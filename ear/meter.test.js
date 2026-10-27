import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMeter, buildVoiceProfile, decodeWav, measureVowel, soundIslands, VoiceCheckError } from './meter.js';

const rate = 16000;
const vowels = { a: [780, 1230], o: [650, 1090], e: [700, 1600], i: [300, 2200], u: [350, 900] };
const bark = (hz) => 26.81 * hz / (1960 + hz) - 0.53;
const silence = (seconds) => new Float64Array(Math.round(seconds * rate));

function tone([f1, f2], seconds = 0.25) {
  let samples = silence(seconds);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = i === 0 || Math.floor(i * 120 / rate) !== Math.floor((i - 1) * 120 / rate) ? 1 : 0;
  }
  // Glottal rolloff keeps a voiced i below the raw zero-crossing cutoff.
  for (let i = 1; i < samples.length; i += 1) samples[i] += 0.95 * samples[i - 1];
  for (const [f, bw] of [[f1, 80], [f2, 100], [2500, 120], [3500, 150]]) {
    const c = -Math.exp(-2 * Math.PI * bw / rate);
    const b = 2 * Math.exp(-Math.PI * bw / rate) * Math.cos(2 * Math.PI * f / rate);
    const a = 1 - b - c;
    const output = new Float64Array(samples.length);
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < samples.length; i += 1) {
      const y = a * samples[i] + b * y1 + c * y2;
      output[i] = y;
      y2 = y1;
      y1 = y;
    }
    samples = output;
  }
  const fade = 0.02 * rate;
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] *= Math.min(1, i / fade, (samples.length - 1 - i) / fade);
  }
  const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
  return samples.map((sample) => sample / peak * 0.5);
}

function join(segments) {
  const samples = new Float64Array(segments.reduce((sum, segment) => sum + segment.length, 0));
  let offset = 0;
  for (const segment of segments) {
    samples.set(segment, offset);
    offset += segment.length;
  }
  return samples;
}

function utterance(labels) {
  return join([silence(0.25), ...labels.flatMap((label) => [tone(vowels[label]), silence(0.25)])]);
}

function wav(samples) {
  const data = Buffer.alloc(44 + samples.length * 2);
  data.write('RIFF', 0);
  data.writeUInt32LE(data.length - 8, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(rate, 24);
  data.writeUInt32LE(rate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) data.writeInt16LE(Math.round(samples[i] * 32768), 44 + i * 2);
  return data;
}

function near(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`);
}

let profile;
function voiceProfile() {
  const labels = ['a', 'o', 'e', 'i', 'a', 'o', 'e', 'i'];
  profile ??= buildVoiceProfile(wav(utterance(labels)), labels);
  return profile;
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

test('buildVoiceProfile keeps numeric Bark means and counts, skipping null labels and singleton classes', () => {
  const sounds = ['a', 'o', 'e', 'i', 'a', 'o', 'e', 'i', 'o'];
  const labels = ['a', 'o', 'e', 'i', 'a', 'o', 'e', 'i', null];
  const data = wav(utterance(sounds));
  const result = buildVoiceProfile(data, labels);
  assert.deepEqual(Object.keys(result), ['version', 'vowels']);
  assert.equal(result.version, 1);
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

test('buildVoiceProfile reports island counts and rejects one usable class or unmeasurable audio', () => {
  const data = wav(utterance(['a', 'a']));
  assert.throws(() => buildVoiceProfile(data, ['a']), (error) => error instanceof VoiceCheckError
    && error.code === 'count' && error.heard === 2);
  assert.throws(() => buildVoiceProfile(data, ['a', 'a']), (error) => error instanceof VoiceCheckError && error.code === 'quiet');
  const noisy = new Float64Array(4000).map((_, i) => i % 2 ? 0.5 : -0.5);
  assert.throws(() => buildVoiceProfile(wav(noisy), ['a']), (error) => error.code === 'quiet');
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
    [null, undefined, 'profile'], [null, { version: 2, vowels: {} }, 'profile'],
    [null, { version: 1, vowels: null }, 'profile'], [null, { version: 1, vowels: [] }, 'profile'],
    [Buffer.alloc(0), voiceProfile(), 'format'],
  ]) {
    const result = applyMeter(words, data, voice);
    assert.deepEqual(result, { words, changes: [], applied: false, reason });
    assert.notEqual(result.words, words);
    assert.notEqual(result.words[0], words[0]);
  }
});

test('applyMeter skips missing candidate classes and unmeasurable islands', () => {
  assert.deepEqual(applyMeter([['ba']], wav(utterance(['o'])), { version: 1, vowels: { o: voiceProfile().vowels.o } }), {
    words: [['ba']], changes: [], applied: true,
  });
  const noise = new Float64Array(4000).map((_, i) => i % 2 ? 0.5 : -0.5);
  assert.deepEqual(applyMeter([['ba']], wav(noise), voiceProfile()), { words: [['ba']], changes: [], applied: true });
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
