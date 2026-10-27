import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { cardLabels, VOICE_CARD } from './voice-card.js';

test('voice card is frozen and has three rows of five syllables', () => {
  assert.equal(Object.isFrozen(VOICE_CARD), true);
  assert.equal(VOICE_CARD.length, 15);
});

test('voice card labels follow the Ashkenazi and Sephardi rulebook', () => {
  assert.deepEqual(cardLabels('ashkenazi'), Array(3).fill(['o', 'a', 'e', 'i', null]).flat());
  assert.deepEqual(cardLabels('sephardi'), Array(3).fill(['a', 'a', 'e', 'i', 'o']).flat());
  assert.deepEqual(cardLabels('chassidish'), Array(3).fill([null, 'a', 'e', 'i', null]).flat());
  assert.throws(() => cardLabels('unknown'), RangeError);
  assert.throws(() => cardLabels('toString'), RangeError);
});

test('documented voice check Hebrew matches the voice card exactly and precedes Round 1', async () => {
  const markdown = await readFile(new URL('../docs/ear-test.md', import.meta.url), 'utf8');
  const row = markdown.split('\n').find((line) => line.startsWith('| voice-check |'));
  assert.equal(row.split('|')[2].trim(), VOICE_CARD.join(' '));
  assert.ok(markdown.indexOf('## Voice check') < markdown.indexOf('## Round 1: an adult voice'));
});
