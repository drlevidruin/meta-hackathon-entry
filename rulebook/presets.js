const common = {
  patach: ['a'], chataf_patach: ['a'], kamatz_katan: ['o'], chataf_kamatz: ['o'],
  segol: ['e'], chataf_segol: ['e'], chirik: ['i'], kubutz: ['u'], shuruk: ['u'],
  sheva_na: ['e'], sheva_nach: [''], sheva: ['e', ''], none: [''],
};

export const PRESETS = Object.fromEntries(Object.entries({
  sephardi: { kamatz: ['a'], tzere: ['e', 'ey'], cholam: ['o'] },
  ashkenazi: { kamatz: ['o'], tzere: ['ey'], cholam: ['o', 'oy', 'ey'] },
  chassidish: { kamatz: ['o', 'u'], tzere: ['ey'], cholam: ['o', 'oy', 'ey'] },
}).map(([name, vowels]) => [name, Object.freeze(Object.fromEntries(
  Object.entries({ ...common, ...vowels }).map(([vowel, sounds]) => [vowel, Object.freeze([...sounds])]),
))]));
Object.freeze(PRESETS);

export const VOWEL_MARKS = {
  '\u05b0': 'sheva', '\u05b1': 'chataf_segol', '\u05b2': 'chataf_patach',
  '\u05b3': 'chataf_kamatz', '\u05b4': 'chirik', '\u05b5': 'tzere',
  '\u05b6': 'segol', '\u05b7': 'patach', '\u05b8': 'kamatz',
  '\u05b9': 'cholam', '\u05ba': 'cholam', '\u05bb': 'kubutz', '\u05c7': 'kamatz_katan',
};

export function markedVowel(group) {
  return [...group.marks].map((mark) => VOWEL_MARKS[mark]).find(Boolean) ?? 'none';
}
