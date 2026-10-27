import { expect, it } from 'vitest';
import { createSilenceDetector, rms } from './silence.js';

it('never stops before speech, then stops after 1.2 seconds of quiet', () => {
  const silent = createSilenceDetector();
  expect(silent(0, 0)).toBe(false);
  expect(silent(0, 12000)).toBe(false);
  expect(silent(.1, 13000)).toBe(false);
  expect(silent(0, 13100)).toBe(false);
  expect(silent(0, 14299)).toBe(false);
  expect(silent(0, 14300)).toBe(true);
});
it('resets the quiet clock when speech resumes', () => {
  const silent = createSilenceDetector();
  silent(.1, 0); silent(0, 100);
  expect(silent(.1, 1100)).toBe(false);
  expect(silent(0, 1200)).toBe(false);
  expect(silent(0, 2399)).toBe(false);
  expect(silent(0, 2400)).toBe(true);
});
it('measures loudness in the waveform', () => {
  expect(rms(new Float32Array([.5, -.5]))).toBe(.5);
});
