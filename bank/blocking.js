import { readFileSync } from 'node:fs';
import { cleanWord, expectedSounds, PRESETS } from '../rulebook/index.js';

const blocklist = JSON.parse(readFileSync(new URL('./blocklist.json', import.meta.url), 'utf8'));
const finals = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };

export function foldedSkeleton(word) {
  return cleanWord(word).replace(/[^א-ת]/gu, '').replace(/[ךםןףץ]/gu, (letter) => finals[letter]);
}

const skeletons = new Set(blocklist.skeletons.map(foldedSkeleton));
const blockedSounds = new Set(blocklist.sounds);

export function acceptedReadings(result) {
  let readings = !result.substitute && result.pairs.length ? [''] : [];
  for (const pair of result.substitute ? [] : result.pairs) {
    readings = [...new Set(readings.flatMap((before) => pair.sounds.map((sound) => before + sound)))];
  }
  for (const alternative of result.readings ?? []) readings.push(...acceptedReadings(alternative));
  return [...new Set(readings)];
}

export function matchesBlocklist(word, results) {
  if (skeletons.has(foldedSkeleton(word))) return true;
  const readings = results ?? Object.keys(PRESETS).map((preset) => expectedSounds(word, preset));
  return readings.some((result) => acceptedReadings(result).some((sound) => blockedSounds.has(sound)));
}

export function allowedGeneratedWord(word) {
  const results = Object.keys(PRESETS).map((preset) => expectedSounds(word, preset));
  return results.every((result) => result.pairs.length && !result.flags.length
    && result.pairs.every((pair) => pair.sounds.length && pair.sounds.every(Boolean)))
    && !matchesBlocklist(word, results);
}
