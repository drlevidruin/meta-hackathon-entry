const letters = {
  alef: 'א', bet: 'בּ', vet: 'ב', gimel: 'ג', dalet: 'ד', hei: 'ה', vav: 'ו', zayin: 'ז',
  chet: 'ח', tet: 'ט', yud: 'י', kaf: 'כּ', chaf: 'כ', lamed: 'ל', mem: 'מ', nun: 'נ',
  samech: 'ס', ayin: 'ע', pei: 'פּ', fei: 'פ', tzadi: 'צ', kuf: 'ק', resh: 'ר',
  shin: 'שׁ', sin: 'שׂ', tav: 'תּ', sav: 'ת', final_chaf: 'ך', final_kaf: 'ךּ',
  final_mem: 'ם', final_nun: 'ן', final_fei: 'ף', final_tzadi: 'ץ',
};
const vowels = new Set(['kamatz', 'kamatz_katan', 'patach', 'chataf_patach', 'chataf_kamatz',
  'segol', 'chataf_segol', 'tzere', 'chirik', 'cholam', 'kubutz', 'shuruk', 'sheva_na']);

export function skillName(skill) {
  const [kind, name] = String(skill).split(':');
  if (kind === 'letter' && letters[name]) return `the letter ${letters[name]}`;
  if (kind === 'vowel' && vowels.has(name)) return `the vowel ${name.replaceAll('_', ' ')}`;
  return null;
}

export function turnMessage(summaries) {
  const pairs = summaries.reduce((sum, summary) => sum + (summary.pairs || 0), 0);
  const ok = summaries.reduce((sum, summary) => sum + (summary.ok || 0), 0);
  const mistakes = summaries.some(summary => ['wrong_letter', 'wrong_vowel', 'skipped', 'extra', 'uncertain', 'not_decoded']
    .some(key => summary[key] > 0));
  if (pairs > 0 && ok === pairs && !mistakes) return 'You read every sound just right!';
  const counts = new Map();
  summaries.flatMap(summary => summary.missedSkills || []).forEach(skill => counts.set(skill, (counts.get(skill) || 0) + 1));
  const practice = [...counts].sort((a, b) => b[1] - a[1]).map(([skill]) => skillName(skill)).find(Boolean);
  if (pairs > 0 && ok / pairs >= 0.7) {
    return practice ? `Great reading, and keep practicing ${practice}!` : 'You read so many sounds just right!';
  }
  return practice ? `Keep trying, and let's practice ${practice} together!` : 'Every try helps you grow!';
}
