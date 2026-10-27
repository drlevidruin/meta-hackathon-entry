import { readFileSync } from 'node:fs';
import { expectedSounds, splitWords } from '../rulebook/index.js';
import { stripMarkup } from '../rulebook/cleanup.js';

export const siddur = JSON.parse(readFileSync(new URL('./data/siddur.json', import.meta.url), 'utf8'));

export function pointedWord(word, result = expectedSounds(word, 'sephardi')) {
  return !result.flags.includes('unpointed')
    && (/[\u05b0-\u05bb\u05c7]/u.test(word) || result.pairs.some((pair) => pair.vowel === 'shuruk'));
}

export function segmentWords(segment) {
  return splitWords(segment).map(({ word, maqaf }) => word + (maqaf ? '־' : ''));
}

export function usableSegment(segment) {
  const words = segmentWords(segment);
  return words.length > 0 && words.every((word) => pointedWord(word));
}

export function usableSegments(section) {
  return section.segments.filter(usableSegment);
}

export function punctuatedPhrases(segment) {
  return stripMarkup(segment).split(/[,.:;!?\u05c3]+/u).map(segmentWords).filter((words) => words.length);
}

export function lineText(words) {
  return words.join(' ').replaceAll('־ ', '־');
}
