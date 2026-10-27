export const USABLE_PAIRS = Object.freeze([['a', 'o'], ['a', 'e'], ['e', 'i']]);

export function hasUsablePair(labels) {
  return USABLE_PAIRS.some(pair => pair.every(vowel => labels.includes(vowel)));
}
