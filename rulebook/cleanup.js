const ignoredMarks = /[\u0591-\u05af\u05bd\u05bf\u05c4\u05c5]/gu;

export function stripMarkup(raw) {
  return String(raw).replace(/<[^>]*>/gu, '').normalize('NFKD');
}

export function cleanWord(raw) {
  const text = stripMarkup(raw).replace(/([א-ת])([^א-ת]*)/gu, (whole, letter, marks) =>
    letter + (marks.includes('\u05bf') ? marks.replaceAll('\u05bc', '') : marks))
    .replace(ignoredMarks, '');
  // Keep this abbreviation recognizable when a cleaned word is analyzed again.
  const abbreviation = text.replace(/[^א-ת\u05b0-\u05bc\u05c1\u05c2\u05c7׳'’]/gu, '');
  if (/^ה[׳'’]$/u.test(abbreviation)) return 'ה׳';
  return text.replace(/[^\u05b0-\u05bc\u05c1\u05c2\u05c7\u05d0-\u05ea]/gu, '');
}

export function splitWords(line) {
  const text = stripMarkup(line).replace(/[\u0591-\u05af\u05bd\u05c4\u05c5]/gu, '');
  const tokens = text.match(/[א-ת][\u05b0-\u05bc\u05bf\u05c1\u05c2\u05c7א-ת׳״'’]*|־/gu) ?? [];
  const words = [];
  for (const token of tokens) {
    if (token === '־') {
      if (words.length) words.at(-1).maqaf = true;
      continue;
    }
    const word = cleanWord(token);
    if (/[א-ת]/u.test(word)) words.push({ word, maqaf: false });
  }
  return words;
}

export function letterGroups(word) {
  return [...word.matchAll(/([א-ת])([^א-ת]*)/gu)].map((match) => ({
    letter: match[1], text: match[0], marks: match[2],
  }));
}
