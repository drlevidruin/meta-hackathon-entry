import { hasDagesh } from './letters.js';

const begedKefet = 'בגדכךפףת';
const shortOrSilent = ['none', 'sheva_nach'];

export function dageshChazak(pairs, index) {
  const pair = pairs[index];
  if (!pair || !hasDagesh(pair) || pair.shuruk || pair.mappik) return false;
  if (!begedKefet.includes(pair.letter)) return true;
  return index > 0 && !shortOrSilent.includes(pairs[index - 1].vowel);
}

function afterLongVowel(pair) {
  return pair && (['kamatz', 'tzere', 'cholam', 'shuruk'].includes(pair.vowel)
    || pair.skills.includes('pattern:chirik_male'));
}

export function decideShevas(groups, pairs) {
  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];
    if (pair.vowel !== 'sheva') continue;
    const position = pair.index;
    const previousSheva = groups[position - 1]?.vowel === 'sheva';
    const nextSheva = groups[position + 1]?.vowel === 'sheva';
    if (previousSheva || nextSheva) pair.skills.push('pattern:two_shevas');
    if (position === 0) pair.vowel = 'sheva_na';
    else if (position === groups.length - 1 || (nextSheva && position === groups.length - 2)) {
      pair.vowel = 'sheva_nach';
    } else if (nextSheva) pair.vowel = 'sheva_nach';
    else if (previousSheva || dageshChazak(pairs, index)) pair.vowel = 'sheva_na';
    else if (index === 1 && pairs[0].shuruk && pairs[0].index === 0) pair.vowel = 'sheva_na';
    else if (pair.letter === groups[position + 1]?.letter || afterLongVowel(pairs[index - 1])) {
      pair.flags.push('sheva');
    } else pair.vowel = 'sheva_nach';
  }
}

function hasKolEnding(groups) {
  const letters = groups.map((group) => group.letter).join('');
  const start = letters.length - 2;
  return letters.endsWith('כל') && /^[ובכלמשה]*$/u.test(letters.slice(0, start))
    && groups[start]?.vowel === 'kamatz';
}

function isVavPast(groups, pairs) {
  const first = groups[0];
  const prefix = first?.letter === 'ו' && ((first.vowel === 'patach' && hasDagesh(groups[1]))
    || (first.vowel === 'kamatz' && groups[1]?.letter === 'א'));
  const lastVowel = pairs.findLastIndex((pair) => !['none', 'sheva_nach'].includes(pair.vowel));
  return { prefix, lastVowel };
}

export function flagKamatzKatan(groups, pairs, maqaf) {
  const kolEnding = hasKolEnding(groups);
  const past = isVavPast(groups, pairs);
  const lastVowel = pairs.findLastIndex((pair) => !['none', 'sheva_nach'].includes(pair.vowel));
  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index];
    if (pair.vowel !== 'kamatz') continue;
    const next = groups[pair.index + 1];
    const beforeClosingConsonant = pairs[index + 1]
      && ['none', 'sheva_nach'].includes(pairs[index + 1].vowel);
    if (next?.vowel === 'sheva' || next?.vowel === 'chataf_kamatz'
      || (pairs[index + 1]?.index === pair.index + 1 && dageshChazak(pairs, index + 1))
      || (maqaf && index === lastVowel)
      || (kolEnding && pair.index === groups.length - 2)
      || (past.prefix && index === past.lastVowel && beforeClosingConsonant)) {
      pair.flags.push('kamatz_katan');
      pair.skills.push('vowel:kamatz_katan');
    }
  }
}
