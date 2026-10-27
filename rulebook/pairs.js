import { letterGroups } from './cleanup.js';
import { hasDagesh } from './letters.js';
import { markedVowel } from './presets.js';

function isShuruk(group) {
  return group.letter === 'ו' && hasDagesh(group) && group.vowel === 'none';
}

function isCholamMale(group) {
  return group.letter === 'ו' && group.vowel === 'cholam'
    && !hasDagesh(group) && !group.marks.includes('\u05ba');
}

function joinMater(pair, group, pattern) {
  pair.text += group.text;
  if (pattern) pair.skills.push(`pattern:${pattern}`);
  if ('אעה'.includes(group.letter)) {
    const name = { א: 'alef', ע: 'ayin', ה: 'hei' }[group.letter];
    pair.skills.push(`pattern:silent_${name}`);
    if (group.letter !== 'ה') pair.skills.push(`letter:${name}`);
  }
}

export function formPairs(word) {
  const groups = letterGroups(word).map((group) => ({ ...group, vowel: markedVowel(group) }));
  const pairs = [];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    const before = pairs.at(-1);
    if (before?.vowel === 'none' && (isShuruk(group) || isCholamMale(group))) {
      before.vowel = isShuruk(group) ? 'shuruk' : 'cholam';
      before.closingYud = false;
      joinMater(before, group, isShuruk(group) ? null : 'cholam_male');
      continue;
    }
    const bare = group.vowel === 'none';
    const materYud = group.letter === 'י' && bare && !hasDagesh(group)
      && ['chirik', 'tzere', 'segol'].includes(before?.vowel);
    const finalAv = group.letter === 'י' && bare && index === groups.length - 2
      && groups[index + 1].letter === 'ו' && groups[index + 1].vowel === 'none'
      && before?.vowel === 'kamatz';
    const yudBeforeShuruk = group.letter === 'י' && isShuruk(groups[index + 1] ?? {});
    if (before && !yudBeforeShuruk && (materYud || finalAv)) {
      const pattern = finalAv ? 'av' : { chirik: 'chirik_male', tzere: 'tzere_male', segol: 'segol_yud' }[before.vowel];
      joinMater(before, group, pattern);
      continue;
    }
    const carriesNextVowel = groups[index + 1]
      && (isShuruk(groups[index + 1]) || isCholamMale(groups[index + 1]));
    const silent = bare && !carriesNextVowel && ('אע'.includes(group.letter)
      || (group.letter === 'ה' && index === groups.length - 1 && !hasDagesh(group)));
    if (before && silent) {
      joinMater(before, group);
      continue;
    }
    pairs.push({
      ...group, index, vowel: isShuruk(group) ? 'shuruk' : group.vowel,
      shuruk: isShuruk(group), silent, flags: [], skills: [],
      mappik: group.letter === 'ה' && index === groups.length - 1 && hasDagesh(group),
      closingYud: group.letter === 'י' && bare && ['patach', 'kamatz'].includes(before?.vowel),
    });
  }
  return { groups, pairs };
}
