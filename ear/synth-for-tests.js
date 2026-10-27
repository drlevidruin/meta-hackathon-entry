export const rate = 16000;
export const vowels = { a: [780, 1230], o: [650, 1090], e: [700, 1600], i: [300, 2200], u: [350, 900] };
export const silence = (seconds) => new Float64Array(Math.round(seconds * rate));

export function tone([f1, f2], seconds = 0.25) {
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

export function join(segments) {
  const samples = new Float64Array(segments.reduce((sum, segment) => sum + segment.length, 0));
  let offset = 0;
  for (const segment of segments) {
    samples.set(segment, offset);
    offset += segment.length;
  }
  return samples;
}

export function utterance(labels) {
  return join([silence(0.25), ...labels.flatMap((label) => [tone(vowels[label]), silence(0.25)])]);
}

export function wav(samples) {
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

