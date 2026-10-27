import { pairsApart } from './meter.js';
import { PRESETS } from '../rulebook/presets.js';
import { voiceCard } from '../rulebook/voice-card.js';

export function voiceCardToEar(profile, vowels, preset) {
  try {
    if (!Object.hasOwn(PRESETS, preset) || !pairsApart(profile)) return false;
    // The ear learns this reader's kamatz from the card, so trust it only when
    // the card shows kamatz apart from a patach.
    const needsKamatzPair = voiceCard(vowels).some(syllable => syllable.includes('\u05b8'))
      && PRESETS[preset].kamatz.some(sound => sound !== 'a');
    return !needsKamatzPair
      || (Object.hasOwn(profile.vowels, 'o') && Object.hasOwn(profile.vowels, 'a'));
  } catch {
    return false;
  }
}
