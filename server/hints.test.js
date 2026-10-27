import test from 'node:test';
import assert from 'node:assert/strict';
import { parentLine } from './hints.js';

test('parent line celebrates only a nonempty summary with every sounded pair ok', () => {
  assert.equal(parentLine('Sprout', { pairs: 3, ok: 3 }, 'sephardi', null),
    'Sprout read 3 of 3 sounds right today. Every sound was right!');
});

test('parent line stops after the count when there are mistakes and no next skill', () => {
  assert.equal(parentLine('Sprout', { pairs: 3, ok: 2, wrong_vowel: 1 }, 'sephardi', null),
    'Sprout read 2 of 3 sounds right today.');
});

test('parent line is empty when the summary has no pairs', () => {
  assert.equal(parentLine('Sprout', { pairs: 0, ok: 0 }, 'sephardi', 'letter:bet'), '');
});

test('parent line stops after the count when extra sounds were heard and there is no next skill', () => {
  assert.equal(parentLine('Sprout', { pairs: 3, ok: 3, extra: 1 }, 'sephardi', null),
    'Sprout read 3 of 3 sounds right today.');
});
