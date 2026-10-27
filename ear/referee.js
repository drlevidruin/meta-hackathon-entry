import { meterChoice } from './meter.js';

const vowelSymbols = 'aɑɔoɒʌæɐeɛəiɪuʊyøœɜɯɨɚɝ';
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
  if (/^[uʊ]$/.test(sound)) return 'high-back';
  return null;
}

function alignVowels(syllables, vowels) {
  const difference = Math.abs(syllables.length - vowels.length);
  if (difference * 3 > Math.max(syllables.length, vowels.length)) return null;
  const ears = syllables.map(({ sound }) => earClasses[sound]);
  const phones = vowels.map(({ token }) => phonemeClass(token));
  const table = Array.from({ length: ears.length + 1 }, () => Array(phones.length + 1));
  table[0][0] = { score: 0, gaps: 0 };
  for (let i = 1; i <= ears.length; i++) table[i][0] = { score: -i, gaps: i, move: 'ear' };
  for (let j = 1; j <= phones.length; j++) table[0][j] = { score: -j, gaps: j, move: 'phone' };
  for (let i = 1; i <= ears.length; i++) {
    for (let j = 1; j <= phones.length; j++) {
      const same = ears[i - 1] === phones[j - 1];
      const openMid = (ears[i - 1] === 'open' && phones[j - 1] === 'mid')
        || (ears[i - 1] === 'mid' && phones[j - 1] === 'open');
      const diagonal = table[i - 1][j - 1];
      const ear = table[i - 1][j];
      const phone = table[i][j - 1];
      const choices = [
        { score: diagonal.score + (same ? 2 : openMid ? 0 : -1), gaps: diagonal.gaps, move: 'match' },
        { score: ear.score - 1, gaps: ear.gaps + 1, move: 'ear' },
        { score: phone.score - 1, gaps: phone.gaps + 1, move: 'phone' },
      ];
      // At equal scores prefer fewer gaps, then a match, an ear gap, a phone gap.
      table[i][j] = choices.reduce((best, choice) => choice.score > best.score
        || (choice.score === best.score && choice.gaps < best.gaps) ? choice : best);
    }
  }
  if (table[ears.length][phones.length].gaps > difference) return null;
  const matches = [];
  let i = ears.length, j = phones.length;
  while (i || j) {
    const { move } = table[i][j];
    if (move === 'match') matches.push([--i, --j]);
    else if (move === 'ear') i--;
    else j--;
  }
  return matches.reverse();
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
  for (const [earIndex, tokenIndex] of matches) {
    const { word, syllable, from, sound, index } = syllables[earIndex];
    if (!['a', 'o', 'e'].includes(sound)) continue;
    const kind = vowelClass(vowels[tokenIndex].token);
    const score = kind === 'front' || kind === 'back' ? backScore(vowels[tokenIndex].top) : null;
    const finalL = from.slice(from.indexOf(sound) + sound.length).endsWith('l');
    let replacement = sound;
    let rule = 'phoneme';
    if (sound === 'o' && score !== null && score < low) replacement = 'a';
    else if (finalL || (sound === 'o' && score !== null && score >= low && score < line)) {
      rule = finalL ? 'coda-l' : 'band';
      const point = options.points?.[index];
      const choice = meterChoice(point, options.profile, ['a', 'o']);
      if (sound === 'a' && choice === 'o') replacement = 'o';
      else if (sound === 'o') {
        if (choice === 'a') replacement = 'a';
        else if (choice === null && point && options.profile) replacement = '?';
      }
    } else if (score !== null && score >= line) replacement = 'o';
    const to = replacement === '?' ? '?' : from.replace(sound, replacement);
    if (to === from) continue;
    result.words[word][syllable] = to;
    result.changes.push({ word, syllable, from, to, rule });
  }
  return result;
}
