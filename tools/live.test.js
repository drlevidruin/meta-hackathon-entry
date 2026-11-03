import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { VOWEL_IDS } from '../rulebook/vowels.js';
import { secret, seedDemoReaders } from './live.js';

test('seeds Levi and Guest into an empty roster once, and never into a roster with readers', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-live-'));
  try {
    const store = createStore(dir);
    assert.deepEqual(await seedDemoReaders(store), ['Levi', 'Guest']);
    const children = Object.values(createStore(dir).read().children);
    assert.deepEqual(children.map(child => [child.name, child.preset]), [['Levi', 'ashkenazi'], ['Guest', 'sephardi']]);
    for (const child of children) {
      assert.deepEqual(child.vowels, [...VOWEL_IDS]);
      assert.equal(child.level, 1);
      assert.deepEqual(createStore(dir).read().turns[child.id], []);
    }
    assert.deepEqual(await seedDemoReaders(createStore(dir)), []);
    assert.equal(Object.keys(createStore(dir).read().children).length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('reads a secret from the environment first, then the keychain', () => {
  const calls = [];
  const read = service => { calls.push(service); return 'from-keychain'; };
  assert.equal(secret('META_API_KEY', 'meta-model-api', { META_API_KEY: 'from-env' }, read), 'from-env');
  assert.deepEqual(calls, []);
  assert.equal(secret('META_API_KEY', 'meta-model-api', { META_API_KEY: ' ' }, read), 'from-keychain');
  assert.equal(secret('TEACHER_PIN', 'kriah-teacher-pin', {}, read), 'from-keychain');
  assert.deepEqual(calls, ['meta-model-api', 'kriah-teacher-pin']);
  assert.equal(secret('TEACHER_PIN', 'kriah-teacher-pin', {}, () => undefined), undefined);
});
