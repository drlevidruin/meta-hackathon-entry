import { describe, expect, it, vi } from 'vitest';
import { encodeWav, recordingToWav, resample } from './wav.js';

describe('resampling captured PCM', () => {
  it.each([[48000, 48000, 16000], [44100, 44100, 16000], [48000, 24000, 8000], [44100, 22050, 8000]])
    ('converts %i Hz with %i samples to %i constant samples at 16 kHz', (sampleRate, length, expectedLength) => {
      const samples = new Float32Array(length).fill(.25);
      const result = resample(samples, sampleRate);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result).toHaveLength(expectedLength);
      expect(result.every(sample => sample === .25)).toBe(true);
      expect(samples.every(sample => sample === .25)).toBe(true);
    });

  it('interpolates fractional sample positions at 44.1 kHz', () => {
    const result = resample(new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]), 44100);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(0);
    expect(result[1]).toBeCloseTo(2.75625);
    expect(result[2]).toBeCloseTo(5.5125);
  });

  it('preserves 16 kHz samples and accepts an empty capture', () => {
    expect(Array.from(resample(new Float32Array([-.5, 0, .5]), 16000))).toEqual([-.5, 0, .5]);
    expect(resample(new Float32Array(), 48000)).toHaveLength(0);
  });
});

describe('PCM WAV', () => {
  it('writes RIFF fields and exactly one 16-bit mono sample per input value', () => {
    const samples = new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]);
    const buffer = encodeWav(samples);
    const view = new DataView(buffer);
    const text = (offset, size) => String.fromCharCode(...new Uint8Array(buffer, offset, size));
    expect(text(0, 4)).toBe('RIFF');
    expect(text(8, 4)).toBe('WAVE');
    expect(text(12, 4)).toBe('fmt ');
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(buffer.byteLength - 8);
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(buffer.byteLength).toBe(44 + samples.length * 2);
    expect(Array.from({ length: samples.length }, (_, index) => view.getInt16(44 + index * 2, true)))
      .toEqual([-32768, -32768, -16384, 0, 16384, 32767, 32767]);
  });

  it('decodes then renders 16 kHz mono with the right duration and closes the decoder', async () => {
    const close = vi.fn();
    const connect = vi.fn();
    const start = vi.fn();
    const decoded = { duration: 0.25, numberOfChannels: 2, sampleRate: 48000 };
    const offlineArgs = [];
    class Decoder {
      decodeAudioData = vi.fn(async () => decoded);
      close = close;
    }
    class Renderer {
      constructor(...args) { offlineArgs.push(args); }
      destination = {};
      createBufferSource() { return { connect, start }; }
      async startRendering() { return { getChannelData: () => new Float32Array(4000) }; }
    }
    vi.stubGlobal('AudioContext', Decoder);
    vi.stubGlobal('OfflineAudioContext', Renderer);
    try {
      const blob = await recordingToWav({ arrayBuffer: async () => new ArrayBuffer(4) });
      expect(offlineArgs).toEqual([[1, 4000, 16000]]);
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBe(44 + 4000 * 2);
      expect(start).toHaveBeenCalledWith(0);
      expect(close).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});
