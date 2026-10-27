import { SKILLS } from '../rulebook/index.js';

const letters = {
  alef: 'an alef carries the vowel sound', bet: 'a bet with a dot says b',
  vet: 'a bet with no dot says v', gimel: 'a gimel says g', dalet: 'a dalet says d',
  hei: 'a hei says h', vav: 'a vav used as a letter says v', zayin: 'a zayin says z',
  chet: 'a chet says ch', tet: 'a tet says t', yud: 'a yud used as a letter says y',
  kaf: 'a kaf with a dot says k', chaf: 'a kaf with no dot says ch',
  final_kaf: 'a final kaf with a dot says k', final_chaf: 'a final kaf with no dot says ch',
  lamed: 'a lamed says l', mem: 'a mem says m', final_mem: 'a final mem says m',
  nun: 'a nun says n', final_nun: 'a final nun says n', samech: 'a samech says s',
  ayin: 'an ayin carries the vowel sound', pei: 'a pei with a dot says p',
  fei: 'a pei with no dot says f', final_fei: 'a final fei says f',
  tzadi: 'a tzadi says tz', final_tzadi: 'a final tzadi says tz', kuf: 'a kuf says k',
  resh: 'a resh says r', shin: 'a shin with a dot on the right says sh',
  sin: 'a shin with a dot on the left says s', tav: 'a tav with a dot says t',
};
const vowels = {
  patach: 'the patach (ַ) says a', segol: 'the segol (ֶ) says e',
  chirik: 'the chirik (ִ) says i', kubutz: 'the kubutz (ֻ) says u',
  shuruk: 'a vav with a dot in the middle says u',
  chataf_patach: 'the chataf patach (ֲ) says a quickly',
  chataf_segol: 'the chataf segol (ֱ) says e quickly',
  chataf_kamatz: 'the chataf kamatz (ֳ) says o quickly',
  kamatz_katan: 'the kamatz katan (ׇ) says o',
  sheva_na: 'a sheva at the start of a word is said quickly, like e',
};
const patterns = {
  closed_syllable: 'join the last letter to the sound before it',
  two_shevas: 'with two shevas together, the first is quiet and the second says a quick e',
  cholam_male: 'a vav with a dot above carries the cholam sound',
  chirik_male: 'a yud after chirik keeps the i sound',
  tzere_male: 'a yud after tzere belongs to the vowel sound',
  segol_yud: 'a yud after segol belongs to the e sound',
  ai: 'join the closing yud to the vowel before it',
  av: 'read the final kamatz, yud and vav together',
  silent_alef: 'a quiet alef adds no new sound',
  silent_hei: 'a hei at the end without a dot adds no new sound',
  silent_ayin: 'a quiet ayin adds no new sound',
  mappik: 'a hei at the end with a dot says h',
  patach_genuvah: 'say the final patach before the chet, ayin or dotted hei',
  vav_consonant: 'a vav used as a letter says v',
};

export function hint(skill, preset) {
  if (skill === 'letter:sav') return `a tav with no dot says ${preset === 'sephardi' ? 't' : 's'}`;
  if (skill === 'vowel:kamatz') return `the kamatz (ָ) says ${preset === 'sephardi' ? 'a' : 'o'}`;
  if (skill === 'vowel:tzere') return `the tzere (ֵ) says ${preset === 'sephardi' ? 'e' : 'ey'}`;
  if (skill === 'vowel:cholam') return `the cholam (ֹ) says ${preset === 'sephardi' ? 'o' : 'o, oy or ey'}`;
  const [kind, name] = skill.split(':');
  return ({ letter: letters, vowel: vowels, pattern: patterns })[kind]?.[name]
    || `practice ${SKILLS[skill] || skill}`;
}

export function parentLine(name, summary, preset) {
  const first = `${name} read ${summary.ok} of ${summary.pairs} sounds right today.`;
  if (summary.missedSkills?.length) return `${first} One to practice: ${hint(summary.missedSkills[0], preset)}.`;
  return summary.ok === summary.pairs ? `${first} Every sound was right!` : `${first} One to practice: read each sound slowly.`;
}
