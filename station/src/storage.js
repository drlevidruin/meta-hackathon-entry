export const TURN_KEY = 'kriah.turn.v2';
export const PIN_KEY = 'kriah.teacher.pin.v2';
export const PRESETS = ['sephardi', 'ashkenazi', 'chassidish'];

export function readSession(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

export function writeSession(key, value) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(value));
  } catch { /* The current screen still works if browser storage is unavailable. */ }
}

export const loadPin = () => readSession(PIN_KEY) || '';
export const savePin = pin => writeSession(PIN_KEY, pin || null);
export const saveTurn = turn => writeSession(TURN_KEY, turn);

export function grayGrade(item) {
  const words = item.text.trim().split(/\s+/).map(text => ({
    text, verdict: 'not_decoded', pairs: [{ text, verdict: 'not_decoded' }],
  }));
  return { itemId: item.id, words, summary: { pairs: words.length, ok: 0, not_decoded: words.length } };
}

export function validSet(set) {
  return Array.isArray(set) && set.length > 0 && set.every(item =>
    typeof item.id === 'string' && typeof item.text === 'string');
}

export function loadTurn() {
  const turn = readSession(TURN_KEY);
  if (!turn || typeof turn.turnId !== 'string' || !turn.child?.id || !validSet(turn.set) ||
    !Array.isArray(turn.attempts) || !Number.isInteger(turn.lineIndex) ||
    turn.lineIndex < 0 || turn.lineIndex > turn.set.length) return null;
  // Store grades and progress only. Interrupted audio is never persisted or replayed.
  return { ...turn,
    phase: turn.phase === 'choosing' ? 'checkpoint' : turn.phase === 'finishing' ? 'finish_pending' : turn.phase,
    attempts: turn.attempts.map(attempt => attempt.status === 'pending'
      ? { ...attempt, status: 'failed', grade: grayGrade({ id: attempt.itemId, text: attempt.text }) } : attempt),
  };
}
