import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMeter, buildVoiceProfile, decodeWav, measureVowel, meterChoice, meterDecision, pairsApart,
  soundIslands, syllablePoints, syllableRanges, VoiceCheckError } from './meter.js';
import { hasUsablePair, USABLE_PAIRS } from './pairs.js';
import { cardLabels } from '../rulebook/voice-card.js';

import { rate, vowels, silence, tone, join, utterance, wav } from './synth-for-tests.js';

const bark = (hz) => 26.81 * hz / (1960 + hz) - 0.53;

function near(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

function whiteNoise(seconds) {
  let seed = 1;
  return silence(seconds).map(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  });
}

let profile;
function voiceProfile() {
  const labels = ['a', 'o', 'e', 'i', 'a', 'o', 'e', 'i'];
  profile ??= buildVoiceProfile(wav(utterance(labels)), labels);
  return profile;
}

const phone = (token, start, end) => ({ token, start, end, top: [[token, 1]] });

function connectedReading() {
  const data = wav(join([silence(0.25), ...['o', 'u', 'i', 'a'].map(label => tone(vowels[label])), silence(0.25)]));
  const words = [['ba', 'ruch'], ['me', 'ta']];
  const tokens = [phone('<pad>', 0, 0.25), phone('b', 0.25, 0.28), phone('a', 0.28, 0.48),
    phone('r', 0.5, 0.53), phone('u', 0.53, 0.73), phone('m', 0.75, 0.78), phone('e', 0.78, 0.98),
    phone('t', 1, 1.03), phone('ɑ', 1.03, 1.23), phone('<unk>', 1.25, 1.27)];
  return { data, words, tokens };
}

test('decodeWav round trips signed PCM samples and Uint8Array views', () => {
  const input = new Float64Array([-1, -0.5, 0, 0.25, 32767 / 32768]);
  const data = wav(input);
  assert.deepEqual(decodeWav(data), { samples: input, rate });
  const padded = new Uint8Array(data.length + 8);
  padded.set(data, 3);
  assert.deepEqual(decodeWav(padded.subarray(3, 3 + data.length)), { samples: input, rate });
});

for (const [name, offset, value, size] of [
  ['stereo', 22, 2, 2], ['8-bit', 34, 8, 2], ['44.1 kHz', 24, 44100, 4], ['non-PCM', 20, 3, 2],
]) {
  test(`decodeWav rejects ${name} with a format error`, () => {
    const data = wav(silence(0.1));
    data.writeUIntLE(value, offset, size);
    assert.throws(() => decodeWav(data), (error) => error instanceof VoiceCheckError && error.code === 'format');
  });
}

test('decodeWav walks unknown RIFF chunks and honors odd chunk padding', () => {
  const original = wav(new Float64Array([0, 0.5, -0.5]));
  const junk = Buffer.alloc(10);
  junk.write('JUNK');
  junk.writeUInt32LE(1, 4);
  junk[8] = 123;
  const data = Buffer.concat([original.subarray(0, 12), junk, original.subarray(12, 36), junk, original.subarray(36)]);
  data.writeUInt32LE(data.length - 8, 4);
  assert.deepEqual(decodeWav(data), decodeWav(original));
});

test('decodeWav rejects malformed, truncated and missing chunks as format errors', () => {
  const data = wav(silence(0.1));
  const missingFormat = Buffer.from(data);
  missingFormat.write('JUNK', 12);
  const oddData = Buffer.from(data);
  oddData.writeUInt32LE(3, 40);
  const missingData = Buffer.from(data);
  missingData.write('JUNK', 36);
  const badSignature = Buffer.from(data);
  badSignature.write('NOPE', 0);
  for (const invalid of [null, new Uint8Array(3), data.subarray(0, -1), missingFormat, oddData, missingData, badSignature]) {
    assert.throws(() => decodeWav(invalid), (error) => error instanceof VoiceCheckError && error.code === 'format');
  }
});

test('soundIslands finds three separated 250 ms syllables and returns sample ranges', () => {
  const samples = utterance(['a', 'o', 'e']);
  const islands = soundIslands(samples, rate);
  assert.equal(islands.length, 3);
  for (const [i, island] of islands.entries()) {
    assert.ok(island.start <= (0.25 + i * 0.5 + 0.025) * rate);
    assert.ok(island.end >= (0.5 + i * 0.5 - 0.025) * rate);
    assert.equal(island.start % 160, 0);
    assert.equal(island.end % 160, 0);
  }
});

test('soundIslands drops a 50 ms blip and silence, and merges bursts 40 ms apart', () => {
  assert.deepEqual(soundIslands(silence(1), rate), []);
  assert.deepEqual(soundIslands(join([silence(0.25), tone(vowels.a, 0.05), silence(0.25)]), rate), []);
  assert.equal(soundIslands(join([silence(0.25), tone(vowels.a), silence(0.04), tone(vowels.a), silence(0.25)]), rate).length, 1);
  assert.equal(soundIslands(new Float64Array(), rate).length, 0);
});

test('soundIslands drops a separate 150 ms white-noise burst between voiced syllables', () => {
  const data = wav(join([
    silence(0.25), tone(vowels.o), silence(0.25), whiteNoise(0.15),
    silence(0.25), tone(vowels.i), silence(0.25),
  ]));
  const { samples } = decodeWav(data);
  assert.equal(soundIslands(samples, rate).length, 2);
  assert.deepEqual(applyMeter([['ba', 'be']], data, voiceProfile()), {
    words: [['bo', 'bi']],
    changes: [{ index: 0, from: 'ba', to: 'bo' }, { index: 1, from: 'be', to: 'bi' }],
    applied: true,
  });
});

test('soundIslands keeps islands with at least 30 percent voiced frames', () => {
  // Ten frames: 640 samples gives two voiced frames; 720 gives three.
  for (const [voicedSamples, expected] of [[640, 0], [720, 1]]) {
    const samples = silence(0.12).map((_, i) => i < voicedSamples || i % 2 ? 0.5 : -0.5);
    assert.equal(soundIslands(samples, rate).length, expected);
  }
});

for (const label of ['a', 'o', 'e', 'i']) {
  test(`measureVowel recovers synthetic ${label} formants within 10 percent`, () => {
    const samples = tone(vowels[label]);
    const measured = measureVowel(samples, rate, 0, samples.length);
    assert.ok(measured);
    near(measured.f1, vowels[label][0], vowels[label][0] * 0.1);
    near(measured.f2, vowels[label][1], vowels[label][1] * 0.1);
  });
}

