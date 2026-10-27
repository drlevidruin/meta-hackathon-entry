export const TURN_KEY = 'kriah.turn.v1';
const PROGRESS_KEY = 'kriah.progress.v1';
const PRESET_KEY = 'kriah.preset.v1';
export const PRESETS = ['sephardi', 'ashkenazi', 'chassidish'];

function read(storage, key) {
  try { return JSON.parse(storage.getItem(key)); } catch { return null; }
}

function write(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ }
}

export function loadPreset() {
  const preset = read(localStorage, PRESET_KEY);
  return PRESETS.includes(preset) ? preset : 'sephardi';
}
export const savePreset = preset => write(localStorage, PRESET_KEY, preset);

export function loadProgress() {
  const saved = read(localStorage, PROGRESS_KEY) || {};
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  return { level: saved.level >= 1 && saved.level <= 6 ? saved.level : 1,
    stars: count(saved.stars), streak: count(saved.streak), best: count(saved.best) };
}
export const saveProgress = progress => write(localStorage, PROGRESS_KEY, progress);
export const saveTurn = turn => write(sessionStorage, TURN_KEY, turn);

export function grayGrade(item) {
  const words = item.text.trim().split(/\s+/).map(text => ({
    text, verdict: 'not_decoded', pairs: [{ text, verdict: 'not_decoded', heard: null, expected: null, skills: [] }],
  }));
  return { itemId: item.id, words, verdicts: [], summary: {
    pairs: words.length, ok: 0, wrong_letter: 0, wrong_vowel: 0, skipped: 0, extra: 0, uncertain: 0,
    not_decoded: words.length, missedSkills: [],
  } };
}

export function loadTurn() {
  const turn = read(sessionStorage, TURN_KEY);
  if (!turn || !Array.isArray(turn.set) || turn.set.length < 2 || turn.set.length > 3 ||
      !turn.set.every(item => typeof item.id === 'string' && typeof item.text === 'string') ||
      !Array.isArray(turn.attempts) || !Number.isInteger(turn.lineIndex) || !PRESETS.includes(turn.preset)) return null;
  // Audio is never stored. Interrupted uploads become gray and the turn can continue.
  return { ...turn, phase: turn.phase === 'choosing' ? 'checkpoint' : turn.phase,
    attempts: turn.attempts.map(attempt => attempt.status === 'pending'
      ? { ...attempt, status: 'failed', grade: grayGrade({ id: attempt.itemId, text: attempt.text }) } : attempt) };
}
