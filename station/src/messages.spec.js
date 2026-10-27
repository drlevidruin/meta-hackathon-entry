import { expect, it } from 'vitest';
import { turnMessage, skillName } from './messages.js';

it('uses a template for best and next with kid words and the letter sign', () => {
  expect(turnMessage({ best: 'letter:bet', next: 'vowel:sheva_na', proven: ['letter:bet'] }))
    .toBe('You nailed the bet with a dot (בּ) today! Next time we practice the sheva.');
});
it('names only the next skill when no best is present', () => {
  expect(turnMessage({ best: null, next: 'vowel:chirik' })).toBe('Next time we practice the chirik.');
});
it('celebrates the best when no next is present', () => {
  expect(turnMessage({ best: 'letter:vet' })).toBe('You nailed the vet (ב) today!');
});
it('uses the empty fallback and never echoes arbitrary text', () => {
  expect(turnMessage({})).toBe('You read so well today!');
  expect(turnMessage(null)).toBe('You read so well today!');
  expect(turnMessage({ best: 'untrusted text', next: 'unknown:secret' })).toBe('You read so well today!');
  expect(skillName('vowel:chataf_patach')).toBe('the chataf patach');
});
