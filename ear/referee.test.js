import test from 'node:test';
import assert from 'node:assert/strict';
import { cardLabels } from '../rulebook/voice-card.js';
import { applyReferee, backScore, cardCalibration, nucleus, refereeSettings, vowelClass } from './referee.js';

const calibration = { version: 1, a: 0.43, o: 0.91, n: { a: 3, o: 3 } };
const vowel = (score, token = score >= 0.5 ? 'ɑ' : 'a') => ({
  token, start: 0, end: 0.02, top: [['ɑ', score], ['a', 1 - score]],
});

for (const [expected, examples] of [
  ['front', 'a aː a5 a. ã æ æː ɐ ɐ̃ a: aɜ aɹ aɚ'],
  ['back', 'ɑ ɑː ɑ5 ɑ̃ ɔ ɔː ɔ̃ o oː o5 o̞ õ ɒ ʌ ɑɜ'],
  ['other', 'e ɛ ə i iː ɪ u uː œ ø aɪ oɪ ɔɪ aʊ eɪ ja ər ɚ ɝ'],
  [null, 'b ʃ x ɹ ts <pad> <s> </s> <unk>'],
]) {
  for (const token of examples.split(' ')) {
    test(`vowelClass ${token} is ${expected}`, () => assert.equal(vowelClass(token), expected));
  }
}

test('backScore counts only front and back probabilities', () => {
  assert.equal(backScore([['ɑː', 0.3], ['o', 0.15], ['a', 0.05], ['e', 0.4], ['b', 0.1]]), 0.9);
  assert.equal(backScore([['a', 0.7]]), 0);
  assert.equal(backScore([['o', 0.7]]), 1);
  for (const top of [[], [['b', 1]], [['a', 0], ['o', 0]]]) assert.equal(backScore(top), null);
});

test('nucleus finds the first vowel or diphthong', () => {
  for (const [syllable, expected] of [['toy', 'oy'], ['mey', 'ey'], ['bay', 'ay'], ['ba', 'a'],
    ['le', 'e'], ['mi', 'i'], ['bo', 'o'], ['nu', 'u'], ["b'", ''], ['?', '']]) {
    assert.equal(nucleus(syllable), expected);
  }
});

function cardTokens() {
  const scores = { a: [0.75, 0.36, 0.43], o: [0.91, 0.93, 0.86] };
  return cardLabels('ashkenazi').map(label => label === 'a' || label === 'o'
    ? vowel(scores[label].shift())
    : { token: label || 'oɪ', start: 0, end: 0.02, top: [[label || 'oɪ', 1]] });
}

test('cardCalibration takes medians from the Ashkenazi card and skips consonants', () => {
  assert.deepEqual(cardCalibration([{ token: 'b', top: [['b', 1]] }, ...cardTokens()], cardLabels('ashkenazi')),
    calibration);
});

test('cardCalibration requires aligned vowels and two scores for each class', () => {
  const tokens = cardTokens();
  assert.equal(cardCalibration(tokens.slice(1), cardLabels('ashkenazi')), null);
  assert.equal(cardCalibration([vowel(0.1), vowel(0.9), vowel(0.8)], ['a', 'o', 'o']), null);
  assert.equal(cardCalibration(null, cardLabels('ashkenazi')), null);
});

test('cardCalibration skips a labeled vowel heard as ɛ and averages the middle two', () => {
  const tokens = cardTokens();
  tokens[1] = { token: 'ɛ', top: [['ɛ', 0.8], ['a', 0.2]] };
  assert.deepEqual(cardCalibration(tokens, cardLabels('ashkenazi')),
    { version: 1, a: 0.395, o: 0.91, n: { a: 2, o: 3 } });
});

for (const [a, o, on, line] of [[0.43, 0.91, true, 0.5], [0.65, 0.99, true, 0.7],
  [0.9, 0.99, false, 0.95], [0.2, 0.55, false, 0.5]]) {
  test(`refereeSettings for a ${a} and o ${o}`, () => {
    assert.deepEqual(refereeSettings({ ...calibration, a, o }), { on, line, low: 0.15 });
  });
}

test('refereeSettings rejects missing and malformed calibration without throwing', () => {
  for (const value of [null, undefined, {}, [], { ...calibration, version: 2 }, { ...calibration, a: '0.43' },
    { ...calibration, o: NaN }, { ...calibration, a: -0.1 }, { ...calibration, o: 1.1 },
    { ...calibration, n: null }, { ...calibration, n: { a: 1, o: 3 } },
    { ...calibration, n: { a: 2.5, o: 3 } }, Object.assign(() => {}, calibration),
    { ...calibration, n: Object.assign(() => {}, { a: 3, o: 3 }) }]) {
    assert.deepEqual(refereeSettings(value), { on: false, line: null, low: null });
  }
});

test('applyReferee corrects ka-tan and reports whole syllables without mutating inputs', () => {
  const words = Object.freeze([Object.freeze(['ka', 'tan'])]);
  const result = applyReferee(words, [vowel(0.9), vowel(0.8)], calibration);
  assert.deepEqual(result, { words: [['ko', 'ton']], changes: [
    { word: 0, syllable: 0, from: 'ka', to: 'ko' },
    { word: 0, syllable: 1, from: 'tan', to: 'ton' },
  ], status: 'checked' });
  assert.deepEqual(words, [['ka', 'tan']]);
});

for (const [words, tokens, expected] of [
  [[['yom']], [vowel(0.07)], [['yam']]],
  [[['bo', 'nim']], [vowel(0.25), { token: 'i', top: [['i', 1]] }], [['bo', 'nim']]],
  [[['le', 'pe', 'ne', 'che']], [vowel(0.1), vowel(0.9), vowel(0.1), vowel(0.8)], [['le', 'po', 'ne', 'cho']]],
  [[['toy', 'ra']], [{ token: 'oɪ', top: [['oɪ', 1]] }, vowel(0.9)], [['toy', 'ro']]],
  [[['ka'], ["b'", 'tan', '?']], [vowel(0.9), { token: 't', top: [['t', 1]] }, vowel(0.8)],
    [['ko'], ["b'", 'ton', '?']]],
  [[['be', 'ba']], [vowel(0.07), { token: 'ɑ', top: [['ɑ', 0], ['a', 0]] }], [['be', 'ba']]],
]) {
  test(`applyReferee handles ${words.map(word => word.join('-')).join(' ')}`, () => {
    const result = applyReferee(words, tokens, calibration);
    assert.equal(result.status, 'checked');
    assert.deepEqual(result.words, expected);
  });
}

test('applyReferee uses inclusive line and exclusive low boundaries', () => {
  assert.deepEqual(applyReferee([['ba', 'bo']], [vowel(0.5), vowel(0.15)], calibration).words, [['bo', 'bo']]);
});

test('applyReferee leaves count mismatches and disabled readings unchanged', () => {
  const words = [['ka', 'tan']];
  assert.deepEqual(applyReferee(words, [vowel(0.9)], calibration), { words, changes: [], status: 'count' });
  for (const [tokens, card] of [[null, calibration], [[], null]]) {
    assert.deepEqual(applyReferee(words, tokens, card), { words, changes: [], status: 'off' });
  }
});
