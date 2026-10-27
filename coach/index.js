import { SKILLS } from '../rulebook/skills.js';
import { modelPick } from './model.js';

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const clamp = level => Math.max(1, Math.min(6, Math.trunc(level) || 1));
const misses = skill => skill.recent.reduce((sum, mark) => sum + mark, 0);
const challenge = item => item.level === 4 && item.source?.challenge === true;

/** cleanAtLevel stores the last checkpoint's cleanliness and up to three held
 * checkpoints' skills. Keeping this in the profile makes JSON round trips safe. */
export function startProfile({ level = 1 } = {}) {
  return {
    version: 1, level: clamp(level), checkpoints: 0,
    cleanAtLevel: { clean: false, held: [] },
    skills: {}, proven: [], seen: [],
  };
}

/** Keep learning history while starting the checkpoint and hold counts afresh. */
export function startTurn(profile) {
  const next = structuredClone(profile);
  next.checkpoints = 0;
  next.cleanAtLevel = { clean: false, held: [] };
  return next;
}

function cleanLine({ summary }) {
  return summary.pairs > 0 && summary.ok === summary.pairs &&
    ['wrong_letter', 'wrong_vowel', 'skipped', 'extra', 'uncertain', 'not_decoded']
      .every(key => !summary[key]);
}

export function updateProfile(profile, results, items) {
  const next = structuredClone(profile);
  if (!results.length) return next;
  const byId = new Map(items.map(item => [item.id, item]));
  const practiced = new Set();
  const proven = new Set(next.proven);
  let atLevel = false;
  let allClean = true;
  for (const result of results) {
    const item = byId.get(result.itemId);
    if (!item) throw new RangeError('Unknown result item.');
    const clean = cleanLine(result);
    allClean &&= clean;
    atLevel ||= item.level === profile.level;
    const missed = new Set(result.summary.missedSkills || []);
    const cleanSkills = new Set();
    const uncredited = new Set();
    for (const verdict of result.verdicts || []) {
      for (const skill of verdict.blame || []) missed.add(skill);
      for (const skill of verdict.skills || []) {
        (verdict.verdict === 'ok' ? cleanSkills : uncredited).add(skill);
      }
    }
    if (!clean && !missed.size && !cleanSkills.size && !uncredited.size) {
      const failure = ['wrong_letter', 'wrong_vowel', 'skipped', 'not_decoded']
        .some(key => result.summary[key] > 0);
      if (failure) {
        // A genuine failure without pair attribution conservatively misses all.
        for (const skill of item.skills) missed.add(skill);
      } else if (!result.summary.pairs || result.summary.ok !== result.summary.pairs) {
        // Uncertainty supplies no miss evidence or attributable clean evidence.
        for (const skill of item.skills) uncredited.add(skill);
      }
    }
    for (const skill of new Set(item.skills)) {
      if (!missed.has(skill) && uncredited.has(skill) && !cleanSkills.has(skill)) continue;
      practiced.add(skill);
      const previous = next.skills[skill] || { tries: 0, misses: 0, recent: [] };
      const mark = clean ? 0 : Number(missed.has(skill));
      next.skills[skill] = {
        ...previous,
        tries: previous.tries + 1,
        misses: previous.misses + mark,
        recent: [...previous.recent, mark].slice(-6),
      };
    }
    if (clean && item.level === 4 && item.focus) proven.add(item.focus);
    if (clean && challenge(item)) {
      for (const skill of item.skills) {
        if (/^(vowel|pattern):/.test(skill)) proven.add(skill);
      }
    }
    next.seen.push(item.id);
  }
  next.seen = next.seen.slice(-40);
  next.proven = [...proven].sort(compare);
  next.checkpoints += 1;
  // Provisional hold: chooseNextSet clears it if the chosen set changes level.
  next.cleanAtLevel = {
    clean: atLevel && allClean,
    held: atLevel ? [...next.cleanAtLevel.held, [...practiced].sort(compare)].slice(-3)
      : next.cleanAtLevel.held,
  };
  return next;
}

function weakSkills(profile) {
  return Object.keys(profile.skills).sort((a, b) =>
    misses(profile.skills[b]) - misses(profile.skills[a]) || compare(a, b));
}

export function turnFacts(profile) {
  const clean = Object.keys(profile.skills).filter(skill =>
    profile.skills[skill].tries > profile.skills[skill].misses);
  clean.sort((a, b) =>
    (profile.skills[b].tries - profile.skills[b].misses) -
    (profile.skills[a].tries - profile.skills[a].misses) || compare(a, b));
  return {
    best: clean[0] || null,
    next: weakSkills(profile).find(skill => misses(profile.skills[skill]) > 0) || null,
    proven: [...profile.proven].sort(compare),
  };
}