test('measureVowel returns null for silence, short ranges and high zero crossings', () => {
  assert.equal(measureVowel(silence(0.25), rate, 0, 4000), null);
  assert.equal(measureVowel(tone(vowels.a), rate, 0, 800), null);
  const noise = new Float64Array(4000).map((_, i) => i % 2 ? 0.5 : -0.5);
  assert.equal(measureVowel(noise, rate, 0, noise.length), null);
});

test('syllablePoints measures every flat syllable in Bark using the meter islands', () => {
  const words = Object.freeze([Object.freeze(["b'", 'bo']), Object.freeze(['?', 'bi'])]);
  const data = wav(utterance(['a', 'o', 'e', 'i']));
  const { samples } = decodeWav(data);
  const expected = soundIslands(samples, rate).map(({ start, end }) => {
    const value = measureVowel(samples, rate, start, end);
    return { f1: bark(value.f1), f2: bark(value.f2) };
  });
  assert.deepEqual(syllablePoints(words, data), expected);
});

test('syllablePoints retains a null for a sound island without measurable formants', () => {
  const hum = silence(0.25).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 100 * i / rate));
  const data = wav(join([utterance(['a']), hum, silence(0.25), utterance(['o'])]));
  const points = syllablePoints([['ba', 'bo', 'bo']], data);
  assert.equal(points.length, 3);
  assert.ok(points[0]);
  assert.equal(points[1], null);
  assert.ok(points[2]);
});

test('syllablePoints returns null for island mismatches and undecodable WAV', () => {
  assert.equal(syllablePoints([['ba']], wav(utterance(['a', 'o']))), null);
  assert.equal(syllablePoints([['ba', 'bo']], wav(utterance(['a']))), null);
  assert.equal(syllablePoints([['ba']], wav(silence(0.25))), null);
  for (const data of [null, Buffer.from('not WAV'), wav(utterance(['a'])).subarray(0, 50)]) {
    assert.equal(syllablePoints([['ba']], data), null);
  }
});

test('meterChoice chooses either vowel only with a strict margin', () => {
  const voice = { version: 2, vowels: {
    a: { f1: 0, f2: 8, n: 3 }, o: { f1: 7, f2: 8, n: 3 },
  }, spread: 0 };
  assert.equal(meterChoice(voice.vowels.a, voice, ['a', 'o']), 'a');
  assert.equal(meterChoice(voice.vowels.o, voice, ['a', 'o']), 'o');
  assert.equal(meterChoice({ f1: 2.9, f2: 8 }, voice, ['a', 'o']), 'a');
  assert.equal(meterChoice({ f1: 3, f2: 8 }, voice, ['a', 'o']), null);
  assert.equal(meterChoice({ f1: 3, f2: 8 }, voice, ['a', 'o'], { margin: 0.8 }), 'a');
  assert.equal(meterChoice({ f1: 3.5, f2: 8 }, voice, ['a', 'o']), null);
  assert.equal(meterChoice(voice.vowels.o, voice, ['a', 'o', 'u']), 'o');
});

test('meterChoice requires every other candidate to be apart with the meter defaults and options', () => {
  const voice = { version: 2, vowels: {
    a: { f1: 4, f2: 9, n: 3 }, o: { f1: 4, f2: 8, n: 3 },
  }, spread: 0.2 };
  assert.equal(meterChoice(voice.vowels.o, voice, ['a', 'o']), 'o');
  const wide = { ...voice, spread: 0.6 };
  assert.equal(meterChoice(voice.vowels.o, wide, ['a', 'o']), null);
  assert.equal(meterChoice(voice.vowels.o, wide, ['a', 'o'], { gapFactor: 1 }), 'o');
  assert.equal(meterChoice(voice.vowels.o, voice, ['a', 'o'], { minGap: 1.1 }), null);
  const merged = { ...voice, vowels: { ...voice.vowels, a: { f1: 4, f2: 8.5, n: 3 } }, spread: 0 };
  assert.equal(meterChoice(merged.vowels.o, merged, ['a', 'o']), null);
  assert.equal(meterChoice(merged.vowels.o, merged, ['a', 'o'], { minGap: 0.4 }), 'o');
  const three = { ...voice, vowels: { ...voice.vowels, e: merged.vowels.a } };
  assert.equal(meterChoice(voice.vowels.o, three, ['a', 'o']), 'o');
  assert.equal(meterChoice(voice.vowels.o, three, ['a', 'o', 'e']), null);
  const unequal = { ...voice, spread: 0.45, vowels: {
    a: { ...voice.vowels.a, n: 2 }, o: { ...voice.vowels.o, n: 15 },
  } };
  assert.equal(meterChoice(voice.vowels.o, unequal, ['a', 'o']), null);
  assert.equal(meterChoice(voice.vowels.o, { ...unequal,
    vowels: { ...unequal.vowels, a: { ...unequal.vowels.a, n: 15 } } }, ['a', 'o']), 'o');
});

test('meterChoice rejects missing points, damaged profiles and fewer than two available candidates', () => {
  const voice = voiceProfile();
  const point = voice.vowels.a;
  for (const missing of [null, undefined, {}, { f1: NaN, f2: 8 }, { f1: 4, f2: Infinity }]) {
    assert.equal(meterChoice(missing, voice, ['a', 'o']), null);
  }
  for (const invalid of [null, undefined, {}, { ...voice, version: 1 },
    ...[null, [], {}, 'vowels'].map(vowels => ({ ...voice, vowels })),
    ...[-1, NaN, Infinity, '0.3', undefined].map(spread => ({ ...voice, spread })),
    ...[null, { f1: NaN, f2: 8, n: 3 }, { f1: 4, f2: 8, n: 0 },
      { f1: 4, f2: 8, n: 2.5 }].map(o => ({ ...voice, vowels: { ...voice.vowels, o } })),
  ]) assert.equal(meterChoice(point, invalid, ['a', 'o']), null);
  for (const candidates of [null, [], ['a'], ['a', 'u'], ['a', 'a']]) {
    assert.equal(meterChoice(point, voice, candidates), null);
  }
  const coincident = { ...voice, vowels: { a: point, o: point } };
  assert.equal(meterChoice(point, coincident, ['a', 'o'], { minGap: 0, gapFactor: 0 }), null);
});

