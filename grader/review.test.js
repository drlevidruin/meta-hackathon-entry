import test from 'node:test';
import assert from 'node:assert/strict';
import { expectedSounds } from '../rulebook/index.js';
import { align, gradeLine } from './index.js';
import { alignPairs } from './pairs.js';
import { phonemes } from './phonemes.js';

const grade = (text, heard) => gradeLine({
  text, preset: 'ashkenazi', heard: heard ? heard.split(' ').map(word => word.split('-')) : [],
});

test('blame: sha-vos blames only letter:bet', () => {
  const result = grade('שַׁבָּת', 'sha-vos');
  assert.deepEqual(result.words[0].pairs.map(pair => pair.blame), [[], ['letter:bet'], []]);
  assert.deepEqual(result.summary.missedSkills, ['letter:bet']);
});

test('blame: shi-bos blames only vowel:patach', () => {
  const result = grade('שַׁבָּת', 'shi-bos');
  assert.deepEqual(result.words[0].pairs.map(pair => pair.blame), [['vowel:patach'], [], []]);
  assert.deepEqual(result.summary.missedSkills, ['vowel:patach']);
});

test('blame: a skipped pair blames every skill', () => {
  const result = grade('מֶלֶךְ', 'mech');
  const skipped = result.words[0].pairs[1];
  assert.equal(skipped.verdict, 'skipped');
  assert.deepEqual(skipped.blame, skipped.skills);
  assert.deepEqual(grade('שַׁבָּת', '').verdicts.map(pair => pair.blame),
    expectedSounds('שַׁבָּת', 'ashkenazi').pairs.map(pair => pair.skills));
});

test('blame: consonant patterns and vowel patterns belong to their respective errors', () => {
  const model = {
    pair: { text: 'וַ', sounds: ['va'], consonants: ['v'], skills: [
      'letter:vav', 'pattern:vav_consonant', 'pattern:mappik',
      'pattern:closed_syllable', 'pattern:patach_genuvah', 'vowel:patach',
    ] },
    alternatives: [phonemes('va')], traditions: [],
  };
  assert.deepEqual(alignPairs(phonemes('ba'), [model], {}).pairs[0].blame,
    ['letter:vav', 'pattern:vav_consonant', 'pattern:mappik']);
  assert.deepEqual(alignPairs(phonemes('vi'), [model], {}).pairs[0].blame,
    ['pattern:closed_syllable', 'pattern:patach_genuvah', 'vowel:patach']);
});

test('blame: ok, extra, uncertain and not_decoded entries have empty blame', () => {
  for (const result of [grade('שַׁבָּת', 'sha-bos'), grade('', 'ba'),
    grade('אֶחָד', 'e-cho-de'), grade('שַׁבָּת', '?'), grade('הָעוֹלָם', 'ha-ma-kom')]) {
    for (const entry of [...result.verdicts, ...result.words.flatMap(word => word.pairs)]) {
      assert.deepEqual(entry.blame, [], entry.verdict);
    }
  }
});

test('review 1: mo-she-ba leaves the final ba extra', () => {
  const result = grade('מֹשֶׁה', 'mo-she-ba');
  assert.deepEqual(result.words[0].pairs.map(pair => pair.verdict), ['ok', 'ok']);
  assert.equal(result.summary.extra, 1);
  assert.equal(result.verdicts.find(entry => entry.verdict === 'extra').heard, 'ba');
});

for (const text of ['א', 'ה', 'ע']) {
  test(`review 1: silent ${text} cannot consume ba or an unknown token`, () => {
    for (const heard of ['ba', '?']) {
      const result = grade(text, heard);
      assert.equal(result.words.find(word => word.text === text).pairs[0].verdict, 'ok');
      assert.equal(result.words.find(word => word.text === text).pairs[0].heard, '');
      assert.equal(result.summary.pairs, 0);
      assert.equal(result.summary.extra, 1);
      assert.deepEqual(result.summary.missedSkills, []);
    }
  });
}

test('review 3: both restart attempts can span one to three heard words', () => {
  for (const earlier of ['sha-bos', 'sha bos', 'sha bo s']) {
    for (const final of ['vo-bos', 'vo bos', 'vo bo s']) {
      const result = grade('שַׁבָּת', `${earlier} ${final}`);
      assert.equal(result.words.length, 1, `${earlier} ${final}`);
      assert.deepEqual(result.words[0].pairs.map(pair => pair.heard), ['vo', 'bo', 's']);
      assert.equal(result.summary.extra, 0);
    }
  }
});

test('review 4: a final incomplete restart replaces an earlier completed attempt', () => {
  const result = grade('שַׁבָּת', 'sha-bos sha');
  assert.equal(result.words.length, 1);
  assert.deepEqual(result.words[0].pairs.map(pair => pair.heard), ['sha', '', '']);
  assert.equal(result.words[0].verdict, 'not_decoded');
  assert.equal(result.summary.extra, 0);
});

test('review 4: repeated printed words match separately even with an incomplete second read', () => {
  for (const heard of ['sha-bos sha-bos', 'sha bos sha bos', 'sha-bos sha']) {
    const result = grade('שַׁבָּת שַׁבָּת', heard);
    assert.equal(result.words.length, 2, heard);
    assert.deepEqual(result.words[0].pairs.map(pair => pair.heard), ['sha', 'bo', 's']);
    assert.equal(result.words[1].pairs[0].heard, 'sha');
    assert.equal(result.summary.extra, 0);
  }
});

test('review 4: similar neighboring printed words remain separate reads', () => {
  const result = grade('בַּת בַּר', 'bas bar');
  assert.equal(result.summary.ok, 4);
  assert.equal(result.summary.extra, 0);
  assert.deepEqual(result.words.map(word => word.pairs.map(pair => pair.heard)),
    [['ba', 's'], ['ba', 'r']]);
});

test('review 5: not_decoded preserves silent ok pairs and uncertain pairs', () => {
  const result = grade('אבַּבַּ', 'va-?');
  assert.equal(result.words[0].verdict, 'not_decoded');
  assert.deepEqual(result.words[0].pairs.map(pair => pair.verdict), ['ok', 'not_decoded', 'uncertain']);
  assert.equal(result.summary.not_decoded, 1);
  assert.equal(result.summary.uncertain, 1);
  assert.equal(result.summary.ok, 0);
  assert.deepEqual(result.summary.missedSkills, []);
});

test('review 8: a missing tradition counterpart has no alternatives', () => {
  const expected = expectedSounds('בַּ', 'ashkenazi');
  expected.pairs.push(expectedSounds('גַ', 'ashkenazi').pairs[0]);
  const before = structuredClone(expected);
  const result = align([['ba', 'gi']], [expected]);
  assert.equal(result.words[0].pairs[1].verdict, 'wrong_vowel');
  assert.equal(result.words[0].pairs[1].otherTradition, undefined);
  assert.deepEqual(expected, before);
});