function availableLevels(items) {
  const levels = [...new Set(items.filter(item => !item.source?.challenge).map(item => item.level))]
    .sort((a, b) => a - b);
  if (!levels.length) throw new RangeError('No regular items.');
  return levels;
}

function snapLevel(level, levels) {
  return levels.includes(level) ? level : levels.findLast(value => value < level) ?? levels[0];
}

function rulePlan(profile, levels) {
  const weak = weakSkills(profile);
  const current = snapLevel(profile.level, levels);
  if (!profile.checkpoints) {
    return { level: current, target: weak[0] || null, why: 'start', misses: 0 };
  }
  if (profile.cleanAtLevel.clean) {
    return { level: levels.find(level => level > current) ?? current, target: weak[0] || null, why: 'clean', misses: 0 };
  }
  const twice = weak.find(skill => {
    const record = profile.skills[skill];
    const recent = record.recent;
    return record.tries - (record.demotedAt || 0) >= 2
      && recent.length >= 2 && recent.at(-1) === 1 && recent.at(-2) === 1;
  });
  return twice
    ? { level: levels.findLast(level => level < current) ?? current, target: twice, why: 'missed_twice', misses: 2 }
    : { level: current, target: weak[0] || null, why: 'mixed', misses: 0 };
}

function rankedItems(profile, items, level, target) {
  const seen = new Set(profile.seen);
  const weak = weakSkills(profile).filter(skill => misses(profile.skills[skill]) > 0);
  const weakness = item => {
    const rank = weak.findIndex(skill => item.skills.includes(skill));
    return rank < 0 ? weak.length : rank;
  };
  return items.filter(item => item.level === level && !item.source?.challenge)
    .sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)) ||
      Number(b.focus === target) - Number(a.focus === target) ||
      weakness(a) - weakness(b) || compare(a.id, b.id));
}

function challengeItem(profile, items, level) {
  if (level === 4 || !profile.checkpoints || profile.checkpoints % 2) return null;
  let eligible = items.filter(item => challenge(item) && item.skills.every(skill => {
    const record = profile.skills[skill];
    return record && record.tries > record.misses;
  }));
  const unseen = eligible.filter(item => !profile.seen.includes(item.id));
  if (unseen.length) eligible = unseen;
  eligible.sort((a, b) => Number(profile.proven.includes(a.focus)) -
    Number(profile.proven.includes(b.focus)) || a.skills.length - b.skills.length || compare(a.id, b.id));
  return eligible[0] || null;
}

function ruleReason(profile, plan) {
  if (plan.why === 'start') return `Start at level ${plan.level}.`;
  if (plan.why === 'clean') return `Every line was clean; choose level ${plan.level}.`;
  if (plan.why === 'missed_twice') {
    const target = Object.hasOwn(SKILLS, plan.target) ? plan.target : 'the focus skill';
    return `Two latest reads missed ${target}; target it at level ${plan.level}.`;
  }
  return `Mixed checkpoint; hold level ${plan.level} and revisit the weakest skills.`;
}

export function ruleNextSet(profile, items) {
  const plan = rulePlan(profile, availableLevels(items));
  const regular = rankedItems(profile, items, plan.level, plan.target)
    .slice(0, plan.level >= 5 ? 2 : 3);
  const extra = challengeItem(profile, items, plan.level);
  return {
    itemIds: [...regular, ...(extra ? [extra] : [])].map(item => item.id),
    level: plan.level,
    reason: ruleReason(profile, plan),
  };
}

function candidatesFor(profile, items, rule) {
  const available = availableLevels(items);
  const current = available.indexOf(snapLevel(profile.level, available));
  const levels = available.slice(Math.max(0, current - 1), current + 2);
  const target = rulePlan(profile, available).target;
  const queues = levels.map(level => {
    const ranked = rankedItems(profile, items, level, target);
    const unseen = ranked.filter(item => !profile.seen.includes(item.id));
    return unseen.length >= 2 ? unseen : ranked;
  });
  const candidates = items.filter(item => rule.itemIds.includes(item.id) && !item.source?.challenge);
  const included = new Set(candidates.map(item => item.id));
  while (candidates.length < 30 && queues.some(queue => queue.length)) {
    for (const queue of queues) {
      const item = queue.shift();
      if (item && !included.has(item.id)) {
        candidates.push(item);
        included.add(item.id);
        if (candidates.length === 30) break;
      }
    }
  }
  return { levels, candidates };
}

function heldLongEnough(profile) {
  const held = profile.cleanAtLevel.held;
  return held.length === 3 && held.flat().length > 0 &&
    held.flat().every(skill => profile.skills[skill].tries >= 3);
}

