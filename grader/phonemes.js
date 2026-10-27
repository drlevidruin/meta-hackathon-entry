import { tokenize } from '../ear/alphabet.js';

export const isVowel = (token) => ['a', 'e', 'i', 'o', 'u'].includes(token);
export const equal = (left, right) => left.length === right.length
  && left.every((token, index) => token === right[index]);

export function phonemes(syllable) {
  if (syllable === '') return [];
  const tokens = tokenize(syllable);
  if (!tokens) throw new TypeError('Invalid sound alphabet syllable.');
  const expanded = tokens.flatMap((token) => (
    token === 'oy' ? ['o', 'y'] : token === 'ey' ? ['e', 'y'] : [token]
  ));
  // Apply this before flattening syllables, so a-i and ai stay distinct.
  return expanded.map((token, index) => (
    ['i', 'u'].includes(token) && isVowel(expanded[index - 1]) ? 'y' : token
  ));
}

export function substitution(left, right) {
  if (left === right) return 0;
  if (left === '?' || right === '?') return 0.5;
  return isVowel(left) === isVowel(right) ? 1 : 2;
}

export function distance(heard, expected) {
  let previous = Array.from({ length: heard.length + 1 }, (_, index) => index);
  for (const token of expected) {
    const next = [previous[0] + 1];
    for (let index = 1; index <= heard.length; index += 1) {
      next[index] = Math.min(
        previous[index] + 1,
        next[index - 1] + 1,
        previous[index - 1] + substitution(heard[index - 1], token),
      );
    }
    previous = next;
  }
  return previous[heard.length];
}
