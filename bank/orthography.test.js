import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { expectedSounds, formatReading } from '../rulebook/index.js';
import { segmentWords, siddur } from './corpus.js';

const items = JSON.parse(readFileSync(new URL('./items.json', import.meta.url), 'utf8'));
const generated = items.filter(item => item.source.generated);
const groups = word => [...word.matchAll(/([א-ת])([^א-ת]*)/gu)]
  .map(match => ({ letter: match[1], marks: match[2] }));
const vowel = /[\u05b0-\u05bb\u05c7]/u;
const finals = 'ךםןףץ';
const regularFinals = 'כמנפצ';
const shuruk = group => group.letter === 'ו' && group.marks.includes('ּ') && !vowel.test(group.marks);

test('every generated item on disk uses only the permitted dagesh and shin/sin marks', () => {
  for (const item of generated) for (const word of item.words) {
    const letters = groups(word);
    letters.forEach((group, index) => {
      const dot = group.marks.includes('ּ');
      if (group.letter === 'ש') assert.equal(/[ׁׂ]/u.test(group.marks), true, word);
      else assert.equal(/[ׁׂ]/u.test(group.marks), false, word);
      if (shuruk(group)) return;
      if (item.level < 4) {
        if (dot) assert.ok('בכפת'.includes(group.letter), word);
      } else {
        const kal = 'בכפת'.includes(group.letter) && index < letters.length - 1
          && (index === 0 || letters[index - 1].marks.includes('ְ'));
        assert.equal(dot, kal, `${item.id}: ${word} at ${index}`);
      }
    });
  }
});

test('every generated item on disk has correctly placed and pointed final forms and legal word endings', () => {
  for (const item of generated) for (const word of item.words) {
    const letters = groups(word);
    letters.forEach((group, index) => {
      if (index < letters.length - 1) assert.ok(!finals.includes(group.letter), word);
      else {
        assert.ok(!regularFinals.includes(group.letter), word);
        if (finals.includes(group.letter)) {
          assert.ok(!vowel.test(group.marks) || (group.letter === 'ך' && /^[ְָ]$/u.test(group.marks)), word);
        }
      }
    });
    const last = letters.at(-1);
    const lastPair = expectedSounds(word, 'sephardi').pairs.at(-1);
    const endsOnVowel = !regularFinals.includes(last.letter) && lastPair.vowels.some(Boolean);
    const endsOnConsonant = !vowel.test(last.marks) && lastPair.consonants.some(Boolean);
    assert.ok(endsOnVowel || endsOnConsonant || (last.letter === 'ך' && last.marks === 'ְ'), word);
  }
});

test('every generated item on disk uses consonant vav and vowel carriers correctly', () => {
  for (const item of generated) for (const word of item.words) {
    const letters = groups(word);
    letters.forEach((group, index) => {
      if (group.letter !== 'ו') return;
      if (shuruk(group) || group.marks.includes('ֹ')) {
        assert.ok(index > 0 && !vowel.test(letters[index - 1].marks), word);
        assert.ok(shuruk(group) || !group.marks.includes('ּ'), word);
      } else {
        assert.match(group.marks, /^[ִֵֶַָ]$/u, word);
      }
    });
  }
});

test('every generated item on disk avoids advanced pointing and misplaced gutturals or alef', () => {
  for (const item of generated) for (const word of item.words) {
    assert.ok(!/[ֱֲֳ]/u.test(word), word);
    const letters = groups(word);
    assert.notEqual(letters.at(-1).letter, 'ה', word);
    letters.forEach((group, index) => {
      if ('אהחער'.includes(group.letter)) assert.ok(!/[ְּ]/u.test(group.marks), word);
      if (group.letter === 'א') assert.equal(index, 0, word);
    });
    const result = expectedSounds(word, 'sephardi');
    assert.ok(result.pairs.every(pair => !pair.furtive), word);
    assert.ok(!result.skills.includes('pattern:mappik'), word);
    assert.deepEqual(result.flags, [], word);
  }
});

