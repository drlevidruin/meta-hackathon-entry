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
  ['other', 'e ɛ ə i iː ɪ u uː y ʏ œ ø aɪ oɪ ɔɪ aʊ eɪ ja ər ɚ ɝ'],
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
    { word: 0, syllable: 0, from: 'ka', to: 'ko', rule: 'phoneme' },
    { word: 0, syllable: 1, from: 'tan', to: 'ton', rule: 'phoneme' },
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

const profile = { version: 2, vowels: {
  a: { f1: 7, f2: 10, n: 3 }, o: { f1: 4, f2: 8, n: 3 },
}, spread: 0.2 };
const ambiguous = { f1: 5.5, f2: 9 };

test('rounded corrects ko-sov to ko-suv from a normalized œ token', () => {
  assert.deepEqual(applyReferee([['ko', 'sov']], [vowel(0.9, 'ɑː'), vowel(0.1, 'œ')], calibration), {
    words: [['ko', 'suv']],
    changes: [{ word: 0, syllable: 1, from: 'sov', to: 'suv', rule: 'rounded' }], status: 'checked',
  });
});

for (const token of 'u ʊ y ʏ ø œ uː ʊ5 ỹ ʏː ø̞ œɹ'.split(' ')) {
  test(`rounded normalizes ${token} and takes precedence over coda-l`, () => {
    assert.deepEqual(applyReferee([['kol']], [vowel(0.1, token)], calibration,
      { points: [profile.vowels.a], profile }), {
      words: [['kul']],
      changes: [{ word: 0, syllable: 0, from: 'kol', to: 'kul', rule: 'rounded' }], status: 'checked',
    });
  });
}

for (const [from, token] of [['ka', 'œ'], ['toy', 'œ'], ['ke', 'œ'], ['ku', 'œ'], ['ko', 'ɑ']]) {
  test(`rounded leaves ${from} paired with ${token} unchanged`, () => {
    const words = [[from]];
    assert.deepEqual(applyReferee(words, [vowel(0.9, token)], calibration),
      { words, changes: [], status: 'checked' });
  });
}

for (const [from, score, point, voice, to, rule] of [
  ['toy-ra', 0.07, ambiguous, profile, 'toy-?', 'open-end'],
  ['toy-ra', 0.07, profile.vowels.a, profile, 'toy-ra'],
  ['toy-ra', 0.07, profile.vowels.o, profile, 'toy-ro', 'open-end'],
  ['toy-ra', 0.37, profile.vowels.o, profile, 'toy-ro', 'open-end'],
  ['toy-ra', 0.07, null, profile, 'toy-ra'],
  ['toy-ra', 0.07, undefined, profile, 'toy-ra'],
  ['toy-ra', 0.07, profile.vowels.o, undefined, 'toy-ra'],
  ['she-ma', 0.07, profile.vowels.a, profile, 'she-ma'],
  ['so-ro', 0.07, profile.vowels.o, profile, 'so-ro'],
  ['so-ro', 0.07, profile.vowels.a, profile, 'so-ra', 'open-end'],
  ['so-ro', 0.07, ambiguous, profile, 'so-?', 'open-end'],
  ['so-ro', 0.07, null, profile, 'so-ro'],
  ['so-ro', 0.07, undefined, profile, 'so-ro'],
  ['so-ro', 0.07, profile.vowels.a, undefined, 'so-ro'],
  ['so-ro', 0.07, profile.vowels.a, { ...profile, spread: 2 }, 'so-ro'],
  ['so-ro', 0.15, profile.vowels.a, profile, 'so-ro'],
  ['so-ro', 0.37, profile.vowels.a, profile, 'so-ro'],
]) {
  test(`open end: ${from} with score ${score}, point ${JSON.stringify(point)} and profile ${!!voice} gives ${to}`, () => {
    const [head] = from.split('-');
    const token = { toy: 'oɪ', she: 'e', so: 'ɑ' }[head];
    assert.deepEqual(applyReferee([from.split('-')],
      [{ token, top: [[token, 1]] }, vowel(score)], calibration, { points: [null, point], profile: voice }), {
      words: [to.split('-')], changes: rule
        ? [{ word: 0, syllable: 1, from: from.split('-')[1], to: to.split('-')[1], rule }] : [], status: 'checked',
    });
  });
}

