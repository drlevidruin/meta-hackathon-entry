import test from 'node:test';
import assert from 'node:assert/strict';
import { cardLabels } from '../rulebook/voice-card.js';
import { applyReferee, cardCalibration, frontRefereeSettings, frontScore, refereeSettings } from './referee.js';

const calibration = { version: 1, a: 0.19, o: 0.94, n: { a: 3, o: 3 } };
const frontCalibration = { ...calibration, i: 0.9, e: 0.1, n: { ...calibration.n, i: 3, e: 3 } };
const frontVowel = (score, token = score >= 0.5 ? 'i' : 'ɛ') => ({
  token, top: [['i', score], ['ɛ', 1 - score]],
});
const backVowel = score => ({ token: score >= 0.5 ? 'ɑ' : 'a', top: [['ɑ', score], ['a', 1 - score]] });

test('frontScore counts high front over high and mid front probabilities', () => {
  const top = [['iː', 0.2], ['ɪ', 0.1], ['e', 0.1], ['ɛ', 0.05], ['eɪ', 0.05],
    ['ə', 0.1], ['a', 0.2], ['u', 0.1], ['b', 0.1]];
  const before = structuredClone(top);
  assert.ok(Math.abs(frontScore(top) - 0.6) < 1e-12);
  assert.deepEqual(top, before);
  for (const token of ['i', 'ɪ', 'i5', 'ɪ̃', 'iɹ', 'iɚ']) assert.equal(frontScore([[token, 0.7]]), 1);
  for (const token of ['e', 'ɛ', 'eɪ', 'eː', 'ẽ', 'ɛ5', 'eɪː']) assert.equal(frontScore([[token, 0.7]]), 0);
  for (const top of [undefined, null, {}, [], [['b', 1]], [['ə', 1]], [['aɪ', 1]], [['oɪ', 1]],
    [['i', 0], ['e', 0]]]) assert.equal(frontScore(top), null);
});

function cardTokens() {
  const scores = { i: [0.9, 0.7, 0.8], e: [0.2, 0.4, 0.1] };
  return cardLabels('ashkenazi').map(label => label === 'i' || label === 'e'
    ? frontVowel(scores[label].shift())
    : label === 'a' || label === 'o' ? backVowel(calibration[label])
      : { token: 'oɪ', top: [['oɪ', 1]] });
}

test('cardCalibration adds i and e medians and counts without changing a and o', () => {
  const tokens = [{ token: 'b', top: [['b', 1]] }, ...cardTokens()];
  const before = structuredClone(tokens);
  const card = cardCalibration(tokens, cardLabels('ashkenazi'));
  assert.deepEqual(card, { ...calibration, i: 0.8, e: 0.2, n: { ...calibration.n, i: 3, e: 3 } });
  assert.deepEqual(refereeSettings(card), refereeSettings(calibration));
  assert.deepEqual(tokens, before);
  assert.deepEqual(frontRefereeSettings(JSON.parse(JSON.stringify(card))), { on: true, line: 0.5 });
});

test('cardCalibration averages two usable front scores and skips other token classes', () => {
  const tokens = cardTokens();
  const labels = cardLabels('ashkenazi');
  for (const label of ['i', 'e']) tokens[labels.indexOf(label)].token = 'ə';
  assert.deepEqual(cardCalibration(tokens, labels), {
    ...calibration, i: 0.75, e: 0.25, n: { ...calibration.n, i: 2, e: 2 },
  });
});

test('cardCalibration omits every optional front field if either class has fewer than two usable scores', () => {
  const labels = cardLabels('ashkenazi');
  for (const label of ['i', 'e']) {
    for (const unusable of [{ token: 'ɑ' }, { token: 'ə' }, { top: [] }, { top: [['u', 1]] }]) {
      const tokens = cardTokens();
      const indices = labels.flatMap((value, index) => value === label ? [index] : []).slice(0, 2);
      for (const index of indices) tokens[index] = { ...tokens[index], ...unusable };
      const card = cardCalibration(tokens, labels);
      assert.deepEqual(card, calibration);
      assert.deepEqual(frontRefereeSettings(card), { on: false, line: null });
    }
  }
  assert.equal(cardCalibration([frontVowel(0.9), frontVowel(0.8), frontVowel(0.1), frontVowel(0.2)],
    ['i', 'i', 'e', 'e']), null);
});

