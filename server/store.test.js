import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from './store.js';
import { startProfile } from '../coach/index.js';
import { buildVoiceProfile } from '../ear/meter.js';
import { utterance, wav } from '../ear/synth-for-tests.js';

test('learned vowels and voice skip are sanitized on update and reload', async t => {
  const { directory, store } = fixture(t);
  for (const value of [null, [], ['kamatz', 'kamatz'], ['unknown'], 'kamatz', 1, undefined]) {
    await store.update(state => { state.children.sprout = { vowels: value, voiceSkipped: value }; });
    const child = store.read().children.sprout;
    assert.equal(Object.hasOwn(child, 'vowels'), false);
    assert.equal(Object.hasOwn(child, 'voiceSkipped'), false);
  }
  await store.update(state => { state.children.sprout = { vowels: ['sheva', 'kamatz'], voiceSkipped: true }; });
  assert.deepEqual(store.read().children.sprout.vowels, ['kamatz', 'sheva']);
  assert.equal(createStore(directory).read().children.sprout.voiceSkipped, true);
  const saved = store.read();
  saved.children.sprout.vowels = ['invalid'];
  saved.children.sprout.voiceSkipped = 'true';
  fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify(saved));
  const reloaded = createStore(directory).read().children.sprout;
  assert.equal(Object.hasOwn(reloaded, 'vowels'), false);
  assert.equal(Object.hasOwn(reloaded, 'voiceSkipped'), false);
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-store-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, store: createStore(directory) };
}

test('store fixtures use the system temp folder and clean up', async () => {
  let cleanup;
  const { directory } = fixture({ after: callback => { cleanup = callback; } });
  try {
    assert.equal(fs.realpathSync(path.dirname(directory)), fs.realpathSync(os.tmpdir()));
  } finally {
    await cleanup();
  }
  assert.equal(fs.existsSync(directory), false);
});

for (const turns of [{}, 7]) {
  test(`a malformed turn list (${typeof turns}) gives a controlled load error`, t => {
    const { directory } = fixture(t);
    fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify({ version: 1, children: {}, turns: { sprout: turns } }));
    assert.throws(() => createStore(directory), { name: 'Error', message: 'Could not load store' });
  });
}

test('a null child gives a controlled load error', t => {
  const { directory } = fixture(t);
  fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify({ version: 1, children: { sprout: null }, turns: {} }));
  assert.throws(() => createStore(directory), { name: 'Error', message: 'Could not load store' });
});

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

test('voice persistence keeps only supported numeric vowel fields on update and reload', async t => {
  const { directory, store } = fixture(t);
  const labels = ['a', 'a', 'o', 'o', 'e', 'e', 'i', 'i'];
  const profile = buildVoiceProfile(wav(utterance(labels)), labels);
  const polluted = structuredClone(profile);
  polluted.audio = 'PRIVATE_AUDIO';
  polluted.transcript = 'PRIVATE_TEXT';
  polluted.vowels.u = { f1: 4, f2: 8, n: 2 };
  polluted.vowels.a.heard = 'PRIVATE_SOUND';
  await store.update(state => { state.children.sprout = { voice: polluted }; });
  assert.deepEqual(store.read().children.sprout.voice, profile);
  const file = path.join(directory, 'store.json');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /PRIVATE|audio|transcript|heard/);
  const saved = store.read();
  saved.children.sprout.voice = polluted;
  fs.writeFileSync(file, JSON.stringify(saved));
  assert.deepEqual(createStore(directory).read().children.sprout.voice, profile);
});

