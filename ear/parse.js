import { tokenize } from './alphabet.js';

function unwrap(text) {
  let value = text.trim();
  const pairs = [['"', '"'], ["'", "'"], ['`', '`'], ['“', '”'], ['‘', '’']];
  while (value.length >= 2) {
    const pair = pairs.find(([start, end]) => value.startsWith(start) && value.endsWith(end));
    if (!pair) break;
    const [start, end] = pair;
    let count = 1;
    while (2 * (count + 1) <= value.length
      && value.startsWith(start.repeat(count + 1))
      && value.endsWith(end.repeat(count + 1))) count += 1;
    const inner = value.slice(count, -count);
    // Quotes around separate words or lines are not a wrapper around the whole output.
    if (inner.includes(start) || inner.includes(end)) break;
    value = inner.trim();
  }
  return value;
}

const preamble = /^(?:sounds?|syllables|transcription|what i heard|here(?: is|'s) what i heard|here are the sounds(?: i heard)?|here is the transcription)\s*[:.!]?$/;

// The formatting the models add around sounds: outer quotes, list markers and
// a heading line such as "Sounds:".
function soundLines(text) {
  const lines = unwrap(text).split(/\r?\n/)
    .map((line) => unwrap(unwrap(line).replace(/^(?:\d+[.)]|[-*•])\s*/, '')))
    .filter(Boolean);

  if (lines.length && preamble.test(lines[0].toLowerCase())) lines.shift();
  return lines;
}

export function parseEarOutput(text) {
  return soundLines(text).flatMap((line) => line.toLowerCase().split(/\s+/).map((word) => (
    unwrap(word).split(/-+/).filter(Boolean)
      .map((syllable) => (tokenize(syllable) ? syllable : '?'))
  )).filter((word) => word.length));
}

// The models sometimes answer in English prose instead of sounds ("I don't have the
// ability to hear audio"). That is a failed call, not a child who read badly.
// Single letters such as "i" are real vowels, so they never count as prose.
const proseWords = /\b(?:audio|hear|heard|ability|upload|sorry|cannot|unable|file|sound|alphabet|please|recording|transcribe)\b/gi;
const prosePhrase = /\b(?:i (?:can'?t|cannot|don'?t|do not|am (?:not |un)able)|i'?m (?:sorry|unable|not able)|as an ai)\b/i;

// Once that formatting is removed, a sound answer holds only letters, hyphens,
// slashes and "?". Punctuation means a sentence: "I can't hear audio." Capitals
// are a reading only when every syllable is a real sound, so "Sha-vos" counts
// and "No speech detected" does not.
function sentenceShaped(raw) {
  const words = soundLines(raw).flatMap((line) => line.split(/\s+/)).map(unwrap).filter(Boolean);
  if (words.some((word) => !/^[a-z/?-]*$/.test(word.toLowerCase()))) return true;
  return words.some((word) => word !== word.toLowerCase())
    && words.some((word) => word.toLowerCase().split(/[-/]+/).filter(Boolean)
      .some((syllable) => syllable !== '?' && !tokenize(syllable)));
}

export function looksLikeProse(raw) {
  if (sentenceShaped(raw)) return true;
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length <= 6) return false;
  if (prosePhrase.test(raw)) return true;
  const hits = new Set((raw.match(proseWords) || []).map((word) => word.toLowerCase()));
  return hits.size >= 2;
}
