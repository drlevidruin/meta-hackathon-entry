import { hasUsablePair } from './pairs.js';

export class VoiceCheckError extends Error {
  constructor(code, heard) {
    super(`Voice check: ${code}`);
    this.code = code;
    if (code === 'count') this.heard = heard;
  }
}

export function decodeWav(data) {
  if (!(data instanceof Uint8Array)) throw new VoiceCheckError('format');
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (bytes.length < 12 || bytes.toString('ascii', 0, 4) !== 'RIFF'
    || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new VoiceCheckError('format');
  const limit = bytes.readUInt32LE(4) + 8;
  if (limit < 12 || limit > bytes.length) throw new VoiceCheckError('format');
  let format = false;
  for (let offset = 12; offset + 8 <= limit;) {
    const name = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > limit) throw new VoiceCheckError('format');
    if (name === 'fmt ') {
      if (size < 16 || bytes.readUInt16LE(start) !== 1
        || bytes.readUInt16LE(start + 2) !== 1 || bytes.readUInt32LE(start + 4) !== 16000
        || bytes.readUInt16LE(start + 14) !== 16) throw new VoiceCheckError('format');
      format = true;
    } else if (name === 'data') {
      if (!format || size % 2) throw new VoiceCheckError('format');
      const samples = new Float64Array(size / 2);
      for (let i = 0; i < samples.length; i += 1) samples[i] = bytes.readInt16LE(start + i * 2) / 32768;
      return { samples, rate: 16000 };
    }
    offset = start + size + size % 2;
  }
  throw new VoiceCheckError('format');
}