test('buildVoiceProfile keeps numeric Bark means and counts, skipping null labels and singleton classes', () => {
  const sounds = ['a', 'o', 'e', 'i', 'a', 'o', 'e', 'i', 'o'];
  const labels = ['a', 'o', 'e', 'i', 'a', 'o', 'e', 'i', null];
  const data = wav(utterance(sounds));
  const result = buildVoiceProfile(data, labels);
  assert.deepEqual(Object.keys(result), ['version', 'vowels', 'spread']);
  assert.equal(result.version, 2);
  assert.equal(result.spread, 0);
  assert.deepEqual(Object.keys(result.vowels), ['a', 'o', 'e', 'i']);
  const { samples } = decodeWav(data);
  const islands = soundIslands(samples, rate);
  for (const [label, value] of Object.entries(result.vowels)) {
    assert.deepEqual(Object.keys(value), ['f1', 'f2', 'n']);
    assert.equal(value.n, 2);
    assert.ok(Object.values(value).every(Number.isFinite));
    for (const [key, f] of [['f1', 0], ['f2', 1]]) {
      near(value[key], bark(vowels[label][f]), 0.5);
      const measured = islands.flatMap(({ start, end }, i) => labels[i] === label
        ? [bark(measureVowel(samples, rate, start, end)[key])] : []);
      assert.equal(value[key], Math.round(measured.reduce((sum, v) => sum + v, 0) / measured.length * 1000) / 1000);
    }
  }
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  const singleton = buildVoiceProfile(wav(utterance(['a', 'a', 'o', 'o', 'i'])), ['a', 'a', 'o', 'o', 'i']);
  assert.deepEqual(Object.keys(singleton.vowels), ['a', 'o']);
});

test('buildVoiceProfile ignores separate white-noise islands when matching labels', () => {
  const samples = join([utterance(['a', 'o']), whiteNoise(0.15), utterance(['a', 'o'])]);
  const result = buildVoiceProfile(wav(samples), ['a', 'o', 'a', 'o']);
  assert.deepEqual(Object.keys(result.vowels), ['a', 'o']);
  assert.equal(result.vowels.a.n, 2);
  assert.equal(result.vowels.o.n, 2);
});

test('buildVoiceProfile reports island counts and rejects two-vowel cards with only one measured class', () => {
  const data = wav(utterance(['a', 'a', 'o']));
  assert.throws(() => buildVoiceProfile(data, ['a', 'o']), (error) => error instanceof VoiceCheckError
    && error.code === 'count' && error.heard === 3);
  const hum = silence(0.25).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 100 * i / rate));
  assert.equal(measureVowel(hum, rate, 0, hum.length), null);
  const quiet = wav(join([utterance(['a', 'a']), hum, silence(0.25), hum, silence(0.25)]));
  assert.throws(() => buildVoiceProfile(quiet, ['a', 'a', 'o', 'o']),
    (error) => error instanceof VoiceCheckError && error.code === 'quiet');
  assert.throws(() => buildVoiceProfile(wav(utterance(['a', 'a', 'o'])), ['a', 'a', 'o']),
    (error) => error instanceof VoiceCheckError && error.code === 'quiet');
  const noisy = new Float64Array(4000).map((_, i) => i % 2 ? 0.5 : -0.5);
  assert.throws(() => buildVoiceProfile(wav(noisy), ['a', 'o']), (error) => error instanceof VoiceCheckError
    && error.code === 'count' && error.heard === 0);
});

test('buildVoiceProfile rejects cards without a usable pair before decoding audio', () => {
  for (const labels of [Array(6).fill('o'), ['o', 'i', null, 'o', 'i'], ['a', 'i'], ['o', 'e'], ['e'], ['i']]) {
    assert.throws(() => buildVoiceProfile(null, labels),
      (error) => error instanceof VoiceCheckError && error.code === 'card');
  }
});

test('buildVoiceProfile rejects an unlabeled card before decoding audio', () => {
  for (const labels of [[], [null, null]]) {
    assert.throws(() => buildVoiceProfile(null, labels),
      (error) => error instanceof VoiceCheckError && error.code === 'card');
  }
});

test('buildVoiceProfile rejects a full card when only o and i classes measure', () => {
  const labels = cardLabels('ashkenazi');
  const hum = silence(0.25).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 100 * i / rate));
  const segments = labels.map(label => ['o', 'i'].includes(label) ? tone(vowels[label]) : hum);
  const data = wav(join([silence(0.25), ...segments.flatMap(segment => [segment, silence(0.25)])]));
  const { samples } = decodeWav(data);
  const islands = soundIslands(samples, rate);
  assert.equal(islands.length, labels.length);
  const measured = islands.flatMap(({ start, end }, index) => measureVowel(samples, rate, start, end)
    ? [labels[index]] : []);
  assert.deepEqual(measured, ['o', 'i', 'o', 'i', 'o', 'i']);
  assert.throws(() => buildVoiceProfile(data, labels),
    (error) => error instanceof VoiceCheckError && error.code === 'quiet');
});

test('buildVoiceProfile pools spread from kept classes around unrounded Bark centroids', () => {
  const labels = ['a', 'a', 'a', 'o', 'o', 'i', null, 'e', 'e'];
  const hum = silence(0.25).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 100 * i / rate));
  const segments = [tone([700, 1100]), tone([800, 1250]), tone([900, 1400]),
    tone([500, 950]), tone([650, 1100]), tone(vowels.i), tone(vowels.u), hum, hum];
  const data = wav(join([silence(0.25), ...segments.flatMap(segment => [segment, silence(0.25)])]));
  const result = buildVoiceProfile(data, labels);
  assert.deepEqual(Object.keys(result.vowels), ['a', 'o']);
  assert.equal(result.vowels.a.n, 3);
  assert.equal(result.vowels.o.n, 2);
  const { samples } = decodeWav(data);
  const islands = soundIslands(samples, rate);
  let squaredDeviations = 0;
  let degreesOfFreedom = 0;
  for (const label of ['a', 'o']) {
    const tokens = islands.flatMap(({ start, end }, index) => labels[index] === label
      ? [measureVowel(samples, rate, start, end)] : []);
    for (const axis of ['f1', 'f2']) {
      const values = tokens.map(token => bark(token[axis]));
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      squaredDeviations += values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
      degreesOfFreedom += values.length - 1;
      assert.equal(result.vowels[label][axis], Math.round(mean * 1000) / 1000);
    }
  }
  assert.ok(result.spread > 0);
  assert.equal(result.spread, Math.round(Math.sqrt(squaredDeviations / degreesOfFreedom) * 1000) / 1000);
});

