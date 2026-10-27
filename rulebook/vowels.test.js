import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as vowels from './vowels.js';

const ids = ['kamatz', 'patach', 'segol', 'tzere', 'chirik', 'cholam', 'shuruk', 'kubutz', 'sheva', 'chataf'];
const items = JSON.parse(readFileSync(new URL('../bank/items.json', import.meta.url), 'utf8'));

test('learned vowels normalize to a fresh canonical array and reject invalid values', () => {
  assert.deepEqual(vowels.VOWEL_IDS, ids);
  assert.ok(Object.isFrozen(vowels.VOWEL_IDS));
  const input = ['sheva', 'kamatz', 'tzere'];
  assert.deepEqual(vowels.normalizeVowels(input), ['kamatz', 'tzere', 'sheva']);
  assert.notEqual(vowels.normalizeVowels(input), input);
  for (const value of [[], ['kamatz', 'kamatz'], ['unknown'], ['sheva_na'], [1], ['kamatz', ,], null, undefined, 'kamatz', {}]) {
    assert.equal(vowels.normalizeVowels(value), null);
  }
  assert.equal(vowels.isFullSet([...ids].reverse()), true);
  for (const value of [undefined, null, [], ids.slice(1), Array(10).fill('kamatz')]) {
    assert.equal(vowels.isFullSet(value), false);
  }
});

test('required vowels unite skills and text, excluding the closing kaf sheva', () => {
  assert.deepEqual(vowels.requiredVowels({ text: 'בָּךְ', skills: [] }), ['kamatz']);
  assert.deepEqual(vowels.requiredVowels({ text: 'בִּנְבֶּךְ', skills: [] }), ['segol', 'chirik', 'sheva']);
  assert.deepEqual(vowels.requiredVowels({ text: 'אֱ אֲ אֳ', skills: [] }), ['chataf']);
  assert.deepEqual(vowels.requiredVowels({ text: 'בׇ בֺ בֵ בֻ', skills: [] }), ['kamatz', 'tzere', 'cholam', 'kubutz']);
  assert.deepEqual(vowels.requiredVowels({ text: 'וּ בּ', skills: [] }), []);
  assert.deepEqual(vowels.requiredVowels({ skills: ['vowel:shuruk', 'vowel:kamatz_katan',
    'vowel:sheva_na', 'vowel:chataf_patach', 'vowel:chataf_segol', 'vowel:chataf_kamatz', 'letter:bet'] }),
  ['kamatz', 'shuruk', 'sheva', 'chataf']);
  assert.equal(vowels.fitsVowels({ text: 'בָּךְ' }, ['kamatz']), true);
  assert.equal(vowels.fitsVowels({ text: 'בָּרְ' }, ['kamatz']), false);
});

test('every bank vowel point and vowel skill is covered by required vowels', () => {
  const points = ['sheva', 'chataf', 'chataf', 'chataf', 'chirik', 'tzere', 'segol', 'patach', 'kamatz', 'cholam', 'cholam', 'kubutz'];
  const skills = { kamatz_katan: 'kamatz', sheva_na: 'sheva', chataf_patach: 'chataf',
    chataf_segol: 'chataf', chataf_kamatz: 'chataf' };
  for (const item of items) {
    const required = vowels.requiredVowels(item);
    for (const point of item.text.replaceAll('ךְ', '').match(/[\u05b0-\u05bb\u05c7]/gu) || []) {
      assert.ok(required.includes(point === 'ׇ' ? 'kamatz' : points[point.codePointAt(0) - 0x05b0]), item.id);
    }
    for (const skill of item.skills.filter(skill => skill.startsWith('vowel:'))) {
      const name = skill.slice(6);
      assert.ok(required.includes(skills[name] || name), `${item.id}: ${skill}`);
    }
    assert.deepEqual(required, ids.filter(id => required.includes(id)));
  }
});

test('full and missing learned sets preserve the original bank order and exclude beginners', () => {
  const regular = items.filter(item => !item.source?.beginner);
  for (const full of [undefined, null, ids, [...ids].reverse()]) {
    assert.deepEqual(vowels.itemsForVowels(items, full), regular);
  }
  const sample = [{ text: 'בָּ', source: { beginner: true } }, { text: 'בַּ' }, { text: 'דָ' }];
  assert.deepEqual(vowels.itemsForVowels(sample, ['kamatz']), [sample[0], sample[2]]);
});
