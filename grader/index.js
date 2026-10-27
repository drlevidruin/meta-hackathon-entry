import { expectedSounds, PRESETS, splitWords } from '../rulebook/index.js';
import { alignPairs, blameFor, sounded } from './pairs.js';
import { phonemes, substitution } from './phonemes.js';

function readingsOf(result) {
  const readings = [];
  const seen = new Set();
  function visit(reading) {
    if (seen.has(reading.word)) return;
    seen.add(reading.word);
    // A substituted Name with a prefix carries only the prefix in pairs.
    if (reading.pairs.length && !reading.substitute) readings.push(reading);
    for (const alternative of reading.readings ?? []) visit(alternative);
  }
  visit(result);
  return readings;
}

function prepare(result) {
  const readings = readingsOf(result);
  return (readings.length ? readings : [result]).map((reading) => {
    const others = Object.keys(PRESETS).filter((name) => name !== result.preset)
      .map((name) => ({ name, reading: expectedSounds(reading.word, name) }));
    return reading.pairs.map((source, index) => {
      let pair = source;
      // The requested conventional substitute is ha-shem, also under Ashkenazi
      // presets whose ordinary tzere is ey. Keep this exception in the grader.
      if (reading !== result && reading.word.replace(/[^א-ת]/gu, '').endsWith('השם')
        && source.vowel === 'tzere') {
        pair = { ...source, sounds: [...new Set([...source.sounds, ...source.consonants.map((c) => `${c}e`)])] };
      }
      const traditions = others.map(({ name, reading: other }) => {
        const counterpart = other.pairs[index];
        if (!counterpart) return { name, alternatives: [] };
        const sounds = [...counterpart.sounds];
        // Rebuilding a cleaned word loses a trailing maqaf. Preserve an already
        // flagged kamatz-katan alternative from the supplied expected result.
        if (source.flags.includes('kamatz_katan')) {
          sounds.push(...counterpart.consonants.map((c) => counterpart.furtive ? `o${c}` : `${c}o`));
        }
        return { name, alternatives: sounds.map(phonemes) };
      });
      return { pair, alternatives: pair.sounds.map(phonemes), traditions };
    });
  });
}

// Distance to any prefix of the pronunciation lattice, without enumerating
// every combination of a word's accepted vowel alternatives.
function isAttempt(tokens, readings) {
  if (!tokens.length || tokens.includes('?')) return false;
  return readings.some((models) => {
    let previous = Array.from({ length: tokens.length + 1 }, (_, index) => index);
    let best = Infinity;
    for (const model of models) {
      const ends = [];
      for (const alternative of model.alternatives) {
        let row = previous;
        for (const token of alternative) {
          const next = [row[0] + 1];
          for (let j = 1; j <= tokens.length; j += 1) {
            next[j] = Math.min(row[j] + 1, next[j - 1] + 1,
              row[j - 1] + substitution(tokens[j - 1], token));
          }
          row = next;
          best = Math.min(best, row[tokens.length]);
        }
        ends.push(row);
      }
      previous = previous.map((_, j) => Math.min(...ends.map((row) => row[j])));
    }
    return best / tokens.length <= 0.5;
  });
}

function better(candidate, current) {
  if (!current) return true;
  if (Math.abs(candidate.cost - current.cost) > 1e-9) return candidate.cost < current.cost;
  if (candidate.ok !== current.ok) return candidate.ok > current.ok;
  if (candidate.matched !== current.matched) return candidate.matched > current.matched;
  return candidate.extras < current.extras;
}

function skippedWord(result, models) {
  const pairs = models.map(({ pair }) => ({
    text: pair.text, verdict: sounded(pair) ? 'skipped' : 'ok', heard: '',
    expected: [...pair.sounds], skills: [...pair.skills],
    blame: blameFor(sounded(pair) ? 'skipped' : 'ok', pair.skills),
  }));
  return {
    word: { text: result.word, verdict: 'skipped', pairs },
    entries: pairs.map((pair, index) => ({ pair: index, ...pair })), models,
  };
}

function matchedWord(result, alignment) {
  const pairs = alignment.pairs.map((pair) => ({ ...pair }));
  // An unknown syllable is not evidence that the child failed to decode.
  const known = alignment.models.filter(({ pair }, index) => sounded(pair)
    && pairs[index].verdict !== 'uncertain').length;
  // A fully recognizable tradition reading still gets its specific teaching
  // verdicts, even when fewer than 40 percent match the child's own preset.
  const traditionReading = pairs.every((pair) => pair.verdict === 'ok'
    || pair.verdict === 'uncertain' || pair.otherTradition);
  const notDecoded = !traditionReading && known > 0 && alignment.ok / known < 0.4;
  if (notDecoded) {
    for (const [index, pair] of pairs.entries()) {
      if (sounded(alignment.models[index].pair) && pair.verdict !== 'uncertain') {
        pair.verdict = 'not_decoded';
        pair.blame = [];
      }
    }
  }
  const entries = alignment.entries.map((entry) => entry.verdict === 'extra' ? { ...entry }
    : { pair: entry.pair, ...pairs[entry.pair] });
  return {
    word: { text: result.word, verdict: notDecoded ? 'not_decoded' : null, pairs },
    entries, models: alignment.models,
  };
}