test('an open-end o in the band does not ask the meter for a point', () => {
  const words = [['so', 'ro']];
  assert.deepEqual(applyReferee(words, [vowel(0.9), vowel(0.37)], calibration, {
    profile, get points() { assert.fail('an open-end o in the band must keep its vowel'); },
  }), { words, changes: [], status: 'checked' });
});

test('an open end still raises to o at the calibrated line', () => {
  assert.deepEqual(applyReferee([['tze', 'da', 'ka']],
    [vowel(0.1, 'e'), vowel(0.07), vowel(0.5)], calibration, { points: [null, null, profile.vowels.a], profile }), {
    words: [['tze', 'da', 'ko']],
    changes: [{ word: 0, syllable: 2, from: 'ka', to: 'ko', rule: 'phoneme' }], status: 'checked',
  });
});

test('an open end with no front or back score keeps the ear vowel', () => {
  for (const [last, token, top] of [
    ['ra', 'ɛ', [['ɑ', 0.9], ['a', 0.1]]],
    ['ro', 'ɛ', [['ɑ', 0.1], ['a', 0.9]]],
    ['ra', 'a', []], ['ro', 'ɑ', []],
  ]) {
    const words = [['toy', last]];
    assert.deepEqual(applyReferee(words, [{ token: 'oɪ', top: [['oɪ', 1]] }, { token, top }], calibration,
      { points: [null, ambiguous], profile }), { words, changes: [], status: 'checked' });
  }
});

test('open ends are determined from each word and use flat point indices', () => {
  const words = Object.freeze([Object.freeze(['?', 'toy', 'ra']), Object.freeze(['she', 'ma'])]);
  const points = Object.freeze([null, null, profile.vowels.o, null, profile.vowels.a]);
  const tokens = [{ token: 'oɪ', top: [['oɪ', 1]] }, vowel(0.07), vowel(0.1, 'e'), vowel(0.07)];
  assert.deepEqual(applyReferee(words, tokens, calibration, { points, profile }), {
    words: [['?', 'toy', 'ro'], ['she', 'ma']],
    changes: [{ word: 0, syllable: 2, from: 'ra', to: 'ro', rule: 'open-end' }], status: 'checked',
  });
  assert.deepEqual(words, [['?', 'toy', 'ra'], ['she', 'ma']]);
});

for (const [from, score, point, voice, to, rule] of [
  ['chal', 0.84, profile.vowels.a, profile, 'chal'],
  ['dol', 0.84, profile.vowels.o, profile, 'dol'],
  ['kol', 0.84, profile.vowels.a, profile, 'kal', 'coda-l'],
  ['kol', 0.84, ambiguous, profile, '?', 'coda-l'],
  ['kol', 0.84, null, profile, 'kol'],
  ['kol', 0.84, undefined, profile, 'kol'],
  ['kol', 0.84, profile.vowels.a, undefined, 'kol'],
  ['chal', 0.84, profile.vowels.o, profile, 'chol', 'coda-l'],
  ['chal', 0.84, ambiguous, profile, 'chal'],
  ['mal', 0.84, undefined, undefined, 'mal'],
  ['lal', 0.84, undefined, undefined, 'lal'],
  ['chel', 0.84, profile.vowels.o, profile, 'chel'],
  ['kol', 0.07, profile.vowels.o, profile, 'kal', 'phoneme'],
  ['kol', 0.07, null, undefined, 'kal', 'phoneme'],
  ['la', 0.84, profile.vowels.a, profile, 'lo', 'phoneme'],
  ['lo', 0.84, profile.vowels.a, profile, 'lo'],
  ['lo', 0.07, profile.vowels.o, profile, 'la', 'phoneme'],
]) {
  test(`final l: ${from} with score ${score}, point ${JSON.stringify(point)} and profile ${!!voice} gives ${to}`, () => {
    const result = applyReferee([[from]], [vowel(score)], calibration, { points: [point], profile: voice });
    assert.deepEqual(result, { words: [[to]], changes: rule
      ? [{ word: 0, syllable: 0, from, to, rule }] : [], status: 'checked' });
  });
}

