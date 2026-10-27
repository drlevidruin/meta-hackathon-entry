import { SKILLS } from '../rulebook/index.js';
import { cellKey, cellState, itemPairs } from './progress.js';

const brief = ({ id, text, level }) => ({ id, text, level });
const byId = (a, b) => a.id.localeCompare(b.id);

export function makePacket({ items, child, skill, level }) {
  const regular = items.filter(item => !item.source?.challenge && item.level <= level);
  const nearest = (a, b) => b.level - a.level || byId(a, b);
  const teaches = item => item.focus === skill || item.skills.includes(skill);
  const allRegular = items.filter(item => !item.source?.challenge);
  const byDistance = (a, b) => Math.abs(a.level - level) - Math.abs(b.level - level) || byId(a, b);
  const targeted = [
    ...regular.filter(item => item.focus === skill).sort(nearest),
    ...regular.filter(item => item.focus !== skill && item.skills.includes(skill)).sort(nearest),
    ...allRegular.filter(item => item.level > level && teaches(item)).sort(byDistance),
  ];
  const practice = (targeted.length ? targeted : allRegular.sort(byDistance)).slice(0, 6);
  const hasSolid = child && Object.values(child.pairs).some(history => cellState(history) === 'solid');
  let warm = [];
  if (hasSolid) {
    warm = regular.filter(item => {
      const pairs = itemPairs(item, child.preset);
      return pairs.length > 0 && pairs.every(pair => {
        const key = cellKey(pair.skills);
        return key && cellState(child.pairs[key]) === 'solid';
      });
    }).sort(nearest).slice(0, 2);
  } else {
    warm = regular.filter(item => item.level === 1).sort(byId).slice(0, 2);
  }
  if (!warm.length) warm = [...allRegular].sort((a, b) => a.level - b.level || byId(a, b)).slice(0, 2);
  const challenges = items.filter(item => item.source?.challenge);
  // A supplied challenge can sit above the child's level. Prefer the target
  // skill and the nearest level, then use the stable bank id as a tie breaker.
  challenges.sort((a, b) => Number(b.focus === skill) - Number(a.focus === skill)
    || Math.abs(a.level - level) - Math.abs(b.level - level) || byId(a, b));
  return {
    title: child ? `Practice for ${child.name}` : `Practice: ${SKILLS[skill] || skill}`,
    sections: [
      { heading: 'Warm up', items: warm.map(brief) },
      { heading: 'Practice', items: practice.map(brief) },
      { heading: 'Challenge', items: challenges.slice(0, 1).map(brief) },
    ],
  };
}