for (const [i, e, on] of [[0.8, 0.2, true], [0.65, 0.35, true], [0.6, 0.3, true],
  [0.57, 0.27, true], [0.569999, 0.27, false], [0.649, 0.35, false],
  [0.1, 0.9, false], [0.5, 0.5, false], [1, 0, true]]) {
  test(`frontRefereeSettings for i ${i} and e ${e}`, () => {
    assert.deepEqual(frontRefereeSettings({ ...frontCalibration, i, e }), { on, line: (i + e) / 2 });
  });
}

test('frontRefereeSettings rejects missing and invalid optional calibration fields', () => {
  for (const value of [null, undefined, {}, [], calibration, { ...frontCalibration, version: 2 },
    { ...frontCalibration, i: undefined }, { ...frontCalibration, e: null },
    { ...frontCalibration, i: '0.9' }, { ...frontCalibration, e: NaN },
    { ...frontCalibration, i: Infinity }, { ...frontCalibration, e: -0.1 },
    { ...frontCalibration, i: 1.1 }, { ...frontCalibration, n: null },
    { ...frontCalibration, n: [] }, { ...frontCalibration, n: { i: 1, e: 3 } },
    { ...frontCalibration, n: { i: 3, e: 1 } }, { ...frontCalibration, n: { i: 2.5, e: 3 } },
    { ...frontCalibration, n: { i: 3, e: '3' } }, Object.assign(() => {}, frontCalibration),
    { ...frontCalibration, n: Object.assign(() => {}, { i: 3, e: 3 }) }]) {
    assert.deepEqual(frontRefereeSettings(value), { on: false, line: null });
  }
});

for (const [from, score, to] of [['sem', 0.9, 'sim'], ['yis', 0.1, 'yes'],
  ['be', 0.6, 'bi'], ['mi', 0.4, 'me'], ['be', 0.599, 'be'], ['mi', 0.401, 'mi'],
  ['be', 0.5, 'be'], ['mi', 0.5, 'mi'], ['be', 0.1, 'be'], ['mi', 0.9, 'mi'],
  ['mey', 0.9, 'mey'], ['toy', 0.1, 'toy']]) {
  test(`front-high changes ${from} with score ${score} to ${to}`, () => {
    assert.deepEqual(applyReferee([[from]], [frontVowel(score)], frontCalibration), {
      words: [[to]], changes: from === to ? [] : [{ word: 0, syllable: 0, from, to, rule: 'front-high' }],
      status: 'checked',
    });
  });
}

test('front-high keeps decimal boundaries inclusive without admitting scores inside the margin', () => {
  const card = { ...frontCalibration, i: 0.57, e: 0.27 };
  for (const [from, score, to] of [['be', 0.52, 'bi'], ['mi', 0.32, 'me'],
    ['be', 0.519999, 'be'], ['mi', 0.320001, 'mi']]) {
    assert.deepEqual(applyReferee([[from]], [frontVowel(score)], card), {
      words: [[to]], changes: from === to ? [] : [{ word: 0, syllable: 0, from, to, rule: 'front-high' }],
      status: 'checked',
    });
  }
});

test('front-high requires a front vowel token and a usable front score', () => {
  for (const value of [frontVowel(0.9, 'ɑ'), frontVowel(0.9, 'ə'), frontVowel(0.9, 'aɪ'),
    { token: 'i', top: [] }, { token: 'i', top: [['u', 1]] }, { token: 'i' }]) {
    const words = [['sem']];
    assert.deepEqual(applyReferee(words, [value], frontCalibration), { words, changes: [], status: 'checked' });
  }
});

const profile = { version: 2, vowels: {
  e: { f1: 5, f2: 12, n: 3 }, i: { f1: 3, f2: 14, n: 3 },
}, spread: 0.2 };

test('front-high respects meter disagreements in both directions and accepts agreement or abstention', () => {
  for (const [from, score, proposed] of [['sem', 0.9, 'sim'], ['yis', 0.1, 'yes']]) {
    for (const [point, to] of [[profile.vowels.e, from === 'sem' ? from : proposed],
      [profile.vowels.i, from === 'sem' ? proposed : from], [{ f1: 4, f2: 13 }, proposed],
      [null, proposed], [undefined, proposed]]) {
      const result = applyReferee([[from]], [frontVowel(score)], frontCalibration, { points: [point], profile });
      assert.deepEqual(result, { words: [[to]], changes: from === to ? []
        : [{ word: 0, syllable: 0, from, to, rule: 'front-high' }], status: 'checked' });
    }
  }
});

