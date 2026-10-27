import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { cardLabels, VOICE_CARD } from './voice-card.js';
import * as cards from './voice-card.js';

test('subset voice cards use learned columns, enough rows, and the original Unicode syllables', () => {
  const columns = ['kamatz', 'patach', 'segol', 'chirik', 'cholam'];
  assert.deepEqual(cards.CARD_VOWELS, columns);
  for (let mask = 0; mask < 32; mask++) {
    const shown = columns.filter((_, i) => mask & (1 << i));
    const card = cards.voiceCard(shown);
    const rows = shown.length <= 2 ? 6 : 3;
    assert.equal(card.length, shown.length * rows);
    for (let row = 0; row < Math.min(3, rows); row++) {
      for (const [col, vowel] of shown.entries()) {
        assert.equal(card[row * shown.length + col], VOICE_CARD[row * 5 + columns.indexOf(vowel)]);
      }
    }
    if (shown.length > 0 && shown.length <= 2) {
      const marks = { kamatz: 'ָ', patach: 'ַ', segol: 'ֶ', chirik: 'ִ', cholam: 'ֹ' };
      assert.deepEqual(card.slice(3 * shown.length), ['ג', 'תּ', 'ק'].flatMap(letter =>
        shown.map(vowel => (letter + marks[vowel]).normalize('NFD'))));
    }
  }
  assert.deepEqual(cards.voiceCard(), VOICE_CARD);
  assert.deepEqual(cards.voiceCard(null), VOICE_CARD);
  assert.notEqual(cards.voiceCard(columns), VOICE_CARD);
  assert.deepEqual(cards.voiceCard(['tzere', 'sheva']), []);
  assert.deepEqual(cardLabels('ashkenazi', cards.voiceCard(['kamatz'])), Array(6).fill('o'));
  assert.deepEqual(cards.voiceCardFor(['cholam'], 'ashkenazi'), []);
  assert.deepEqual(cards.voiceCardFor(['kamatz'], 'chassidish'), []);
  assert.deepEqual(cards.voiceCardFor(['cholam'], 'sephardi'), cards.voiceCard(['cholam']));
});

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
