import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceCardToEar } from './card-gate.js';
import { pairsApart } from './meter.js';

function profile(labels = ['a', 'o', 'e', 'i']) {
  const classes = {
    a: { f1: 7, f2: 10, n: 3 }, o: { f1: 6, f2: 9, n: 3 },
    e: { f1: 6, f2: 12, n: 3 }, i: { f1: 2, f2: 14, n: 3 },
  };
  return { version: 2, vowels: Object.fromEntries(labels.map(label => [label, classes[label]])), spread: 0.3 };
}

for (const [name, preset, vowels, labels, expected] of [
  ['Ashkenazi with every vowel', 'ashkenazi', null, ['a', 'o', 'e', 'i'], true],
  ['Ashkenazi with kamatz but no patach', 'ashkenazi', ['kamatz', 'segol', 'chirik'], ['o', 'e', 'i'], false],
  ['Ashkenazi without kamatz', 'ashkenazi', ['patach', 'segol'], ['a', 'e'], true],
  ['Sephardi with every vowel', 'sephardi', null, ['a', 'o', 'e', 'i'], true],
  ['Sephardi with kamatz but no patach', 'sephardi', ['kamatz', 'segol', 'chirik'], ['a', 'e', 'i'], true],
  ['Chassidish with every vowel', 'chassidish', null, ['a', 'e', 'i'], false],
  ['Chassidish without kamatz', 'chassidish', ['patach', 'segol'], ['a', 'e'], true],
]) {
  test(`voiceCardToEar checks a separated profile for ${name}`, () => {
    const voice = profile(labels);
    assert.equal(pairsApart(voice), true);
    assert.equal(voiceCardToEar(voice, vowels, preset), expected);
    if (vowels === null) assert.equal(voiceCardToEar(voice, undefined, preset), expected);
  });
}

test('voiceCardToEar rejects an Ashkenazi card with merged a and o', () => {
  const voice = profile();
  voice.vowels.o = { ...voice.vowels.a };
  assert.equal(pairsApart(voice), false);
  assert.equal(voiceCardToEar(voice, null, 'ashkenazi'), false);
});

test('voiceCardToEar rejects unknown presets without throwing', () => {
  const voice = profile();
  assert.equal(pairsApart(voice), true);
  for (const preset of ['unknown', 'constructor', '__proto__', null, undefined]) {
    assert.equal(voiceCardToEar(voice, null, preset), false);
    assert.equal(voiceCardToEar(voice, ['patach', 'segol'], preset), false);
  }
});

test('voiceCardToEar rejects missing profiles without throwing', () => {
  for (const voice of [null, undefined]) {
    assert.equal(voiceCardToEar(voice, null, 'ashkenazi'), false);
    assert.equal(voiceCardToEar(voice, ['patach', 'segol'], 'chassidish'), false);
  }
});

test('voiceCardToEar returns false when card construction throws', () => {
  const vowels = { includes() { throw new Error('damaged vowels'); } };
  assert.equal(voiceCardToEar(profile(), vowels, 'ashkenazi'), false);
});