function decisionFor(profile, picked, items, plan) {
  const first = items.find(item => item.id === picked.itemIds[0]);
  const current = snapLevel(profile.level, availableLevels(items));
  const move = picked.level > current ? 'up' : picked.level < current ? 'down'
    : profile.checkpoints ? 'stay' : 'start';
  return {
    move, from: current, level: picked.level, target: plan.target,
    focus: first?.focus || null,
    recentMisses: plan.target && profile.skills[plan.target] ? misses(profile.skills[plan.target]) : 0,
    why: move === 'start' ? 'start'
      : picked.level === plan.level && plan.why !== 'start' ? plan.why : 'mixed',
    misses: move === 'down' && plan.why === 'missed_twice' ? plan.misses : 0,
    challengeId: picked.itemIds.find(id => challenge(items.find(item => item.id === id))) || null,
  };
}

function stopped(profile, reason) {
  return {
    itemIds: [], level: profile.level, profile, done: true, reason, source: 'rule',
    decision: {
      move: 'stay', from: profile.level, level: profile.level, target: null, focus: null, recentMisses: 0,
      why: 'mixed', misses: 0, challengeId: null,
    },
  };
}

export async function chooseNextSet(profile, results, items, options = {}) {
  const levelsAvailable = availableLevels(items);
  const updated = updateProfile(profile, results, items);
  if (results.length && options.elapsedMs >= 240_000) return stopped(updated, 'Turn ended after four minutes.');
  if (results.length && updated.checkpoints >= 8) return stopped(updated, 'Turn ended after eight checkpoints.');
  const rule = ruleNextSet(updated, items);
  const plan = rulePlan(updated, levelsAvailable);
  const { levels, candidates } = candidatesFor(updated, items, rule);
  let picked = rule;
  let source = 'rule';
  if (options.useModel !== false && process.env.META_API_KEY?.trim()) {
    const model = await modelPick(updated, results, rule, levels, candidates, options.fetch);
    if (model) {
      // Even a valid model answer must exhaust unseen items before repeating.
      const regular = items.filter(item => item.level === model.level && !item.source?.challenge);
      const unseen = regular.filter(item => !updated.seen.includes(item.id));
      const repeats = model.itemIds.some(id => updated.seen.includes(id));
      if (!repeats || unseen.every(item => model.itemIds.includes(item.id))) {
        const extra = challengeItem(updated, items, model.level);
        picked = { ...model, itemIds: [...model.itemIds, ...(extra ? [extra.id] : [])] };
        source = 'model';
      }
    }
  }
  const decision = decisionFor(updated, picked, items, plan);
  if (decision.move === 'down') {
    // Consume all evidence available at this demotion without erasing misses
    // used for practice targeting and end-of-turn facts.
    for (const record of Object.values(updated.skills)) record.demotedAt = record.tries;
  }
  updated.level = picked.level;
  if (decision.move === 'up' || decision.move === 'down') {
    updated.cleanAtLevel = { clean: false, held: [] };
  }
  if (results.length && heldLongEnough(updated)) return stopped(updated, 'Turn ended after three held checkpoints with practiced skills.');
  return { ...picked, profile: updated, decision, done: false, source };
}

const levelNames = ['', 'letters with vowels', 'syllables', 'words', 'nonsense words', 'phrases', 'fluency lines'];
function skillName(skill) {
  if (!Object.hasOwn(SKILLS, skill)) return 'focus skill';
  const kind = skill.split(':')[0];
  return `${kind} ${SKILLS[skill].toLowerCase()}`;
}

/** Only structured facts reach this template, never the model's reason. */
export function explain(decision) {
  const focus = decision.target && decision.recentMisses > 0
    ? `the ${skillName(decision.target)}` : null;
  if (decision.move === 'start') {
    const startFocus = decision.focus ? `the ${skillName(decision.focus)}` : null;
    return `Started at level ${decision.level}${startFocus ? ` with a focus on ${startFocus}` : ''}.`;
  }
  if (decision.move === 'up') {
    return decision.why === 'clean'
      ? `Clean set at level ${decision.from}; moved up to ${levelNames[decision.level]}.`
      : `Moved up to ${levelNames[decision.level]}${focus ? ` to practice ${focus}` : ''}.`;
  }
  if (decision.move === 'down') {
    return decision.why === 'missed_twice'
      ? `${decision.misses} misses at level ${decision.from}; dropped to ${levelNames[decision.level]}${focus ? ` to practice ${focus}` : ''}.`
      : `Dropped to ${levelNames[decision.level]}${focus ? ` to practice ${focus}` : ''}.`;
  }
  return `Held level ${decision.level}${focus ? ` and gave ${focus} another try` : ' for more practice'}.`;
}
