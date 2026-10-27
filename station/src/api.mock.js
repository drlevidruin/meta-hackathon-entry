import { readSession, writeSession } from './storage.js';
import { skillLabel } from './messages.js';

const KEY = 'kriah.mock.v2';
const initialChildren = [
  { id: 'bim', name: 'Bim', avatar: 'lion', preset: 'sephardi', level: 1, stars: 12, best: 5 },
  { id: 'nubo', name: 'Nubo', avatar: 'owl', preset: 'ashkenazi', level: 2, stars: 24, best: 7 },
  { id: 'zuzu', name: 'Zuzu', avatar: 'turtle', preset: 'chassidish', level: 1, stars: 8, best: 3 },
];
const lines = ['בָּ בַּ בֵּ', 'מָ מַ מִ', 'לָ לַ לִ', 'בִּ בֵּ בֻּ', 'שָׁ שַׁ שִׁ', 'נָ נַ נִ'];
export const items = lines.map((text, index) => ({
  id: `mock-${index}`, level: 1, text, words: text.split(' '),
  skills: ['vowel:kamatz', 'vowel:patach', 'vowel:chirik'], focus: 'vowel:kamatz',
  source: { generated: true, challenge: index % 2 === 0 },
}));
const clone = value => JSON.parse(JSON.stringify(value));
const database = () => readSession(KEY) || { children: clone(initialChildren), turns: {} };
const save = db => writeSession(KEY, db);
const setFor = round => clone(items.slice(round * 2, round * 2 + 2));
const findChild = (db, id) => {
  const child = db.children.find(child => child.id === id);
  if (!child) throw new Error('Child not found');
  return child;
};
export async function children() { return clone(database().children); }
export async function config() { return { trace: true }; }
export async function checkPin(pin) {
  if (!/^\d{4,12}$/.test(pin)) throw new Error('Enter PIN');
  return { ok: true };
}
export async function start({ childId }) {
  const db = database();
  const child = findChild(db, childId);
  const turnId = `mock-turn-${crypto.randomUUID()}`;
  db.turns[turnId] = { childId, checkpoint: 0, level: child.level, startLevel: child.level, grades: {}, date: new Date().toISOString() };
  save(db);
  return { turnId, level: child.level, set: setFor(0) };
}
export async function grade({ turnId, itemId }) {
  const item = items.find(item => item.id === itemId);
  if (!item) throw new Error('Item not found');
  const tokens = ['ok', 'ok', 'ok', 'ok', 'wrong_letter', 'wrong_vowel', 'uncertain'];
  const summary = { pairs: 0, ok: 0, wrong_letter: 0, wrong_vowel: 0, skipped: 0, extra: 0, uncertain: 0, not_decoded: 0 };
  const words = item.words.map(text => {
    const verdict = tokens[Math.floor(Math.random() * tokens.length)];
    summary.pairs++;
    summary[verdict]++;
    return { text, verdict: null, pairs: [{ text, verdict, skills: ['vowel:kamatz'] }] };
  });
  const result = { itemId, words, summary };
  const db = database();
  if (db.turns[turnId]) { db.turns[turnId].grades[itemId] = result; save(db); }
  return result;
}
export async function next({ turnId }) {
  const db = database();
  const turn = db.turns[turnId];
  if (!turn) throw new Error('Turn not found');
  turn.checkpoint++;
  const levelUp = turn.checkpoint === 2 && turn.level < 6;
  if (levelUp) turn.level++;
  save(db);
  return turn.checkpoint >= 3
    ? { done: true, level: turn.level, levelUp, facts: { best: 'letter:bet', next: 'vowel:sheva_na', proven: ['letter:bet'] } }
    : { done: false, level: turn.level, levelUp, set: setFor(turn.checkpoint) };
}
export async function finish({ turnId, stars }) {
  const db = database();
  const turn = db.turns[turnId];
  if (!turn) throw new Error('Turn not found');
  const child = findChild(db, turn.childId);
  if (!turn.finished) {
    child.level = turn.level;
    child.stars += stars;
    child.best = Math.max(child.best, stars);
    turn.stars = stars;
    turn.finished = true;
    save(db);
  }
  return { child: clone(child) };
}
const sampleTurn = () => ({ date: new Date().toISOString(), startLevel: 1, endLevel: 2, ok: 18, pairs: 20, stars: 4,
  log: ['Held the current level after steady reading.', 'Practiced sheva after two missed sounds.'] });
