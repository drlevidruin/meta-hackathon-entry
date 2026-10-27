const clean = { words: [{ verdict: null, pairs: [{ verdict: 'ok' }] }], summary: { pairs: 1, ok: 1 } };
export const starFixtures = [
  { name: 'missing grade', grade: null, challenge: true, stars: 0 },
  { name: 'empty line', grade: { words: [], summary: { pairs: 0, ok: 0 } }, challenge: true, stars: 0 },
  { name: 'regular clean line', grade: clean, challenge: false, stars: 1 },
  { name: 'clean challenge', grade: clean, challenge: true, stars: 2 },
  { name: 'eighty percent', grade: { ...clean, summary: { pairs: 10, ok: 8 } }, stars: 1 },
  { name: 'below eighty percent', grade: { ...clean, summary: { pairs: 10, ok: 7 } }, stars: 0 },
  { name: 'extra sound', grade: { ...clean, summary: { pairs: 1, ok: 1, extra: 1 } }, challenge: true, stars: 1 },
  { name: 'extra word', grade: { ...clean, words: [...clean.words, { verdict: 'extra', pairs: [] }] }, challenge: true, stars: 1 },
  { name: 'undecoded word', grade: { ...clean, words: [{ verdict: 'not_decoded', pairs: [{ verdict: 'ok' }] }] }, challenge: true, stars: 1 },
  { name: 'uncertain pair', grade: { words: [{ pairs: [{ verdict: 'uncertain' }] }], summary: { pairs: 1, ok: 0 } }, challenge: true, stars: 0 },
];