test('front-high uses flat meter point indices across words and syllables without nuclei', () => {
  const words = Object.freeze([Object.freeze(["b'", 'sem']), Object.freeze(['?', 'mi'])]);
  const tokens = [frontVowel(0.9), frontVowel(0.1)];
  const before = structuredClone(tokens);
  assert.deepEqual(applyReferee(words, tokens, frontCalibration,
    { points: [profile.vowels.e, profile.vowels.i, profile.vowels.i, profile.vowels.e], profile }), {
    words: [["b'", 'sim'], ['?', 'me']], changes: [
      { word: 0, syllable: 1, from: 'sem', to: 'sim', rule: 'front-high' },
      { word: 1, syllable: 1, from: 'mi', to: 'me', rule: 'front-high' },
    ], status: 'checked',
  });
  assert.deepEqual(words, [["b'", 'sem'], ['?', 'mi']]);
  assert.deepEqual(tokens, before);
});

test('front-high uses the existing vowel alignment and leaves tied pairs alone', () => {
  assert.deepEqual(applyReferee([['se', 'nu', 'bi', 'toy']],
    [frontVowel(0.9, 'ɛ'), frontVowel(0.1, 'i'), { token: 'oɪ', top: [['oɪ', 1]] }], frontCalibration), {
    words: [['si', 'nu', 'be', 'toy']], changes: [
      { word: 0, syllable: 0, from: 'se', to: 'si', rule: 'front-high' },
      { word: 0, syllable: 2, from: 'bi', to: 'be', rule: 'front-high' },
    ], status: 'aligned',
  });
  const words = [['be', 'me', 'de']];
  assert.deepEqual(applyReferee(words, [frontVowel(0.9, 'e'), frontVowel(0.1, 'e')], frontCalibration),
    { words, changes: [], status: 'aligned' });
});

test('a and o changes stay identical on a mixed line and changed e syllables are not checked again', () => {
  const words = [['ba', 'bo', 'be', 'mi', 'mey', 'pe']];
  const tokens = [backVowel(0.9), backVowel(0.07), frontVowel(0.9), frontVowel(0.1),
    frontVowel(0.9), { token: 'ɑ', top: [['ɑ', 0.6], ['a', 0.05], ['i', 0.3], ['ɛ', 0.05]] }];
  const baseline = applyReferee(words, tokens, calibration);
  const result = applyReferee(words, tokens, frontCalibration);
  assert.deepEqual(baseline.words, [['bo', 'ba', 'be', 'mi', 'mey', 'po']]);
  assert.deepEqual(result.words, [['bo', 'ba', 'bi', 'me', 'mey', 'po']]);
  assert.deepEqual(result.changes.filter(change => change.rule !== 'front-high'), baseline.changes);
  assert.deepEqual(result.changes.filter(change => change.rule === 'front-high'), [
    { word: 0, syllable: 2, from: 'be', to: 'bi', rule: 'front-high' },
    { word: 0, syllable: 3, from: 'mi', to: 'me', rule: 'front-high' },
  ]);
  assert.equal(result.status, baseline.status);
});

test('front-high is independent of the a and o settings and leaves readings alone when both checks are off', () => {
  const card = { ...frontCalibration, a: 0.55, o: 0.6 };
  assert.equal(refereeSettings(card).on, false);
  assert.deepEqual(applyReferee([['ba', 'sem']], [backVowel(0.9), frontVowel(0.9)], card), {
    words: [['ba', 'sim']], changes: [{ word: 0, syllable: 1, from: 'sem', to: 'sim', rule: 'front-high' }],
    status: 'checked',
  });
  const words = [['sem', 'mi']];
  for (const card of [calibration, { ...frontCalibration, i: 0.6, e: 0.4 },
    { ...frontCalibration, i: NaN }, { ...frontCalibration, n: calibration.n }]) {
    assert.deepEqual(applyReferee(words, [frontVowel(0.9), frontVowel(0.1)], card),
      applyReferee(words, [frontVowel(0.9), frontVowel(0.1)], calibration));
  }
  assert.deepEqual(applyReferee(words, [frontVowel(0.9), frontVowel(0.1)], { ...card, i: 0.6, e: 0.4 }),
    { words, changes: [], status: 'off' });
});

test('a segol the phoneme model hears as a still counts as a front vowel', () => {
  const words = [['sim']];
  const result = applyReferee(words, [frontVowel(0.1, 'a')], frontCalibration);
  assert.deepEqual(result.words, [['sem']]);
  assert.deepEqual(result.changes.map(change => change.rule), ['front-high']);
});