test('pairsApart accepts a separated four-class profile and checks every usable pair', () => {
  const voice = { version: 2, vowels: {
    a: { f1: 7, f2: 10, n: 3 }, o: { f1: 6, f2: 9, n: 3 },
    e: { f1: 6, f2: 12, n: 3 }, i: { f1: 2, f2: 14, n: 3 },
  }, spread: 0.3 };
  assert.equal(pairsApart(voice), true);
  for (const [first, second] of USABLE_PAIRS) {
    const merged = { ...voice, vowels: { ...voice.vowels, [second]: { ...voice.vowels[first] } } };
    assert.equal(pairsApart(merged), false, `${first}, ${second}`);
  }
  // The o/e pair is not usable, so its centroids need not be apart.
  assert.equal(pairsApart({ ...voice, vowels: { ...voice.vowels, e: voice.vowels.o } }), true);
});

test('pairsApart rejects the card with a and o only 0.08 Bark apart', () => {
  const voice = { version: 2, vowels: {
    a: { f1: 6, f2: 9, n: 3 }, o: { f1: 6.08, f2: 9, n: 3 },
  }, spread: 0.135 };
  assert.equal(pairsApart(voice), false);
});

test('pairsApart requires a usable pair and accepts any single usable pair that is apart', () => {
  const first = { f1: 4, f2: 8, n: 3 };
  const second = { f1: 7, f2: 10, n: 3 };
  assert.equal(pairsApart({ version: 2, vowels: { o: first, i: second }, spread: 0.3 }), false);
  for (const [left, right] of USABLE_PAIRS) {
    assert.equal(pairsApart({ version: 2, vowels: { [left]: first, [right]: second }, spread: 0.3 }), true);
  }
});

test('pairsApart rejects invalid profiles without throwing', () => {
  const voice = voiceProfile();
  for (const invalid of [
    null, undefined, { ...voice, version: 1 }, { version: 2, vowels: voice.vowels },
    ...[null, [], {}, 'vowels'].map(vowels => ({ ...voice, vowels })),
    ...[-0.1, NaN, Infinity, '0.3'].map(spread => ({ ...voice, spread })),
    { ...voice, vowels: { a: null, o: voice.vowels.o } },
  ]) assert.equal(pairsApart(invalid), false);
  assert.equal(pairsApart(voice, null), false);
});

test('pairsApart matches the meter separation guard across a grid of two-class centroid gaps', () => {
  for (const [first, second] of USABLE_PAIRS) {
    for (const [n1, n2] of [[2, 2], [3, 3], [2, 15], [15, 15]]) {
      for (const spread of [0, 0.135, 0.336, 0.6]) {
        for (const options of [{}, { minGap: 0.4 }, { gapFactor: 1 }, { minGap: 1.2, gapFactor: 4 }]) {
          const { minGap = 0.8, gapFactor = 3 } = options;
          const requiredGap = Math.max(minGap, gapFactor * spread * Math.sqrt(1 / n1 + 1 / n2));
          for (let f1 = 0; f1 <= 20; f1++) {
            for (let f2 = 0; f2 <= 20; f2++) {
              const voice = { version: 2, vowels: {
                [first]: { f1: f1 / 10, f2: f2 / 10, n: n1 },
                [second]: { f1: 0, f2: 0, n: n2 },
              }, spread };
              const expected = Math.hypot(f1 / 10, f2 / 10) >= requiredGap;
              assert.equal(pairsApart(voice, options), expected);
              // At the other centroid, only the separation guard can block correction.
              if (f1 || f2) assert.equal(meterDecision(first, voice.vowels[second], voice, options),
                expected ? second : null);
            }
          }
          const boundary = { version: 2, vowels: {
            [first]: { f1: requiredGap, f2: 0, n: n1 }, [second]: { f1: 0, f2: 0, n: n2 },
          }, spread };
          assert.equal(pairsApart(boundary, options), true);
          assert.equal(meterDecision(first, boundary.vowels[second], boundary, options), second);
        }
      }
    }
  }
});

test('meterDecision equals the old rule across the full Bark grid for a well-separated four-vowel card', () => {
  const voice = { version: 2, vowels: {
    o: { f1: 6.10, f2: 9.04, n: 3 }, a: { f1: 6.89, f2: 9.87, n: 3 },
    e: { f1: 6.03, f2: 11.83, n: 3 }, i: { f1: 2.10, f2: 13.90, n: 3 },
  }, spread: 0.336 };
  function oldRule(earVowel, point, profile, margin = 0.75) {
    const candidates = earVowel === 'a' ? ['a', 'o', 'e'] : earVowel === 'e' ? ['e', 'i'] : [];
    const usable = candidates.filter(v => Object.hasOwn(profile.vowels, v));
    if (usable.length < 2) return null;
    const distances = usable.map(v => {
      const c = profile.vowels[v];
      return { v, d: Math.hypot(point.f1 - c.f1, point.f2 - c.f2) };
    }).sort((a, b) => a.d - b.d);
    const [best, second] = distances;
    return best.v !== earVowel && best.d / second.d < margin ? best.v : null;
  }
  for (let f1 = 10; f1 <= 90; f1 += 1) {
    for (let f2 = 70; f2 <= 150; f2 += 1) {
      const point = { f1: f1 / 10, f2: f2 / 10 };
      for (const earVowel of ['a', 'e']) {
        assert.equal(meterDecision(earVowel, point, voice), oldRule(earVowel, point, voice),
          `ear ${earVowel} at ${point.f1}, ${point.f2}`);
      }
    }
  }
});

test('meterDecision only returns usable pairs across the Bark grid for every subset of four classes', () => {
  assert.deepEqual(USABLE_PAIRS, [['a', 'o'], ['a', 'e'], ['e', 'i']]);
  assert.ok(Object.isFrozen(USABLE_PAIRS));
  const classes = {
    a: { f1: 7, f2: 10, n: 3 }, o: { f1: 6, f2: 9, n: 3 },
    e: { f1: 6, f2: 12, n: 3 }, i: { f1: 2, f2: 14, n: 3 },
  };
  const labels = Object.keys(classes);
  const corrections = new Set();
  for (let mask = 0; mask < 16; mask++) {
    const entries = Object.entries(classes).filter((_, i) => mask & (1 << i));
    const voice = { version: 2, vowels: Object.fromEntries(entries), spread: 0.3 };
    const present = Object.keys(voice.vowels);
    const usable = (present.includes('a') && (present.includes('o') || present.includes('e')))
      || (present.includes('e') && present.includes('i'));
    assert.equal(hasUsablePair([null, ...present, null]), usable);
    for (let f1 = 10; f1 <= 90; f1++) {
      for (let f2 = 70; f2 <= 150; f2++) {
        const point = { f1: f1 / 10, f2: f2 / 10 };
        for (const earVowel of [...labels, 'u', 'oy', 'ey', '?']) {
          const target = meterDecision(earVowel, point, voice);
          if (target === null) continue;
          const message = `profile ${present}, ear ${earVowel} at ${point.f1}, ${point.f2}: ${target}`;
          assert.notEqual(target, earVowel, message);
          assert.ok(Object.hasOwn(voice.vowels, earVowel) && Object.hasOwn(voice.vowels, target), message);
          assert.ok(USABLE_PAIRS.some(pair => pair.includes(earVowel) && pair.includes(target)), message);
          corrections.add(`${earVowel}:${target}`);
        }
      }
    }
  }
  assert.deepEqual([...corrections].sort(), ['a:e', 'a:o', 'e:i']);
});

