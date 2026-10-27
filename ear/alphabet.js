export const CONSONANTS = Object.freeze([
  'b', 'v', 'g', 'd', 'h', 'z', 'ch', 't', 'y', 'k', 'l', 'm', 'n', 's',
  'p', 'f', 'tz', 'r', 'sh',
]);

export const VOWELS = Object.freeze(['a', 'e', 'i', 'o', 'u', 'oy', 'ey']);

const phonemes = [...CONSONANTS, ...VOWELS].sort((a, b) => b.length - a.length);

export function tokenize(syllable) {
  if (syllable === '?') return ['?'];
  if (typeof syllable !== 'string' || syllable.length === 0) return null;

  const tokens = [];
  let offset = 0;
  while (offset < syllable.length) {
    const token = phonemes.find((sound) => syllable.startsWith(sound, offset));
    if (!token) return null;
    tokens.push(token);
    offset += token.length;
  }
  return tokens;
}
