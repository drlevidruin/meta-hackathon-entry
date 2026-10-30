import { expect, it } from 'vitest';
import { createSilenceDetector, rms } from './silence.js';

function audio(silent) {
  let now = 0;
  return (loudness, ms) => {
    let ended = false;
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      now += 50;
      ended = silent(typeof loudness === 'function' ? loudness(elapsed) : loudness, now) || ended;
    }
    return ended;
  };
}

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

it.each([[.002, .025], [.003, .03]])('starts a soft line over a %s floor at %s and ends after 1.2 seconds of quiet', (floor, speech) => {
  const silent = createSilenceDetector(), play = audio(silent);
  expect(play(floor, 1000)).toBe(false);
  expect(silent.heardSpeech).toBe(false);
  expect(play(speech, 1000)).toBe(false);
  expect(silent.heardSpeech).toBe(true);
  expect(play(floor, 1200)).toBe(false);
  expect(play(floor, 50)).toBe(true);
});

it('never starts on steady hum above the old threshold and ends 1.2 seconds after reading over it', () => {
  const silent = createSilenceDetector(), play = audio(silent);
  expect(play(.03, 25000)).toBe(false);
  expect(silent.heardSpeech).toBe(false);
  expect(play(.1, 2000)).toBe(false);
  expect(silent.heardSpeech).toBe(true);
  expect(play(.03, 1200)).toBe(false);
  expect(play(.03, 50)).toBe(true);
});

it('ends within 1.6 seconds as automatic gain raises hum from .01 to .04 over 1.5 seconds', () => {
  const silent = createSilenceDetector(), play = audio(silent);
  expect(play(.01, 1000)).toBe(false);
  expect(play(.12, 2000)).toBe(false);
  expect(play(elapsed => .01 + .03 * Math.min(elapsed / 1500, 1), 1600)).toBe(true);
});

it('keeps a line open through repeated .4 second pauses between words', () => {
  const silent = createSilenceDetector(), play = audio(silent);
  play(.002, 1000);
  for (let word = 0; word < 10; word++) {
    expect(play(.025, 300)).toBe(false);
    expect(play(.002, 400)).toBe(false);
  }
  expect(play(.025, 300)).toBe(false);
  expect(play(.002, 1200)).toBe(false);
  expect(play(.002, 50)).toBe(true);
});
