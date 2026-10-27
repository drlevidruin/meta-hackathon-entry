const letters = {
  alef: ['alef', 'א'], bet: ['bet with a dot', 'בּ'], vet: ['vet', 'ב'], gimel: ['gimel', 'ג'],
  dalet: ['dalet', 'ד'], hei: ['hei', 'ה'], vav: ['vav', 'ו'], zayin: ['zayin', 'ז'], chet: ['chet', 'ח'],
  tet: ['tet', 'ט'], yud: ['yud', 'י'], kaf: ['kaf with a dot', 'כּ'], chaf: ['chaf', 'כ'], lamed: ['lamed', 'ל'],
  mem: ['mem', 'מ'], nun: ['nun', 'נ'], samech: ['samech', 'ס'], ayin: ['ayin', 'ע'],
  pei: ['pei with a dot', 'פּ'], fei: ['fei', 'פ'], tzadi: ['tzadi', 'צ'], kuf: ['kuf', 'ק'], resh: ['resh', 'ר'],
  shin: ['shin', 'שׁ'], sin: ['sin', 'שׂ'], tav: ['tav with a dot', 'תּ'], sav: ['sav', 'ת'],
  final_chaf: ['final chaf', 'ך'], final_kaf: ['final kaf with a dot', 'ךּ'], final_mem: ['final mem', 'ם'],
  final_nun: ['final nun', 'ן'], final_fei: ['final fei', 'ף'], final_tzadi: ['final tzadi', 'ץ'],
};
const vowels = {
  kamatz: 'kamatz', kamatz_katan: 'small kamatz', patach: 'patach', chataf_patach: 'chataf patach',
  chataf_kamatz: 'chataf kamatz', segol: 'segol', chataf_segol: 'chataf segol', tzere: 'tzere',
  chirik: 'chirik', cholam: 'cholam', kubutz: 'kubutz', shuruk: 'shuruk',
  sheva: 'sheva', sheva_na: 'sheva', sheva_nach: 'quiet sheva', none: 'quiet letter',
};
const patterns = {
  closed_syllable: 'closed syllable', two_shevas: 'two shevas', chirik_male: 'chirik with a yud',
  tzere_male: 'tzere with a yud', segol_yud: 'segol with a yud', ai: 'patach with a yud',
  silent_alef: 'quiet alef', silent_hei: 'quiet hei', silent_ayin: 'quiet ayin',
  patach_genuva: 'patach at the end', patach_genuvah: 'patach at the end', dagesh_chazak: 'strong dot',
  cholam_male: 'cholam with a vav', av: 'kamatz with a yud and vav',
  mappik: 'hei with a dot', vav_consonant: 'vav sound',
};

export function skillName(skill) {
  const [kind, name] = String(skill || '').split(':');
  if (kind === 'letter' && letters[name]) return `the ${letters[name][0]} (${letters[name][1]})`;
  if (kind === 'vowel' && vowels[name]) return `the ${vowels[name]}`;
  if (kind === 'pattern' && patterns[name]) return `the ${patterns[name]}`;
  return null;
}

export function skillLabel(skill) {
  const name = skillName(skill)?.replace(/^the /, '');
  return name ? name[0].toUpperCase() + name.slice(1) : 'Practice';
}

export function turnMessage(facts = {}) {
  const best = skillName(facts?.best);
  const next = skillName(facts?.next);
  if (best && next) return `You nailed ${best} today! Next time we practice ${next}.`;
  if (best) return `You nailed ${best} today!`;
  if (next) return `Next time we practice ${next}.`;
  return 'You read so well today!';
}
