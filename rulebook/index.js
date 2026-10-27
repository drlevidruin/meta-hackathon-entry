import { cleanWord, stripMarkup } from './cleanup.js';
import { markedVowel, PRESETS } from './presets.js';
import { formPairs } from './pairs.js';
import { decideShevas, flagKamatzKatan } from './grammar.js';
import { divineName, soundPairs } from './analysis.js';
import { sortedUnique } from './skills.js';

export { cleanWord, splitWords } from './cleanup.js';
export { PRESETS } from './presets.js';
export { SKILLS } from './skills.js';

export function expectedSounds(raw, preset) {
  if (!Object.hasOwn(PRESETS, preset)) throw new RangeError(`Unknown preset: ${preset}`);
  const word = cleanWord(raw);
  const { groups, pairs } = formPairs(word);
  const divine = divineName(word, groups);
  if (divine.substitute) {
    const prefixWord = groups.slice(0, divine.prefixLength).map((group) => group.text).join('');
    const { pairs: prefixPairs } = formPairs(prefixWord);
    // Prefix grammar follows the spoken Name, not its unpronounced pointing.
    const context = [...groups.slice(0, divine.prefixLength), ...formPairs('אֲדֹנָי').groups];
    decideShevas(context, prefixPairs);
    flagKamatzKatan(context, prefixPairs, false);
    const sounded = soundPairs(context, prefixPairs, preset, divine);
    const flags = sortedUnique(['divine_name', ...sounded.flatMap((pair) => pair.flags)]);
    const skills = sortedUnique(sounded.flatMap((pair) => pair.skills));
    const readings = [expectedSounds('אֲדֹנָי', preset), expectedSounds('הַשֵּׁם', preset)];
    return {
      word, preset, pairs: sounded, flags, skills, substitute: true,
      readings: prefixWord ? readings.map((reading) => ({
        ...reading, word: prefixWord + reading.word, pairs: [...sounded, ...reading.pairs],
        flags: sortedUnique([...flags, ...reading.flags]),
        skills: sortedUnique([...skills, ...reading.skills]), readings: null,
      })) : readings,
    };
  }
  decideShevas(groups, pairs);
  flagKamatzKatan(groups, pairs, /־\s*$/u.test(stripMarkup(raw)));
  const sounded = soundPairs(groups, pairs, preset, divine);
  const flags = sounded.flatMap((pair) => pair.flags);
  if (groups.length >= 2 && groups.every((group) => markedVowel(group) === 'none')
    && !pairs.some((pair) => pair.shuruk || pair.vowel === 'shuruk')) flags.push('unpointed');
  if (divine.adonai) flags.push('divine_name');
  return {
    word, preset, pairs: sounded, flags: sortedUnique(flags),
    skills: sortedUnique(sounded.flatMap((pair) => pair.skills)),
    readings: divine.adonai ? [expectedSounds('הַשֵּׁם', preset)] : null,
  };
}

export function tagSkills(word) {
  return expectedSounds(word, 'sephardi').skills;
}

export function formatReading(result) {
  if ((result.substitute || !result.pairs.length) && result.readings?.length) return formatReading(result.readings[0]);
  const syllables = [];
  for (const pair of result.pairs) {
    const sound = pair.sounds[0];
    if (!sound) continue;
    if (pair.vowels[0] === '' && syllables.length) syllables[syllables.length - 1] += sound;
    else syllables.push(sound);
  }
  return syllables.join('-');
}

export function formatPairs(result) {
  return result.pairs.map((pair) => pair.sounds.join('/')).join(' · ');
}
