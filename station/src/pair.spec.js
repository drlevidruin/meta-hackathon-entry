import { expect, it } from 'vitest';
import { pairLetter } from './pair.js';

it.each([
  ['בָּ', 'בּ'], ['שָׁ', 'שׁ'], ['שָׂ', 'שׂ'], ['רוּ', 'ר'],
  ['נֶי', 'נ'], ['מִי', 'מ'], ['מֵי', 'מ'], ['תָּה', 'תּ'], ['ךָ', 'ך'],
  ['וּ', 'וּ'], ['וֹ', 'ו'], ['בָּ', 'בּ'], ['שָּׁ', 'שּׁ'],
  ['שָׁ֑', 'שׁ'], ['בָהּ', 'ב'], ['ב', 'ב'], ['', ''],
])('keeps only the first letter and its consonant points in %s', (text, expected) => {
  expect(pairLetter(text)).toBe(expected);
});
