import { expect, it } from 'vitest';
import { createLineEndDetector, createSilenceDetector, rms, wordForSyllables, wordSyllables } from './silence.js';

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

it('ends a soft line when gain raises the pause to just under the old fixed level', () => {
  const silent = createSilenceDetector(), play = audio(silent);
  expect(play(.003, 1000)).toBe(false);
  expect(play(.03, 1000)).toBe(false);
  expect(silent.heardSpeech).toBe(true);
  expect(play(.02, 1200)).toBe(false);
  expect(play(.02, 50)).toBe(true);
});

it('starts soft speech read from the first moment at the first pause between words', () => {
  const silent = createSilenceDetector(), play = audio(silent);
  play(.03, 400);
  expect(silent.heardSpeech).toBe(false);
  play(.003, 200);
  expect(play(.03, 400)).toBe(false);
  expect(silent.heardSpeech).toBe(true);
});

it('keeps a mid-line breath open even after enough speech for the timing fallback', () => {
  const ended = createLineEndDetector({ text: 'בָּ בָּרָ בָּרָכָה' });
  const play = audio(ended);
  play(.1, 2000);
  ended.follow(0, 2000);
  expect(play(0, 3000)).toBe(false);
  expect(ended.finishing).toBe(false);
  expect(play(.1, 500)).toBe(false);
  ended.follow(2, 5500);
  expect(play(0, 1500)).toBe(false);
  expect(play(0, 50)).toBe(false);
  expect(ended.finishing).toBe(true);
  expect(play(0, 400)).toBe(false);
  expect(play(0, 50)).toBe(true);
});

it('allows a mid-line stop after 3.5 seconds plus the retained tail', () => {
  const ended = createLineEndDetector({ text: 'בָּ בָּרָ בָּרָכָה' });
  const play = audio(ended);
  play(.1, 500);
  ended.follow(0, 500);
  expect(play(0, 3500)).toBe(false);
  expect(play(0, 50)).toBe(false);
  expect(ended.finishing).toBe(true);
  expect(play(0, 450)).toBe(true);
});

it('cancels a detected ending when the final vowel resumes during the tail', () => {
  const ended = createLineEndDetector({ text: 'בָּ' });
  const play = audio(ended);
  play(.1, 500);
  ended.follow(0, 500);
  expect(play(0, 1600)).toBe(false);
  expect(ended.finishing).toBe(true);
  expect(play(.03, 500)).toBe(false);
  expect(ended.finishing).toBe(false);
  expect(play(0, 1950)).toBe(false);
  expect(play(0, 50)).toBe(true);
});

it('scales timing-only endings with line length and falls back when follow is slow', () => {
  const short = createLineEndDetector({ text: 'בָּ' }), long = createLineEndDetector({ text: 'בָּ '.repeat(20) });
  const shortPlay = audio(short), longPlay = audio(long);
  shortPlay(.1, 1000); longPlay(.1, 1000);
  expect(shortPlay(0, 2000)).toBe(true);
  expect(longPlay(0, 7000)).toBe(false);
  expect(longPlay(0, 1500)).toBe(true);
  const slow = createLineEndDetector({ text: 'בָּ בָּ' }), play = audio(slow);
  play(.1, 1000);
  slow.follow(0, -2000);
  expect(play(0, 2000)).toBe(true);
});

it('maps syllables to printed word positions locally, including maqaf and substituted Names', () => {
  expect(wordSyllables('בָּ־בָּרָ  בָּרָכָה׃')).toEqual([1, 2, 3]);
  for (const [count, word] of [[0, null], [1, 0], [2, 1], [3, 1], [4, 2], [6, 2], [20, 2]]) {
    expect(wordForSyllables('בָּ בָּרָ בָּרָכָה', 'ashkenazi', count)).toBe(word);
  }
  for (const [count, word] of [[1, 0], [2, 0], [3, 1], [5, 1], [6, 2]]) {
    expect(wordForSyllables('מֶלֶךְ יְהוָה בָּ', 'chassidish', count)).toBe(word);
  }
});