test('meterDecision with only o leaves every ear a unchanged across the Bark grid', () => {
  const voice = { version: 2, vowels: { o: { f1: 4, f2: 8, n: 3 } }, spread: 0.3 };
  for (let f1 = 10; f1 <= 90; f1 += 1) {
    for (let f2 = 70; f2 <= 150; f2 += 1) {
      const point = { f1: f1 / 10, f2: f2 / 10 };
      assert.equal(meterDecision('a', point, voice), null, `ear a at ${point.f1}, ${point.f2}`);
    }
  }
});

test('meterDecision with o and a corrects a near o and beyond 0.75 Bark', () => {
  const voice = { version: 2, vowels: {
    o: { f1: 4, f2: 8, n: 3 }, a: { f1: 7, f2: 8, n: 3 },
  }, spread: 0.3 };
  assert.equal(meterDecision('a', voice.vowels.o, voice), 'o');
  assert.equal(meterDecision('a', { f1: 4.5, f2: 8 }, voice), 'o');
  assert.equal(meterDecision('a', { f1: 4, f2: 9 }, voice), 'o');
});

test('meterDecision with o and e leaves a unchanged when a is missing', () => {
  const voice = { version: 2, vowels: {
    o: { f1: 4, f2: 8, n: 3 }, e: { f1: 4, f2: 11, n: 3 },
  }, spread: 0.3 };
  assert.equal(meterDecision('a', voice.vowels.o, voice), null);
  assert.equal(meterDecision('a', voice.vowels.e, voice), null);
  assert.equal(meterDecision('a', { f1: 5, f2: 8 }, voice), null);
  assert.equal(meterDecision('a', { f1: 4.5, f2: 8 }, voice), null);
  assert.equal(meterDecision('a', { f1: 4, f2: 9.5 }, voice, { margin: 2 }), null);
});

test('meterDecision with o and i leaves ears a and e unchanged across the Bark grid', () => {
  const voice = { version: 2, vowels: {
    o: { f1: 4, f2: 8, n: 3 }, i: { f1: 2, f2: 14, n: 3 },
  }, spread: 0.3 };
  for (let f1 = 10; f1 <= 90; f1 += 1) {
    for (let f2 = 70; f2 <= 150; f2 += 1) {
      const point = { f1: f1 / 10, f2: f2 / 10 };
      for (const earVowel of ['a', 'e']) {
        assert.equal(meterDecision(earVowel, point, voice), null,
          `ear ${earVowel} at ${point.f1}, ${point.f2}`);
      }
    }
  }
});

test('meterDecision leaves a unchanged across the Bark grid when kamatz was read as patach', () => {
  const voice = { version: 2, vowels: {
    o: { f1: 4, f2: 8, n: 3 }, a: { f1: 4.2, f2: 8, n: 3 },
  }, spread: 0.336 };
  for (let f1 = 10; f1 <= 90; f1 += 1) {
    for (let f2 = 70; f2 <= 150; f2 += 1) {
      const point = { f1: f1 / 10, f2: f2 / 10 };
      assert.equal(meterDecision('a', point, voice), null, `ear a at ${point.f1}, ${point.f2}`);
    }
  }
});

test('meterDecision blocks targets whose available centroids are only 0.5 Bark apart', () => {
  const voice = { version: 2, vowels: {
    a: { f1: 4.5, f2: 8, n: 3 }, o: { f1: 4, f2: 8, n: 3 },
  }, spread: 0.01 };
  assert.equal(meterDecision('a', voice.vowels.o, voice), null);
  const closeToE = { version: 2, vowels: {
    a: { f1: 7, f2: 8, n: 3 }, e: { f1: 4.5, f2: 8, n: 3 }, o: { f1: 4, f2: 8, n: 3 },
  }, spread: 0.01 };
  assert.equal(meterDecision('a', closeToE.vowels.e, closeToE), null);
});

test('meterDecision widens the separation guard with pooled spread and honors gap options', () => {
  const voice = { version: 2, vowels: {
    a: { f1: 5, f2: 8, n: 3 }, o: { f1: 4, f2: 8, n: 3 },
  }, spread: 0.2 };
  const wide = { ...voice, spread: 0.6 };
  assert.equal(meterDecision('a', voice.vowels.o, voice), 'o');
  assert.equal(meterDecision('a', voice.vowels.o, wide), null);
  assert.equal(meterDecision('a', voice.vowels.o, wide, { gapFactor: 1 }), 'o');
  assert.equal(meterDecision('a', voice.vowels.o, voice, { minGap: 1.1 }), null);
  const boundary = { ...voice, vowels: { ...voice.vowels, a: { f1: 4, f2: 8.8, n: 3 } }, spread: 0 };
  assert.equal(meterDecision('a', voice.vowels.o, boundary), 'o');
});

test('meterDecision checks every available centroid and each class token count', () => {
  const voice = { version: 2, vowels: {
    a: { f1: 3, f2: 9.4, n: 3 }, o: { f1: 4, f2: 8, n: 3 }, e: { f1: 4.5, f2: 8, n: 3 },
  }, spread: 0.01 };
  assert.equal(meterDecision('a', { f1: 3, f2: 8 }, voice), null);
  const unequal = { version: 2, vowels: {
    a: { f1: 5, f2: 8, n: 2 }, o: { f1: 4, f2: 8, n: 15 },
  }, spread: 0.45 };
  assert.equal(meterDecision('a', unequal.vowels.o, unequal), null);
  const moreTokens = { ...unequal, vowels: { ...unequal.vowels, a: { ...unequal.vowels.a, n: 15 } } };
  assert.equal(meterDecision('a', moreTokens.vowels.o, moreTokens), 'o');
});

