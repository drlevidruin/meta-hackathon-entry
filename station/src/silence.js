// Keep the existing minimum so quiet-room readings still start at the same level.
export const SPEECH_THRESHOLD = 0.025;
const QUIET_MS = 1200; // Leave the reader the existing 1.2 seconds between phrases.
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
    const speaking = silent.heardSpeech ? loudness > floor + (speechLevel - floor) * QUIET_RATIO
      : loudness >= Math.max(threshold, floor * START_RATIO);
    if (speaking) {
      silent.heardSpeech = true;
      speechLevel = Math.max(speechLevel, loudness);
      quietSince = null;
    } else if (silent.heardSpeech) {
      if (quietSince === null) quietSince = now;
      return now - quietSince >= quietMs;
    }
    return false;
  }
  silent.heardSpeech = false;
  silent.reset = () => { silent.heardSpeech = false; speechLevel = 0; quietSince = null; };
  silent.resume = () => { quietSince = null; };
  return silent;
}

export function rms(samples) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
}
