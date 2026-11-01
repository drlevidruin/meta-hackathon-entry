import { expectedSounds, formatReading, splitWords } from '../../rulebook/index.js';

// Keep the existing minimum so quiet-room readings still start at the same level.
export const SPEECH_THRESHOLD = 0.025;
const QUIET_MS = 1200; // Keep the voice card's existing quiet ending separate from live lines.
export const FINISHED_QUIET_MS = 1500; // Allow a breath after reaching the final word.
export const MID_LINE_QUIET_MS = 3500; // Give a reader who stops inside a line time to continue.
export const TAIL_MS = 450; // Keep a final soft vowel after the detected ending before changing lines.
const FOLLOW_FRESH_MS = 2000; // An older audio snapshot cannot reliably say where the reader is now.
const MIN_LINE_MS = 700; // Even the shortest line needs a plausible speaking interval without follow.
const MS_PER_WORD = 450; // Scale the fallback minimum for short words read aloud.
const MS_PER_SYLLABLE = 200; // Longer words need more speaking time before a timing-only ending.
const NOISE_WINDOW_MS = 1000; // Forget older lows within a second as automatic gain raises hum.
const START_RATIO = 2.5; // Require a clear rise above hum while admitting .1 speech over a .03 floor.
const QUIET_RATIO = 0.25; // A return to the bottom quarter of this line's voice range counts as quiet.
const NOISE_RATIO = 0.5; // Exclude voiced peaks from the floor while allowing gain-raised pauses.

export function createSilenceDetector({ quietMs = QUIET_MS, threshold = SPEECH_THRESHOLD } = {}) {
  let quietSince = null;
  let floor = null;
  let speechLevel = 0;
  let recentNoise = [];
  function silent(loudness, now) {
    // Seed conservatively so startup hum does not count as speech, while a loud
    // first syllable can still start immediately without a calibration wait.
    if (floor === null) floor = Math.min(loudness, threshold);
    recentNoise = recentNoise.filter(sample => now - sample.now < NOISE_WINDOW_MS);
    const noise = silent.heardSpeech ? loudness <= speechLevel * NOISE_RATIO
      : loudness < Math.max(threshold, floor * START_RATIO);
    if (noise) recentNoise.push({ loudness, now });
    if (recentNoise.length) floor = Math.min(...recentNoise.map(sample => sample.loudness));
    // Keep soft pauses below the fixed level quiet even while automatic gain raises hum.
    const speaking = silent.heardSpeech ? loudness >= threshold
      && loudness > floor + (speechLevel - floor) * QUIET_RATIO
      : loudness >= Math.max(threshold, floor * START_RATIO);
    silent.speaking = speaking;
    if (speaking) {
      silent.heardSpeech = true;
      speechLevel = Math.max(speechLevel, loudness);
      quietSince = null;
    } else if (silent.heardSpeech) {
      if (quietSince === null) quietSince = now;
      silent.quietForMs = now - quietSince;
      return silent.quietForMs >= quietMs;
    }
    silent.quietForMs = 0;
    return false;
  }
  silent.heardSpeech = false;
  silent.reset = () => { silent.heardSpeech = false; silent.speaking = false; silent.quietForMs = 0; speechLevel = 0; quietSince = null; };
  silent.resume = () => { quietSince = null; silent.quietForMs = 0; };
  return silent;
}

export function wordSyllables(text, preset = 'sephardi') {
  return splitWords(text).map(({ word, maqaf }) => formatReading(expectedSounds(word + (maqaf ? '־' : ''), preset))
    .split('-').filter(sound => /[aeiou]/u.test(sound)).length);
}

export function wordForSyllables(text, preset, count) {
  if (!Number.isSafeInteger(count) || count <= 0) return null;
  const syllables = wordSyllables(text, preset);
  const word = syllables.findIndex(size => (count -= size) <= 0);
  return word >= 0 ? word : syllables.length ? syllables.length - 1 : null;
}

export function createLineEndDetector({ text = '', preset } = {}) {
  let syllables, minimumMs;
  function configure(text, preset) {
    syllables = wordSyllables(text, preset);
    minimumMs = Math.max(MIN_LINE_MS, syllables.length * MS_PER_WORD,
      syllables.reduce((sum, size) => sum + size, 0) * MS_PER_SYLLABLE);
  }
  configure(text, preset);
  const silent = createSilenceDetector({ quietMs: Infinity });
  let word = null, followedAt = -Infinity, lastSpeechAt = 0, previousAt = null, elapsedMs = 0, spokenMs = 0, endingAt = null;
  function ended(loudness, now, frameMs = previousAt === null ? 0 : now - previousAt) {
    previousAt = now;
    silent(loudness, now);
    ended.heardSpeech = silent.heardSpeech;
    if (!silent.heardSpeech) return false;
    elapsedMs += frameMs;
    if (silent.speaking) { spokenMs += frameMs; lastSpeechAt = now; }
    const reachedLast = syllables.length > 0 && word === syllables.length - 1;
    // A current mid-line position stays current through its pause until new speech arrives.
    const fresh = word !== null && lastSpeechAt - followedAt <= FOLLOW_FRESH_MS;
    const likelyLast = !fresh && spokenMs >= minimumMs;
    const quietMs = reachedLast || likelyLast ? FINISHED_QUIET_MS : MID_LINE_QUIET_MS;
    if (silent.speaking || silent.quietForMs < quietMs || (!fresh && !reachedLast && elapsedMs < minimumMs)) {
      endingAt = null;
    } else endingAt ??= now;
    ended.finishing = endingAt !== null;
    return ended.finishing && now - endingAt >= TAIL_MS;
  }
  ended.heardSpeech = false;
  ended.finishing = false;
  ended.follow = (position, capturedAt) => {
    if (Number.isInteger(position) && position >= 0 && position < syllables.length) {
      word = Math.max(word ?? -1, position);
      followedAt = capturedAt;
    }
  };
  ended.reset = options => {
    if (options) configure(options.text, options.preset);
    silent.reset();
    word = null; followedAt = -Infinity; lastSpeechAt = 0; previousAt = null; elapsedMs = 0; spokenMs = 0; endingAt = null;
    ended.heardSpeech = false; ended.finishing = false;
  };
  ended.resume = () => { silent.resume(); previousAt = null; endingAt = null; ended.finishing = false; };
  return ended;
}

export function rms(samples) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
}
