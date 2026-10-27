export function createSilenceDetector({ quietMs = 1200, threshold = 0.025 } = {}) {
  let heardSpeech = false;
  let quietSince = null;
  return (loudness, now) => {
    if (loudness >= threshold) {
      heardSpeech = true;
      quietSince = null;
    } else if (heardSpeech) {
      if (quietSince === null) quietSince = now;
      return now - quietSince >= quietMs;
    }
    return false;
  };
}

export function rms(samples) {
  return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
}
