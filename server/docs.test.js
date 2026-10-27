import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import items from '../bank/items.json' with { type: 'json' };
import { makePacket } from './packet.js';

test('API documentation describes the 150 bank challenges and a packet challenge', () => {
  assert.equal(items.filter(item => item.source?.challenge).length, 150);
  assert.equal(makePacket({ items, level: 1, skill: 'vowel:patach' }).sections[2].items.length, 1);
  const api = fs.readFileSync(new URL('../docs/api.md', import.meta.url), 'utf8');
  assert.match(api, /150 challenge items/);
  assert.doesNotMatch(api, /bank has no/);
});