test('voice sanitizer drops invalid vowels and requires at least one surviving class', async t => {
  const { store } = fixture(t);
  const valid = { f1: 0, f2: 25, n: 2 };
  const save = async voice => {
    await store.update(state => { state.children.sprout = { voice }; });
    return store.read().children.sprout.voice;
  };
  assert.deepEqual(await save({ version: 2, vowels: { a: valid, o: { ...valid, n: 15 }, u: valid }, spread: 0.3 }),
    { version: 2, vowels: { a: valid, o: { ...valid, n: 15 } }, spread: 0.3 });
  for (const invalid of [null, [], {}, { ...valid, f1: NaN }, { ...valid, f2: Infinity },
    { ...valid, f1: -0.01 }, { ...valid, f2: 25.01 }, { ...valid, f1: '3' },
    { ...valid, n: 1 }, { ...valid, n: 16 }, { ...valid, n: 2.5 }, { ...valid, n: '2' }]) {
    assert.equal(await save({ version: 2, vowels: { o: invalid }, spread: 0.3 }), null);
    assert.deepEqual(await save({ version: 2, vowels: { a: valid, o: invalid }, spread: 0.3 }),
      { version: 2, vowels: { a: valid }, spread: 0.3 });
    assert.deepEqual(await save({ version: 2, vowels: { a: valid, o: valid, e: invalid }, spread: 0.3 }),
      { version: 2, vowels: { a: valid, o: valid }, spread: 0.3 });
  }
  for (const invalid of [undefined, null, [], {}, { version: 2, vowels: { a: valid, o: valid } },
    { version: 1, vowels: { a: valid, o: valid }, spread: 0.3 },
    { version: '2', vowels: { a: valid, o: valid }, spread: 0.3 },
    { version: 2, vowels: [], spread: 0.3 }, { version: 2, vowels: {}, spread: 0.3 },
    { version: 2, vowels: { u: valid, oy: valid }, spread: 0.3 }]) {
    assert.equal(await save(invalid), null);
  }
});

test('phoneme calibration keeps only its medians and counts on update and reload', async t => {
  const { directory, store } = fixture(t);
  const base = { version: 2, vowels: { o: { f1: 4, f2: 8, n: 3 } }, spread: 0.3 };
  const phonemes = { version: 1, a: 0.43, o: 0.91, n: { a: 3, o: 3 } };
  const polluted = { ...phonemes, tokens: 'PRIVATE_TOKENS', n: { ...phonemes.n, heard: 'PRIVATE_SOUND' } };
  await store.update(state => { state.children.sprout = { voice: { ...base, phonemes: polluted } }; });
  assert.deepEqual(store.read().children.sprout.voice, { ...base, phonemes });
  const file = path.join(directory, 'store.json');
  assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /PRIVATE|tokens|heard/);
  assert.deepEqual(createStore(directory).read().children.sprout.voice, { ...base, phonemes });
  for (const invalid of [null, [], {}, { ...phonemes, version: 2 }, { ...phonemes, version: '1' },
    { ...phonemes, a: 1.01 }, { ...phonemes, o: -0.01 }, { ...phonemes, a: '0.43' }, { ...phonemes, o: NaN },
    { ...phonemes, n: null }, { ...phonemes, n: [] }, { ...phonemes, n: { a: 1, o: 3 } },
    { ...phonemes, n: { a: 3, o: 16 } }, { ...phonemes, n: { a: 2.5, o: 3 } }, { ...phonemes, n: { a: 3 } }]) {
    await store.update(state => { state.children.sprout = { voice: { ...base, phonemes: invalid } }; });
    assert.deepEqual(store.read().children.sprout.voice, base);
  }
});

test('a version 1 voice profile loads as null', t => {
  const { directory } = fixture(t);
  const voice = { version: 1, vowels: { a: { f1: 5, f2: 9, n: 3 }, o: { f1: 4, f2: 8, n: 3 } } };
  fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify({
    version: 1, children: { sprout: { voice } }, turns: {},
  }));
  assert.equal(createStore(directory).read().children.sprout.voice, null);
});

test('a version 2 voice profile with one vowel survives an update and reload', async t => {
  const { directory, store } = fixture(t);
  for (const spread of [0, 0.3, 10]) {
    const voice = { version: 2, vowels: { o: { f1: 4, f2: 8, n: 6 } }, spread };
    await store.update(state => { state.children.sprout = { voice }; });
    assert.deepEqual(store.read().children.sprout.voice, voice);
    assert.deepEqual(createStore(directory).read().children.sprout.voice, voice);
  }
});

test('voice sanitizer rejects invalid spread on update and reload', async t => {
  const { directory, store } = fixture(t);
  for (const spread of [-0.1, NaN, '0.3', 10.01, Infinity, undefined, null]) {
    const voice = { version: 2, vowels: { o: { f1: 4, f2: 8, n: 3 } }, spread };
    await store.update(state => { state.children.sprout = { voice }; });
    assert.equal(store.read().children.sprout.voice, null);
    fs.writeFileSync(path.join(directory, 'store.json'), JSON.stringify({
      version: 1, children: { sprout: { voice } }, turns: {},
    }));
    assert.equal(createStore(directory).read().children.sprout.voice, null);
  }
});
