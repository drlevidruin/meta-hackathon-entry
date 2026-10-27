import { cleanWord, expectedSounds, formatReading, tagSkills } from '../rulebook/index.js';
import { allowedGeneratedWord } from './blocking.js';
import { shuffled } from './random.js';

export const LETTERS = [
  'א', 'ב', 'בּ', 'ג', 'גּ', 'ד', 'דּ', 'ה', 'הּ', 'ו', 'וּ', 'ז', 'זּ', 'ח',
  'ט', 'טּ', 'י', 'יּ', 'כ', 'כּ', 'ל', 'לּ', 'מ', 'מּ', 'נ', 'נּ', 'ס', 'סּ',
  'ע', 'פ', 'פּ', 'צ', 'צּ', 'ק', 'קּ', 'ר', 'שׁ', 'שּׁ', 'שׂ', 'שּׂ', 'ת', 'תּ',
];
export const VOWELS = {
  kamatz: 'ָ', patach: 'ַ', tzere: 'ֵ', segol: 'ֶ', chirik: 'ִ', cholam: 'ֹ',
  kubutz: 'ֻ', shuruk: 'וּ', sheva_na: 'ְ',
};

function record(word) {
  word = cleanWord(word);
  const result = expectedSounds(word, 'sephardi');
  return { word, result, skills: result.skills };
}

export function pairPool() {
  return LETTERS.flatMap((letter) => Object.values(VOWELS).map((mark) => record(letter + mark)))
    .filter(({ word, result }) => result.pairs.length === 1 && allowedGeneratedWord(word));
}

function syllablePool(pairs) {
  const endings = ['ת', 'תּ', 'ם', 'ן', 'ךְ', 'ף', 'ץ', 'ל', 'ר', 'ס'];
  const matres = LETTERS.flatMap((letter) => ['ִי', 'ֵי', 'ֶי', 'וֹ'].map((mark) => record(letter + mark)));
  const closed = pairs.flatMap(({ word }) => endings.map((ending) => record(word + ending)));
  const unique = new Map([...pairs, ...matres, ...closed].map((entry) => [entry.word, entry]));
  return [...unique.values()].filter(({ word, result }) =>
    formatReading(result).split('-').length === 1 && allowedGeneratedWord(word));
}

function focusPlans(vowelRepeats, letterCount) {
  const vowels = Object.keys(VOWELS).flatMap((name) => Array(vowelRepeats).fill(`vowel:${name}`));
  const letters = [...new Set(LETTERS.flatMap((letter) => tagSkills(letter + 'ַ')))]
    .filter((skill) => skill.startsWith('letter:'));
  return [...vowels, ...Array.from({ length: letterCount }, (_, index) => letters[index % letters.length])];
}

function drillLines(pool, focuses, length, random) {
  const lines = [];
  const seenLines = new Set();
  const uses = new Map();
  for (const [index, focus] of focuses.entries()) {
    const size = typeof length === 'function' ? length(index) : length;
    const candidates = shuffled(pool.filter((entry) => entry.skills.includes(focus)), random);
    // Prefer less-practiced pairs while keeping seeded variety within each focus.
    candidates.sort((left, right) => (uses.get(left.word) ?? 0) - (uses.get(right.word) ?? 0));
    if (candidates.length < size) throw new Error(`Too few words for ${focus}`);
    let words = candidates.slice(0, size).map((entry) => entry.word);
    for (let attempt = 0; seenLines.has(words.join(' ')); attempt++) {
      if (attempt > 100) throw new Error(`Repeated drill for ${focus}`);
      words = shuffled(candidates, random).slice(0, size).map((entry) => entry.word);
    }
    for (const word of words) uses.set(word, (uses.get(word) ?? 0) + 1);
    seenLines.add(words.join(' '));
    lines.push({ words, focus });
  }
  return lines;
}

export function generatedDrills(random) {
  const pairs = pairPool();
  return {
    pairs,
    level1: drillLines(pairs, focusPlans(3, 33), (index) => index % 2 ? 5 : 6, random),
    level2: drillLines(syllablePool(pairs), focusPlans(2, 22), 5, random),
  };
}

export function nonsenseLines(pairs, corpusWords, random) {
  const focuses = focusPlans(2, 22);
  const ordinary = pairs.filter(({ result }) => result.pairs[0].vowel !== 'sheva_na');
  const used = new Set();
  const choose = (values) => values[Math.floor(random() * values.length)];
  return focuses.map((focus) => {
    const focused = pairs.filter((entry) => entry.skills.includes(focus));
    const words = [];
    for (let attempt = 0; words.length < 4; attempt++) {
      if (attempt >= 10000) throw new Error(`Cannot build nonsense words for ${focus}`);
      const syllables = random() < 0.5 ? 2 : 3;
      const units = [choose(focused), ...Array.from({ length: syllables - 1 }, () => choose(ordinary))];
      const word = cleanWord(units.map((entry) => entry.word).join(''));
      if (corpusWords.has(word) || used.has(word) || !allowedGeneratedWord(word)) continue;
      const result = expectedSounds(word, 'sephardi');
      if (!result.skills.includes(focus) || formatReading(result).split('-').length !== syllables) continue;
      used.add(word);
      words.push(word);
    }
    return { words, focus };
  });
}
