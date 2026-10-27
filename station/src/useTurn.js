import { useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import { recordingToWav } from './wav.js';
import { loadTurn, saveTurn, grayGrade, validSet } from './storage.js';
import { navigate } from './router.js';

export function perfectLine(grade) {
  const pairs = grade?.words?.flatMap(word => word.pairs || []) || [];
  return pairs.length > 0 && grade.words.every(word => !word.verdict || word.verdict === 'ok') &&
    pairs.every(pair => pair.verdict === 'ok') && !(grade.summary?.extra > 0);
}

export function lineStars(grade, challenge = false) {
  const { pairs = 0, ok = 0 } = grade?.summary || {};
  return (pairs > 0 && ok / pairs >= 0.8 ? 1 : 0) + (challenge && perfectLine(grade) ? 1 : 0);
}

export function useTurn() {
  const [turn, setTurn] = useState(loadTurn);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const current = useRef(turn);
  const startingRef = useRef(false);

  function store(value) {
    current.current = value;
    saveTurn(value);
    setTurn(value);
  }

  async function start(child, { replace = false } = {}) {
    if (startingRef.current || !child?.id) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(false);
    try {
      const response = await api.start({ childId: child.id });
      if (!response.turnId || !validSet(response.set)) throw new Error('Invalid turn');
      store({ turnId: response.turnId, child, level: response.level, set: response.set,
        lineIndex: 0, completedSets: 0, stars: 0, streak: 0, bestStreak: 0, bonusBurst: 0,
        attempts: [], setStart: 0, resolvedThrough: 0, setStartedAt: Date.now(), phase: 'reading' });
      navigate('/read', { replace });
    } catch {
      setStartError(true);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function record(blob) {
    const snapshot = current.current;
    if (!snapshot || snapshot.phase !== 'reading') return;
    const item = snapshot.set[snapshot.lineIndex];
    if (!item) return;
    const index = snapshot.attempts.length;
    const last = snapshot.lineIndex === snapshot.set.length - 1;
    store({ ...snapshot, attempts: [...snapshot.attempts, {
      itemId: item.id, text: item.text, challenge: !!item.source?.challenge, status: 'pending', grade: null,
    }], lineIndex: snapshot.lineIndex + 1, phase: last ? 'checkpoint' : 'reading' });
    let result, status = 'graded';
    try {
      const audio = api.isMockMode() ? null : await recordingToWav(blob);
      result = await api.grade({ turnId: snapshot.turnId, itemId: item.id, audio });
      if (result.itemId !== item.id || !Array.isArray(result.words) || !result.summary) throw new Error('Invalid grade');
    } catch {
      result = grayGrade(item);
      status = 'failed';
    }
    const latest = current.current;
    if (latest?.turnId !== snapshot.turnId) return;
    store({ ...latest, attempts: latest.attempts.map((entry, entryIndex) => entryIndex === index
      ? { ...entry, status, grade: result } : entry) });
  }

  useEffect(() => {
    let latest = current.current;
    if (!latest) return;
    let through = latest.resolvedThrough;
    let { stars, streak, bestStreak, bonusBurst } = latest;
    // Scores and streaks follow reading order even if uploads finish out of order.
    while (through < latest.attempts.length && latest.attempts[through].status !== 'pending') {
      const attempt = latest.attempts[through];
      const perfect = attempt.status === 'graded' && perfectLine(attempt.grade);
      stars += attempt.status === 'graded' ? lineStars(attempt.grade, attempt.challenge) : 0;
      streak = perfect ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
      if (perfect && attempt.challenge) bonusBurst++;
      through++;
    }
    if (through !== latest.resolvedThrough) {
      latest = { ...latest, stars, streak, bestStreak, bonusBurst, resolvedThrough: through };
      store(latest);
    }
    if (latest.phase === 'checkpoint' && latest.attempts.slice(latest.setStart).every(entry => entry.status !== 'pending')) {
      const checkpoint = latest;
      store({ ...latest, phase: 'choosing' });
      api.next({ turnId: latest.turnId, elapsedMs: Math.max(0, Date.now() - latest.setStartedAt) }).then(response => {
        if (current.current?.turnId !== checkpoint.turnId) return;
        if (!response.done && !validSet(response.set)) throw new Error('Invalid set');
        const phase = response.done ? 'finish_pending' : 'reading';
        store({ ...current.current, level: response.level, facts: response.facts || {},
          completedSets: checkpoint.completedSets + 1,
          set: response.done ? checkpoint.set : response.set,
          lineIndex: response.done ? checkpoint.set.length : 0,
          setStart: response.done ? checkpoint.setStart : checkpoint.attempts.length,
          setStartedAt: Date.now() + (response.levelUp ? 2000 : 0),
          phase: response.levelUp ? 'level_up' : phase, afterLevelUp: phase,
          levelUpUntil: response.levelUp ? Date.now() + 2000 : null,
        });
      }).catch(() => {
        if (current.current?.turnId === checkpoint.turnId) store({ ...current.current, phase: 'next_error' });
      });
    } else if (latest.phase === 'finish_pending') {
      const snapshot = latest;
      store({ ...latest, phase: 'finishing' });
      api.finish({ turnId: latest.turnId, stars: latest.stars }).then(({ child }) => {
        if (current.current?.turnId === snapshot.turnId) store({ ...current.current, child, phase: 'finished' });
      }).catch(() => {
        if (current.current?.turnId === snapshot.turnId) store({ ...current.current, phase: 'finish_error' });
      });
    }
  }, [turn]);

  useEffect(() => {
    if (turn?.phase !== 'level_up') return;
    const timer = setTimeout(() => {
      const latest = current.current;
      if (latest?.turnId === turn.turnId && latest.phase === 'level_up') store({ ...latest, phase: latest.afterLevelUp });
    }, Math.max(0, turn.levelUpUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [turn]);

  function retryNext() {
    const latest = current.current;
    if (latest?.phase === 'next_error') store({ ...latest, phase: 'checkpoint' });
    if (latest?.phase === 'finish_error') store({ ...latest, phase: 'finish_pending' });
  }

  return { turn, starting, startError, start, record, retryNext, clear: () => store(null) };
}
