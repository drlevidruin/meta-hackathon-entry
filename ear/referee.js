import { meterChoice } from './meter.js';

const vowelSymbols = 'aɑɔoɒʌæɐeɛəiɪuʊʉɵyʏøœɜɯɨɚɝ';
const vowel = new RegExp(`[${vowelSymbols}]`);
const openDiphthong = new RegExp(`^[ao][${vowelSymbols}]+$`);
const tone = new RegExp(`([${vowelSymbols}])ɜ`, 'g');
const specialTokens = new Set(['<pad>', '<s>', '</s>', '<unk>']);
const round = value => Math.round(value * 1000) / 1000;

function normalizeVowel(token) {
  return token.normalize('NFD').replace(/[1-5ː:.\u0303\u031e]/g, '')
    .replace(tone, '$1').replace(/(.+)[ɹɚ]$/, '$1');
}

export function vowelClass(token) {
  if (typeof token !== 'string' || specialTokens.has(token)) return null;
  const sound = normalizeVowel(token);
  if (/^[aæɐ]$/.test(sound)) return 'front';
  if (/^[ɑɔoɒʌ]$/.test(sound)) return 'back';
  return vowel.test(sound) ? 'other' : null;
}

export function backScore(top) {
  if (!Array.isArray(top)) return null;
  let back = 0;
  let total = 0;
  for (const [token, probability] of top) {
    const kind = vowelClass(token);
    if (kind === 'back') back += probability;
    if (kind === 'front' || kind === 'back') total += probability;
  }
  return total > 0 ? back / total : null;
}

export function nucleus(syllable) {
  return /oy|ey|ay|a|e|i|o|u/.exec(syllable)?.[0] || '';
}