test('meterDecision with only i leaves e unchanged when e is missing', () => {
  const voice = { version: 2, vowels: { i: { f1: 2, f2: 14, n: 3 } }, spread: 0.3 };
  assert.equal(meterDecision('e', voice.vowels.i, voice), null);
  assert.equal(meterDecision('e', { f1: 2.5, f2: 14 }, voice), null);
  assert.equal(meterDecision('e', { f1: 3.1, f2: 14 }, voice), null);
});

test('meterDecision leaves a unchanged for a Sephardi-style card with only a', () => {
  const voice = { version: 2, vowels: { a: { f1: 5, f2: 8, n: 6 } }, spread: 0.3 };
  for (const point of [{ f1: 5, f2: 8 }, { f1: 1, f2: 15 }]) {
    assert.equal(meterDecision('a', point, voice), null);
  }
  for (const earVowel of ['o', 'i', 'u', 'oy', 'ey', '?', 'e']) {
    assert.equal(meterDecision(earVowel, voice.vowels.a, voice), null);
  }
});

test('meterDecision keeps candidate order for ties and rejects a zero second distance', () => {
  const voice = { version: 2, vowels: {
    o: { f1: 4, f2: 8, n: 3 }, e: { f1: 4, f2: 10, n: 3 }, a: { f1: 8, f2: 12, n: 3 },
  }, spread: 0 };
  assert.equal(meterDecision('a', { f1: 4, f2: 9 }, voice, { margin: 2 }), 'o');
  const coincident = { ...voice, vowels: { ...voice.vowels, e: { ...voice.vowels.o } } };
  assert.equal(meterDecision('a', coincident.vowels.o, coincident,
    { margin: 2, minGap: 0, gapFactor: 0 }), null);
});

test('applyMeter corrects o heard as a, preserves u and never mutates its inputs', () => {
  const words = Object.freeze([Object.freeze(['ba', 'ruch'])]);
  const voice = voiceProfile();
  const before = structuredClone(voice);
  const result = applyMeter(words, wav(utterance(['o', 'u'])), voice);
  assert.deepEqual(result, { words: [['bo', 'ruch']], changes: [{ index: 0, from: 'ba', to: 'bo' }], applied: true });
  assert.notEqual(result.words, words);
  assert.notEqual(result.words[0], words[0]);
  assert.deepEqual(words, [['ba', 'ruch']]);
  assert.deepEqual(voice, before);
});

test('applyMeter leaves a voices unchanged and corrects e heard on an i voice', () => {
  assert.deepEqual(applyMeter([['ba', 'ruch']], wav(utterance(['a', 'u'])), voiceProfile()), {
    words: [['ba', 'ruch']], changes: [], applied: true,
  });
  assert.deepEqual(applyMeter([['be']], wav(utterance(['i'])), voiceProfile()), {
    words: [['bi']], changes: [{ index: 0, from: 'be', to: 'bi' }], applied: true,
  });
  assert.deepEqual(applyMeter([['ba']], wav(utterance(['e'])), voiceProfile()), {
    words: [['be']], changes: [{ index: 0, from: 'ba', to: 'be' }], applied: true,
  });
});

test('meter placement keeps the island measurements when syllable counts match', () => {
  const words = [['ba'], ['be']];
  const data = wav(utterance(['o', 'i']));
  const { samples } = decodeWav(data);
  const islands = soundIslands(samples, rate);
  const metered = applyMeter(words, data, voiceProfile());
  const points = syllablePoints(words, data);
  for (const tokens of [null, [], [phone('a', 0.02, 0.04)],
    [phone('a', 0.02, 0.04), phone('b', 0.04, 0.06), phone('e', 0.06, 0.08)], [null]]) {
    assert.deepEqual(syllableRanges(words, samples, rate, tokens), islands);
    assert.deepEqual(applyMeter(words, data, voiceProfile(), { tokens }), metered);
    assert.deepEqual(syllablePoints(words, data, tokens), points);
  }
  assert.deepEqual(metered.words, [['bo'], ['bi']]);
});

test('meter placement uses timed vowel nuclei on connected audio without using their vowel labels', () => {
  const { data, words, tokens } = connectedReading();
  words.forEach(Object.freeze);
  Object.freeze(words);
  tokens.forEach(Object.freeze);
  Object.freeze(tokens);
  const voice = structuredClone(voiceProfile());
  const before = structuredClone(voice);
  assert.equal(soundIslands(decodeWav(data).samples, rate).length, 1);
  const result = applyMeter(words, data, voice, { tokens });
  assert.deepEqual(result, { words: [['bo', 'ruch'], ['mi', 'ta']],
    changes: [{ index: 0, from: 'ba', to: 'bo' }, { index: 2, from: 'me', to: 'mi' }], applied: true });
  assert.deepEqual(words, [['ba', 'ruch'], ['me', 'ta']]);
  assert.notEqual(result.words, words);
  assert.notEqual(result.words[0], words[0]);
  assert.deepEqual(voice, before);
  assert.deepEqual(applyMeter(words, data, voice, { tokens, margin: 0 }), { words, changes: [], applied: true });
  const points = syllablePoints(words, data, tokens);
  assert.equal(points.length, 4);
  for (const [index, label] of ['o', 'u', 'i', 'a'].entries()) {
    near(points[index].f1, bark(vowels[label][0]), 0.5);
    near(points[index].f2, bark(vowels[label][1]), 0.5);
  }
});

test('meter placement widens 20 ms and 40 ms vowel tokens enough to measure a connected line', () => {
  const { data, words, tokens } = connectedReading();
  const { samples } = decodeWav(data);
  assert.equal(soundIslands(samples, rate).length, 1);
  for (const duration of [0.02, 0.04]) {
    const supplied = tokens.map((token, index) => {
      if (![2, 4, 6, 8].includes(index)) return token;
      const center = (token.start + token.end) / 2;
      const narrowed = { ...token, start: center - duration / 2, end: center + duration / 2 };
      assert.equal(measureVowel(samples, rate, Math.round(narrowed.start * rate),
        Math.round(narrowed.end * rate)), null);
      return narrowed;
    });
    assert.deepEqual(applyMeter(words, data, voiceProfile(), { tokens: supplied }), {
      words: [['bo', 'ruch'], ['mi', 'ta']],
      changes: [{ index: 0, from: 'ba', to: 'bo' }, { index: 2, from: 'me', to: 'mi' }], applied: true,
    });
    const points = syllablePoints(words, data, supplied);
    assert.equal(points.length, 4);
    for (const [index, label] of ['o', 'u', 'i', 'a'].entries()) {
      assert.ok(points[index]);
      near(points[index].f1, bark(vowels[label][0]), 0.5);
      near(points[index].f2, bark(vowels[label][1]), 0.5);
    }
  }
});