function turnsFor(db, childId) {
  const saved = Object.values(db.turns).filter(turn => turn.childId === childId && turn.finished).reverse().map(turn => ({
    date: turn.date, startLevel: turn.startLevel, endLevel: turn.level, stars: turn.stars,
    ok: Object.values(turn.grades).reduce((n, grade) => n + grade.summary.ok, 0),
    pairs: Object.values(turn.grades).reduce((n, grade) => n + grade.summary.pairs, 0),
    log: ['Held the level at the first checkpoint.', 'Advanced after the second checkpoint.'],
  }));
  return [...saved, sampleTurn()].slice(0, 20);
}
export async function classView() {
  const db = database();
  const children = db.children.map((child, index) => ({ ...child,
    next: index === 1 ? 'vowel:chirik' : 'vowel:sheva_na', lastTurn: turnsFor(db, child.id)[0],
  }));
  const groups = [...new Set(children.map(child => child.next))].map(skill => ({
    skill, label: skillLabel(skill), childIds: children.filter(child => child.next === skill).map(child => child.id),
  })).sort((a, b) => b.childIds.length - a.childIds.length || a.label.localeCompare(b.label));
  return { children, groups };
}
export async function childDetail(id) {
  const db = database();
  const child = findChild(db, id);
  const letters = ['letter:bet', 'letter:mem', 'letter:lamed'];
  const vowels = ['vowel:kamatz', 'vowel:patach', 'vowel:chirik'];
  const samples = [['בָּ', 'בַּ', 'בִּ'], ['מָ', 'מַ', 'מִ'], ['לָ', 'לַ', 'לִ']];
  const cells = {}, sample = {};
  letters.forEach((letter, row) => vowels.forEach((vowel, column) => {
    const key = `${letter}|${vowel}`;
    cells[key] = ['solid', 'shaky', 'untested'][(row + column) % 3];
    sample[key] = samples[row][column];
  }));
  return { child: clone(child), map: { letters, vowels, cells, sample }, turns: turnsFor(db, id),
    parentLine: `${child.name} read the bet with a dot well today and will practice the sheva next.` };
}
export async function addChild(data) {
  const db = database();
  const child = { ...data, id: `mock-child-${crypto.randomUUID()}`, level: 1, stars: 0, best: 0 };
  db.children.push(child); save(db); return clone(child);
}
export async function editChild(id, data) {
  const db = database();
  const child = findChild(db, id);
  Object.assign(child, data); save(db); return clone(child);
}
export async function deleteChild(id) {
  const db = database();
  db.children = db.children.filter(child => child.id !== id);
  Object.entries(db.turns).forEach(([key, turn]) => { if (turn.childId === id) delete db.turns[key]; });
  save(db); return { ok: true };
}
export async function packet({ childId, skillId }) {
  return { title: childId ? findChild(database(), childId).name : skillLabel(skillId), sections: [
    { heading: 'Warm up', items: clone(items.slice(0, 2)) },
    { heading: 'Practice', items: clone(items) },
    { heading: 'Challenge', items: clone([items[4]]) },
  ] };
}
export async function trace() {
  return { decisions: [
    { checkpoint: 1, source: 'fallback', decision: 'hold', explain: ['Hold this level.'], reason: 'More practice with sheva.' },
    { checkpoint: 2, source: 'coach', decision: 'advance', explain: ['The current level is steady.'], reason: 'Ready for the next level.' },
    { checkpoint: 3, source: 'fallback', decision: 'finish', explain: ['Turn complete.'], reason: 'Three checkpoints completed.' },
  ] };
}
