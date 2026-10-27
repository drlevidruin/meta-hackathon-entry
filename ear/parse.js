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

export function parseEarOutput(text) {
  const lines = unwrap(text).toLowerCase().split(/\r?\n/)
    .map((line) => unwrap(unwrap(line).replace(/^(?:\d+[.)]|[-*•])\s*/, '')))
    .filter(Boolean);

  if (lines.length && preamble.test(lines[0])) lines.shift();

  return lines.flatMap((line) => line.split(/\s+/).map((word) => (
    unwrap(word).split(/-+/).filter(Boolean)
      .map((syllable) => (tokenize(syllable) ? syllable : '?'))
  )).filter((word) => word.length));
}
