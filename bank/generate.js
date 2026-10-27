import { cleanWord, expectedSounds, formatReading, tagSkills } from '../rulebook/index.js';
import { allowedGeneratedWord, foldedSkeleton } from './blocking.js';
import { shuffled } from './random.js';
import { legalGeneratedWord } from './orthography.js';
import { segmentWords, siddur } from './corpus.js';
import { fitsVowels, requiredVowels } from '../rulebook/vowels.js';

export const LETTERS = [
  'א', 'ב', 'בּ', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ', 'כּ',
  'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'פּ', 'צ', 'ק', 'ר', 'שׁ', 'שׂ', 'ת', 'תּ',
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
  // Matres let a mem, nun, kaf or pei be practiced in one sounding pair
  // without printing a medial form at the end of the word.
  return LETTERS.flatMap((letter) => [...Object.values(VOWELS), 'ִי', 'ֵי', 'ֶי', 'וֹ']
    .map((mark) => record(letter + mark)))
    .filter(({ word, result }) => result.pairs.length === 1
      && legalGeneratedWord(word, 1) && allowedGeneratedWord(word));
}

function syllablePool(pairs) {
  const endings = ['ת', 'ם', 'ן', 'ךְ', 'ף', 'ץ', 'ל', 'ר', 'ס'];
  const matres = LETTERS.flatMap((letter) => ['ִי', 'ֵי', 'ֶי', 'וֹ'].map((mark) => record(letter + mark)));
  const closed = pairs.flatMap(({ word }) => endings.map((ending) => record(word + ending)));
  const unique = new Map([...pairs, ...matres, ...closed].map((entry) => [entry.word, entry]));
  return [...unique.values()].filter(({ word, result }) =>
    formatReading(result).split('-').length === 1 && legalGeneratedWord(word, 2) && allowedGeneratedWord(word));
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
    const candidates = shuffled(pool.filter((entry) => entry.skills.includes(focus)), random);
    const size = typeof length === 'function' ? length(index, candidates.length) : length;
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
    level1: drillLines(pairs, focusPlans(3, 33), (index, available) => Math.min(index % 2 ? 5 : 6, available), random),
    level2: drillLines(syllablePool(pairs), focusPlans(2, 22), 5, random),
  };
}

export function commonConsonants() {
  const counts = new Map();
  for (const section of siddur.sections) for (const segment of section.segments) {
    for (const word of segmentWords(segment)) for (const letter of foldedSkeleton(word)) {
      counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'he'))
    .slice(0, 12).map(([letter]) => letter);
}

function wordBuilder(corpusWords, random, allowedVowels = null, existingWords = []) {
  const used = new Set(existingWords);
  const choose = values => values[Math.floor(random() * values.length)];
  const consonants = [...new Set(LETTERS.map(letter => letter.replaceAll('ּ', '')))];
  const vowels = Object.keys(VOWELS).filter(vowel => vowel !== 'sheva_na'
    && (allowedVowels === null || allowedVowels.includes(vowel)));
  const finalForms = { כ: 'ךְ', מ: 'ם', נ: 'ן', פ: 'ף', צ: 'ץ' };
  return (focus, syllables, alphabet = null, maxSkills = Infinity) => {
    // Include pei only in its contrast lessons when it falls outside the
    // corpus's twelve most common letters.
    const bases = alphabet ? [...new Set([...alphabet, ...(['letter:pei', 'letter:fei'].includes(focus) ? ['פ'] : [])])] : null;
    const letters = bases ? consonants.filter(letter => bases.includes(letter[0])) : consonants;
    const closed = focus === 'pattern:closed_syllable';
    for (let attempt = 0; attempt < 100000; attempt++) {
      let word = '';
      let previousClosure = null;
      for (let index = 0; index < syllables; index++) {
        const letter = choose(letters.filter(letter => (index === 0 || letter !== 'א')
          && letter[0] !== previousClosure));
        const vowel = choose(vowels.filter(vowel =>
          (letter !== 'ו' || ['patach', 'kamatz', 'segol', 'tzere', 'chirik'].includes(vowel))
          && (!closed || index !== 0 || ['patach', 'segol', 'chirik', 'kubutz'].includes(vowel))));
        const dot = 'בכפת'.includes(letter) && (index === 0 || previousClosure) ? 'ּ' : '';
        word += letter + dot + VOWELS[vowel];
        previousClosure = null;
        if (closed && index === 0) {
          const closure = choose(letters.filter(letter => !'אהחערו'.includes(letter[0])));
          word += closure + 'ְ';
          previousClosure = closure[0];
        }
      }
      // A final consonant provides a legal ending even when the last
      // sounded vowel sits on a medial-form letter or a hei.
      const last = word.match(/([א-ת])[^א-ת]*$/u)[1];
      if ('כמנפצה'.includes(last) || random() < 0.25) {
        const ending = choose(letters.filter(letter => !'אהעו'.includes(letter[0])))[0];
        word += finalForms[ending] ?? ending;
      }
      // Open final u/o syllables use vav carriers. Keep the consonant's
      // dagesh or shin/sin dot on the consonant when moving its vowel.
      word = word.replace(/([א-ת])([^א-ת]*)$/u, (group, letter, marks) => {
        const carrier = marks.includes('ֻ') ? 'וּ' : marks.includes('ֹ') && letter !== 'ו' ? 'וֹ' : null;
        return carrier ? letter + marks.replace(/[ֹֻ]/gu, '') + carrier : group;
      });
      word = cleanWord(word);
      if (!legalGeneratedWord(word, 4, focus) || corpusWords.has(word) || used.has(word)) continue;
      const result = expectedSounds(word, 'sephardi');
      if (allowedVowels && !fitsVowels({ text: word, skills: result.skills }, allowedVowels)) continue;
      if (result.skills.length > maxSkills || !result.skills.includes(focus)
        || formatReading(result).split('-').length !== syllables || !allowedGeneratedWord(word)) continue;
      used.add(word);
      return word;
    }
    throw new Error(`Cannot build nonsense word for ${focus}`);
  };
}

