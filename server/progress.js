import { expectedSounds } from '../rulebook/index.js';

export const COUNTS = ['pairs', 'ok', 'wrong_letter', 'wrong_vowel', 'skipped', 'extra', 'uncertain', 'not_decoded'];

export function summaryOnly(summary) {
  return {
    ...Object.fromEntries(COUNTS.map(key => [key, summary[key] ?? 0])),
    missedSkills: [...(summary.missedSkills || [])],
  };
}

export function totalSummary(results) {
  const total = summaryOnly({});
  for (const { summary } of results) {
    for (const key of COUNTS) total[key] += summary[key] || 0;
    total.missedSkills.push(...(summary.missedSkills || []));
  }
  total.missedSkills = [...new Set(total.missedSkills)];
  return total;
}

export function cellKey(skills) {
  const letters = skills.filter(skill => skill.startsWith('letter:'));
  const vowels = skills.filter(skill => skill.startsWith('vowel:'));
  return letters.length === 1 && vowels.length === 1 ? `${letters[0]}|${vowels[0]}` : null;
}

export function recordPairs(pairs, verdicts) {
  for (const verdict of verdicts) {
    const key = cellKey(verdict.skills || []);
    if (key) pairs[key] = [...(pairs[key] || []), verdict.verdict === 'ok' ? 1 : 0].slice(-6);
  }
}

export function cellState(history = []) {
  const last = history.slice(-3);
  if (last.includes(0)) return 'shaky';
  return last.length === 3 ? 'solid' : 'untested';
}

export function itemPairs(item, preset) {
  return (item.words || item.text.split(/\s+/u)).flatMap(word => expectedSounds(word, preset).pairs);
}

export function buildMap(items, child) {
  const eligible = items.filter(item => item.level <= child.level).sort((a, b) => a.id.localeCompare(b.id));
  const skills = new Set(eligible.flatMap(item => item.skills));
  const letters = [...skills].filter(skill => skill.startsWith('letter:')).sort();
  const vowels = [...skills].filter(skill => skill.startsWith('vowel:')).sort();
  const cells = {};
  const sample = {};
  for (const letter of letters) {
    for (const vowel of vowels) {
      const key = `${letter}|${vowel}`;
      cells[key] = cellState(child.pairs[key]);
    }
  }
  for (const item of eligible) {
    for (const pair of itemPairs(item, child.preset)) {
      const key = cellKey(pair.skills);
      if (key && Object.hasOwn(cells, key) && !sample[key]) sample[key] = pair.text;
    }
  }
  return { letters, vowels, cells, sample };
}
