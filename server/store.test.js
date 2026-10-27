import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createStore } from './store.js';
import { startProfile } from '../coach/index.js';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(fileURLToPath(new URL('.', import.meta.url)), '.test-store-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: createStore(directory) };
}

test('profile persistence allows only coach fields at every profile depth', async t => {
  const { directory, store } = fixture(t);
  const profile = startProfile({ level: 3 });
  profile.skills['letter:bet'] = { tries: 4, misses: 2, recent: [0, 1], demotedAt: 2 };
  profile.cleanAtLevel = { clean: true, held: [['letter:bet']] };
  profile.proven = ['letter:bet'];
  profile.seen = ['bank-item'];
  const polluted = structuredClone(profile);
  polluted.transcript = 'PRIVATE_TRANSCRIPT';
  polluted.cleanAtLevel.audioUrl = 'PRIVATE_AUDIO';
  polluted.skills['letter:bet'].providerResponse = 'PRIVATE_RESPONSE';
  polluted.skills['unknown:field'] = { raw: 'PRIVATE_RAW' };
  polluted.seen.push({ raw: 'PRIVATE_SEEN' });
  polluted.cleanAtLevel.held.push([{ raw: 'PRIVATE_HELD' }]);
  await store.update(state => { state.children.sprout = { profile: polluted }; });
  const saved = JSON.parse(fs.readFileSync(path.join(directory, 'store.json'), 'utf8'));
  assert.deepEqual(saved.children.sprout.profile, { ...profile, cleanAtLevel: { ...profile.cleanAtLevel, held: [['letter:bet'], []] } });
  assert.doesNotMatch(JSON.stringify(saved), /PRIVATE/);
  assert.deepEqual(createStore(directory).read(), saved);
});

test('the store retains the last sixty turns separately for each child', async t => {
  const { directory, store } = fixture(t);
  await store.update(state => {
    state.turns.sprout = Array.from({ length: 65 }, (_, index) => ({ id: `turn-${65 - index}` }));
    state.turns.pebble = [{ id: 'other-turn' }];
  });
  const saved = createStore(directory).read();
  assert.equal(saved.turns.sprout.length, 60);
  assert.equal(saved.turns.sprout[0].id, 'turn-65');
  assert.equal(saved.turns.sprout.at(-1).id, 'turn-6');
  assert.deepEqual(saved.turns.pebble, [{ id: 'other-turn' }]);
});