test('meter placement centers a 120 ms window on the first start and last end of a nucleus', () => {
  for (const tokens of [[phone('a', 0.2, 0.22)], [phone('a', 0.18, 0.2), phone('ɪ', 0.22, 0.24)]]) {
    assert.deepEqual(syllableRanges([['ba']], silence(1), rate, tokens), [
      { start: 0.15 * rate, end: 0.27 * rate },
    ]);
  }
});

test('meter windows stop at the midpoints to neighbouring consonants and special tokens', () => {
  for (const [before, after] of [['b', 't'], ['<pad>', '<unk>']]) {
    const tokens = [phone(before, 0.14, 0.18), phone('a', 0.2, 0.22), phone(after, 0.24, 0.28)];
    assert.deepEqual(syllableRanges([['ba']], silence(1), rate, tokens), [
      { start: 0.185 * rate, end: 0.235 * rate },
    ]);
  }
});

test('merged meter windows use the first and last token centers for neighbouring midpoints', () => {
  const tokens = [phone('b', 0.18, 0.2), phone('a', 0.2, 0.22), phone('ɪ', 0.26, 0.3),
    phone('t', 0.3, 0.32)];
  assert.deepEqual(syllableRanges([['bay']], silence(1), rate, tokens), [
    { start: 0.2 * rate, end: 0.295 * rate },
  ]);
});

test('meter windows stop at the midpoints to neighbouring vowels that are not merged', () => {
  const tokens = [phone('i', 0.1, 0.14), phone('a', 0.2, 0.22), phone('e', 0.28, 0.3)];
  assert.deepEqual(syllableRanges([['mi', 'ba', 'me']], silence(1), rate, tokens), [
    { start: 0.06 * rate, end: 0.165 * rate },
    { start: 0.165 * rate, end: 0.25 * rate },
    { start: 0.25 * rate, end: 0.35 * rate },
  ]);
});

test('meter windows clip both ends to the audio after centering on the original token times', () => {
  const samples = silence(0.2);
  for (const [end, start] of [[0.2, 0.13], [0.22, 0.15], [0.42, 0.2]]) {
    const tokens = [phone('a', 0, 0.02), phone('e', end - 0.02, end)];
    assert.deepEqual(syllableRanges([['ba', 'me']], samples, rate, tokens), [
      { start: 0, end: 0.07 * rate },
      { start: start * rate, end: samples.length },
    ]);
  }
});

test('meter placement returns count when both islands and vowel nuclei miss the syllable count', () => {
  const { data, words, tokens } = connectedReading();
  for (const supplied of [undefined, null, [], {}, tokens.slice(0, 7),
    [...tokens, phone('i', 1.35, 1.4)]]) {
    assert.deepEqual(applyMeter(words, data, voiceProfile(), { tokens: supplied }), {
      words, changes: [], applied: false, reason: 'count',
    });
    assert.equal(syllablePoints(words, data, supplied), null);
  }
});

test('meter placement skips a short nucleus without shifting later syllables or points', () => {
  const data = wav(join([silence(0.25), tone(vowels.o), tone(vowels.i), silence(0.25)]));
  const words = [['ba', 'me']];
  const tokens = [phone('b', 0.26, 0.28), phone('a', 0.28, 0.3), phone('r', 0.3, 0.32),
    phone('m', 0.5, 0.53), phone('e', 0.53, 0.73)];
  assert.equal(soundIslands(decodeWav(data).samples, rate).length, 1);
  assert.deepEqual(applyMeter(words, data, voiceProfile(), { tokens }), {
    words: [['ba', 'mi']], changes: [{ index: 1, from: 'me', to: 'mi' }], applied: true,
  });
  const points = syllablePoints(words, data, tokens);
  assert.equal(points.length, 2);
  assert.equal(points[0], null);
  near(points[1].f2, bark(vowels.i[1]), 0.5);
});

test('meter placement merges consecutive vowel tokens across gaps up to 40 ms', () => {
  const data = wav(join([silence(0.25), tone(vowels.o), tone(vowels.i), tone(vowels.a), silence(0.25)]));
  const words = [['boy', 'me', 'ta']];
  for (const pair of [['o', 'ɪ'], ['e', 'ɪ'], ['ɑ', 'ɑ']]) {
    for (const gap of [0, 0.02, 0.04]) {
      const tokens = [phone(pair[0], 0.27, 0.31), phone(pair[1], 0.31 + gap, 0.35 + gap),
        phone('m', 0.5, 0.53), phone('i', 0.53, 0.73), phone('t', 0.75, 0.78), phone('a', 0.78, 0.98)];
      assert.deepEqual(applyMeter(words, data, voiceProfile(), { tokens }), {
        words: [['boy', 'mi', 'ta']], changes: [{ index: 1, from: 'me', to: 'mi' }], applied: true,
      });
      const points = syllablePoints(words, data, tokens);
      assert.equal(points.length, 3);
      near(points[0].f2, bark(vowels.o[1]), 0.5);
      near(points[1].f2, bark(vowels.i[1]), 0.5);
    }
  }
});

test('meter placement keeps vowels separate across a consonant or a gap over 40 ms', () => {
  const data = wav(join([silence(0.25), tone(vowels.o), tone(vowels.i), silence(0.25)]));
  const words = [['ba', 'me']];
  for (const tokens of [
    [phone('a', 0.28, 0.48), phone('m', 0.48, 0.5), phone('e', 0.5, 0.73)],
    [phone('a', 0.28, 0.46), phone('e', 0.52, 0.73)],
  ]) {
    assert.deepEqual(applyMeter(words, data, voiceProfile(), { tokens }), {
      words: [['bo', 'mi']], changes: [{ index: 0, from: 'ba', to: 'bo' }, { index: 1, from: 'me', to: 'mi' }], applied: true,
    });
    assert.equal(syllablePoints(words, data, tokens).length, 2);
  }
});

test('meter placement refuses vowel tokens with unusable timing', () => {
  const { data, words, tokens } = connectedReading();
  for (const timing of [{ start: undefined }, { end: NaN }, { end: Infinity }, { start: -1 },
    { end: 0.28 }, { end: 0.27 }]) {
    const supplied = tokens.map((token, index) => index === 2 ? { ...token, ...timing } : token);
    assert.deepEqual(applyMeter(words, data, voiceProfile(), { tokens: supplied }), {
      words, changes: [], applied: false, reason: 'count',
    });
    assert.equal(syllablePoints(words, data, supplied), null);
  }
});