for (const [score, point, voice, to, rule] of [
  [0.37, profile.vowels.a, profile, 'kam', 'band'],
  [0.37, profile.vowels.o, profile, 'kom'],
  [0.37, ambiguous, profile, '?', 'band'],
  [0.37, null, profile, 'kom'],
  [0.37, undefined, undefined, 'kom'],
  [0.37, profile.vowels.a, undefined, 'kom'],
  [0.15, profile.vowels.a, profile, 'kam', 'band'],
  [0.5, profile.vowels.a, profile, 'kom'],
  [0.07, profile.vowels.o, profile, 'kam', 'phoneme'],
]) {
  test(`band: kom with score ${score}, point ${JSON.stringify(point)} and profile ${!!voice} gives ${to}`, () => {
    const result = applyReferee([['kom']], [vowel(score)], calibration, { points: [point], profile: voice });
    assert.deepEqual(result, { words: [[to]], changes: rule
      ? [{ word: 0, syllable: 0, from: 'kom', to, rule }] : [], status: 'checked' });
  });
}

for (const [reason, voice] of [
  ['nearby centroids', { ...profile, vowels: { ...profile.vowels, o: { f1: 7.2, f2: 10.2, n: 3 } } }],
  ['overlapping spread', { ...profile, spread: 2 }],
  ['missing a', { ...profile, vowels: { o: profile.vowels.o } }],
  ['missing o', { ...profile, vowels: { a: profile.vowels.a } }],
]) {
  test(`an unready meter (${reason}) preserves coda-l and band vowels but still undoes a low o`, () => {
    const words = [['chal', 'kol', 'kom', 'kol', 'kom']];
    const tokens = [0.84, 0.84, 0.37, 0.07, 0.07].map(score => vowel(score));
    const points = words.flat().map(() => profile.vowels.o);
    assert.deepEqual(applyReferee(words, tokens, calibration, { points, profile: voice }), {
      words: [['chal', 'kol', 'kom', 'kal', 'kam']],
      changes: [{ word: 0, syllable: 3, from: 'kol', to: 'kal', rule: 'phoneme' },
        { word: 0, syllable: 4, from: 'kom', to: 'kam', rule: 'phoneme' }], status: 'checked',
    });
  });
}

test('the band requires a front or back token and follows the calibrated line', () => {
  const options = { points: [profile.vowels.a], profile };
  assert.deepEqual(applyReferee([['kom']], [vowel(0.37, 'e')], calibration, options).words, [['kom']]);
  assert.deepEqual(applyReferee([['kom']], [vowel(0.6)], calibration, options).words, [['kom']]);
  assert.deepEqual(applyReferee([['kom']], [vowel(0.6)], { ...calibration, a: 0.65, o: 0.99 }, options),
    { words: [['kam']], changes: [{ word: 0, syllable: 0, from: 'kom', to: 'kam', rule: 'band' }], status: 'checked' });
});

test('points use flat syllable indices even across words and syllables without nuclei', () => {
  const words = Object.freeze([Object.freeze(["b'", 'kol']), Object.freeze(['?', 'kom'])]);
  const points = Object.freeze([null, profile.vowels.a, profile.vowels.a, profile.vowels.o]);
  const before = structuredClone(profile);
  assert.deepEqual(applyReferee(words, [vowel(0.84), vowel(0.37)], calibration, { points, profile }), {
    words: [["b'", 'kal'], ['?', 'kom']],
    changes: [{ word: 0, syllable: 1, from: 'kol', to: 'kal', rule: 'coda-l' }], status: 'checked',
  });
  assert.deepEqual(profile, before);
  assert.deepEqual(words, [["b'", 'kol'], ['?', 'kom']]);
});

test('equal counts retain identity pairing even when the classes suggest gaps', () => {
  assert.deepEqual(applyReferee([['ba', 'mi', 'te']],
    [vowel(0.9, 'i'), vowel(0.9), vowel(0.9)], calibration), {
    words: [['ba', 'mi', 'to']],
    changes: [{ word: 0, syllable: 2, from: 'te', to: 'to', rule: 'phoneme' }], status: 'checked',
  });
});

const phoneme = (token, index = 0) => ({
  token, start: index * 0.1,
  top: [[token, 0.85], [vowelClass(token) === 'back' ? 'a' : 'ɑ', 0.1], ['<pad>', 0.05]],
});

