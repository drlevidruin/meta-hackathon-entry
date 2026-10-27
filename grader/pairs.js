import { distance, equal, isVowel, phonemes } from './phonemes.js';

export const sounded = (pair) => pair.sounds.some(Boolean);

function consonantMatches(tokens, pair) {
  return pair.consonants.some((sound) => {
    const consonants = phonemes(sound);
    const heard = pair.furtive ? tokens.slice(tokens.length - consonants.length)
      : tokens.slice(0, consonants.length);
    if (!equal(heard, consonants)) return false;
    const remainder = pair.furtive ? tokens.slice(0, tokens.length - consonants.length)
      : tokens.slice(consonants.length);
    // A trailing y belongs to a diphthong here, including a missing tzere glide.
    return remainder.every((token) => isVowel(token) || token === 'y');
  });
}

function verdictFor(tokens, model, options) {
  const pair = model.pair;
  let verdict;
  if (tokens.includes('?')) verdict = 'uncertain';
  else if (model.alternatives.some((alternative) => equal(tokens, alternative))) verdict = 'ok';
  else if (!tokens.length && sounded(pair)) verdict = 'skipped';
  else verdict = consonantMatches(tokens, pair) ? 'wrong_vowel' : 'wrong_letter';

  const result = {
    text: pair.text, verdict, heard: tokens.join(''), expected: [...pair.sounds],
    skills: [...pair.skills],
  };
  if (verdict === 'wrong_letter' || verdict === 'wrong_vowel') {
    const tradition = model.traditions.find(({ alternatives }) => (
      alternatives.some((alternative) => equal(tokens, alternative))
    ));
    if (tradition) {
      result.otherTradition = tradition.name;
      if (options.acceptOtherTraditions) result.verdict = 'ok';
    }
  }
  return result;
}

function better(candidate, current) {
  if (!current) return true;
  if (Math.abs(candidate.cost - current.cost) > 1e-9) return candidate.cost < current.cost;
  if (candidate.ok !== current.ok) return candidate.ok > current.ok;
  return candidate.extras < current.extras;
}

// Each cell is a prefix of the expected pairs and a prefix of the heard tokens.
// Edges either assign a token span to one pair or insert an extra token.
export function alignPairs(tokens, models, options) {
  const table = Array.from({ length: models.length + 1 }, () => Array(tokens.length + 1));
  table[0][0] = { cost: 0, ok: 0, extras: 0 };
  const update = (i, j, previous, actions, cost, ok = 0, extras = 0) => {
    const candidate = {
      cost: previous.cost + cost, ok: previous.ok + ok,
      extras: previous.extras + extras, previous, actions,
    };
    if (better(candidate, table[i][j])) table[i][j] = candidate;
  };

  for (let i = 0; i <= models.length; i += 1) {
    for (let j = 0; j <= tokens.length; j += 1) {
      const cell = table[i][j];
      if (!cell) continue;
      if (j < tokens.length) {
        update(i, j + 1, cell, [{ extra: tokens[j], after: i - 1 }], 1, 0, 1);
      }
      if (i === models.length) continue;
      const model = models[i];
      const alternatives = options.acceptOtherTraditions
        ? [...model.alternatives, ...model.traditions.flatMap((entry) => entry.alternatives)]
        : model.alternatives;
      for (let end = j; end <= tokens.length; end += 1) {
        const consumed = tokens.slice(j, end);
        const result = verdictFor(consumed, model, options);
        const cost = Math.min(...alternatives.map((alternative) => distance(consumed, alternative)));
        update(i + 1, end, cell, [{ pair: i, result }], cost,
          Number(result.verdict === 'ok' && sounded(model.pair)));
      }

      // The ear's '?' denotes an unclear syllable, which can cover several pairs.
      if (tokens[j] === '?') {
        const actions = [];
        let count = 0;
        for (let end = i; end < models.length; end += 1) {
          const hasSound = sounded(models[end].pair);
          count += Number(hasSound);
          actions.push({ pair: end, result: verdictFor(hasSound ? ['?'] : [], models[end], options) });
          if (count) update(end + 1, j + 1, cell, [...actions], 0.5 + count * 0.05);
        }
      }
    }
  }

  const last = table[models.length][tokens.length];
  const chunks = [];
  for (let cell = last; cell.previous; cell = cell.previous) chunks.push(cell.actions);
  const actions = chunks.reverse().flat();
  const pairs = [];
  const entries = [];
  for (const action of actions) {
    if (action.result) {
      pairs.push(action.result);
      entries.push({ pair: action.pair, ...action.result });
    } else {
      const previous = entries.at(-1);
      if (previous?.verdict === 'extra' && previous.pair === action.after) {
        previous.heard += action.extra;
      } else {
        entries.push({
          pair: action.after, text: '', verdict: 'extra', heard: action.extra,
          expected: [], skills: [],
        });
      }
    }
  }
  return { cost: last.cost, ok: last.ok, pairs, entries, models };
}
