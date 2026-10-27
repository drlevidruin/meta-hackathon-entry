const plainSounds = {
  א: '', ג: 'g', ד: 'd', ה: 'h', ו: 'v', ז: 'z', ח: 'ch', ט: 't', י: 'y',
  ל: 'l', מ: 'm', ם: 'm', נ: 'n', ן: 'n', ס: 's', ע: '', צ: 'tz', ץ: 'tz', ק: 'k', ר: 'r',
};

export function hasDagesh(group) {
  return Boolean(group?.marks.includes('\u05bc'));
}

export function consonant(group, preset) {
  const dagesh = hasDagesh(group);
  switch (group.letter) {
    case 'ב': return dagesh ? 'b' : 'v';
    case 'כ': case 'ך': return dagesh ? 'k' : 'ch';
    case 'פ': case 'ף': return dagesh ? 'p' : 'f';
    case 'ש': return group.marks.includes('\u05c2') ? 's' : 'sh';
    case 'ת': return dagesh || preset === 'sephardi' ? 't' : 's';
    default: return plainSounds[group.letter];
  }
}

export const LETTER_NAMES = {
  א: 'alef', ג: 'gimel', ד: 'dalet', ה: 'hei', ו: 'vav', ז: 'zayin', ח: 'chet',
  ט: 'tet', י: 'yud', ל: 'lamed', מ: 'mem', ם: 'final_mem', נ: 'nun', ן: 'final_nun',
  ס: 'samech', ע: 'ayin', צ: 'tzadi', ץ: 'final_tzadi', ק: 'kuf', ר: 'resh',
};

export function letterSkill(group) {
  const dagesh = hasDagesh(group);
  switch (group.letter) {
    case 'ב': return dagesh ? 'bet' : 'vet';
    case 'כ': return dagesh ? 'kaf' : 'chaf';
    case 'ך': return dagesh ? 'final_kaf' : 'final_chaf';
    case 'פ': return dagesh ? 'pei' : 'fei';
    case 'ף': return 'final_fei';
    case 'ש': return group.marks.includes('\u05c2') ? 'sin' : 'shin';
    case 'ת': return dagesh ? 'tav' : 'sav';
    default: return LETTER_NAMES[group.letter];
  }
}
