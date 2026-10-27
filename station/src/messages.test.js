import { expect, it } from 'vitest';
import { turnMessage, skillName } from './messages.js';

it('celebrates every pair right across the turn', () => {
  expect(turnMessage([{ pairs: 8, ok: 8 }, { pairs: 12, ok: 12 }])).toBe('You read every sound just right!');
});

it('names one vowel when most pairs are right', () => {
  expect(turnMessage([{ pairs: 10, ok: 9, wrong_vowel: 1, missedSkills: ['vowel:kamatz'] }]))
    .toBe('Great reading, and keep practicing the vowel kamatz!');
});

it('encourages and names a letter when many pairs were missed', () => {
  expect(turnMessage([{ pairs: 10, ok: 2, wrong_letter: 8, missedSkills: ['letter:vet'] }]))
    .toBe("Keep trying, and let's practice the letter ב together!");
});

it('uses a warm fallback for unknown skills and does not celebrate extras as perfect', () => {
  expect(turnMessage([{ pairs: 10, ok: 10, extra: 1 }])).not.toBe('You read every sound just right!');
  expect(turnMessage([{ pairs: 4, ok: 0, missedSkills: ['unknown:secret'] }])).toBe('Every try helps you grow!');
  expect(skillName('vowel:chataf_patach')).toBe('the vowel chataf patach');
});
