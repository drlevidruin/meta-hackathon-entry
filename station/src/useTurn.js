import { useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import { recordingToWav } from './wav.js';
import { loadProgress, loadTurn, loadPreset, saveProgress, saveTurn, grayGrade } from './storage.js';
import { navigate } from './router.js';

function validSet(value) {
  return Array.isArray(value) && value.length >= 2 && value.length <= 3 &&
    value.every(item => typeof item.id === 'string' && typeof item.text === 'string');
}

export function perfectLine(grade) {
  const pairs = grade.words.flatMap(word => word.pairs);
  return pairs.length > 0 && grade.words.every(word => !word.verdict) && pairs.every(pair => pair.verdict === 'ok');
}

export function useTurn() {
  const [turn, setTurn] = useState(loadTurn);
  const [progress, setProgress] = useState(loadProgress);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);
  const current = useRef(turn);
  const personal = useRef(progress);
  const startingRef = useRef(false);

  function storeTurn(value) {
    current.current = value;
    saveTurn(value);
    setTurn(value);
  }
  function storeProgress(value) {
    personal.current = value;
    saveProgress(value);
    setProgress(value);
  }

  async function start({ replace = false } = {}) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(false);
    try {
      const preset = loadPreset();
      const response = await api.start({ preset, level: personal.current.level });
      if (!validSet(response.set)) throw new Error('Invalid set');
      storeTurn({
        id: crypto.randomUUID(), preset, profile: response.profile,
        level: response.profile.level || personal.current.level, set: response.set, lineIndex: 0,
        completedSets: 0, stars: 0, setStarAwarded: false,
        attempts: [], setStart: 0, resolvedThrough: 0, phase: 'reading',
      });
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
    const attemptIndex = snapshot.attempts.length;
    const last = snapshot.lineIndex === snapshot.set.length - 1;
    const attempt = { itemId: item.id, text: item.text, status: 'pending', grade: null };
    storeTurn({ ...snapshot,
      attempts: [...snapshot.attempts, attempt], lineIndex: snapshot.lineIndex + 1,
      phase: last ? 'checkpoint' : 'reading',
      stars: snapshot.stars + (last ? 1 : 0), setStarAwarded: last,
    });
    if (last) storeProgress({ ...personal.current, stars: personal.current.stars + 1 });

    let result;
    let status = 'graded';
    try {
      // Mock mode also works without microphone or Web Audio support.
      const audio = api.isMockMode() ? null : await recordingToWav(blob);
      result = await api.grade({ itemId: item.id, preset: snapshot.preset, audio });
    } catch {
      result = grayGrade(item);
      status = 'failed';
    }
    const latest = current.current;
    if (!latest || latest.id !== snapshot.id) return;
    storeTurn({ ...latest, attempts: latest.attempts.map((entry, index) => index === attemptIndex
      ? { ...entry, status, grade: result } : entry) });
  }

  useEffect(() => {
    let latest = current.current;
    if (!latest) return;
    // Grade requests can finish out of order. Streaks follow reading order.
    let through = latest.resolvedThrough;
    let nextProgress = personal.current;
    while (through < latest.attempts.length && latest.attempts[through].status !== 'pending') {
      const streak = perfectLine(latest.attempts[through].grade) ? nextProgress.streak + 1 : 0;
      nextProgress = { ...nextProgress, streak, best: Math.max(nextProgress.best, streak) };
      through++;
    }
    if (through !== latest.resolvedThrough) {
      storeProgress(nextProgress);
      latest = { ...latest, resolvedThrough: through };
      storeTurn(latest);
    }
    if (latest.phase !== 'checkpoint' || latest.attempts.slice(latest.setStart).some(entry => entry.status === 'pending')) return;
    const checkpoint = latest;
    storeTurn({ ...latest, phase: 'choosing' });
    const results = latest.attempts.slice(latest.setStart).map(entry => ({
      itemId: entry.itemId, summary: entry.grade.summary, verdicts: entry.grade.verdicts,
    }));
    api.next({ profile: latest.profile, results }).then(response => {
      if (current.current?.id !== checkpoint.id) return;
      if (!validSet(response.set)) throw new Error('Invalid set');
      const finished = checkpoint.completedSets === 2;
      storeProgress({ ...personal.current, level: response.level });
      storeTurn({ ...current.current, profile: response.profile, level: response.level,
        set: finished ? checkpoint.set : response.set,
        lineIndex: finished ? checkpoint.set.length : 0, completedSets: checkpoint.completedSets + 1,
        setStart: finished ? checkpoint.setStart : checkpoint.attempts.length,
        setStarAwarded: finished, phase: finished ? 'finished' : 'reading' });
      if (finished) navigate('/done', { replace: true });
    }).catch(() => {
      if (current.current?.id === checkpoint.id) storeTurn({ ...current.current, phase: 'next_error' });
    });
  }, [turn]);

  function retryNext() {
    if (current.current?.phase === 'next_error') storeTurn({ ...current.current, phase: 'checkpoint' });
  }

  return { turn, progress, starting, startError, start, record, retryNext };
}