export function soundIslands(samples, rate) {
  const hop = rate / 100;
  const rms = [];
  for (let start = 0; start < samples.length; start += hop) {
    const end = Math.min(start + hop, samples.length);
    let energy = 0;
    for (let i = start; i < end; i += 1) energy += samples[i] ** 2;
    rms.push(Math.sqrt(energy / (end - start)));
  }
  const smooth = rms.map((_, i) => {
    const values = rms.slice(Math.max(0, i - 3), i + 4);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  const threshold = 0.18 * smooth.reduce((max, value) => Math.max(max, value), 0);
  const islands = [];
  for (let i = 0; i < smooth.length; i += 1) {
    if (smooth[i] <= threshold) continue;
    const first = i;
    while (i + 1 < smooth.length && smooth[i + 1] > threshold) i += 1;
    const previous = islands.at(-1);
    if (previous && first - previous.end < 6) previous.end = i + 1;
    else islands.push({ start: first, end: i + 1 });
  }
  const length = Math.round(0.025 * rate);
  const frameHop = Math.round(0.01 * rate);
  return islands.filter(({ start, end }) => end - start >= 10)
    .map(({ start, end }) => ({ start: start * hop, end: end * hop }))
    .filter(({ start, end }) => {
      let frames = 0;
      let voiced = 0;
      for (let s = start; s + length < end; s += frameHop) {
        let crossings = 0;
        for (let i = s; i < s + length; i += 1) {
          if (i > s && (samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings += 1;
        }
        frames += 1;
        if (crossings < 60) voiced += 1;
      }
      return frames > 0 && voiced / frames >= 0.3;
    });
}

function formants(samples, rate, start, length) {
  const v = new Float64Array(length);
  for (let i = 0; i < length; i += 1) {
    const previous = start + i > 0 ? samples[start + i - 1] : 0;
    v[i] = (samples[start + i] - 0.97 * previous)
      * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (length - 1)));
  }
  const r = new Float64Array(17);
  for (let lag = 0; lag <= 16; lag += 1) {
    for (let i = lag; i < length; i += 1) r[lag] += v[i] * v[i - lag];
  }
  r[0] *= 1.0001;
  let a = new Float64Array(17);
  a[0] = 1;
  let error = r[0];
  for (let order = 1; order <= 16; order += 1) {
    let sum = r[order];
    for (let i = 1; i < order; i += 1) sum += a[i] * r[order - i];
    const reflection = -sum / error;
    const next = a.slice();
    next[order] = reflection;
    for (let i = 1; i < order; i += 1) next[i] = a[i] + reflection * a[order - i];
    a = next;
    error *= 1 - reflection ** 2;
  }
  const mag = new Float64Array(512);
  for (let p = 0; p < mag.length; p += 1) {
    const w = Math.PI * p / 512;
    let real = 0;
    let imaginary = 0;
    for (let i = 0; i < a.length; i += 1) {
      real += a[i] * Math.cos(w * i);
      imaginary -= a[i] * Math.sin(w * i);
    }
    mag[p] = -10 * Math.log10(real ** 2 + imaginary ** 2);
  }
  const peaks = [];
  for (let p = 1; p <= 510; p += 1) {
    const hz = p * rate / 2 / 512;
    if (hz > 200 && hz < 3500 && mag[p] > mag[p - 1] && mag[p] >= mag[p + 1]) peaks.push(hz);
  }
  return peaks.length >= 2 ? { f1: peaks[0], f2: peaks[1] } : null;
}

export function measureVowel(samples, rate, start, end) {
  const length = Math.round(0.025 * rate);
  const hop = Math.round(0.01 * rate);
  const frames = [];
  for (let s = start; s + length < end; s += hop) {
    let energy = 0;
    let crossings = 0;
    for (let i = s; i < s + length; i += 1) {
      energy += samples[i] ** 2;
      if (i > s && (samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings += 1;
    }
    frames.push({ start: s, energy, crossings });
  }
  const threshold = 0.3 * frames.reduce((max, frame) => Math.max(max, frame.energy), 0);
  const values = frames.filter(({ energy, crossings }) => energy > threshold && crossings < 60)
    .map((frame) => formants(samples, rate, frame.start, length)).filter(Boolean);
  if (values.length < 4) return null;
  const median = (key) => values.map((value) => value[key]).sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return { f1: median('f1'), f2: median('f2') };
}

function bark(hz) {
  return 26.81 * hz / (1960 + hz) - 0.53;
}

export function buildVoiceProfile(data, labels) {
  if (!hasUsablePair(labels)) throw new VoiceCheckError('card');
  const { samples, rate } = decodeWav(data);
  const islands = soundIslands(samples, rate);
  if (islands.length !== labels.length) throw new VoiceCheckError('count', islands.length);
  const groups = {};
  for (const [index, { start, end }] of islands.entries()) {
    const value = measureVowel(samples, rate, start, end);
    const label = labels[index];
    if (label === null || !value) continue;
    (groups[label] ??= []).push({ f1: bark(value.f1), f2: bark(value.f2) });
  }
  const vowels = {};
  let squaredDeviations = 0;
  let degreesOfFreedom = 0;
  for (const [label, values] of Object.entries(groups)) {
    if (values.length < 2) continue;
    const mean = (key) => values.reduce((sum, value) => sum + value[key], 0) / values.length;
    const f1 = mean('f1');
    const f2 = mean('f2');
    vowels[label] = { f1: Math.round(f1 * 1000) / 1000, f2: Math.round(f2 * 1000) / 1000, n: values.length };
    for (const value of values) squaredDeviations += (value.f1 - f1) ** 2 + (value.f2 - f2) ** 2;
    degreesOfFreedom += 2 * (values.length - 1);
  }
  if (!hasUsablePair(Object.keys(vowels))) throw new VoiceCheckError('quiet');
  const spread = Math.round(Math.sqrt(squaredDeviations / degreesOfFreedom) * 1000) / 1000;
  return { version: 2, vowels, spread };
}

export function meterDecision(earVowel, point, profile, { margin = 0.75, minGap = 0.8, gapFactor = 3 } = {}) {
  if (!Object.hasOwn(profile.vowels, earVowel)) return null;
  const candidates = earVowel === 'a' ? ['a', 'o', 'e'] : earVowel === 'e' ? ['e', 'i'] : [];
  const available = candidates.filter(v => Object.hasOwn(profile.vowels, v));
  if (!available.some(v => v !== earVowel)) return null;
  const distances = available.map(v => {
    const c = profile.vowels[v];
    return { v, d: Math.hypot(point.f1 - c.f1, point.f2 - c.f2) };
  }).sort((a, b) => a.d - b.d);
  const [best, second] = distances;
  if (best.v === earVowel) return null;
  if (second && !(best.d / second.d < margin)) return null;
  const cb = profile.vowels[best.v];
  for (const { v } of distances.slice(1)) {
    const cy = profile.vowels[v];
    const gap = Math.hypot(cb.f1 - cy.f1, cb.f2 - cy.f2);
    const requiredGap = Math.max(minGap, gapFactor * profile.spread * Math.sqrt(1 / cb.n + 1 / cy.n));
    if (gap < requiredGap) return null;
  }
  return best.v;
}

export function applyMeter(words, data, profile, options = {}) {
  const newWords = words.map((word) => [...word]);
  const unchanged = (reason) => ({ words: newWords, changes: [], applied: false, reason });
  if (profile?.version !== 2 || !profile.vowels || typeof profile.vowels !== 'object'
    || Array.isArray(profile.vowels) || Object.keys(profile.vowels).length === 0
    || !Number.isFinite(profile.spread) || profile.spread < 0) return unchanged('profile');
  let audio;
  try {
    audio = decodeWav(data);
  } catch (error) {
    if (error instanceof VoiceCheckError) return unchanged('format');
    throw error;
  }
  const { samples, rate } = audio;
  const islands = soundIslands(samples, rate);
  if (islands.length !== words.flat().length) return unchanged('count');
  const changes = [];
  let index = 0;
  for (const word of newWords) {
    for (let s = 0; s < word.length; s += 1, index += 1) {
      const from = word[s];
      const match = /oy|ey|a|e|i|o|u/.exec(from);
      const earVowel = match?.[0];
      const candidates = earVowel === 'a' ? ['a', 'o', 'e'] : earVowel === 'e' ? ['e', 'i'] : [];
      if (!Object.hasOwn(profile.vowels, earVowel)
        || !candidates.some(v => v !== earVowel && Object.hasOwn(profile.vowels, v))) continue;
      const { start, end } = islands[index];
      const value = measureVowel(samples, rate, start, end);
      if (!value) continue;
      const vowel = meterDecision(earVowel, { f1: bark(value.f1), f2: bark(value.f2) }, profile, options);
      if (vowel) {
        const to = from.slice(0, match.index) + vowel + from.slice(match.index + earVowel.length);
        word[s] = to;
        changes.push({ index, from, to });
      }
    }
  }
  return { words: newWords, changes, applied: true };
}