test('every level 4 sheva on disk closes an internal syllable in a lesson focused on that skill', () => {
  for (const item of generated.filter(item => item.level === 4)) for (const word of item.words) {
    const letters = groups(word);
    const result = expectedSounds(word, 'sephardi');
    letters.forEach((group, index) => {
      if (!group.marks.includes('ְ')) return;
      assert.ok(index > 0 && index < letters.length - 1, word);
      assert.equal(item.focus, 'pattern:closed_syllable', item.id);
      assert.equal(result.pairs.find(pair => pair.text.startsWith(group.letter + group.marks))?.vowel,
        'sheva_nach', word);
    });
    assert.ok(result.pairs.every(pair => !['sheva', 'sheva_na'].includes(pair.vowel)), word);
  }
});

test('drill lines on disk never repeat a word and level 3 words appear in at most two lines', () => {
  const uses = new Map();
  for (const item of items.filter(item => item.level <= 4)) {
    assert.equal(new Set(item.words).size, item.words.length, item.id);
    if (item.level === 3) for (const word of item.words) {
      uses.set(word, (uses.get(word) ?? 0) + 1);
      assert.ok(uses.get(word) <= 2, word);
    }
  }
});

test('level 4 lines on disk have two or three words and challenge items have one, all two or three syllables', () => {
  for (const item of generated.filter(item => item.level === 4)) {
    assert.ok(item.source.challenge ? item.words.length === 1 : [2, 3].includes(item.words.length), item.id);
    for (const word of item.words) for (const preset of ['sephardi', 'ashkenazi', 'chassidish']) {
      assert.ok([2, 3].includes(formatReading(expectedSounds(word, preset)).split('-').length), word);
    }
  }
});

test('challenge items on disk balance vowels and contrasts, limit skills and include 30 sheva-nach words', () => {
  const challenges = generated.filter(item => item.source.challenge);
  assert.equal(challenges.length, 150);
  let three = 0;
  let closed = 0;
  for (const item of challenges) {
    assert.equal(item.level, 4);
    assert.deepEqual(item.source, { generated: true, challenge: true });
    assert.ok(item.skills.length <= 6, item.id);
    assert.ok(item.skills.includes(item.focus), item.id);
    if (formatReading(expectedSounds(item.words[0], 'sephardi')).split('-').length === 3) three++;
    if (item.words[0].includes('ְ')) {
      closed++;
      assert.equal(item.focus, 'pattern:closed_syllable');
    }
  }
  assert.ok(three >= 35 && three <= 40, three);
  assert.equal(closed, 30);
  for (const focus of [
    ...['kamatz', 'patach', 'tzere', 'segol', 'chirik', 'cholam', 'shuruk', 'kubutz'].map(v => `vowel:${v}`),
    ...['bet', 'vet', 'kaf', 'chaf', 'pei', 'fei', 'shin', 'sin'].map(l => `letter:${l}`),
  ]) assert.ok(challenges.filter(item => item.focus === focus).length >= 5, focus);
});

test('challenge words on disk use the corpus top twelve letters, with pei/fei contrast exceptions', () => {
  const counts = new Map();
  const fold = letter => ({ ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' })[letter] ?? letter;
  for (const section of siddur.sections) for (const segment of section.segments) {
    for (const word of segmentWords(segment)) for (const letter of word.match(/[א-ת]/gu) ?? []) {
      const base = fold(letter);
      counts.set(base, (counts.get(base) ?? 0) + 1);
    }
  }
  const core = new Set([...counts].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([letter]) => letter));
  const seen = new Set();
  for (const item of generated.filter(item => item.source.challenge)) {
    for (const group of groups(item.words[0])) {
      const base = fold(group.letter);
      seen.add(base);
      assert.ok(core.has(base) || (base === 'פ' && ['letter:pei', 'letter:fei'].includes(item.focus)), item.id);
      assert.ok(!/[ֱֲֳׇֺ]/u.test(group.marks), item.words[0]);
    }
  }
  for (const letter of core) assert.ok(seen.has(letter), letter);
});

test('level 5 text on disk never repeats at level 6', () => {
  const phrases = new Set(items.filter(item => item.level === 5).map(item => item.text));
  for (const item of items.filter(item => item.level === 6)) assert.ok(!phrases.has(item.text), item.id);
});
