import { expectedSounds } from './index.js';

export const VOICE_CARD = Object.freeze(['בָּ', 'בַּ', 'בֶּ', 'בִּ', 'בֹּ', 'דָ', 'דַ', 'דֶ', 'דִ', 'דֹ', 'מָ', 'מַ', 'מֶ', 'מִ', 'מֹ']);

export function cardLabels(preset) {
  return VOICE_CARD.map((syllable) => {
    const { pairs } = expectedSounds(syllable, preset);
    const vowels = pairs.length === 1 ? pairs[0].vowels : [];
    return vowels.length === 1 && ['a', 'o', 'e', 'i'].includes(vowels[0]) ? vowels[0] : null;
  });
}
