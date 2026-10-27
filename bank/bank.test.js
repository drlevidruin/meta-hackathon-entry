import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cleanWord, expectedSounds, formatReading, PRESETS, SKILLS, tagSkills } from '../rulebook/index.js';
import { buildBank, cutLines } from './build.js';
import { acceptedReadings, allowedGeneratedWord, foldedSkeleton, matchesBlocklist } from './blocking.js';
import { checkPage } from './check-page.js';
import { lineText, pointedWord, punctuatedPhrases, segmentWords, siddur, usableSegment } from './corpus.js';
import { LETTERS, VOWELS } from './generate.js';
import { mulberry32 } from './random.js';
import { fitsVowels, requiredVowels } from '../rulebook/vowels.js';

const items = buildBank();
const presets = Object.keys(PRESETS);
const unique = (values) => [...new Set(values)].sort();

test('the original non-beginner bank remains byte for byte in its original order', () => {
  const original = items.filter(item => !item.source.beginner);
  assert.equal(createHash('sha1').update(JSON.stringify(original)).digest('hex'),
    '668c9e6eb64bcff149a7f1b0ed5af9d5a56e5277');
  for (const level of [1, 2, 4]) {
    const atLevel = items.filter(item => item.level === level);
    const firstBeginner = atLevel.findIndex(item => item.source.beginner);
    assert.ok(firstBeginner >= 0);
    assert.ok(atLevel.slice(firstBeginner).every(item => item.source.beginner));
  }
});

test('beginner single and pair groups have the exact promised counts and vowel coverage', () => {
  const names = ['kamatz', 'patach', 'segol', 'tzere', 'chirik', 'cholam', 'shuruk', 'kubutz', 'sheva_na'];
  const groups = names.flatMap((name, index) => [[name], ...names.slice(index + 1).map(other => [name, other])]);
  const beginners = items.filter(item => item.source.beginner);
  assert.deepEqual([1, 2, 4].map(level => beginners.filter(item => item.level === level).length), [180, 180, 104]);
  assert.equal(new Set(items.map(item => item.text)).size,
    new Set(items.filter(item => !item.source.beginner).map(item => item.text)).size + beginners.length);
  const oldWords = new Set(items.filter(item => item.level === 4 && !item.source.beginner).flatMap(item => item.words));
  const newWords = new Set();
  for (const level of [1, 2, 4]) for (const group of groups) {
    const learned = group.map(name => name === 'sheva_na' ? 'sheva' : name);
    const matching = beginners.filter(item => item.level === level
      && JSON.stringify(requiredVowels(item)) === JSON.stringify(learned));
    const expected = level === 4 ? group.includes('sheva_na') ? 0 : group.length === 1 ? 6 : 2
      : group.length === 1 ? 8 : 3;
    assert.equal(matching.length, expected, `level ${level}: ${group.join('+')}`);
    for (const [index, item] of matching.entries()) {
      assert.deepEqual(item.source, { generated: true, beginner: true });
      assert.equal(item.focus, `vowel:${group.at(-1)}`);
      assert.ok(fitsVowels(item, learned), item.id);
      assert.equal(item.words.length, level === 1 ? 6 : level === 2 ? 5 : index % 2 ? 2 : 3);
      if (group.length === 2 && level < 4) for (const vowel of learned) {
        assert.ok(item.words.filter(word => requiredVowels({ text: word, skills: tagSkills(word) }).includes(vowel)).length >= 2,
          `${item.id}: ${vowel}`);
      }
      if (level === 4) for (const word of item.words) {
        assert.ok(!oldWords.has(word) && !newWords.has(word), word);
        newWords.add(word);
      }
    }
  }
});

test('check-page CLI without a section prints usage and exits without a stack trace', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./check-page.js', import.meta.url))], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'Usage: npm run check:page -- <section>\n');
});