function collect(actions) {
  const words = [];
  const verdicts = [];
  const summary = {
    pairs: 0, ok: 0, wrong_letter: 0, wrong_vowel: 0, skipped: 0,
    extra: 0, uncertain: 0, not_decoded: 0, missedSkills: [],
  };
  const missed = new Set();
  for (const action of actions) {
    if (action.type === 'restart') continue;
    const word = words.length;
    if (action.type === 'extra') {
      words.push({ text: action.text, verdict: 'extra', pairs: [] });
      verdicts.push({ word, pair: -1, text: action.text, verdict: 'extra',
        heard: action.heard, expected: [], skills: [], blame: [] });
      summary.extra += 1;
      continue;
    }
    const entry = action.result;
    words.push(entry.word);
    summary.pairs += entry.models.filter(({ pair }) => sounded(pair)).length;
    for (const verdict of entry.entries) {
      verdicts.push({ word, ...verdict });
      if (verdict.verdict === 'extra' || sounded(entry.models[verdict.pair].pair)) {
        summary[verdict.verdict] += 1;
      }
      for (const skill of verdict.blame) missed.add(skill);
    }
  }
  summary.missedSkills = [...missed].sort();
  return { words, verdicts, summary };
}

/** Align ear words to expectedSounds results. Neither input is modified. */
export function align(heard, expected, options = {}) {
  if (!Array.isArray(heard) || !Array.isArray(expected)) {
    throw new TypeError('heard and expected must be arrays of words.');
  }
  const heardTokens = heard.map((word) => {
    if (!Array.isArray(word) || !word.length || word.some((syllable) => typeof syllable !== 'string' || !syllable)) {
      throw new TypeError('Each heard word must contain sound alphabet syllables.');
    }
    return word.flatMap(phonemes);
  });
  const prepared = expected.map(prepare);
  const attempts = prepared.map(readings => heardTokens.map((_, start) =>
    [1, 2, 3].map(count => start + count <= heard.length
      && isAttempt(heardTokens.slice(start, start + count).flat(), readings))));
  const cache = new Map();
  function match(i, j, count) {
    const key = `${i}:${j}:${count}`;
    if (!cache.has(key)) {
      const tokens = heardTokens.slice(i, i + count).flat();
      let best;
      for (const models of prepared[j]) {
        const candidate = alignPairs(tokens, models, options);
        if (!best || candidate.cost < best.cost
          || (candidate.cost === best.cost && candidate.ok > best.ok)) best = candidate;
      }
      cache.set(key, best);
    }
    return cache.get(key);
  }

  const table = Array.from({ length: heard.length + 1 }, () => Array(expected.length + 1));
  table[0][0] = { cost: 0, ok: 0, matched: 0, extras: 0 };
  function update(i, j, previous, action, cost, ok = 0, matched = 0, extras = 0) {
    const candidate = {
      cost: previous.cost + cost, ok: previous.ok + ok,
      matched: previous.matched + matched, extras: previous.extras + extras,
      previous, action,
    };
    if (better(candidate, table[i][j])) table[i][j] = candidate;
  }

  for (let i = 0; i <= heard.length; i += 1) {
    for (let j = 0; j <= expected.length; j += 1) {
      const cell = table[i][j];
      if (!cell) continue;
      if (i < heard.length) {
        update(i + 1, j, cell, {
          type: 'extra', text: heard[i].join('-'), heard: heardTokens[i].join(''),
        }, heardTokens[i].length, 0, 0, 1);
      }
      if (j === expected.length) continue;
      const readings = prepared[j];
      const skipCost = Math.min(...readings.map((models) => models.reduce((sum, model) => (
        sum + Math.min(...model.alternatives.map((tokens) => tokens.length))
      ), 0)));
      update(i, j + 1, cell, { type: 'word', result: skippedWord(expected[j], readings[0] ?? []) }, skipCost);
      if (i === heard.length) continue;
      let restarted = false;
      let continuesText = false;
      for (let count = 1; count <= 3 && i + count < heard.length; count += 1) {
        const later = attempts[j][i + count];
        if (attempts[j][i][count - 1] && later.some(Boolean)) {
          restarted = true;
          continuesText ||= later.some((attempt, span) => attempt && attempts[j + 1]?.[i + count][span]);
          update(i + count, j, cell, { type: 'restart' }, 0.05);
        }
      }
      // A detected restart must grade the final attempt, even if it is shorter.
      // A later attempt that can begin the next printed word may instead be a
      // separate read, including when the printed word repeats.
      if (restarted && !continuesText) continue;
      for (let count = 1; count <= 3 && i + count <= heard.length; count += 1) {
        const alignment = match(i, j, count);
        if (!alignment) continue;
        update(i + count, j + 1, cell, { type: 'word', result: matchedWord(expected[j], alignment) },
          alignment.cost + 0.1 * (count - 1), alignment.ok, 1);
      }
    }
  }

  const actions = [];
  for (let cell = table[heard.length][expected.length]; cell.previous; cell = cell.previous) {
    actions.push(cell.action);
  }
  return collect(actions.reverse());
}

/** Split a printed line and apply the child's pronunciation preset. */
export function gradeLine({ heard, text, preset }, options = {}) {
  if (!Object.hasOwn(PRESETS, preset)) throw new RangeError(`Unknown preset: ${preset}`);
  const expected = splitWords(text).map(({ word, maqaf }) => expectedSounds(word + (maqaf ? '־' : ''), preset));
  return align(heard, expected, options);
}
