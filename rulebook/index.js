import { cleanWord, stripMarkup } from './cleanup.js';
import { PRESETS } from './presets.js';
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
    return {
      word, preset, pairs: [], flags: ['divine_name'], skills: [],
      readings: [expectedSounds('אֲדֹנָי', preset), expectedSounds('הַשֵּׁם', preset)],
    };
  }
  decideShevas(groups, pairs);
  flagKamatzKatan(groups, pairs, /־\s*$/u.test(stripMarkup(raw)));
  const sounded = soundPairs(groups, pairs, preset, divine);
  const flags = sounded.flatMap((pair) => pair.flags);
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
  if (!result.pairs.length && result.readings?.length) return formatReading(result.readings[0]);
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
