import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makePacket } from './packet.js';

const item = (id, level, focus, skills = [focus], challenge = false) =>
  ({ id, level, text: 'בִּי', focus, skills, source: { challenge } });
const practice = options => makePacket(options).sections[1].items;
const skill = 'pattern:chirik_male';

test('round 2.9: level one chirik male practice fills six real-bank items', () => {
  const items = JSON.parse(readFileSync(new URL('../bank/items.json', import.meta.url), 'utf8'));
  const result = practice({ items, level: 1, skill });
  assert.equal(result.length, 6);
  assert.equal(new Set(result.map(item => item.id)).size, 6);
  for (const picked of result) {
    const original = items.find(item => item.id === picked.id);
    assert.ok(original.focus === skill || original.skills.includes(skill));
    assert.ok(!original.source?.challenge);
    assert.deepEqual(picked, { id: original.id, text: original.text, level: original.level });
  }
});

test('round 2.9: practice ranks focus below, coverage below, then above by distance and id', () => {
  const items = [item('focus-low', 1, skill), item('focus-near-z', 2, skill),
    item('focus-near-a', 2, skill), item('covered', 2, 'vowel:chirik', [skill]),
    item('above-z', 4, skill), item('above-a', 4, 'vowel:chirik', [skill]),
    item('far', 5, skill), item('excluded', 3, skill, [skill], true)];
  const before = structuredClone(items);
  assert.deepEqual(practice({ items, skill, level: 3 }).map(item => item.id),
    ['focus-near-a', 'focus-near-z', 'focus-low', 'covered', 'above-a', 'above-z']);
  assert.deepEqual(practice({ items: [...items].reverse(), skill, level: 3 }), practice({ items, skill, level: 3 }));
  assert.deepEqual(items, before);
});

test('round 2.9: a skill with no items falls back to six nearest regular items', () => {
  const items = [item('below', 2, 'letter:bet'), item('same-z', 3, 'letter:bet'),
    item('same-a', 3, 'letter:bet'), item('above', 4, 'letter:bet'),
    item('low', 1, 'letter:bet'), item('high', 5, 'letter:bet'),
    item('excluded', 3, 'letter:bet', [], true)];
  assert.deepEqual(practice({ items, skill, level: 3 }).map(item => item.id),
    ['same-a', 'same-z', 'above', 'below', 'high', 'low']);
});

test('round 2.9: sparse practice stays unique and never takes unrelated filler for a taught skill', () => {
  const items = [item('only', 4, skill), item('unrelated', 1, 'letter:bet'),
    item('excluded', 1, skill, [skill], true)];
  assert.deepEqual(practice({ items, skill, level: 1 }).map(item => item.id), ['only']);
  assert.deepEqual(practice({ items: [], skill, level: 1 }), []);
});