export function cardCalibration(tokens, labels) {
  if (!Array.isArray(tokens) || !Array.isArray(labels)) return null;
  const vowels = tokens.filter(value => vowelClass(value?.token) !== null);
  if (vowels.length !== labels.length) return null;
  const scores = { a: [], o: [] };
  for (const [index, value] of vowels.entries()) {
    const label = labels[index];
    const kind = vowelClass(value.token);
    if ((label !== 'a' && label !== 'o') || (kind !== 'front' && kind !== 'back')) continue;
    const score = backScore(value.top);
    if (score !== null) scores[label].push(score);
  }
  if (scores.a.length < 2 || scores.o.length < 2) return null;
  const median = values => {
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return round(values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
  };
  return { version: 1, a: median(scores.a), o: median(scores.o), n: { a: scores.a.length, o: scores.o.length } };
}

export function refereeSettings(calibration) {
  const off = { on: false, line: null, low: null };
  try {
    if (!calibration || typeof calibration !== 'object' || Array.isArray(calibration) || calibration.version !== 1
      || ![calibration.a, calibration.o].every(value => Number.isFinite(value) && value >= 0 && value <= 1)
      || !calibration.n || typeof calibration.n !== 'object' || Array.isArray(calibration.n)
      || ![calibration.n.a, calibration.n.o].every(value => Number.isSafeInteger(value) && value >= 2)) return off;
    // The card must show this child's o as a back vowel and their a as a front
    // one in the phoneme model's own terms. The line sits at the model's
    // midpoint, or just above the card's a when the child's a leans back.
    const line = round(Math.max(0.5, calibration.a + 0.05));
    return { on: calibration.o >= line + 0.1, line, low: 0.15 };
  } catch {
    return off;
  }
}

const earClasses = { a: 'open', o: 'open', e: 'mid', ey: 'mid', i: 'high-front',
  u: 'high-back', oy: 'oy', ay: 'ay' };

function phonemeClass(token) {
  const sound = normalizeVowel(token);
  if (/^(oɪ|ɔɪ|ɔɨ)$/.test(sound)) return 'oy';
  if (/^(aɪ|aɨ|ɑɨ)$/.test(sound)) return 'ay';
  if (/^[aæɐɑɔoɒʌ]$/.test(sound) || openDiphthong.test(sound)) return 'open';
  if (/^(e|ɛ|ə|eɪ)$/.test(sound)) return 'mid';
  if (/^[iɪ]$/.test(sound)) return 'high-front';
  if (/^[uʊʉ]$/.test(sound)) return 'high-back';
  return null;
}

function bestPaths(choices) {
  return choices.reduce((best, choice) => {
    if (choice.score > best.score) return choice;
    if (choice.score === best.score) {
      return { ...(choice.gaps < best.gaps ? choice : best), count: best.count + choice.count };
    }
    return best;
  });
}

export function alignVowels(syllables, vowels) {
  const difference = Math.abs(syllables.length - vowels.length);
  if (difference * 3 > Math.max(syllables.length, vowels.length)) return null;
  const ears = syllables.map(({ sound }) => earClasses[sound]);
  const phones = vowels.map(({ token }) => phonemeClass(token));
  const matchScore = (i, j) => {
    const same = ears[i] === phones[j];
    const openMid = (ears[i] === 'open' && phones[j] === 'mid')
      || (ears[i] === 'mid' && phones[j] === 'open');
    return same ? 2 : openMid ? 0 : -1;
  };
  const forward = Array.from({ length: ears.length + 1 }, () => Array(phones.length + 1));
  // Counts can exceed Number's exact integer range in repeated vowel patterns.
  forward[0][0] = { score: 0, gaps: 0, count: 1n };
  for (let i = 1; i <= ears.length; i++) forward[i][0] = { score: -i, gaps: i, count: 1n, move: 'ear' };
  for (let j = 1; j <= phones.length; j++) forward[0][j] = { score: -j, gaps: j, count: 1n, move: 'phone' };
  for (let i = 1; i <= ears.length; i++) {
    for (let j = 1; j <= phones.length; j++) {
      const diagonal = forward[i - 1][j - 1];
      const ear = forward[i - 1][j];
      const phone = forward[i][j - 1];
      // Count all score ties; for traceback prefer fewer gaps, then a match,
      // an ear gap, a phone gap.
      forward[i][j] = bestPaths([
        { score: diagonal.score + matchScore(i - 1, j - 1), gaps: diagonal.gaps, count: diagonal.count, move: 'match' },
        { score: ear.score - 1, gaps: ear.gaps + 1, count: ear.count, move: 'ear' },
        { score: phone.score - 1, gaps: phone.gaps + 1, count: phone.count, move: 'phone' },
      ]);
    }
  }
  const best = forward[ears.length][phones.length];
  if (best.gaps > difference) return null;
  const matches = [];
  let i = ears.length, j = phones.length;
  while (i || j) {
    const { move } = forward[i][j];
    if (move === 'match') matches.push([--i, --j]);
    else if (move === 'ear') i--;
    else j--;
  }
  const backward = Array.from({ length: ears.length + 1 }, () => Array(phones.length + 1));
  backward[ears.length][phones.length] = { score: 0, gaps: 0, count: 1n };
  for (let i = ears.length - 1; i >= 0; i--) {
    backward[i][phones.length] = { score: i - ears.length, gaps: ears.length - i, count: 1n };
  }
  for (let j = phones.length - 1; j >= 0; j--) {
    backward[ears.length][j] = { score: j - phones.length, gaps: phones.length - j, count: 1n };
  }
  for (let i = ears.length - 1; i >= 0; i--) {
    for (let j = phones.length - 1; j >= 0; j--) {
      const diagonal = backward[i + 1][j + 1];
      const ear = backward[i + 1][j];
      const phone = backward[i][j + 1];
      backward[i][j] = bestPaths([
        { score: diagonal.score + matchScore(i, j), gaps: diagonal.gaps, count: diagonal.count },
        { score: ear.score - 1, gaps: ear.gaps + 1, count: ear.count },
        { score: phone.score - 1, gaps: phone.gaps + 1, count: phone.count },
      ]);
    }
  }
  return matches.reverse().filter(([i, j]) => {
    const before = forward[i][j];
    const after = backward[i + 1][j + 1];
    // Keep an edge only when its best prefixes and suffixes cover every best path.
    return before.score + matchScore(i, j) + after.score === best.score
      && before.count * after.count === best.count;
  });
}

function hasFiniteFormants(point) {
  return Number.isFinite(point?.f1) && Number.isFinite(point?.f2);
}

export function applyReferee(words, tokens, calibration, options = {}) {
  const result = { words: words.map(word => [...word]), changes: [], status: 'off' };
  const { on, line, low } = refereeSettings(calibration);
  if (!on || !Array.isArray(tokens)) return result;
  const vowels = tokens.filter(value => vowelClass(value?.token) !== null);
  const syllables = [];
  let index = 0;
  result.words.forEach((word, w) => word.forEach((from, s) => {
    const sound = nucleus(from);
    if (sound) syllables.push({ word: w, syllable: s, from, sound, index });
    index++;
  }));
  const equalCounts = syllables.length === vowels.length;
  const matches = equalCounts ? syllables.map((_, i) => [i, i]) : alignVowels(syllables, vowels);
  if (!matches) return { ...result, status: 'count' };
  result.status = equalCounts ? 'checked' : 'aligned';
  const meterReady = meterChoice(options.profile?.vowels?.a, options.profile, ['a', 'o']) === 'a';
  for (const [earIndex, tokenIndex] of matches) {
    const { word, syllable, from, sound, index } = syllables[earIndex];
    if (!['a', 'o', 'e'].includes(sound)) continue;
    const kind = vowelClass(vowels[tokenIndex].token);
    const score = kind === 'front' || kind === 'back' ? backScore(vowels[tokenIndex].top) : null;
    const finalL = from.slice(from.indexOf(sound) + sound.length).endsWith('l');
    const openEnd = words[word].length >= 2 && syllable === words[word].length - 1
      && ['a', 'o'].includes(sound) && from.endsWith(sound);
    let replacement = sound;
    let rule = 'phoneme';
    if (sound === 'o' && /^[uʊʉyʏøœ]$/.test(normalizeVowel(vowels[tokenIndex].token))
      && !(meterReady && meterChoice(options.points?.[index], options.profile, ['a', 'o']) === 'a')) {
      replacement = 'u';
      rule = 'rounded';
    } else if (openEnd && score !== null && score < line) {
      // Reduced final vowels can sound front to the phoneme model.
      rule = 'open-end';
      if (sound === 'a' || score < low) {
        const point = options.points?.[index];
        const choice = meterReady ? meterChoice(point, options.profile, ['a', 'o']) : null;
        if (choice) replacement = choice;
        else if (hasFiniteFormants(point) && meterReady) replacement = '?';
      }
    } else if (sound === 'o' && score !== null && score < low) replacement = 'a';
    else if (finalL || (sound === 'o' && score !== null && score >= low && score < line)) {
      rule = finalL ? 'coda-l' : 'band';
      const point = options.points?.[index];
      const choice = meterReady ? meterChoice(point, options.profile, ['a', 'o']) : null;
      if (sound === 'a' && choice === 'o') replacement = 'o';
      else if (sound === 'o') {
        if (choice === 'a') replacement = 'a';
        else if (choice === null && hasFiniteFormants(point) && meterReady) replacement = '?';
      }
    } else if (score !== null && score >= line) replacement = 'o';
    const to = replacement === '?' ? '?' : from.replace(sound, replacement);
    if (to === from) continue;
    result.words[word][syllable] = to;
    result.changes.push({ word, syllable, from, to, rule });
  }
  return result;
}