test('applyMeter leaves oy, ey, o, u, i and unknown syllables alone', () => {
  const words = [['boy', 'bey'], ['bo', 'bu', 'bi', '?']];
  assert.deepEqual(applyMeter(words, wav(utterance(['a', 'a', 'a', 'a', 'a', 'a'])), voiceProfile()), {
    words, changes: [], applied: true,
  });
});

test('applyMeter falls back for count, profile and format failures with fresh arrays', () => {
  const words = [['ba']];
  for (const [data, voice, reason] of [
    [wav(utterance(['a', 'o'])), voiceProfile(), 'count'],
    [null, undefined, 'profile'], [null, { version: 2, vowels: {}, spread: 0.3 }, 'profile'],
    [null, { version: 2, vowels: null, spread: 0.3 }, 'profile'],
    [null, { version: 2, vowels: [], spread: 0.3 }, 'profile'],
    [null, { ...voiceProfile(), version: 1 }, 'profile'],
    ...[undefined, -0.1, NaN, Infinity, '0.3'].map(spread => [null, { ...voiceProfile(), spread }, 'profile']),
    [Buffer.alloc(0), voiceProfile(), 'format'],
  ]) {
    const result = applyMeter(words, data, voice);
    assert.deepEqual(result, { words, changes: [], applied: false, reason });
    assert.notEqual(result.words, words);
    assert.notEqual(result.words[0], words[0]);
  }
});

test('applyMeter skips classes with no possible correction and unmeasurable islands', () => {
  assert.deepEqual(applyMeter([['ba']], wav(utterance(['o'])), { version: 2, vowels: { a: voiceProfile().vowels.a }, spread: 0.3 }), {
    words: [['ba']], changes: [], applied: true,
  });
  // Three voiced frames keep this island, but four are needed to measure it.
  const unmeasurable = silence(0.12).map((_, i) => i < 720 || i % 2 ? 0.5 : -0.5);
  assert.equal(measureVowel(unmeasurable, rate, 0, unmeasurable.length), null);
  assert.deepEqual(applyMeter([['ba']], wav(unmeasurable), voiceProfile()), { words: [['ba']], changes: [], applied: true });
});

test('applyMeter accepts one-vowel profiles unchanged and forwards margin and separation options', () => {
  const data = wav(utterance(['o']));
  const o = voiceProfile().vowels.o;
  const onlyO = { version: 2, vowels: { o }, spread: 0.2 };
  const corrected = { words: [['bo']], changes: [{ index: 0, from: 'ba', to: 'bo' }], applied: true };
  const unchanged = { words: [['ba']], changes: [], applied: true };
  assert.deepEqual(applyMeter([['ba']], data, onlyO), unchanged);
  const separated = { ...onlyO, vowels: { o, a: { ...o, f1: o.f1 + 2 } } };
  assert.deepEqual(applyMeter([['ba']], data, separated), corrected);
  assert.deepEqual(applyMeter([['ba']], data, separated, { margin: 0 }), unchanged);
  const close = { ...onlyO, vowels: { o, a: { ...o, f1: o.f1 + 0.5 } }, spread: 0.1 };
  assert.deepEqual(applyMeter([['ba']], data, close), unchanged);
  assert.deepEqual(applyMeter([['ba']], data, close, { minGap: 0.4 }), corrected);
  const wide = { ...onlyO, vowels: { o, a: { ...o, f1: o.f1 + 1 } }, spread: 0.6 };
  assert.deepEqual(applyMeter([['ba']], data, wide), unchanged);
  assert.deepEqual(applyMeter([['ba']], data, wide, { gapFactor: 1 }), corrected);
});

test('applyMeter leaves syllables unchanged when their ear vowel classes are missing', () => {
  const words = [['ba'], ['be']];
  const before = structuredClone(words);
  const { o, i } = voiceProfile().vowels;
  const voice = { version: 2, vowels: { o, i }, spread: 0.2 };
  const result = applyMeter(words, wav(utterance(['o', 'i'])), voice);
  assert.deepEqual(result.words, before);
  assert.deepEqual(result.changes, []);
  assert.equal(result.applied, true);
  assert.deepEqual(words, before);
});

test('applyMeter corrects a to o when F2 is closer under Euclidean Bark distance', () => {
  const voice = { version: 2, vowels: {
    a: { f1: bark(750), f2: bark(1250), n: 2 },
    o: { f1: bark(650), f2: bark(1050), n: 2 },
  }, spread: 0.2 };
  const data = wav(join([silence(0.25), tone([700, 1060]), silence(0.25)]));
  assert.deepEqual(applyMeter([['ba']], data, voice), {
    words: [['bo']], changes: [{ index: 0, from: 'ba', to: 'bo' }], applied: true,
  });
});

test('applyMeter leaves an ambiguous vowel halfway between a and o unchanged', () => {
  const voice = voiceProfile();
  const hz = (value) => 1960 * (value + 0.53) / (26.81 - value - 0.53);
  const halfway = ['f1', 'f2'].map((key) => hz((voice.vowels.a[key] + voice.vowels.o[key]) / 2));
  const data = wav(join([silence(0.25), tone(halfway), silence(0.25)]));
  assert.deepEqual(applyMeter([['ba']], data, voice), { words: [['ba']], changes: [], applied: true });
});

test('applyMeter honors the margin and replaces only the first vowel occurrence across words', () => {
  const data = wav(utterance(['o', 'i']));
  assert.deepEqual(applyMeter([['baba'], ['be']], data, voiceProfile()).changes, [
    { index: 0, from: 'baba', to: 'boba' }, { index: 1, from: 'be', to: 'bi' },
  ]);
  assert.deepEqual(applyMeter([['ba']], wav(utterance(['o'])), voiceProfile(), { margin: 0 }).changes, []);
});

test('pairsApart counts a damaged class as merged', () => {
  const apart = { version: 2, spread: 0.1, vowels: { a: { f1: 7, f2: 11, n: 3 }, o: { f1: 5, f2: 9, n: 3 } } };
  assert.equal(pairsApart(apart), true);
  for (const damage of [{ f1: Number.NaN }, { f2: undefined }, { n: 0 }, { n: 1.5 }]) {
    assert.equal(pairsApart({ ...apart, vowels: { ...apart.vowels, o: { ...apart.vowels.o, ...damage } } }), false);
  }
});
