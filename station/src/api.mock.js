const lines = ['בָּ בַּ בֵּ', 'מָ מַ מִ', 'לָ לַ לִ', 'בִּ בֵּ בֻּ', 'שָׁ שַׁ שִׁ', 'נָ נַ נִ'];
const tokens = ['ok', 'ok', 'ok', 'ok', 'wrong_letter', 'wrong_vowel', 'uncertain'];
export const items = lines.map((text, index) => ({
  id: `mock-${index}`, level: 1, text, words: text.split(' '),
  skills: ['vowel:kamatz', 'vowel:patach', 'vowel:chirik'], focus: 'vowel:kamatz',
  flags: [], source: { generated: true },
}));

const setFor = round => items.slice((round % 3) * 2, (round % 3) * 2 + 2);

export async function start({ level }) {
  return { profile: { level, round: 0 }, set: setFor(0) };
}

export async function next({ profile }) {
  const updated = { ...profile, round: profile.round + 1 };
  return { profile: updated, level: updated.level, set: setFor(updated.round) };
}

export async function grade({ itemId }) {
  const item = items.find(candidate => candidate.id === itemId);
  if (!item) throw new Error('Unknown mock item');
  const summary = { pairs: 0, ok: 0, wrong_letter: 0, wrong_vowel: 0, skipped: 0, extra: 0, uncertain: 0, not_decoded: 0, missedSkills: [] };
  const verdicts = [];
  const words = item.words.map(text => {
    const verdict = tokens[Math.floor(Math.random() * tokens.length)];
    const skills = ['vowel:kamatz'];
    summary.pairs++;
    summary[verdict]++;
    if (verdict !== 'ok') summary.missedSkills = skills;
    const pair = { text, verdict, heard: '?', expected: ['a'], skills };
    verdicts.push(pair);
    return { text, verdict: null, pairs: [pair] };
  });
  return { itemId, model: 'mock', words, verdicts, summary };
}
