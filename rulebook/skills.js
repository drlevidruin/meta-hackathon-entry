import { LETTER_NAMES } from './letters.js';
import { PRESETS } from './presets.js';

const labels = {
  closed_syllable: 'Closed syllable', two_shevas: 'Two consecutive shevas',
  cholam_male: 'Cholam with a mater vav', chirik_male: 'Chirik with a mater yud',
  tzere_male: 'Tzere with a mater yud', segol_yud: 'Segol with a mater yud',
  ai: 'Patach or kamatz with a closing yud', av: 'Final kamatz, yud, vav',
  silent_alef: 'Silent alef', silent_hei: 'Silent hei', silent_ayin: 'Silent ayin',
  mappik: 'Mappik hei', patach_genuvah: 'Patach genuvah', vav_consonant: 'Consonant vav',
};
const letterNames = [...new Set([...Object.values(LETTER_NAMES),
  'bet', 'vet', 'kaf', 'chaf', 'final_kaf', 'final_chaf', 'pei', 'fei', 'final_fei',
  'shin', 'sin', 'tav', 'sav'])];
const english = (name) => name.replaceAll('_', ' ').replace(/^./u, (first) => first.toUpperCase());

export const SKILLS = Object.freeze(Object.fromEntries([
  ...letterNames.map((name) => [`letter:${name}`, english(name)]),
  ...Object.keys(PRESETS.sephardi).filter((name) => !['none', 'sheva', 'sheva_nach'].includes(name))
    .map((name) => [`vowel:${name}`, english(name)]),
  ...Object.entries(labels).map(([name, label]) => [`pattern:${name}`, label]),
]));

export function sortedUnique(values) {
  return [...new Set(values)].sort();
}