export function nonsenseLines(corpusWords, random) {
  const buildWord = wordBuilder(corpusWords, random);
  const focuses = focusPlans(2, 22).map(focus => focus === 'vowel:sheva_na' ? 'pattern:closed_syllable' : focus);
  const lines = focuses.map((focus, index) => ({
    focus, words: Array.from({ length: index % 2 ? 2 : 3 }, () => buildWord(focus, random() < 0.5 ? 2 : 3)),
  }));
  const challengeFocuses = [
    ...Object.keys(VOWELS).filter(vowel => vowel !== 'sheva_na').map(vowel => `vowel:${vowel}`),
    ...['bet', 'vet', 'kaf', 'chaf', 'pei', 'fei', 'shin', 'sin'].map(letter => `letter:${letter}`),
  ];
  const alphabet = commonConsonants();
  const challenges = Array.from({ length: 150 }, (_, index) => {
    const focus = index < 30 ? 'pattern:closed_syllable' : challengeFocuses[(index - 30) % challengeFocuses.length];
    return { focus, words: [buildWord(focus, index % 4 === 0 ? 3 : 2, alphabet, 6)] };
  });
  return { lines, challenges };
}

// This stream is supplied only after the original bank has finished generating.
export function beginnerLines(random, corpusWords, existingNonsenseWords, existingTexts = []) {
  const names = ['kamatz', 'patach', 'segol', 'tzere', 'chirik', 'cholam', 'shuruk', 'kubutz', 'sheva_na'];
  const groups = names.flatMap((name, index) => [[name], ...names.slice(index + 1).map(other => [name, other])]);
  const pairs = pairPool();
  const pools = { 1: pairs, 2: syllablePool(pairs) };
  const lines = [];
  const shortfalls = [];
  const seen = new Set(existingTexts);
  const usedWords = new Set(existingNonsenseWords);
  const entryItem = entry => ({ text: entry.word, skills: entry.skills });
  for (const level of [1, 2, 4]) for (const group of groups) {
    if (level === 4 && group.includes('sheva_na')) continue;
    const learned = group.map(name => name === 'sheva_na' ? 'sheva' : name);
    const focus = `vowel:${group.at(-1)}`;
    const wanted = level === 4 ? group.length === 1 ? 6 : 2 : group.length === 1 ? 8 : 3;
    const pool = level < 4 ? pools[level].filter(entry => fitsVowels(entryItem(entry), learned)) : null;
    const buildWord = level === 4 ? wordBuilder(corpusWords, random, group, usedWords) : null;
    let count = 0;
    let reason = 'Distinct line combinations exhausted';
    for (let attempt = 0; count < wanted && attempt < 1000; attempt++) {
      const size = level === 1 ? 6 : level === 2 ? 5 : count % 2 ? 2 : 3;
      let words;
      if (pool) {
        if (pool.length < size) { reason = `Only ${pool.length} eligible distinct words for a ${size}-word line`; break; }
        words = shuffled(pool, random).slice(0, size).map(entry => entry.word);
      } else {
        try {
          words = Array.from({ length: size }, (_, index) =>
            buildWord(`vowel:${group[index % group.length]}`, random() < 0.5 ? 2 : 3));
        } catch (error) {
          reason = error.message;
          break;
        }
        for (const word of words) usedWords.add(word);
      }
      const required = words.map(word => requiredVowels({ text: word, skills: tagSkills(word) }));
      if (!learned.every(vowel => required.filter(vowels => vowels.includes(vowel)).length >= (level < 4 && group.length === 2 ? 2 : 1))) continue;
      const text = words.join(' ');
      if (seen.has(text)) continue;
      seen.add(text);
      lines.push({ level, words, focus });
      count++;
    }
    if (count < wanted) shortfalls.push({ level, group, count, wanted, reason });
  }
  return { lines, shortfalls };
}
