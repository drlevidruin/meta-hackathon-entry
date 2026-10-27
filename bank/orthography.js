import { letterGroups } from '../rulebook/cleanup.js';
import { markedVowel } from '../rulebook/presets.js';

const finals = 'ךםןףץ';
const isShuruk = group => group.letter === 'ו' && group.marks.includes('ּ') && group.vowel === 'none';

// These are teaching-bank restrictions, not rules for analyzing siddur words.
export function legalGeneratedWord(word, level, focus = null) {
  const groups = letterGroups(word).map(group => ({ ...group, vowel: markedVowel(group) }));
  return groups.length > 0 && groups.every((group, index) => {
    const { letter, marks, vowel } = group;
    const last = index === groups.length - 1;
    const dot = marks.includes('ּ');
    const carrier = isShuruk(group) || (letter === 'ו' && vowel === 'cholam' && !dot);
    const closingKaf = last && letter === 'ך' && vowel === 'sheva';
    if (finals.includes(letter) && (!last || (vowel !== 'none'
      && !(letter === 'ך' && ['sheva', 'kamatz'].includes(vowel))))) return false;
    if (letter === 'ך' && !['sheva', 'kamatz'].includes(vowel)) return false;
    if (last && groups.length > 1
      && (vowel === 'kubutz' || (vowel === 'cholam' && letter !== 'ו'))) return false;
    if (last && ('כמנפצה'.includes(letter) || (vowel === 'none' && 'אע'.includes(letter)))) return false;
    if (letter === 'א' && index !== 0) return false;
    if ('אהחער'.includes(letter) && (dot || vowel === 'sheva')) return false;
    if (vowel.startsWith('chataf') || vowel === 'kamatz_katan') return false;
    if (last && vowel === 'patach' && 'חע'.includes(letter)) return false;
    if (letter === 'ו') {
      if (carrier) {
        if (index === 0 || groups[index - 1].vowel !== 'none' || isShuruk(groups[index - 1])) return false;
      } else if (dot || !['patach', 'kamatz', 'segol', 'tzere', 'chirik'].includes(vowel)) return false;
    }
    if (!carrier) {
      if (level < 4 && dot && !'בכפת'.includes(letter)) return false;
      if (level === 4) {
        const kal = !last && 'בכפת'.includes(letter)
          && (index === 0 || groups[index - 1].vowel === 'sheva');
        if (dot !== kal) return false;
      }
    }
    if (level === 4 && vowel === 'sheva' && !closingKaf
      && (focus !== 'pattern:closed_syllable' || index === 0 || last)) return false;
    return true;
  });
}
