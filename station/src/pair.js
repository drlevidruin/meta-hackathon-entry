export function pairLetter(text) {
  const first = text.match(/^.\p{M}*/u)?.[0] ?? '';
  // A vav whose dot is its only point is the shuruk vowel, so none of it is the letter.
  const marks = first.slice(1);
  if (first[0] === 'ו' && marks.includes('ּ') && !/[ְ-ׇֻ]/u.test(marks)) return '';
  return first.replace(/(?![ּׁׂ])\p{M}/gu, '');
}
