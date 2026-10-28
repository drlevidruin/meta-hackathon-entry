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
function isAttempt(tokens, readings, complete = false) {
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
          if (!complete) best = Math.min(best, row[tokens.length]);
        }
        ends.push(row);
      }
      previous = previous.map((_, j) => Math.min(...ends.map((row) => row[j])));
    }
    return (complete ? previous[tokens.length] : best) / tokens.length <= 0.5;
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
  const notDecoded = !traditionReading && known >= 2 && alignment.ok / known < 0.4;
  if (notDecoded) {
    for (const [index, pair] of pairs.entries()) {
      if (sounded(alignment.models[index].pair) && pair.verdict !== 'uncertain') {
        pair.verdict = 'not_decoded';
        pair.blame = blameFor('not_decoded', pair.skills);
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
  const heardSyllables = [];
  const heardTokens = heard.map((word, wordIndex) => {
    if (!Array.isArray(word) || !word.length || word.some((syllable) => typeof syllable !== 'string' || !syllable)) {
      throw new TypeError('Each heard word must contain sound alphabet syllables.');
    }
    const syllables = [];
    const tokens = word.flatMap((syllable, index) => {
      const tokens = phonemes(syllable);
      syllables.push(...tokens.map(() => `${wordIndex}:${index}`));
      return tokens;
    });
    heardSyllables.push(syllables);
    return tokens;
  });
  const prepared = expected.map(prepare);
  const attempts = prepared.map(readings => heardTokens.map((_, start) =>
    [1, 2, 3].map(count => start + count <= heard.length
      && isAttempt(heardTokens.slice(start, start + count).flat(), readings))));
  const completeAttempts = prepared.map(readings => heardTokens.map((_, start) =>
    [1, 2, 3].map(count => start + count <= heard.length
      && isAttempt(heardTokens.slice(start, start + count).flat(), readings, true))));
  const wordLengths = prepared.map(readings => Math.max(...readings.map(models =>
    models.reduce((sum, model) => sum + Math.max(...model.alternatives.map(tokens => tokens.length)), 0))));
  const lineCache = new Map();
  function lineAttempts(i, j) {
    const key = `${i}:${j}`;
    if (lineCache.has(key)) return lineCache.get(key);
    const spans = [];
    let positions = new Set([i]);
    for (let word = j; word < expected.length && positions.size; word++) {
      const next = new Set();
      for (const start of positions) {
        for (let count = 1; count <= 3 && start + count <= heard.length; count++) {
          const end = start + count;
          // A cut-short word cannot contain more sounds than the full word.
          // This keeps unrelated neighboring words out of an attempt span.
          if (heardTokens.slice(start, end).reduce((sum, tokens) => sum + tokens.length, 0) > wordLengths[word]) continue;
          // Every earlier word must be a complete attempt. Only the last
          // printed word in the abandoned span may be cut short.
          if (word > j && attempts[word][start][count - 1]) {
            spans.push({ end, words: word - j + 1 });
          }
          if (completeAttempts[word][start][count - 1]) next.add(end);
        }
      }
      positions = next;
    }
    lineCache.set(key, spans);
    return spans;
  }
  // After a repeat, the reader goes on to the skipped word when the next heard
  // word fits it better than the word that would follow the repeat.
  function goesOn(start, skipped) {
    for (let count = 1; count <= 3 && start + count <= heard.length; count += 1) {
      if (!attempts[skipped]?.[start]?.[count - 1]) continue;
      if (skipped + 2 >= expected.length) return true;
      if (match(start, skipped, count).cost < match(start, skipped + 2, count).cost) return true;
    }
    return false;
  }
  const cache = new Map();
  function match(i, j, count) {
    const key = `${i}:${j}:${count}`;
    if (!cache.has(key)) {
      const tokens = heardTokens.slice(i, i + count).flat();
      const syllables = heardSyllables.slice(i, i + count).flat();
      let best;
      for (const models of prepared[j]) {
        const candidate = alignPairs(tokens, models, options, syllables);
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
      const spans = lineAttempts(i, j);
      let lineRestarted = false;
      let lineContinuesText = false;
      for (const span of spans) {
        const later = attempts[j][span.end];
        if (!later?.some(Boolean)) continue;
        lineRestarted = true;
        lineContinuesText ||= later.some((attempt, count) => attempt
          && (attempts[j + span.words]?.[span.end]?.[count]
            || attempts[j + span.words + 1]?.[span.end]?.[count]));
        update(span.end, j, cell, { type: 'restart' }, 0.05 * span.words);
      }
      // A repeated span may follow one skipped printed word.
      if (lineRestarted && !lineContinuesText) continue;
      let restarted = false;
      // A span that already follows multiple printed words must remain
      // available as separate matches, including repeated printed phrases.
      let continuesText = spans.length > 0;
      for (let count = 1; count <= 3 && i + count < heard.length; count += 1) {
        // A try spread over several heard words cannot hold more sounds than the word.
        const fits = (start, words) => words === 1
          || heardTokens.slice(start, start + words).reduce((sum, tokens) => sum + tokens.length, 0) <= wordLengths[j];
        const later = attempts[j][i + count].map((attempt, span) => attempt && fits(i + count, span + 1));
        if (attempts[j][i][count - 1] && fits(i, count) && later.some(Boolean)) {
          restarted = true;
          continuesText ||= later.some((attempt, span) => attempt
            && (attempts[j + 1]?.[i + count][span]
              || (attempts[j + 2]?.[i + count][span]
                && !goesOn(i + count + span + 1, j + 1)
                && match(i + count, j + 2, span + 1).cost <= match(i + count, j, span + 1).cost)));
          update(i + count, j, cell, { type: 'restart' }, 0.05);
        }
      }
      // A detected restart must grade the final attempt, even if it is shorter.
      // A later attempt that can begin the next printed word, or the word after
      // one skipped word, may instead be a separate read of repeated text.
      // The skipped-word alternative must fit at least as well as a reread,
      // and the following heard word must not begin the skipped word.
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