test('levels, item schema, stable SHA-1 ids and skills', () => {
  assert.deepEqual(unique(items.map((item) => item.level)), [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
  for (const item of items) {
    assert.ok(item.text.length && item.words.length && item.skills.length, item.id);
    assert.equal(item.text, lineText(item.words));
    const hash = createHash('sha1').update(`${item.level}|${item.text}`).digest('hex').slice(0, 8);
    assert.equal(item.id, `L${item.level}-${hash}`);
    assert.deepEqual(item.skills, unique(item.words.flatMap(tagSkills)));
    assert.deepEqual(item.flags, unique(item.words.flatMap((word) => expectedSounds(word, 'sephardi').flags)));
    assert.ok(item.focus === null || SKILLS[item.focus], item.focus);
    assert.ok(item.source.generated === true || (item.source.section && item.source.ref));
  }
});

test('every word re-analyzes in every preset, with no unpointed words or early flags', () => {
  for (const item of items) for (const word of item.words) for (const preset of presets) {
    const result = expectedSounds(word, preset);
    assert.ok(pointedWord(word, result), `${item.id}: ${word}`);
    assert.ok(!result.flags.includes('unpointed'));
    if (item.level < 5) {
      assert.deepEqual(result.flags, [], `${item.id}: ${word}`);
      assert.deepEqual(item.flags, []);
    }
    assert.deepEqual(result.skills, tagSkills(word));
    for (const pair of result.pairs) {
      assert.ok(pair.sounds.length);
      assert.ok(pair.skills.every((skill) => SKILLS[skill]), word);
    }
  }
});

test('generated words pass skeleton and every accepted sound in the blocklist', () => {
  const blocklist = JSON.parse(readFileSync(new URL('./blocklist.json', import.meta.url), 'utf8'));
  const skeletons = new Set(blocklist.skeletons.map(foldedSkeleton));
  const sounds = new Set(blocklist.sounds);
  for (const item of items.filter((entry) => entry.source.generated)) for (const word of item.words) {
    assert.ok(!skeletons.has(foldedSkeleton(word)), word);
    for (const preset of presets) {
      const result = expectedSounds(word, preset);
      const combinations = result.pairs.reduce((before, pair) =>
        before.flatMap((prefix) => pair.sounds.map((sound) => prefix + sound)), ['']);
      assert.ok(combinations.every((reading) => !sounds.has(reading)), word);
      assert.ok(result.pairs.every((pair) => pair.sounds.every(Boolean)), word);
    }
    assert.ok(allowedGeneratedWord(word), word);
  }
  assert.ok(matchesBlocklist('זִין'));
  assert.ok(matchesBlocklist('כֻּס'));
  assert.ok(matchesBlocklist('כּוֹס'));
  assert.equal(foldedSkeleton('ךםןףץ'), 'כמנפצ');
  assert.ok(matchesBlocklist('בַּת', [{ pairs: [{ sounds: ['safe', 'kus'] }], readings: null }]));
  assert.deepEqual(acceptedReadings({ pairs: [{ sounds: ['a', 'e'] }, { sounds: ['b', 'v'] }], readings: null }),
    ['ab', 'av', 'eb', 'ev']);
});

test('prefixed Name readings include the prefix exactly once and never accept a prefix alone', () => {
  for (const preset of presets) {
    const result = expectedSounds('שֶׁיְהֹוָה', preset);
    const readings = acceptedReadings(result);
    assert.ok(readings.length);
    assert.ok(readings.every((reading) => reading.startsWith('she')));
    assert.ok(!readings.includes('she'));
    assert.deepEqual([...readings].sort(), unique(expectedSounds('יְהֹוָה', preset).readings
      .flatMap(acceptedReadings).map((reading) => 'she' + reading)));
  }
  const row = checkPage('ashrei').split('\n').find((line) => line.includes(cleanWord('שֶׁיְהֹוָה')));
  assert.ok(row.includes('she-a-do-nay'));
  assert.ok(row.includes('she-ha-shem'));
  assert.ok(!row.includes('| she /'));
  assert.ok(row.endsWith('divine_name |'));
});

test('level 1 has 60 lines of five or six pairs and covers letters, variants and all target vowels', () => {
  const level = items.filter((item) => item.level === 1);
  assert.equal(level.filter(item => !item.source.beginner).length, 60);
  const words = level.flatMap((item) => item.words);
  for (const item of level) {
    assert.ok([5, 6].includes(item.words.length));
    assert.ok(item.words.every((word) => !/[ךםןףץ]/u.test(word)));
    for (const word of item.words) assert.equal(expectedSounds(word, 'sephardi').pairs.length, 1);
  }
  const firstLetters = new Set(words.map((word) => {
    const pair = expectedSounds(word, 'sephardi').pairs[0];
    const marks = pair.text.match(/^[א-ת]([^א-ת]*)/u)[1].replace(/[\u05b0-\u05bb\u05c7]/gu, '');
    return cleanWord(pair.letter + marks);
  }));
  for (const letter of LETTERS) assert.ok(firstLetters.has(cleanWord(letter)), letter);
  for (const vowel of Object.keys(VOWELS)) assert.ok(level.some((item) => item.skills.includes(`vowel:${vowel}`)), vowel);
  assert.ok(words.some((word) => expectedSounds(word, 'sephardi').pairs[0].vowel === 'shuruk'
    && word.replace(/[^א-ת]/gu, '').length === 2));
});

test('level 2 has 40 lines of five one-syllable words and all drills share their focus', () => {
  const level = items.filter((item) => item.level === 2);
  assert.equal(level.filter(item => !item.source.beginner).length, 40);
  for (const item of level) {
    assert.equal(item.words.length, 5);
    for (const word of item.words) for (const preset of presets) {
      assert.equal(formatReading(expectedSounds(word, preset)).split('-').length, 1, word);
    }
  }
  for (const item of items.filter((item) => [1, 2, 3, 4].includes(item.level))) {
    assert.ok(item.focus);
    if (!item.source.beginner) assert.ok(item.words.every((word) => tagSkills(word).includes(item.focus)), item.id);
    assert.equal(new Set(item.words).size, item.words.length);
  }
});

test('level 3 reaches 80 lines of four real words from its named source', () => {
  const level = items.filter((item) => item.level === 3);
  assert.equal(level.length, 80);
  for (const item of level) {
    assert.equal(item.words.length, 4);
    const section = siddur.sections.find((entry) => entry.id === item.source.section);
    const words = new Set(section.segments.filter(usableSegment).flatMap(segmentWords).map(cleanWord));
    assert.ok(item.words.every((word) => words.has(word)), item.id);
  }
});

test('level 4 has 40 short lines and 150 single-word challenges, all excluded from the siddur', () => {
  const corpus = new Set(siddur.sections.flatMap((section) => section.segments.flatMap(segmentWords))
    .filter((word) => pointedWord(word)).map(cleanWord));
  const level = items.filter((item) => item.level === 4);
  assert.equal(level.filter(item => !item.source.challenge && !item.source.beginner).length, 40);
  assert.equal(level.filter(item => item.source.challenge).length, 150);
  for (const item of level) {
    assert.ok(item.source.challenge ? item.words.length === 1 : [2, 3].includes(item.words.length));
    for (const word of item.words) {
      assert.ok(!corpus.has(cleanWord(word)), word);
      for (const preset of presets) assert.ok([2, 3].includes(formatReading(expectedSounds(word, preset)).split('-').length));
    }
  }
});

test('phrase and fluency lines preserve source order and maqaf, with level 5 text excluded from level 6', () => {
  const phraseTexts = new Set(items.filter(item => item.level === 5).map(item => item.text));
  for (const [level, minimum, maximum] of [[5, 3, 5], [6, 4, 9]]) {
    const expected = new Map();
    for (const section of siddur.sections) for (const segment of section.segments.filter(usableSegment)) {
      for (const phrase of punctuatedPhrases(segment)) {
        for (const words of cutLines(phrase, minimum, maximum)) {
          const text = lineText(words);
          if (level === 6 && phraseTexts.has(text)) continue;
          if (!expected.has(text)) expected.set(text, { words, source: { section: section.id, ref: section.ref } });
        }
      }
    }
    const levelItems = items.filter((item) => item.level === level);
    assert.deepEqual(levelItems.map((item) => item.text), [...expected.keys()]);
    for (const item of levelItems) {
      assert.ok(item.words.length >= minimum && item.words.length <= maximum);
      assert.deepEqual(item.words, expected.get(item.text).words);
      assert.deepEqual(item.source, expected.get(item.text).source);
    }
    assert.ok(levelItems.some((item) => item.words.some((word) => word.endsWith('־'))));
  }
  assert.deepEqual(cutLines(['a', 'b', 'c', 'd', 'e', 'f'], 3, 5), [['a', 'b', 'c'], ['d', 'e', 'f']]);
  assert.deepEqual(cutLines(['a', 'b'], 3, 5), []);
});

test('builds are deterministic, seed changes generated work, and disk matches exactly', () => {
  assert.deepEqual(buildBank(), items);
  assert.equal(readFileSync(new URL('./items.json', import.meta.url), 'utf8'), JSON.stringify(items, null, 2) + '\n');
  const changed = buildBank({ seed: 17 });
  assert.notDeepEqual(changed.filter((item) => item.source.generated), items.filter((item) => item.source.generated));
  assert.deepEqual(changed.filter((item) => !item.source.generated), items.filter((item) => !item.source.generated));
  const a = mulberry32(5787);
  const b = mulberry32(5787);
  for (let index = 0; index < 20; index++) assert.equal(a(), b());
});

test('Shema check page includes every usable word and its source, alternatives and flags', () => {
  const page = checkPage('shema');
  const section = siddur.sections.find((entry) => entry.id === 'shema');
  const words = section.segments.filter(usableSegment).flatMap(segmentWords);
  const rows = page.split('\n').filter((line) => /^\| \d+ /u.test(line));
  assert.equal(rows.length, words.length);
  assert.ok(page.includes(`# ${section.title}`));
  assert.ok(page.includes(section.url));
  rows.forEach((row, index) => assert.equal(row.split(' | ')[1], words[index]));
  assert.ok(page.includes('he/hey/ke/key'));
  assert.ok(page.includes('a-do-nay'));
  assert.ok(page.includes('ha-shem'));
  assert.ok(page.includes('kamatz_katan'));
  assert.ok(!page.includes('יחיד'));
  assert.ok(!usableSegment('מוֹדֶה יחיד אֲנִי'));
  assert.ok(usableSegment('משֶׁה קְדשִׁים'));
  assert.ok(!usableSegment('משֶׁה קְדשִׁים יחיד'));
  assert.ok(!usableSegment('ל'));
  assert.throws(() => checkPage('../missing'), /Unknown section/u);
  assert.equal(readFileSync(new URL('../docs/check/shema.md', import.meta.url), 'utf8'), page);
});

test('merged cholam restores exactly the two Shema paragraphs while instructions remain excluded', () => {
  const rejected = siddur.sections.flatMap(section => section.segments
    .map((segment, index) => ({ segment, label: `${section.id}:${index + 1}` }))
    .filter(({ segment }) => !usableSegment(segment)).map(({ label }) => label));
  assert.deepEqual(rejected, [
    'torah-blessings:2', 'morning-blessings:5', 'shema:1', 'shema:4', 'shema:9', 'shema:11',
    'ashrei:1', 'avot:1', 'avot:4', 'avot:5',
  ]);
  const shema = siddur.sections.find(section => section.id === 'shema');
  for (const index of [6, 7]) {
    assert.ok(usableSegment(shema.segments[index]));
    const words = new Set(segmentWords(shema.segments[index]));
    for (const level of [5, 6]) assert.ok(items.some(item => item.level === level
      && item.source.section === 'shema' && item.words.some(word => words.has(word))));
  }
  const page = checkPage('shema');
  for (const word of ['משֶׁה', 'קְדשִׁים', 'וְתִירשְׁךָ']) assert.ok(page.includes(cleanWord(word)), word);
});