test('Shema alignment corrects the certain ra pair and leaves the tied second a-do-noy alone', () => {
  const words = [['she', 'ma'], ['yis', 'ra', 'el'], ['a', 'do', 'noy'], ['a', 'do', 'noy'], ['e', 'chod']];
  // The first noy and second do have no phoneme vowel. Open a/o classes tie
  // over the repeated a-do-noy, so its uncertain pairs must not be refereed.
  const tokens = 'a a i ɑ ɛ a ɑ a aɪ ɛ ɑ'.split(' ').map(phoneme);
  assert.deepEqual(applyReferee(words, tokens, calibration), {
    words: [['she', 'ma'], ['yis', 'ro', 'el'], ['a', 'do', 'noy'], ['a', 'do', 'noy'], ['e', 'chod']],
    changes: [{ word: 1, syllable: 1, from: 'ra', to: 'ro', rule: 'phoneme' }], status: 'aligned',
  });
});

test('13 syllables align to 11 vowels, correcting matches while leaving both gap syllables alone', () => {
  const words = [['ka', 'mi', 'nu'], ['be', 'tan', 'toy', 'bay'], ['li', 'ku', 'mey', 'pa', 'ra', 'ni']];
  const tokens = [vowel(0.9), phoneme('i'), phoneme('u'), phoneme('e'), phoneme('oɪ'), phoneme('aɪ'),
    phoneme('ɪ'), phoneme('ʊ'), vowel(0.9), vowel(0.07), phoneme('i')];
  assert.deepEqual(applyReferee(words, tokens, calibration), {
    words: [['ko', 'mi', 'nu'], ['be', 'tan', 'toy', 'bay'], ['li', 'ku', 'mey', 'po', 'ra', 'ni']],
    changes: [{ word: 0, syllable: 0, from: 'ka', to: 'ko', rule: 'phoneme' },
      { word: 2, syllable: 3, from: 'pa', to: 'po', rule: 'phoneme' }], status: 'aligned',
  });
});

test('alignment skips an extra phoneme vowel without shifting the following syllables', () => {
  assert.deepEqual(applyReferee([['ka', 'mi', 'nu']],
    [vowel(0.9), phoneme('e'), phoneme('i'), phoneme('u')], calibration), {
    words: [['ko', 'mi', 'nu']],
    changes: [{ word: 0, syllable: 0, from: 'ka', to: 'ko', rule: 'phoneme' }], status: 'aligned',
  });
});

test('alignment ties leave repeated vowel pairs unchanged when best paths disagree', () => {
  const words = [['ka', 'tan', 'ma']];
  const expected = { words, changes: [], status: 'aligned' };
  assert.deepEqual(applyReferee(words, [vowel(0.9), vowel(0.07)], calibration), expected);
  assert.deepEqual(applyReferee(words, [vowel(0.9), vowel(0.07)], calibration), expected);
});

test('alignment refuses excessive gaps or a count difference above one third in either direction', () => {
  const words = [['ka', 'ba', 'mi', 'nu', 'te']];
  assert.deepEqual(applyReferee(words, [phoneme('i'), phoneme('u'), phoneme('e'), vowel(0.9)], calibration),
    { words, changes: [], status: 'count' });
  for (const [heard, tokens] of [
    [[['ka', 'mi', 'nu', 'te']], [vowel(0.9), phoneme('i')]],
    [[['ka', 'mi']], [vowel(0.9), phoneme('i'), phoneme('u'), phoneme('e')]],
  ]) assert.deepEqual(applyReferee(heard, tokens, calibration), { words: heard, changes: [], status: 'count' });
});

for (const [syllable, examples] of [
  ['ma', 'a æ ɐ ɑ ɔ o ɒ ʌ aʊ oʊ ã o̞ aɜ ɑɹ'],
  ['me', 'e ɛ ə eɪ eː'], ['mey', 'e ɛ ə eɪ'],
  ['mi', 'i ɪ iː'], ['mu', 'u ʊ u5'],
  ['moy', 'oɪ ɔɪ ɔɨ oɪː'], ['may', 'aɪ aɨ ɑɨ aɪ5'],
]) {
  test(`alignment recognizes the normalized phoneme class for ${syllable}`, () => {
    for (const token of examples.split(' ')) {
      const gap = syllable === 'ma' ? 'li' : 'ka';
      const result = applyReferee([[gap, syllable, 'bo']], [phoneme(token), vowel(0.07)], calibration);
      const middle = ['ma', 'me'].includes(syllable) && vowelClass(token) === 'back'
        ? syllable.replace(nucleus(syllable), 'o') : syllable;
      assert.deepEqual(result.words, [[gap, middle, 'bo']], token);
      assert.equal(result.status, 'aligned', token);
    }
  });
}
