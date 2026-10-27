const vowelSymbols = 'aɑɔoɒʌæɐeɛəiɪuʊyøœɜɯɨɚɝ';
const vowel = new RegExp(`[${vowelSymbols}]`);
const tone = new RegExp(`([${vowelSymbols}])ɜ`, 'g');
const specialTokens = new Set(['<pad>', '<s>', '</s>', '<unk>']);
const round = value => Math.round(value * 1000) / 1000;

export function vowelClass(token) {
  if (typeof token !== 'string' || specialTokens.has(token)) return null;
  const sound = token.normalize('NFD').replace(/[1-5ː:.\u0303\u031e]/g, '')
    .replace(tone, '$1').replace(/(.+)[ɹɚ]$/, '$1');
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

export function applyReferee(words, tokens, calibration) {
  const result = { words: words.map(word => [...word]), changes: [], status: 'off' };
  const { on, line, low } = refereeSettings(calibration);
  if (!on || !Array.isArray(tokens)) return result;
  const vowels = tokens.filter(value => vowelClass(value?.token) !== null);
  const syllables = [];
  result.words.forEach((word, w) => word.forEach((from, s) => {
    const sound = nucleus(from);
    if (sound) syllables.push({ word: w, syllable: s, from, sound });
  }));
  if (syllables.length !== vowels.length) return { ...result, status: 'count' };
  result.status = 'checked';
  for (const [index, { word, syllable, from, sound }] of syllables.entries()) {
    const kind = vowelClass(vowels[index].token);
    if (!['a', 'o', 'e'].includes(sound) || (kind !== 'front' && kind !== 'back')) continue;
    const score = backScore(vowels[index].top);
    if (score === null) continue;
    const replacement = score >= line ? 'o' : score < low && sound === 'o' ? 'a' : sound;
    const to = from.replace(sound, replacement);
    if (to === from) continue;
    result.words[word][syllable] = to;
    result.changes.push({ word, syllable, from, to });
  }
  return result;
}
