import { consonant, hasDagesh, letterSkill } from './letters.js';
import { PRESETS } from './presets.js';
import { sortedUnique } from './skills.js';

function pairSkills(pair, vowels, consonants) {
  const skills = [...pair.skills];
  if (!pair.shuruk && (!pair.silent || 'אע'.includes(pair.letter))) skills.push(`letter:${letterSkill(pair)}`);
  if (!['none', 'sheva_nach'].includes(pair.vowel)) {
    skills.push(`vowel:${pair.vowel === 'sheva' ? 'sheva_na' : pair.vowel}`);
  }
  if (consonants.some(Boolean) && vowels.includes('')) skills.push('pattern:closed_syllable');
  if (pair.closingYud) skills.push('pattern:ai');
  if (pair.letter === 'ו' && !pair.shuruk) skills.push('pattern:vav_consonant');
  if (pair.mappik) skills.push('pattern:mappik');
  if (pair.furtive) skills.push('pattern:patach_genuvah');
  if ('אע'.includes(pair.letter) && pair.vowel === 'none') {
    skills.push(`pattern:silent_${pair.letter === 'א' ? 'alef' : 'ayin'}`);
  }
  if (pair.silent && pair.letter === 'ה') skills.push('pattern:silent_hei');
  return sortedUnique(skills);
}

export function soundPairs(groups, pairs, preset, divine) {
  return pairs.map((pair) => {
    let consonants = [pair.shuruk || pair.silent ? '' : consonant(pair, preset)];
    if (divine.elohimHei === pair.index) {
      consonants = ['h', 'k'];
      pair.flags.push('divine_name');
    }
    if (divine.elAlef === pair.index) {
      consonants = ['', 'k'];
      pair.flags.push('divine_name');
    }
    let vowels = [...PRESETS[preset][pair.vowel]];
    if (pair.flags.includes('kamatz_katan')) vowels = [...new Set([...vowels, 'o'])];
    pair.furtive = pair.index === groups.length - 1 && pair.vowel === 'patach'
      && ('חע'.includes(pair.letter) || (pair.letter === 'ה' && hasDagesh(pair)));
    const sounds = [...new Set(consonants.flatMap((letter) => vowels.map((vowel) =>
      pair.furtive ? vowel + letter : letter + vowel)))];
    if (pair.letter === 'ש' && !/[\u05c1\u05c2]/u.test(pair.marks)) pair.flags.push('no_shin_dot');
    if (pair.vowel === 'none' && pair.index < groups.length - 1
      && !pair.closingYud && !'אע'.includes(pair.letter)) pair.flags.push('unpointed');
    return {
      text: pair.text, letter: pair.letter, consonants, vowels, sounds, vowel: pair.vowel,
      furtive: pair.furtive, flags: sortedUnique(pair.flags), skills: pairSkills(pair, vowels, consonants),
    };
  });
}

export function divineName(word, groups) {
  const letters = groups.map((group) => group.letter).join('');
  const alef = groups.findIndex((group) => group.letter === 'א');
  const prefixes = alef >= 0 && /^[ובכלמשה]{0,2}$/u.test(letters.slice(0, alef));
  const name = letters.match(/^([ובכלמשה]{0,2})יהוה$/u);
  const lamed = groups[alef + 1];
  const hei = alef + (lamed?.vowel === 'cholam' ? 2 : 3);
  const cholam = lamed?.vowel === 'cholam' || (lamed?.vowel === 'none'
    && groups[alef + 2]?.letter === 'ו' && groups[alef + 2]?.vowel === 'cholam'
    && !hasDagesh(groups[alef + 2]) && !groups[alef + 2].marks.includes('\u05ba'));
  return {
    substitute: Boolean(name) || letters === 'יי' || word === 'ה׳',
    prefixLength: name?.[1].length ?? 0,
    adonai: letters === 'אדני' && groups[0]?.vowel === 'chataf_patach'
      && groups[2]?.vowel === 'kamatz',
    elohimHei: prefixes && (groups[alef].vowel === 'chataf_segol'
      || (alef > 0 && groups[alef].vowel === 'none'))
      && lamed?.letter === 'ל' && cholam && groups[hei]?.letter === 'ה' ? hei : -1,
    elAlef: prefixes && letters.slice(alef) === 'אל' && groups[alef].vowel === 'tzere' ? alef : -1,
  };
}
