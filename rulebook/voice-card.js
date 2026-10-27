import { expectedSounds } from './index.js';

export const VOICE_CARD = Object.freeze(['בָּ', 'בַּ', 'בֶּ', 'בִּ', 'בֹּ', 'דָ', 'דַ', 'דֶ', 'דִ', 'דֹ', 'מָ', 'מַ', 'מֶ', 'מִ', 'מֹ']);

export const CARD_VOWELS = Object.freeze(['kamatz', 'patach', 'segol', 'chirik', 'cholam']);

export function voiceCard(vowels) {
  const shown = CARD_VOWELS.filter(vowel => vowels == null || vowels.includes(vowel));
  if (shown.length === 5) return [...VOICE_CARD];
  if (!shown.length) return [];
  const marks = { kamatz: 'ָ', patach: 'ַ', segol: 'ֶ', chirik: 'ִ', cholam: 'ֹ' };
  const rows = shown.length <= 2 ? ['בּ', 'ד', 'מ', 'ג', 'תּ', 'ק'] : ['בּ', 'ד', 'מ'];
  return rows.flatMap(letter => shown.map(vowel => (letter + marks[vowel]).normalize('NFD')));
}

export function cardLabels(preset, card = VOICE_CARD) {
  return card.map((syllable) => {
    const { pairs } = expectedSounds(syllable, preset);
    const vowels = pairs.length === 1 ? pairs[0].vowels : [];
    return vowels.length === 1 && ['a', 'o', 'e', 'i'].includes(vowels[0]) ? vowels[0] : null;
  });
}

export function voiceCardFor(vowels, preset) {
  const card = voiceCard(vowels);
  return cardLabels(preset, card).some(label => label !== null) ? card : [];
}
