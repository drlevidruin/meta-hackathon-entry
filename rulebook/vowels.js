export const VOWEL_IDS = Object.freeze(['kamatz', 'patach', 'segol', 'tzere', 'chirik', 'cholam', 'shuruk', 'kubutz', 'sheva', 'chataf']);

export function normalizeVowels(value) {
  if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length
    || ![...value].every(id => typeof id === 'string' && VOWEL_IDS.includes(id))) return null;
  return VOWEL_IDS.filter(id => value.includes(id));
}

export function isFullSet(vowels) {
  return Array.isArray(vowels) && VOWEL_IDS.every(id => vowels.includes(id));
}

const skillVowels = {
  kamatz: 'kamatz', kamatz_katan: 'kamatz', patach: 'patach', segol: 'segol', tzere: 'tzere',
  chirik: 'chirik', cholam: 'cholam', shuruk: 'shuruk', kubutz: 'kubutz', sheva_na: 'sheva',
  chataf_patach: 'chataf', chataf_segol: 'chataf', chataf_kamatz: 'chataf',
};
const pointVowels = {
  'ְ': 'sheva', 'ֱ': 'chataf', 'ֲ': 'chataf', 'ֳ': 'chataf', 'ִ': 'chirik', 'ֵ': 'tzere',
  'ֶ': 'segol', 'ַ': 'patach', 'ָ': 'kamatz', 'ׇ': 'kamatz', 'ֹ': 'cholam', 'ֺ': 'cholam', 'ֻ': 'kubutz',
};

export function requiredVowels(item) {
  const required = new Set();
  for (const skill of item.skills || []) {
    if (!skill.startsWith('vowel:')) continue;
    const name = skill.slice(6);
    if (Object.hasOwn(skillVowels, name)) required.add(skillVowels[name]);
  }
  for (const point of (item.text || '').replaceAll('ךְ', '')) {
    if (Object.hasOwn(pointVowels, point)) required.add(pointVowels[point]);
  }
  return VOWEL_IDS.filter(id => required.has(id));
}

export function fitsVowels(item, vowels) {
  return requiredVowels(item).every(id => vowels.includes(id));
}

export function itemsForVowels(items, vowels) {
  return vowels == null || isFullSet(vowels)
    ? items.filter(item => !item.source?.beginner)
    : items.filter(item => fitsVowels(item, vowels));
}
