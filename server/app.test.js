import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { createApp } from './app.js';
import { hint } from './hints.js';
import { SKILLS } from '../rulebook/index.js';
import * as realCoach from '../coach/index.js';
import { gradeLine as realGradeLine } from '../grader/index.js';
import { cardLabels } from '../rulebook/voice-card.js';
import { join, silence, utterance, wav } from '../ear/synth-for-tests.js';
import { measureVowel, pairsApart, soundIslands } from '../ear/meter.js';
import { VOWEL_IDS, fitsVowels } from '../rulebook/vowels.js';
import { voiceCardFor } from '../rulebook/voice-card.js';

const PIN = '2468';
const auth = { 'x-teacher-pin': PIN };
const privateReason = 'PRIVATE_MODEL_REASON';
const privateHeard = 'PRIVATE_HEARD_SOUND';
const betKamatz = 'letter:bet|vowel:kamatz';
const betPatach = 'letter:bet|vowel:patach';
const items = [
  ...Array.from({ length: 6 }, (_, i) => ({ id: `kamatz-${i}`, level: i < 3 ? 1 : 2,
    text: 'בָּ', words: ['בָּ'], skills: ['letter:bet', 'vowel:kamatz'], focus: 'vowel:kamatz', flags: [], source: { generated: true } })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: `patach-${i}`, level: i < 3 ? 1 : 2,
    text: 'בַּ', words: ['בַּ'], skills: ['letter:bet', 'vowel:patach'], focus: 'vowel:patach', flags: [], source: { generated: true } })),
  { id: 'vet', level: 1, text: 'בָ', words: ['בָ'], skills: ['letter:vet', 'vowel:kamatz'], focus: 'letter:vet', flags: [], source: { generated: true } },
  { id: 'higher', level: 3, text: 'מִי', words: ['מִי'], skills: ['letter:mem', 'vowel:chirik', 'pattern:chirik_male'], focus: 'vowel:chirik', flags: [], source: { generated: true } },
  { id: 'challenge', level: 4, text: 'בָּבַּ', words: ['בָּבַּ'], skills: ['letter:bet', 'vowel:kamatz', 'vowel:patach'], focus: 'vowel:kamatz', flags: [], source: { generated: true, challenge: true } },
];

function gradeFor(verdict = 'ok', skills = ['letter:bet', 'vowel:kamatz']) {
  const summary = { pairs: 1, ok: 0, wrong_letter: 0, wrong_vowel: 0, skipped: 0, extra: 0, uncertain: 0, not_decoded: 0, missedSkills: [] };
  summary[verdict] = 1;
  if (verdict !== 'ok') summary.missedSkills = [skills.find(skill => skill.startsWith('vowel:')) || skills[0]];
  return {
    words: [{ text: 'בָּ', pairs: [{ text: 'בָּ', verdict, heard: privateHeard, expected: ['ba'], skills }] }],
    verdicts: [{ word: 0, pair: 0, text: 'בָּ', verdict, heard: privateHeard, expected: ['ba'], skills }], summary,
  };
}

function selection(profile, changes = {}) {
  return {
    itemIds: ['kamatz-0', 'kamatz-1'], level: profile.level, profile: { ...profile, checkpoints: (profile.checkpoints || 0) + 1 },
    decision: { move: 'hold', from: profile.level, level: profile.level, target: 'vowel:kamatz', why: 'practice', misses: [], challengeId: null },
    done: false, reason: privateReason, source: 'rule', ...changes,
  };
}

let root, staticDir;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-api-test-'));
  staticDir = path.join(root, 'static');
  fs.mkdirSync(staticDir);
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<main>Station</main>');
  fs.writeFileSync(path.join(staticDir, 'app.js'), 'window.station = true;');
  fs.symlinkSync(fileURLToPath(import.meta.url), path.join(staticDir, 'outside.js'));
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

test('API fixtures use the system temp folder', () => {
  assert.equal(fs.realpathSync(path.dirname(root)), fs.realpathSync(os.tmpdir()));
});

function setup(overrides = {}) {
  const dependencies = {
    items, staticDir, teacherPin: PIN, trace: false, coachModel: undefined,
    dataDir: overrides.dataDir || fs.mkdtempSync(path.join(root, 'data-')),
    listen: mock.fn(async () => ({ words: [['ba']], model: 'fake-ear' })),
    gradeLine: mock.fn(() => gradeFor()),
    startProfile: mock.fn(({ level }) => ({ level })),
    startTurn: mock.fn(profile => structuredClone(profile)),
    chooseNextSet: mock.fn(async profile => selection(profile)),
    explain: mock.fn(() => 'Keep practicing these sounds.'),
    turnFacts: mock.fn(() => ({ best: 'letter:bet', next: 'vowel:kamatz', proven: [] })),
    ...overrides,
  };
  return { app: createApp(dependencies), ...dependencies };
}

async function request(app, url, { method = 'POST', data, type = 'application/json', headers = {} } = {}) {
  const req = data instanceof Readable ? data : Readable.from([
    Buffer.isBuffer(data) ? data : Buffer.from(data === undefined ? '' : JSON.stringify(data)),
  ]);
  Object.assign(req, { method, url, headers: { 'content-type': type, ...headers } });
  const response = {};
  const res = {
    headersSent: false,
    writeHead(status, values) { response.status = status; response.headers = values; this.headersSent = true; },
    end(value) { response.body = value?.toString() || ''; },
  };
  await app(req, res);
  if (response.headers['Content-Type'].includes('application/json')) response.json = JSON.parse(response.body);
  return response;
}

const get = (app, url, headers = {}) => request(app, url, { method: 'GET', headers });
const teacherGet = (app, url) => get(app, url, auth);
async function add(app, fields = {}) {
  const response = await request(app, '/api/children', { headers: auth,
    data: { name: 'Sprout', avatar: 'owl', preset: 'sephardi', ...fields } });
  assert.equal(response.status, 200, response.body);
  return response.json;
}
async function start(app, childId) {
  const response = await request(app, '/api/start', { data: { childId } });
  assert.equal(response.status, 200, response.body);
  return response.json;
}
const grade = (app, turnId, item = 'kamatz-0', options = {}) => request(app, `/api/grade?turn=${turnId}&item=${item}`,
  { type: 'audio/wav', data: Buffer.from('FAKE_AUDIO_BYTES'), ...options });
const checkpoints = new WeakMap();
async function next(app, turnId, elapsedMs = 1200) {
  if (!checkpoints.has(app)) checkpoints.set(app, new Map());
  const counts = checkpoints.get(app);
  const checkpoint = (counts.get(turnId) || 0) + 1;
  const response = await request(app, '/api/next', { data: { turnId, elapsedMs, checkpoint } });
  if (response.status === 200) counts.set(turnId, checkpoint);
  return response;
}
const finish = (app, turnId, stars = 3) => request(app, '/api/finish', { data: { turnId, stars } });
const patch = (app, id, data) => request(app, `/api/children/${id}`, { method: 'PATCH', headers: auth, data });
const disk = dataDir => JSON.parse(fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8'));

test('children validate learned vowels and reject sets with no regular lines', async () => {
  const { app, dataDir } = setup();
  const child = await add(app);
  assert.deepEqual(child.vowels, VOWEL_IDS);
  assert.equal(child.voiceStatus, 'needed');
  for (const vowels of [null, [], ['kamatz', 'kamatz'], ['unknown'], 'kamatz', [1]]) {
    const created = await request(app, '/api/children', { headers: auth,
      data: { name: 'Sprout', avatar: 'owl', preset: 'sephardi', vowels } });
    const edited = await patch(app, child.id, { vowels });
    for (const response of [created, edited]) {
      assert.equal(response.status, 400);
      assert.deepEqual(response.json, { error: 'Invalid vowels' });
    }
  }
  for (const method of ['POST', 'PATCH']) {
    const response = await request(app, method === 'POST' ? '/api/children' : `/api/children/${child.id}`,
      { method, headers: auth, data: method === 'POST'
        ? { name: 'Sprout', avatar: 'owl', preset: 'sephardi', vowels: ['chataf'] } : { vowels: ['chataf'] } });
    assert.equal(response.status, 400);
    assert.deepEqual(response.json, { error: 'No lines for these vowels' });
  }
  const challengeOnly = setup({ items: [items.at(-1)] });
  const rejected = await request(challengeOnly.app, '/api/children', { headers: auth,
    data: { name: 'Sprout', avatar: 'owl', preset: 'sephardi', vowels: ['kamatz', 'patach'] } });
  assert.equal(rejected.status, 400);
  assert.deepEqual(rejected.json, { error: 'No lines for these vowels' });
  assert.equal(Object.keys(disk(dataDir).children).length, 1);
  assert.deepEqual((await patch(app, child.id, { vowels: ['patach', 'kamatz'] })).json.vowels, ['kamatz', 'patach']);
});

test('create and edits snap levels to regular eligible lines and keep coach levels in step', async () => {
  const bank = [
    { ...items[0], id: 'two', level: 2 },
    { ...items[6], id: 'four', level: 4 },
    { ...items.at(-2), id: 'six', level: 6 },
  ];
  const { app, dataDir } = setup({ ...realCoach, items: bank, coachModel: 'off' });
  const child = await add(app, { vowels: ['kamatz'] });
  assert.equal(child.level, 2);
  assert.equal((await patch(app, child.id, { level: 6 })).json.level, 2);
  assert.deepEqual(disk(dataDir).children[child.id].profile, realCoach.startProfile({ level: 2 }));
  const turn = await start(app, child.id);
  await grade(app, turn.turnId, 'two');
  await next(app, turn.turnId);
  await finish(app, turn.turnId);
  const learned = disk(dataDir).children[child.id].profile;
  assert.ok(learned.skills['vowel:kamatz']);
  await patch(app, child.id, { vowels: ['chirik'] });
  assert.equal(disk(dataDir).children[child.id].level, 6);
  assert.deepEqual(disk(dataDir).children[child.id].profile, { ...learned, level: 6 });
  await patch(app, child.id, { vowels: VOWEL_IDS });
  assert.equal((await patch(app, child.id, { level: 3 })).json.level, 2);
  const saved = disk(dataDir).children[child.id].profile;
  assert.deepEqual(saved, realCoach.startProfile({ level: 2 }));
  await patch(app, child.id, { vowels: ['patach'] });
  const after = disk(dataDir).children[child.id];
  assert.equal(after.level, 4);
  assert.deepEqual(after.profile, { ...saved, level: 4 });
  await patch(app, child.id, { level: 5 });
  assert.equal(disk(dataDir).children[child.id].profile.level, 4);
});

test('kamatz practice, fallback start, progress map and packets only use eligible lines', async () => {
  const bank = JSON.parse(fs.readFileSync(new URL('../bank/items.json', import.meta.url), 'utf8'));
  const { app } = setup({ ...realCoach, items: bank, coachModel: 'off', gradeLine: realGradeLine });
  const child = await add(app, { vowels: ['kamatz'] });
  const turn = await start(app, child.id);
  let set = turn.set;
  for (let checkpoint = 1; checkpoint <= 3; checkpoint++) {
    assert.ok(set.length);
    assert.ok(set.every(item => fitsVowels(item, ['kamatz'])));
    for (const item of set) assert.equal((await grade(app, turn.turnId, item.id)).status, 200);
    const response = await next(app, turn.turnId);
    assert.equal(response.status, 200);
    set = response.json.set;
  }
  const map = (await teacherGet(app, `/api/children/${child.id}/detail`)).json.map;
  assert.deepEqual(map.vowels, ['vowel:kamatz']);
  const packet = (await teacherGet(app, `/api/packet?child=${child.id}`)).json;
  const packetIds = packet.sections.flatMap(section => section.items.map(item => item.id));
  assert.ok(packetIds.length);
  assert.ok(packetIds.every(id => fitsVowels(bank.find(item => item.id === id), ['kamatz'])));
  const fallback = setup({ ...realCoach, items: bank,
    chooseNextSet: async profile => ({ ...selection(profile), done: true, itemIds: [] }) });
  const other = await add(fallback.app, { vowels: ['kamatz'] });
  assert.ok((await start(fallback.app, other.id)).set.every(item => fitsVowels(item, ['kamatz'])));
  const classPacket = (await teacherGet(app, '/api/packet?skill=vowel:kamatz&level=4')).json;
  assert.ok(classPacket.sections.flatMap(section => section.items).every(item => !bank.find(entry => entry.id === item.id).source.beginner));
});

test('full-set and legacy children receive the original start and next sets', async () => {
  const bank = JSON.parse(fs.readFileSync(new URL('../bank/items.json', import.meta.url), 'utf8'));
  const original = bank.filter(item => !item.source.beginner);
  for (const legacy of [false, true]) {
    const { app, dataDir } = setup({ ...realCoach, items: bank, coachModel: 'off' });
    const child = await add(app, { vowels: [...VOWEL_IDS].reverse() });
    let serving = app;
    if (legacy) {
      const saved = disk(dataDir);
      delete saved.children[child.id].vowels;
      fs.writeFileSync(path.join(dataDir, 'store.json'), JSON.stringify(saved));
      serving = setup({ ...realCoach, items: bank, dataDir, coachModel: 'off' }).app;
    }
    assert.deepEqual((await get(serving, '/api/children')).json[0].vowels, VOWEL_IDS);
    const expected = await realCoach.chooseNextSet(realCoach.startProfile(), [], original, { useModel: false });
    const turn = await start(serving, child.id);
    assert.deepEqual(turn.set.map(item => item.id), expected.itemIds);
    for (const item of turn.set) await grade(serving, turn.turnId, item.id);
    const results = turn.set.map(item => ({ itemId: item.id, ...gradeFor() }));
    const expectedNext = await realCoach.chooseNextSet(expected.profile, results, original, { useModel: false });
    const response = await next(serving, turn.turnId);
    assert.deepEqual(response.json.set.map(item => item.id), expectedNext.itemIds);
  }
});

test('voice status, skip, delete and successful subset recording follow the learned card', async () => {
  const { app, dataDir } = setup();
  const child = await add(app, { preset: 'ashkenazi', vowels: ['kamatz', 'patach'] });
  assert.equal(child.voiceStatus, 'needed');
  assert.equal(child.voiceCheck, false);
  const route = `/api/children/${child.id}/voice`;
  for (const headers of [{}, { 'x-teacher-pin': '9999' }]) {
    assert.equal((await request(app, route, { method: 'PUT', headers, data: { skipped: true } })).status, 403);
  }
  for (const data of [{}, { skipped: false }, { skipped: 1 }, { skipped: true, extra: true }]) {
    assert.equal((await request(app, route, { method: 'PUT', headers: auth, data })).status, 400);
  }
  const skip = () => request(app, route, { method: 'PUT', headers: auth, data: { skipped: true } });
  const skipped = await skip();
  assert.equal(skipped.status, 200);
  assert.equal(skipped.json.voiceStatus, 'skipped');
  assert.equal(skipped.json.voiceCheck, true);
  assert.equal(disk(dataDir).children[child.id].voiceSkipped, true);
  const card = voiceCardFor(child.vowels, child.preset);
  assert.equal(card.length, 12);
  const data = wav(utterance(cardLabels(child.preset, card)));
  assert.equal((await voice(app, child, { data })).status, 200);
  assert.deepEqual(Object.keys(disk(dataDir).children[child.id].voice.vowels).sort(), ['a', 'o']);
  assert.equal(Object.hasOwn(disk(dataDir).children[child.id], 'voiceSkipped'), false);
  assert.equal((await get(app, '/api/children')).json[0].voiceStatus, 'done');
  await skip();
  assert.equal(disk(dataDir).children[child.id].voice, null);
  const cleared = await request(app, route, { method: 'DELETE', headers: auth });
  assert.equal(cleared.json.voiceStatus, 'needed');
  assert.equal(cleared.json.voiceCheck, false);
  assert.equal(Object.hasOwn(disk(dataDir).children[child.id], 'voiceSkipped'), false);
  const mismatch = await voice(app, child, { data: wav(utterance(['a', 'a'])) });
  assert.equal(mismatch.status, 422);
  assert.deepEqual(mismatch.json, { error: 'count', heard: 2, expected: 12 });
});

for (const [change, vowels, fields, error] of [
  ['vowels with the same card length', ['kamatz', 'patach'], { vowels: ['patach', 'segol'] }, 'Voice card changed'],
  ['preset with the same card syllables', ['kamatz', 'segol', 'chirik'], { preset: 'sephardi' }, 'Voice card changed'],
  ['vowels that remove the card', ['kamatz', 'patach'], { vowels: ['kamatz'] }, 'No voice check'],
]) {
  test(`an open voice upload rejects changed ${change} without saving or clearing a skip`, async () => {
    for (const skipped of [false, true]) {
      const { app, dataDir } = setup();
      const child = await add(app, { preset: 'ashkenazi', vowels });
      if (skipped) {
        await request(app, `/api/children/${child.id}/voice`, { method: 'PUT', headers: auth, data: { skipped: true } });
      }
      const card = voiceCardFor(child.vowels, child.preset);
      const data = wav(utterance(cardLabels(child.preset, card)));
      const entered = deferred();
      const req = new Readable({ read() { entered.resolve(); } });
      Object.assign(req, { method: 'POST', url: `/api/voice?child=${child.id}`, headers: { 'content-type': 'audio/wav' } });
      let status, body;
      const pending = app(req, { writeHead(code) { status = code; }, end(value) { body = JSON.parse(value); } });
      await Promise.race([entered.promise, pending.then(() => { throw new Error('Upload ended before reading audio'); })]);
      const edited = await patch(app, child.id, fields);
      assert.equal(edited.status, 200);
      const updatedCard = voiceCardFor(edited.json.vowels, edited.json.preset);
      if (error === 'Voice card changed') assert.equal(updatedCard.length, card.length);
      if (fields.preset) {
        assert.deepEqual(updatedCard, card);
        assert.notDeepEqual(cardLabels(edited.json.preset, updatedCard), cardLabels(child.preset, card));
      }
      req.push(data);
      req.push(null);
      await pending;
      assert.equal(status, 409);
      assert.deepEqual(body, { error });
      const saved = disk(dataDir).children[child.id];
      assert.equal(saved.voice, null);
      assert.equal(saved.voiceSkipped, skipped ? true : undefined);
      assert.equal((await get(app, '/api/children')).json[0].voiceStatus,
        error === 'No voice check' ? 'none' : skipped ? 'skipped' : 'needed');
    }
  });
}

test('a child with no measurable card returns 409 without consuming the audio', async () => {
  const bank = [{ ...items[0], id: 'cholam', text: 'בֹּ', skills: ['vowel:cholam'] }];
  const { app } = setup({ items: bank });
  const child = await add(app, { preset: 'ashkenazi', vowels: ['cholam'] });
  assert.equal(child.voiceStatus, 'none');
  assert.equal(child.voiceCheck, true);
  const req = new Readable({ read() { throw new Error('Audio must not be read'); } });
  Object.assign(req, { method: 'POST', url: `/api/voice?child=${child.id}`, headers: { 'content-type': 'audio/wav' } });
  let status, body;
  await app(req, { writeHead(code) { status = code; }, end(value) { body = JSON.parse(value); } });
  assert.equal(status, 409);
  assert.deepEqual(body, { error: 'No voice check' });
});

test('an Ashkenazi kamatz-only child needs no voice check and returns 409 without consuming the audio', async () => {
  const { app, dataDir, listen } = setup();
  const child = await add(app, { preset: 'ashkenazi', vowels: ['kamatz'] });
  assert.equal(child.voiceStatus, 'none');
  assert.equal(child.voiceCheck, true);
  assert.deepEqual((await get(app, '/api/children')).json, [child]);
  const read = mock.fn(() => { throw new Error('Audio must not be read'); });
  const req = new Readable({ read });
  Object.assign(req, { method: 'POST', url: `/api/voice?child=${child.id}`, headers: { 'content-type': 'audio/wav' } });
  let status, body;
  await app(req, { writeHead(code) { status = code; }, end(value) { body = JSON.parse(value); } });
  assert.equal(status, 409);
  assert.deepEqual(body, { error: 'No voice check' });
  assert.equal(read.mock.callCount(), 0);
  assert.equal(listen.mock.callCount(), 0);
  assert.equal(disk(dataDir).children[child.id].voice, null);
});

test('a vowel change clears voice and live turns, keeps skip, and the same normalized set preserves them', async () => {
  const { app, dataDir } = setup();
  const child = await add(app);
  await voice(app, child);
  const first = await start(app, child.id);
  await patch(app, child.id, { vowels: [...VOWEL_IDS].reverse() });
  assert.ok(disk(dataDir).children[child.id].voice);
  assert.equal((await grade(app, first.turnId)).status, 200);
  await patch(app, child.id, { vowels: ['kamatz'] });
  assert.equal(disk(dataDir).children[child.id].voice, null);
  assert.equal((await grade(app, first.turnId)).status, 404);
  await request(app, `/api/children/${child.id}/voice`, { method: 'PUT', headers: auth, data: { skipped: true } });
  const live = await start(app, child.id);
  const changed = await patch(app, child.id, { vowels: ['patach'] });
  assert.equal(changed.json.voiceStatus, 'none');
  assert.equal(changed.json.voiceCheck, true);
  assert.equal(disk(dataDir).children[child.id].voiceSkipped, true);
  assert.equal((await next(app, live.turnId)).status, 404);
});

test('skipping a saved voice profile grades through the ear alone', async () => {
  const item = { ...items[0], id: 'baruch', text: 'בָּרוּךְ', words: ['בָּרוּךְ'] };
  const { app } = setup({ ...realCoach, items: [item], coachModel: 'off',
    listen: async () => ({ words: [['ba', 'ruch']] }), gradeLine: realGradeLine });
  const child = await add(app, { preset: 'ashkenazi' });
  await voice(app, child);
  const turn = await start(app, child.id);
  const data = wav(utterance(['o', 'u']));
  assert.equal((await grade(app, turn.turnId, item.id, { data })).json.summary.wrong_vowel, 0);
  await request(app, `/api/children/${child.id}/voice`, { method: 'PUT', headers: auth, data: { skipped: true } });
  assert.equal((await grade(app, turn.turnId, item.id, { data })).json.summary.wrong_vowel, 1);
});

test('packet default focus comes from eligible items when the coach has no next skill', async () => {
  const bank = [items[6], { ...items[0], id: 'z-beginner', source: { generated: true, beginner: true } },
    { ...items[0], id: 'a-letter', focus: 'letter:bet' }];
  const { app } = setup({ items: bank, turnFacts: () => ({ best: null, next: null, proven: [] }) });
  const child = await add(app, { vowels: ['kamatz'] });
  const packet = (await teacherGet(app, `/api/packet?child=${child.id}`)).json;
  assert.deepEqual(packet.sections[1].items.map(item => item.id), ['z-beginner', 'a-letter']);
});

test('pending starts and checkpoints cannot survive a learned-vowel change', async () => {
  for (const operation of ['start', 'next']) {
    const entered = deferred(), release = deferred();
    let calls = 0;
    const { app, dataDir } = setup({ chooseNextSet: async profile => {
      if (++calls === (operation === 'start' ? 1 : 2)) { entered.resolve(); await release.promise; }
      return selection(profile);
    } });
    const child = await add(app);
    const turn = operation === 'next' ? await start(app, child.id) : null;
    const pending = operation === 'start' ? request(app, '/api/start', { data: { childId: child.id } })
      : request(app, '/api/next', { data: { turnId: turn.turnId, checkpoint: 1, elapsedMs: 10 } });
    await entered.promise;
    assert.equal((await patch(app, child.id, { vowels: ['kamatz'] })).status, 200);
    const saved = disk(dataDir);
    release.resolve();
    assert.equal((await pending).status, 404);
    assert.deepEqual(disk(dataDir), saved);
  }
});

const voiceAudio = preset => wav(utterance(cardLabels(preset).map(label => label || 'o')));
const voice = (app, child, options = {}) => request(app, `/api/voice?child=${child.id}`,
  { type: 'audio/wav', data: voiceAudio(child.preset), ...options });

function openVoiceUpload(app, child, data = voiceAudio(child.preset)) {
  const entered = deferred(), release = deferred();
  const stream = Readable.from((async function* () {
    yield data.subarray(0, 44);
    entered.resolve();
    await release.promise;
    yield data.subarray(44);
  })());
  return { entered: entered.promise, release: release.resolve, response: voice(app, child, { data: stream }) };
}

test('voice check saves only version, numeric vowels and spread, with a public boolean child view', async () => {
  const { app, dataDir, listen } = setup();
  const child = await add(app);
  assert.equal(child.voiceCheck, false);
  const files = fs.readdirSync(dataDir, { recursive: true }).sort();
  const card = voiceAudio(child.preset);
  const response = await voice(app, child, { data: card });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { voiceCheck: true });
  assert.equal(listen.mock.callCount(), 0);
  const saved = disk(dataDir);
  const profile = saved.children[child.id].voice;
  assert.deepEqual(Object.keys(profile), ['version', 'vowels', 'spread']);
  assert.equal(profile.version, 2);
  assert.ok(Number.isFinite(profile.spread) && profile.spread >= 0);
  assert.deepEqual(Object.keys(profile.vowels), ['a', 'o', 'e', 'i']);
  for (const value of Object.values(profile.vowels)) {
    assert.deepEqual(Object.keys(value), ['f1', 'f2', 'n']);
    assert.ok(Object.values(value).every(Number.isFinite));
    assert.ok(value.n >= 2 && value.n <= 15);
  }
  assert.doesNotMatch(JSON.stringify(saved), /audio|RIFF|transcript|heard|base64/i);
  assert.deepEqual(fs.readdirSync(dataDir, { recursive: true }).sort(), files);
  assert.deepEqual((await get(app, '/api/children')).json, [{ ...child, voiceCheck: true, voiceStatus: 'done' }]);
  assert.deepEqual((await teacherGet(app, `/api/children/${child.id}/detail`)).json.child,
    { ...child, voiceCheck: true, voiceStatus: 'done' });
  const turn = await start(app, child.id);
  const data = Buffer.from('reading fixture');
  assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(listen.mock.calls.at(-1).arguments,
    [{ data, format: 'wav' }, { reference: { data: card, format: 'wav' } }]);
});

test('voice check uses the child preset for labels', async () => {
  const { app, dataDir } = setup();
  const child = await add(app, { preset: 'ashkenazi' });
  assert.equal((await voice(app, child)).status, 200);
  const vowels = disk(dataDir).children[child.id].voice.vowels;
  assert.equal(vowels.a.n, 3);
  assert.equal(vowels.o.n, 3);
  assert.ok(vowels.a.f1 > vowels.o.f1);
});

test('voice count mismatch returns heard and expected without saving audio or a profile', async () => {
  const { app, dataDir } = setup();
  const child = await add(app);
  const response = await voice(app, child, { data: wav(utterance(['a', 'o'])) });
  assert.equal(response.status, 422);
  assert.deepEqual(response.json, { error: 'count', heard: 2, expected: 15 });
  assert.equal(disk(dataDir).children[child.id].voice, null);
});

test('a failed voice check creates no card and preserves an earlier card and profile', async () => {
  const { app, dataDir, listen } = setup();
  const child = await add(app);
  const invalid = wav(utterance(['a', 'o']));
  assert.equal((await voice(app, child, { data: invalid })).status, 422);
  assert.deepEqual(fs.readdirSync(dataDir), ['store.json']);
  const turn = await start(app, child.id);
  const reading = { data: Buffer.from('reading fixture'), format: 'wav' };
  assert.equal((await grade(app, turn.turnId, 'kamatz-0', reading)).status, 200);
  assert.deepEqual(listen.mock.calls.at(-1).arguments, [reading]);
  const card = voiceAudio(child.preset);
  assert.equal((await voice(app, child, { data: card })).status, 200);
  for (const [data, status] of [[invalid, 422], [Buffer.from('invalid WAV'), 415], [Buffer.alloc(0), 400]]) {
    const saved = fs.readFileSync(path.join(dataDir, 'store.json'));
    assert.equal((await voice(app, child, { data })).status, status);
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'store.json')), saved);
    assert.equal((await grade(app, turn.turnId, 'kamatz-0', reading)).status, 200);
    assert.deepEqual(listen.mock.calls.at(-1).arguments, [reading, { reference: { data: card, format: 'wav' } }]);
    assert.deepEqual(fs.readdirSync(dataDir), ['store.json']);
  }
});

test('a failed profile save leaves the in-memory recording unchanged', async t => {
  const { app, dataDir, listen } = setup();
  const child = await add(app);
  const card = voiceAudio(child.preset);
  const replacement = wav(join([silence(0.1), utterance(cardLabels(child.preset))]));
  const turn = await start(app, child.id);
  const reading = { data: Buffer.from('reading fixture'), format: 'wav' };
  for (const hasCard of [false, true]) {
    if (hasCard) assert.equal((await voice(app, child, { data: card })).status, 200);
    const saved = fs.readFileSync(path.join(dataDir, 'store.json'));
    const rename = t.mock.method(fs.promises, 'rename', async () => { throw new Error('offline write failure'); });
    assert.equal((await voice(app, child, { data: replacement })).status, 500);
    rename.mock.restore();
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'store.json')), saved);
    assert.deepEqual(fs.readdirSync(dataDir), ['store.json']);
    assert.equal((await grade(app, turn.turnId, 'kamatz-0', reading)).status, 200);
    assert.deepEqual(listen.mock.calls.at(-1).arguments,
      hasCard ? [reading, { reference: { data: card, format: 'wav' } }] : [reading]);
  }
});

test('a restart needs a new recording before grading sends the voice card again', async () => {
  const { app, dataDir, listen } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  const data = Buffer.from('reading fixture');
  const plain = [{ data, format: 'wav' }];
  assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(listen.mock.calls.at(-1).arguments, plain);
  assert.equal((await voice(app, child)).status, 200);
  const reference = { data: voiceAudio(child.preset), format: 'wav' };
  assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(listen.mock.calls.at(-1).arguments, [...plain, { reference }]);
  const reloaded = setup({ dataDir });
  const views = [
    (await get(reloaded.app, '/api/children')).json[0],
    (await teacherGet(reloaded.app, `/api/children/${child.id}/detail`)).json.child,
    (await patch(reloaded.app, child.id, { name: 'Pebble' })).json,
  ];
  for (const view of views) {
    assert.equal(view.voiceStatus, 'needed');
    assert.equal(view.voiceCheck, false);
  }
  const restarted = await start(reloaded.app, child.id);
  assert.equal((await grade(reloaded.app, restarted.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(reloaded.listen.mock.calls.at(-1).arguments, plain);
  const finished = await finish(reloaded.app, restarted.turnId);
  assert.equal(finished.json.child.voiceStatus, 'needed');
  assert.equal(finished.json.child.voiceCheck, false);
  assert.equal((await voice(reloaded.app, child)).status, 200);
  const recorded = (await get(reloaded.app, '/api/children')).json[0];
  assert.equal(recorded.voiceStatus, 'done');
  assert.equal(recorded.voiceCheck, true);
  const reread = await start(reloaded.app, child.id);
  assert.equal((await grade(reloaded.app, reread.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(reloaded.listen.mock.calls.at(-1).arguments, [...plain, { reference }]);
  assert.equal((await finish(reloaded.app, reread.turnId)).json.child.voiceStatus, 'done');
});

for (const apart of [true, false]) {
  test(`grading ${apart ? 'sends a separated card from memory' : 'omits a merged card before and after restart'}`, async () => {
    const { app, dataDir, listen } = setup();
    const child = await add(app, { preset: 'ashkenazi' });
    assert.equal((await voice(app, child)).status, 200);
    const card = wav(utterance(cardLabels(child.preset).map(label => !apart && label === 'o' ? 'a' : label || 'o')));
    assert.equal((await voice(app, child, { data: card })).status, 200);
    assert.equal(pairsApart(disk(dataDir).children[child.id].voice), apart);
    assert.equal((await get(app, '/api/children')).json[0].voiceStatus, 'done');
    const turn = await start(app, child.id);
    const data = Buffer.from('reading fixture');
    assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
    const expected = [{ data, format: 'wav' }];
    if (apart) expected.push({ reference: { data: card, format: 'wav' } });
    assert.deepEqual(listen.mock.calls.at(-1).arguments, expected);
    const reloaded = setup({ dataDir });
    const view = (await get(reloaded.app, '/api/children')).json[0];
    assert.equal(view.voiceStatus, apart ? 'needed' : 'done');
    assert.equal(view.voiceCheck, !apart);
    const restarted = await start(reloaded.app, child.id);
    assert.equal((await grade(reloaded.app, restarted.turnId, 'kamatz-0', { data })).status, 200);
    assert.deepEqual(reloaded.listen.mock.calls.at(-1).arguments, [{ data, format: 'wav' }]);
  });
}

for (const [name, fields] of [
  ['Chassidish card with unmeasured kamatz', { preset: 'chassidish' }],
  ['Ashkenazi card without patach', { preset: 'ashkenazi', vowels: ['kamatz', 'segol', 'chirik'] }],
]) {
  test(`grading omits a separated ${name} before and after restart`, async () => {
    const { app, dataDir, listen } = setup();
    const child = await add(app, fields);
    const card = voiceCardFor(child.vowels, child.preset);
    const cardData = wav(utterance(cardLabels(child.preset, card).map(label => label || 'o')));
    assert.equal((await voice(app, child, { data: cardData })).status, 200);
    assert.equal(pairsApart(disk(dataDir).children[child.id].voice), true);
    assert.equal((await get(app, '/api/children')).json[0].voiceStatus, 'done');
    const turn = await start(app, child.id);
    const data = Buffer.from('reading fixture');
    assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
    assert.deepEqual(listen.mock.calls.at(-1).arguments, [{ data, format: 'wav' }]);
    const reloaded = setup({ dataDir });
    const views = [(await get(reloaded.app, '/api/children')).json[0],
      (await teacherGet(reloaded.app, `/api/children/${child.id}/detail`)).json.child];
    for (const view of views) {
      assert.equal(view.voiceStatus, 'done');
      assert.equal(view.voiceCheck, true);
    }
    const restarted = await start(reloaded.app, child.id);
    assert.equal((await grade(reloaded.app, restarted.turnId, 'kamatz-0', { data })).status, 200);
    assert.deepEqual(reloaded.listen.mock.calls.at(-1).arguments, [{ data, format: 'wav' }]);
  });
}

for (const removal of ['clear', 'skip', 'vowels', 'preset', 'child']) {
  test(`${removal} drops the in-memory voice card`, async t => {
    const { app, listen } = setup();
    const child = await add(app);
    assert.equal((await voice(app, child)).status, 200);
    const turn = await start(app, child.id);
    const data = Buffer.from('reading fixture');
    assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
    assert.deepEqual(listen.mock.calls.at(-1).arguments,
      [{ data, format: 'wav' }, { reference: { data: voiceAudio(child.preset), format: 'wav' } }]);
    const remove = () => removal === 'vowels' ? patch(app, child.id, { vowels: ['kamatz'] })
      : removal === 'preset' ? patch(app, child.id, { preset: 'ashkenazi' })
        : request(app, `/api/children/${child.id}${removal === 'child' ? '' : '/voice'}`, {
          method: removal === 'skip' ? 'PUT' : 'DELETE', headers: auth,
          ...(removal === 'skip' ? { data: { skipped: true } } : {}),
        });
    if (removal === 'child') {
      // A removed child cannot grade, so observe deletion of its buffered entry.
      const removed = [];
      const originalDelete = Map.prototype.delete;
      const deletion = t.mock.method(Map.prototype, 'delete', function(id) {
        const isCard = id === child.id && Buffer.isBuffer(this.get(id));
        const result = originalDelete.call(this, id);
        if (isCard) removed.push({ deleted: result, stillPresent: this.has(id) });
        return result;
      });
      assert.equal((await remove()).status, 200);
      deletion.mock.restore();
      assert.deepEqual(removed, [{ deleted: true, stillPresent: false }]);
      assert.deepEqual((await get(app, '/api/children')).json, []);
      assert.equal((await teacherGet(app, `/api/children/${child.id}/detail`)).status, 404);
      assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 404);
      assert.equal(listen.mock.callCount(), 1);
      assert.equal((await remove()).status, 404);
    } else {
      assert.equal((await remove()).status, 200);
      const after = await start(app, child.id);
      assert.equal((await grade(app, after.turnId, 'kamatz-0', { data })).status, 200);
      assert.deepEqual(listen.mock.calls.at(-1).arguments, [{ data, format: 'wav' }]);
      assert.equal((await remove()).status, 200);
    }
  });
}

test('same vowels, same preset and unrelated edits keep the voice card', async () => {
  const { app, listen } = setup();
  const child = await add(app);
  await voice(app, child);
  const edited = await patch(app, child.id, {
    vowels: [...VOWEL_IDS].reverse(), preset: child.preset, name: 'Pebble', avatar: 'fox', level: 2,
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.voiceStatus, 'done');
  const turn = await start(app, child.id);
  const data = Buffer.from('reading fixture');
  assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(listen.mock.calls.at(-1).arguments,
    [{ data, format: 'wav' }, { reference: { data: voiceAudio(child.preset), format: 'wav' } }]);
});

for (const change of ['clear', 'skip', 'vowel change', 'preset change']) {
  test(`a ${change} during an open voice upload leaves no recording behind`, async () => {
    const { app, dataDir, listen } = setup();
    const child = await add(app);
    const upload = openVoiceUpload(app, child);
    await upload.entered;
    let saved;
    try {
      const changed = change === 'vowel change' ? await patch(app, child.id, { vowels: ['kamatz', 'segol'] })
        : change === 'preset change' ? await patch(app, child.id, { preset: 'ashkenazi' })
          : await request(app, `/api/children/${child.id}/voice`, {
            method: change === 'skip' ? 'PUT' : 'DELETE', headers: auth,
            ...(change === 'skip' ? { data: { skipped: true } } : {}),
          });
      assert.equal(changed.status, 200);
      saved = fs.readFileSync(path.join(dataDir, 'store.json'));
    } finally {
      upload.release();
    }
    const response = await upload.response;
    assert.equal(response.status, 409);
    assert.deepEqual(response.json, { error: 'Voice card changed' });
    assert.deepEqual(fs.readFileSync(path.join(dataDir, 'store.json')), saved);
    assert.equal(disk(dataDir).children[child.id].voice, null);
    const view = (await get(app, '/api/children')).json[0];
    assert.equal(view.voiceStatus, change === 'skip' ? 'skipped' : 'needed');
    assert.equal(view.voiceCheck, change === 'skip');
    const turn = await start(app, child.id);
    const data = Buffer.from('reading fixture');
    assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
    assert.deepEqual(listen.mock.calls.at(-1).arguments, [{ data, format: 'wav' }]);
  });
}

test('Voice card changed leaves a newer in-memory recording and profile unchanged', async () => {
  const { app, dataDir, listen } = setup();
  const child = await add(app);
  assert.equal((await voice(app, child)).status, 200);
  const stale = wav(join([silence(0.1), utterance(cardLabels(child.preset))]));
  const current = wav(join([silence(0.2), utterance(cardLabels(child.preset))]));
  const upload = openVoiceUpload(app, child, stale);
  await upload.entered;
  let saved;
  try {
    assert.equal((await voice(app, child, { data: current })).status, 200);
    saved = fs.readFileSync(path.join(dataDir, 'store.json'));
  } finally {
    upload.release();
  }
  const response = await upload.response;
  assert.equal(response.status, 409);
  assert.deepEqual(response.json, { error: 'Voice card changed' });
  assert.deepEqual(fs.readFileSync(path.join(dataDir, 'store.json')), saved);
  assert.equal((await get(app, '/api/children')).json[0].voiceStatus, 'done');
  const turn = await start(app, child.id);
  const data = Buffer.from('reading fixture');
  assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(listen.mock.calls.at(-1).arguments,
    [{ data, format: 'wav' }, { reference: { data: current, format: 'wav' } }]);
});

test('an upload whose card disappears returns No voice check without saving anything', async () => {
  const { app, dataDir, listen } = setup();
  const child = await add(app);
  assert.equal((await voice(app, child)).status, 200);
  const upload = openVoiceUpload(app, child);
  await upload.entered;
  let saved;
  try {
    assert.equal((await patch(app, child.id, { vowels: ['kamatz'] })).status, 200);
    saved = fs.readFileSync(path.join(dataDir, 'store.json'));
  } finally {
    upload.release();
  }
  const response = await upload.response;
  assert.equal(response.status, 409);
  assert.deepEqual(response.json, { error: 'No voice check' });
  assert.deepEqual(fs.readFileSync(path.join(dataDir, 'store.json')), saved);
  assert.equal((await get(app, '/api/children')).json[0].voiceStatus, 'none');
  const turn = await start(app, child.id);
  const data = Buffer.from('reading fixture');
  assert.equal((await grade(app, turn.turnId, 'kamatz-0', { data })).status, 200);
  assert.deepEqual(listen.mock.calls.at(-1).arguments, [{ data, format: 'wav' }]);
});

test('invalid child ids and unknown children never reach any file operation', async t => {
  const { app } = setup();
  await add(app);
  const operations = ['readFile', 'writeFile', 'rename', 'rm', 'mkdir'].map(name =>
    t.mock.method(fs.promises, name, async () => { throw new Error('Unexpected file operation'); }));
  for (const id of ['bad_id', 'bad.wav', 'bad%2Fid', randomUUID()]) {
    const status = id.includes('-') ? 404 : 400;
    assert.equal((await voice(app, { id, preset: 'sephardi' })).status, status);
    for (const method of ['PUT', 'DELETE']) {
      assert.equal((await request(app, `/api/children/${id}/voice`, {
        method, headers: auth, data: { skipped: true },
      })).status, status);
    }
    assert.equal((await patch(app, id, { preset: 'ashkenazi' })).status, status);
    assert.equal((await request(app, `/api/children/${id}`, { method: 'DELETE', headers: auth })).status, status);
    assert.equal((await request(app, '/api/start', { data: { childId: id } })).status, status);
  }
  for (const operation of operations) assert.equal(operation.mock.callCount(), 0);
});

test('voice check rejects quiet and malformed WAV, wrong content type, empty and oversized audio', async () => {
  const { app } = setup();
  const child = await add(app);
  // A steady 100 Hz hum is voiced, so each one counts as a sound, but it has no vowel to measure.
  const hum = new Float64Array(4000).map((_, i) => 0.5 * Math.sin(2 * Math.PI * 100 * i / 16000));
  const quietSamples = join([silence(0.25), ...Array.from({ length: 15 }, () => [hum, silence(0.25)]).flat()]);
  const humIslands = soundIslands(quietSamples, 16000);
  assert.equal(humIslands.length, 15);
  assert.ok(humIslands.every(({ start, end }) => measureVowel(quietSamples, 16000, start, end) === null));
  const quiet = wav(quietSamples);
  // Unvoiced noise is not a sound at all, so a card of it hears nothing.
  const noise = new Float64Array(4000).map((_, i) => i % 2 ? 0.5 : -0.5);
  const noisy = wav(join([silence(0.25), ...Array.from({ length: 15 }, () => [noise, silence(0.25)]).flat()]));
  const heardNothing = await voice(app, child, { data: noisy });
  assert.equal(heardNothing.status, 422);
  assert.deepEqual(heardNothing.json, { error: 'count', heard: 0, expected: 15 });
  const wrongRate = voiceAudio(child.preset);
  wrongRate.writeUInt32LE(44100, 24);
  for (const [options, status, error] of [
    [{ data: quiet }, 422, 'quiet'],
    [{ data: Buffer.from('invalid WAV') }, 415, 'Use 16 kHz mono WAV'],
    [{ data: wrongRate }, 415, 'Use 16 kHz mono WAV'],
    [{ type: 'audio/webm' }, 415, 'Use audio/wav'],
    [{ data: Buffer.alloc(0) }, 400, 'Empty audio'],
    [{ headers: { 'content-length': String(25 * 1024 * 1024 + 1) } }, 413, 'Body too large'],
  ]) {
    const response = await voice(app, child, options);
    assert.equal(response.status, status);
    assert.deepEqual(response.json, { error });
  }
});

test('voice check and teacher voice deletion reject unknown children', async () => {
  const { app } = setup();
  const child = { id: randomUUID(), preset: 'sephardi' };
  assert.equal((await voice(app, child)).status, 404);
  assert.equal((await request(app, `/api/children/${child.id}/voice`, { method: 'DELETE', headers: auth })).status, 404);
});

test('grading uses the current voice profile, and falls back to ear words without one or usable WAV', async () => {
  const item = { ...items[0], id: 'baruch', text: 'בָּרוּךְ', words: ['בָּרוּךְ'] };
  const earWords = [['ba', 'ruch']];
  const listen = mock.fn(async audio => {
    assert.deepEqual(Object.keys(audio), ['data', 'format']);
    assert.equal(audio.format, 'wav');
    assert.ok(Buffer.isBuffer(audio.data));
    return { words: earWords };
  });
  const gradeLine = mock.fn(realGradeLine);
  const { app } = setup({ items: [item], listen, gradeLine,
    chooseNextSet: async profile => selection(profile, { itemIds: [item.id] }) });
  const child = await add(app, { preset: 'ashkenazi' });
  const turn = await start(app, child.id);
  const data = wav(utterance(['o', 'u']));
  const before = await grade(app, turn.turnId, item.id, { data });
  assert.equal(before.status, 200);
  assert.equal(before.json.summary.wrong_vowel, 1);
  assert.deepEqual(gradeLine.mock.calls.at(-1).arguments[0].heard, earWords);
  assert.equal((await voice(app, child)).status, 200);
  const metered = await grade(app, turn.turnId, item.id, { data });
  assert.equal(metered.status, 200);
  assert.equal(metered.json.summary.wrong_vowel, 0);
  assert.deepEqual(gradeLine.mock.calls.at(-1).arguments[0].heard, [['bo', 'ruch']]);
  const invalid = await grade(app, turn.turnId, item.id);
  assert.equal(invalid.status, 200);
  assert.equal(invalid.json.summary.wrong_vowel, 1);
  assert.deepEqual(earWords, [['ba', 'ruch']]);
  await request(app, `/api/children/${child.id}/voice`, { method: 'DELETE', headers: auth });
  assert.equal((await grade(app, turn.turnId, item.id, { data })).json.summary.wrong_vowel, 1);
});

test('a throwing meter still grades the ear words', async () => {
  const words = [null];
  const { app, gradeLine } = setup({ listen: async () => ({ words }) });
  const child = await add(app);
  const turn = await start(app, child.id);
  const response = await grade(app, turn.turnId, 'kamatz-0', { data: wav(utterance(['a'])) });
  assert.equal(response.status, 200);
  assert.equal(gradeLine.mock.calls[0].arguments[0].heard, words);
});

test('changing a preset clears voice, while same-preset and other edits retain it', async () => {
  const { app, dataDir } = setup();
  const child = await add(app);
  await voice(app, child);
  assert.equal((await patch(app, child.id, { preset: child.preset, avatar: 'fox', level: 2 })).json.voiceCheck, true);
  const changed = await patch(app, child.id, { preset: 'ashkenazi' });
  assert.equal(changed.json.voiceCheck, false);
  assert.equal(disk(dataDir).children[child.id].voice, null);
});

test('deleting voice needs the teacher PIN and returns only the child view', async () => {
  const { app, dataDir } = setup();
  const child = await add(app);
  await voice(app, child);
  for (const headers of [{}, { 'x-teacher-pin': '9999' }]) {
    assert.equal((await request(app, `/api/children/${child.id}/voice`, { method: 'DELETE', headers })).status, 403);
    assert.ok(disk(dataDir).children[child.id].voice);
  }
  const response = await request(app, `/api/children/${child.id}/voice`, { method: 'DELETE', headers: auth });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, child);
  assert.equal(disk(dataDir).children[child.id].voice, null);
});

test('round 2.1: six clean four-minute turns through the real app and coach all start and end by time', async () => {
  const bank = [1, 2, 3, 4, 5, 6].flatMap(level => ['a', 'b', 'c'].map(id =>
    ({ ...items[0], id: `${level}-${id}`, level })));
  const { app, dataDir } = setup({ ...realCoach, items: bank, gradeLine: realGradeLine, coachModel: 'off', trace: true });
  const child = await add(app);
  const startReasons = [];
  const checkpoints = [];
  for (let turnNumber = 1; turnNumber <= 6; turnNumber++) {
    const turn = await start(app, child.id);
    assert.ok(turn.set.length, `turn ${turnNumber}`);
    let set = turn.set;
    for (const elapsedMs of [80_000, 160_000, 240_000]) {
      for (const item of set) assert.equal((await grade(app, turn.turnId, item.id)).status, 200);
      const picked = await next(app, turn.turnId, elapsedMs);
      assert.equal(picked.status, 200);
      assert.equal(picked.json.done, elapsedMs === 240_000, `turn ${turnNumber}, elapsed ${elapsedMs}`);
      set = picked.json.set;
    }
    const trace = (await teacherGet(app, `/api/trace?turn=${turn.turnId}`)).json;
    assert.match(trace.decisions.at(-1).reason, /four minutes/);
    startReasons.push(trace.decisions[0].decision.why);
    assert.equal((await finish(app, turn.turnId)).status, 200);
    checkpoints.push(disk(dataDir).children[child.id].profile.checkpoints);
  }
  assert.equal(disk(dataDir).turns[child.id].length, 6);
  assert.deepEqual(startReasons, Array(6).fill('start'));
  assert.deepEqual(checkpoints, Array(6).fill(3));
});

test('round 2.1: a done answer at start falls back to a normal rule start set', async () => {
  const { app } = setup({ ...realCoach, trace: true,
    chooseNextSet: async profile => ({ ...selection(profile), done: true, itemIds: [] }) });
  const child = await add(app);
  const turn = await start(app, child.id);
  assert.ok(turn.set.length);
  assert.ok(turn.set.every(item => item.level === child.level && !item.source?.challenge));
  const trace = (await teacherGet(app, `/api/trace?turn=${turn.turnId}`)).json;
  assert.equal(trace.decisions[0].source, 'rule');
  assert.equal(trace.decisions[0].decision.why, 'start');
});

test('round 2.8: parent line stays empty until a finished turn has sounded pairs', async () => {
  const { app } = setup();
  const child = await add(app);
  const detail = async () => (await teacherGet(app, `/api/children/${child.id}/detail`)).json;
  assert.equal((await detail()).parentLine, '');
  const emptyTurn = await start(app, child.id);
  await finish(app, emptyTurn.turnId);
  assert.equal((await detail()).parentLine, '');
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  assert.equal((await detail()).parentLine, '');
  await finish(app, turn.turnId);
  assert.match((await detail()).parentLine, /read 1 of 1/);
});

test('children list is public; teacher check and CRUD require the PIN', async () => {
  const { app } = setup();
  assert.deepEqual((await get(app, '/api/children')).json, []);
  for (const headers of [{}, { 'x-teacher-pin': '9999' }, { 'x-teacher-pin': 'x' }]) {
    assert.equal((await request(app, '/api/teacher/check', { headers })).status, 403);
    assert.equal((await request(app, '/api/children', { headers, data: {} })).status, 403);
  }
  assert.deepEqual((await request(app, '/api/teacher/check', { headers: auth })).json, { ok: true });
  const child = await add(app);
  assert.match(child.id, /^[a-f0-9-]{36}$/);
  assert.deepEqual(child, { id: child.id, name: 'Sprout', avatar: 'owl', preset: 'sephardi', level: 1, stars: 0, best: 0,
    vowels: [...VOWEL_IDS], voiceStatus: 'needed', voiceCheck: false });
  assert.deepEqual((await get(app, '/api/children')).json, [child]);
  const updated = await patch(app, child.id, { name: 'Pebble', avatar: 'fox', preset: 'chassidish', level: 3 });
  assert.deepEqual(updated.json, { ...child, name: 'Pebble', avatar: 'fox', preset: 'chassidish', level: 3 });
  for (const method of ['PATCH', 'DELETE']) {
    assert.equal((await request(app, `/api/children/${child.id}`, { method, data: {} })).status, 403);
    assert.equal((await request(app, `/api/children/${child.id}`, { method, headers: { 'x-teacher-pin': '9999' }, data: {} })).status, 403);
  }
});

test('all teacher routes deny access when the teacher PIN is unset', async () => {
  const { app } = setup({ teacherPin: '' });
  const id = randomUUID();
  for (const [method, url] of [
    ['POST', '/api/teacher/check'], ['POST', '/api/children'], ['PATCH', `/api/children/${id}`],
    ['DELETE', `/api/children/${id}`], ['DELETE', `/api/children/${id}/voice`], ['GET', '/api/class'], ['GET', `/api/children/${id}/detail`], ['GET', '/api/packet?skill=vowel:kamatz&level=1'],
  ]) {
    const response = await request(app, url, { method, headers: auth });
    assert.equal(response.status, 403);
    assert.deepEqual(response.json, { error: 'Teacher PIN not set' });
  }
  const traced = setup({ teacherPin: '', trace: true });
  assert.equal((await get(traced.app, '/api/trace?turn=missing')).status, 403);
  assert.equal((await get(app, '/api/config')).status, 200);
  assert.equal((await get(app, '/api/children')).status, 200);
});

test('teacher views reject a missing or wrong PIN', async () => {
  const { app } = setup({ trace: true });
  const child = await add(app);
  for (const url of ['/api/class', `/api/children/${child.id}/detail`, `/api/packet?child=${child.id}`, '/api/trace?turn=missing']) {
    assert.equal((await get(app, url)).status, 403);
    assert.equal((await get(app, url, { 'x-teacher-pin': '9999' })).status, 403);
  }
});

test('child fields, ids and levels are validated without accepting internal fields', async () => {
  const { app } = setup();
  for (const fields of [{ name: 'Two Names' }, { name: '' }, { name: 'A'.repeat(41) }, { avatar: 'dragon' }, { preset: 'other' }, { level: 2 }, { stars: 9 }, { profile: {} }]) {
    assert.equal((await request(app, '/api/children', { headers: auth,
      data: { name: 'Cloud', avatar: 'cat', preset: 'sephardi', ...fields } })).status, 400);
  }
  const child = await add(app);
  for (const fields of [{}, { level: 0 }, { level: 7 }, { level: '2' }, { stars: 1 }, { name: 'Two Names' }, { preset: null }, { avatar: 'other' }]) {
    assert.equal((await patch(app, child.id, fields)).status, 400);
  }
  assert.equal((await patch(app, 'bad-id', { level: 2 })).status, 400);
  assert.equal((await patch(app, randomUUID(), { level: 2 })).status, 404);
  assert.equal((await teacherGet(app, '/api/children/%2e%2e/detail')).status, 403);
  assert.equal((await teacherGet(app, '/api/children/bad-id/detail')).status, 400);
  assert.equal((await teacherGet(app, `/api/children/${randomUUID()}/detail`)).status, 404);
  assert.equal((await request(app, '/api/children/bad-id', { method: 'DELETE', headers: auth })).status, 400);
  assert.equal((await request(app, `/api/children/${randomUUID()}`, { method: 'DELETE', headers: auth })).status, 404);
});

test('start loads the saved profile and returns a turn with only bank items', async () => {
  const context = setup();
  const { app, startProfile, chooseNextSet } = context;
  const child = await add(app);
  await patch(app, child.id, { level: 2 });
  const turn = await start(app, child.id);
  assert.deepEqual(Object.keys(turn).sort(), ['level', 'set', 'turnId']);
  assert.equal(turn.level, 2);
  assert.deepEqual(turn.set, items.slice(0, 2));
  assert.deepEqual(startProfile.mock.calls[0].arguments, [{ level: 2 }]);
  assert.deepEqual(chooseNextSet.mock.calls[0].arguments, [{ level: 2 }, [], items, { useModel: false }]);
  await finish(app, turn.turnId);
  const saved = disk(context.dataDir).children[child.id].profile;
  await start(app, child.id);
  assert.deepEqual(chooseNextSet.mock.calls[1].arguments[0], saved);
  assert.equal(startProfile.mock.callCount(), 1);
  assert.equal((await request(app, '/api/start', { data: {} })).status, 400);
  assert.equal((await request(app, '/api/start', { data: { childId: 'bad-id' } })).status, 400);
  assert.equal((await request(app, '/api/start', { data: { childId: randomUUID() } })).status, 404);
});

test('grade passes only audio to the ear, uses the saved preset, and omits verdicts and model', async () => {
  for (const preset of ['sephardi', 'ashkenazi', 'chassidish']) {
    const { app, listen, gradeLine } = setup();
    const child = await add(app, { preset });
    const turn = await start(app, child.id);
    const data = Buffer.from('FAKE_AUDIO_BYTES');
    const response = await grade(app, turn.turnId, 'kamatz-0', { data, type: 'audio/wav; charset=binary' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.json, { itemId: 'kamatz-0', words: gradeFor().words, summary: gradeFor().summary });
    assert.deepEqual(listen.mock.calls[0].arguments, [{ data, format: 'wav' }]);
    assert.deepEqual(gradeLine.mock.calls[0].arguments, [{ heard: [['ba']], text: 'בָּ', preset }]);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
});

test('grade rejects unknown turns, items outside the current set, empty audio, size and type errors', async () => {
  const { app, listen } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  for (const [turnId, item, options, status] of [
    ['missing', 'kamatz-0', {}, 404], [turn.turnId, 'patach-0', {}, 404], [turn.turnId, 'missing', {}, 404],
    [turn.turnId, 'kamatz-0', { data: Buffer.alloc(0) }, 400],
    [turn.turnId, 'kamatz-0', { type: 'audio/webm' }, 415],
    [turn.turnId, 'kamatz-0', { data: Buffer.alloc(25 * 1024 * 1024 + 1) }, 413],
    [turn.turnId, 'kamatz-0', { headers: { 'content-length': 25 * 1024 * 1024 + 1 } }, 413],
  ]) {
    const response = await grade(app, turnId, item, options);
    assert.equal(response.status, status);
    assert.deepEqual(Object.keys(response.json), ['error']);
  }
  assert.equal(listen.mock.callCount(), 0);
});

test('the complete flow advances levels, returns facts, saves history, and accumulates stars and best', async () => {
  const chooseNextSet = mock.fn(async (profile, results, candidates, options) => {
    if (!options.useModel) return selection(profile, { profile: { ...profile, checkpoints: 1 } });
    if (profile.checkpoints === 1) return selection(profile, { level: 2, profile: { level: 2, checkpoints: 2 }, itemIds: ['patach-0', 'challenge'] });
    return selection(profile, { level: 2, profile: { level: 2, checkpoints: 3 }, itemIds: [], done: true });
  });
  const { app, dataDir } = setup({ chooseNextSet });
  const child = await add(app);
  const turn = await start(app, child.id);
  assert.equal((await grade(app, turn.turnId)).status, 200);
  assert.deepEqual(disk(dataDir).children[child.id].pairs, { [betKamatz]: [1] });
  const checkpoint = await next(app, turn.turnId, 900);
  assert.deepEqual(checkpoint.json, { done: false, level: 2, levelUp: true, set: [items[6], items.at(-1)] });
  const args = chooseNextSet.mock.calls[1].arguments;
  assert.deepEqual(args[1], [{ itemId: 'kamatz-0', summary: gradeFor().summary, verdicts: gradeFor().verdicts }]);
  assert.deepEqual(args[3], { useModel: true, elapsedMs: 900 });
  assert.equal((await grade(app, turn.turnId)).status, 404);
  const done = await next(app, turn.turnId);
  assert.deepEqual(done.json, { done: true, level: 2, levelUp: false, facts: { best: 'letter:bet', next: 'vowel:kamatz', proven: [] } });
  assert.equal((await next(app, turn.turnId)).status, 400);
  const saved = await finish(app, turn.turnId, 5);
  assert.deepEqual(saved.json.child, { ...child, level: 2, stars: 1, best: 1 });
  assert.deepEqual((await finish(app, turn.turnId, 5)).json, saved.json);
  assert.equal((await grade(app, turn.turnId)).status, 404);
  assert.equal((await next(app, turn.turnId)).status, 404);
  const state = disk(dataDir);
  assert.equal(state.version, 1);
  assert.equal(state.children[child.id].profile.level, 2);
  assert.equal(state.turns[child.id][0].ok, 1);
  assert.equal(state.turns[child.id][0].pairs, 1);
  assert.equal(state.turns[child.id][0].decisions.length, 3);
  assert.deepEqual(state.turns[child.id][0].log, Array(3).fill('Keep practicing these sounds.'));
  const second = await start(app, child.id);
  await grade(app, second.turnId);
  assert.equal((await finish(app, second.turnId, 2)).json.child.best, 1);
  const third = await start(app, child.id);
  await grade(app, third.turnId);
  await grade(app, third.turnId, 'kamatz-1');
  assert.deepEqual((await finish(app, third.turnId, 7)).json.child, { ...child, level: 2, stars: 4, best: 2 });
});

test('failed lines stay out of checkpoints and COACH_MODEL=off disables model use', async () => {
  const { app, chooseNextSet } = setup({ coachModel: 'off', listen: async () => { throw new Error('private failure'); } });
  const child = await add(app);
  const turn = await start(app, child.id);
  assert.equal((await grade(app, turn.turnId)).status, 500);
  assert.equal((await next(app, turn.turnId, 50)).json.levelUp, false);
  assert.deepEqual(chooseNextSet.mock.calls[1].arguments[1], []);
  assert.deepEqual(chooseNextSet.mock.calls[1].arguments[3], { useModel: false, elapsedMs: 50 });
});

test('levelUp compares each checkpoint, including a done checkpoint', async () => {
  let calls = 0;
  const { app } = setup({ chooseNextSet: async profile => {
    calls++;
    const level = calls === 1 ? 3 : calls === 2 ? 2 : 4;
    return selection(profile, { level, profile: { level }, done: calls === 3,
      itemIds: calls === 3 ? [] : ['kamatz-0', 'kamatz-1'] });
  } });
  const child = await add(app);
  await patch(app, child.id, { level: 3 });
  const turn = await start(app, child.id);
  assert.equal((await next(app, turn.turnId)).json.levelUp, false);
  const done = await next(app, turn.turnId);
  assert.equal(done.json.done, true);
  assert.equal(done.json.levelUp, true);
  assert.equal(done.json.level, 4);
});

test('an invalid next selection preserves the pending grades for a retry', async () => {
  let invalid = true;
  const chooseNextSet = mock.fn(async (profile, results, candidates, options) =>
    selection(profile, options.useModel && invalid ? { itemIds: ['unknown'] } : {}));
  const { app, dataDir } = setup({ chooseNextSet });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  assert.deepEqual((await next(app, turn.turnId)).json, { error: 'Request failed' });
  invalid = false;
  assert.equal((await next(app, turn.turnId)).status, 200);
  assert.deepEqual(chooseNextSet.mock.calls[1].arguments[1], chooseNextSet.mock.calls[2].arguments[1]);
  await finish(app, turn.turnId);
  assert.equal(disk(dataDir).turns[child.id][0].pairs, 1);
});

test('a repeated grade counts once in the turn total and each read in the cell history', async () => {
  let result = gradeFor('wrong_vowel');
  const { app, dataDir } = setup({ gradeLine: () => result });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  result = gradeFor();
  await grade(app, turn.turnId);
  await finish(app, turn.turnId);
  const state = disk(dataDir);
  assert.deepEqual(state.children[child.id].pairs[betKamatz], [0, 1]);
  assert.equal(state.turns[child.id][0].ok, 1);
  assert.equal(state.turns[child.id][0].pairs, 1);
});

test('next and finish validate their input and unknown turns', async () => {
  const { app } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  for (const elapsedMs of [-1, '1', null]) assert.equal((await next(app, turn.turnId, elapsedMs)).status, 400);
  assert.equal((await request(app, '/api/next', { data: { turnId: turn.turnId } })).status, 400);
  assert.equal((await next(app, 'missing')).status, 404);
  for (const stars of [-1, 1.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) assert.equal((await finish(app, turn.turnId, stars)).status, 400);
  assert.equal((await request(app, '/api/finish', { data: { turnId: turn.turnId } })).status, 400);
  assert.equal((await finish(app, 'missing')).status, 404);
});

test('JSON body validation keeps the 1 MB limit on create, patch and station routes', async () => {
  const { app } = setup();
  const child = await add(app);
  for (const [url, method, headers] of [['/api/start', 'POST', {}], ['/api/next', 'POST', {}], ['/api/finish', 'POST', {}],
    ['/api/children', 'POST', auth], [`/api/children/${child.id}`, 'PATCH', auth]]) {
    for (const data of [Buffer.from('{'), Buffer.from('[]'), Buffer.from('null')]) {
      assert.equal((await request(app, url, { method, headers, data })).status, 400);
    }
    assert.equal((await request(app, url, { method, headers, type: 'text/plain' })).status, 415);
    assert.equal((await request(app, url, { method, headers, data: Buffer.alloc(1024 * 1024 + 1) })).status, 413);
    assert.equal((await request(app, url, { method, headers: { ...headers, 'content-length': 1024 * 1024 + 1 } })).status, 413);
  }
});

test('class groups use next skill, biggest first then label, and expose the last saved turn', async () => {
  const { app } = setup({ turnFacts: profile => ({ best: null, next: profile.level === 3 ? null : profile.level === 2 ? 'letter:bet' : 'vowel:kamatz', proven: [] }) });
  const first = await add(app);
  const second = await add(app, { name: 'Pebble' });
  const third = await add(app, { name: 'Cloud' });
  const fourth = await add(app, { name: 'Leaf' });
  await patch(app, third.id, { level: 2 });
  await patch(app, fourth.id, { level: 3 });
  const turn = await start(app, first.id);
  await grade(app, turn.turnId);
  await finish(app, turn.turnId, 4);
  const response = await teacherGet(app, '/api/class');
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.groups, [
    { skill: 'vowel:kamatz', label: 'Kamatz', childIds: [first.id, second.id] },
    { skill: 'letter:bet', label: 'Bet', childIds: [third.id] },
  ]);
  assert.deepEqual(response.json.children[0].lastTurn, { date: response.json.children[0].lastTurn.date, ok: 1, pairs: 1, stars: 1 });
  assert.equal(response.json.children[1].lastTurn, null);
  assert.equal(response.json.children[3].next, null);
  await patch(app, second.id, { level: 3 });
  assert.deepEqual((await teacherGet(app, '/api/class')).json.groups.map(group => group.label), ['Bet', 'Kamatz']);
});

test('pair histories retain six reads, include misses, and build solid, shaky and untested maps', async () => {
  let result = gradeFor();
  const { app, dataDir } = setup({ gradeLine: () => result });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  let detail = (await teacherGet(app, `/api/children/${child.id}/detail`)).json;
  assert.equal(detail.map.cells[betKamatz], 'untested');
  for (let i = 0; i < 6; i++) await grade(app, turn.turnId);
  assert.deepEqual(disk(dataDir).children[child.id].pairs[betKamatz], Array(6).fill(1));
  result = gradeFor('wrong_vowel', ['letter:bet', 'vowel:patach']);
  await grade(app, turn.turnId);
  detail = (await teacherGet(app, `/api/children/${child.id}/detail`)).json;
  assert.deepEqual(detail.map.letters, ['letter:bet', 'letter:vet']);
  assert.deepEqual(detail.map.vowels, ['vowel:kamatz', 'vowel:patach']);
  assert.equal(detail.map.cells[betKamatz], 'solid');
  assert.equal(detail.map.cells[betPatach], 'shaky');
  assert.equal(detail.map.cells['letter:vet|vowel:patach'], 'untested');
  assert.equal(detail.map.sample[betKamatz], 'בָּ');
  assert.equal(detail.map.sample['letter:vet|vowel:kamatz'], 'בָ');
  result = gradeFor();
  result.verdicts.push({ verdict: 'ok', skills: ['letter:bet', 'letter:alef', 'vowel:kamatz'] });
  await grade(app, turn.turnId);
  assert.equal(Object.keys(disk(dataDir).children[child.id].pairs).length, 2);
  await patch(app, child.id, { level: 3 });
  detail = (await teacherGet(app, `/api/children/${child.id}/detail`)).json;
  assert.ok(detail.map.letters.includes('letter:mem'));
  assert.ok(detail.map.vowels.includes('vowel:chirik'));
});

test('each verdict other than ok records a miss; three subsequent ok reads restore solid', async () => {
  let verdict = 'wrong_letter';
  const { app, dataDir } = setup({ gradeLine: () => gradeFor(verdict) });
  const child = await add(app);
  const turn = await start(app, child.id);
  for (verdict of ['wrong_letter', 'wrong_vowel', 'skipped', 'extra', 'uncertain', 'not_decoded']) await grade(app, turn.turnId);
  assert.deepEqual(disk(dataDir).children[child.id].pairs[betKamatz], Array(6).fill(0));
  verdict = 'ok';
  for (let i = 0; i < 3; i++) await grade(app, turn.turnId);
  assert.equal((await teacherGet(app, `/api/children/${child.id}/detail`)).json.map.cells[betKamatz], 'solid');
});

test('detail returns the latest twenty turns, templated parent lines and explain lines only', async () => {
  let tick = 0;
  const { app } = setup({ now: () => 1_800_000_000_000 + tick++ * 1000,
    turnFacts: () => ({ best: 'letter:bet', next: null, proven: [] }) });
  const child = await add(app);
  const empty = await teacherGet(app, `/api/children/${child.id}/detail`);
  assert.deepEqual(empty.json.turns, []);
  for (let i = 0; i < 21; i++) {
    const turn = await start(app, child.id);
    await grade(app, turn.turnId);
    await finish(app, turn.turnId, i);
  }
  const detail = (await teacherGet(app, `/api/children/${child.id}/detail`)).json;
  assert.equal(detail.turns.length, 20);
  assert.deepEqual(detail.turns.map(turn => turn.stars), Array(20).fill(1));
  assert.ok(detail.turns[0].date > detail.turns[1].date);
  assert.deepEqual(Object.keys(detail.turns[0]).sort(), ['date', 'endLevel', 'id', 'log', 'ok', 'pairs', 'stars', 'startLevel']);
  assert.deepEqual(detail.turns[0].log, ['Keep practicing these sounds.']);
  assert.equal(detail.parentLine, 'Sprout read 1 of 1 sounds right today. Every sound was right!');
});

test('parent hints cover every rulebook skill and use each preset for kamatz and sav', async () => {
  for (const preset of ['sephardi', 'ashkenazi', 'chassidish']) {
    for (const skill of Object.keys(SKILLS)) assert.ok(!hint(skill, preset).startsWith('practice '), skill);
    assert.equal(hint('letter:sav', preset), `a tav with no dot says ${preset === 'sephardi' ? 't' : 's'}`);
    const { app } = setup({ gradeLine: () => gradeFor('wrong_vowel') });
    const child = await add(app, { preset });
    const turn = await start(app, child.id);
    await grade(app, turn.turnId);
    await finish(app, turn.turnId);
    const detail = await teacherGet(app, `/api/children/${child.id}/detail`);
    assert.equal(detail.json.parentLine, `Sprout read 0 of 1 sounds right today. One to practice: the kamatz (ָ) says ${preset === 'sephardi' ? 'a' : 'o'}.`);
  }
  assert.equal(hint('future:skill', 'sephardi'), 'practice future:skill');
});

test('parent line follows the coach next skill rather than the first summary miss', async () => {
  const { app } = setup({
    gradeLine: () => gradeFor('wrong_vowel'),
    turnFacts: () => ({ best: null, next: 'letter:bet', proven: [] }),
    chooseNextSet: async (profile, results) => selection(profile, { done: results.length > 0 }),
  });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  const checkpoint = await next(app, turn.turnId);
  assert.equal(checkpoint.json.facts.next, 'letter:bet');
  await finish(app, turn.turnId);
  const detail = (await teacherGet(app, `/api/children/${child.id}/detail`)).json;
  assert.equal(detail.parentLine, 'Sprout read 0 of 1 sounds right today. One to practice: a bet with a dot says b.');
});

test('parent line stops after the count when the coach has no next skill and there are misses', async () => {
  const { app } = setup({
    gradeLine: () => gradeFor('wrong_vowel'),
    turnFacts: () => ({ best: null, next: null, proven: [] }),
  });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  await finish(app, turn.turnId);
  const detail = (await teacherGet(app, `/api/children/${child.id}/detail`)).json;
  assert.equal(detail.parentLine, 'Sprout read 0 of 1 sounds right today.');
});

test('server entry point has no test-context import', () => {
  const source = fs.readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /NODE_TEST_CONTEXT|app\.test\.js/);
});

test('API documents untested map cells with fewer than three reads and none missed', () => {
  const api = fs.readFileSync(new URL('../docs/api.md', import.meta.url), 'utf8');
  assert.match(api, /untested when it has fewer than three reads and none missed/);
});

test('packets for children and skills are deterministic, bank-only, nearest level first, with three sections', async () => {
  const { app } = setup();
  const child = await add(app);
  await patch(app, child.id, { level: 2 });
  const byChild = await teacherGet(app, `/api/packet?child=${child.id}`);
  const bySkill = await teacherGet(app, '/api/packet?skill=vowel:kamatz&level=2');
  assert.equal(byChild.status, 200);
  assert.equal(bySkill.status, 200);
  assert.equal(byChild.json.title, 'Practice for Sprout');
  assert.deepEqual(byChild.json.sections, bySkill.json.sections);
  assert.deepEqual(byChild.json.sections.map(section => [section.heading, section.items.length]), [['Warm up', 2], ['Practice', 6], ['Challenge', 1]]);
  assert.deepEqual(bySkill.json.sections[1].items.map(item => item.level), [2, 2, 2, 1, 1, 1]);
  assert.ok(byChild.json.sections[0].items.every(item => item.level === 1));
  assert.equal(byChild.json.sections[2].items[0].id, 'challenge');
  for (const section of byChild.json.sections) {
    for (const item of section.items) {
      const original = items.find(candidate => candidate.id === item.id);
      assert.deepEqual(item, { id: original.id, text: original.text, level: original.level });
    }
  }
  assert.deepEqual((await teacherGet(app, `/api/packet?child=${child.id}`)).json, byChild.json);
  const turn = await start(app, child.id);
  for (let i = 0; i < 3; i++) await grade(app, turn.turnId);
  const solidWarm = (await teacherGet(app, `/api/packet?child=${child.id}`)).json.sections[0].items;
  assert.deepEqual(solidWarm.map(item => item.id), ['kamatz-3', 'kamatz-4']);
  const missingChallenge = setup({ items: items.filter(item => !item.source.challenge) });
  assert.deepEqual((await teacherGet(missingChallenge.app, '/api/packet?skill=vowel:kamatz&level=2')).json.sections[2].items, []);
});

test('packet errors reject invalid child ids, missing children, unknown skills and invalid levels', async () => {
  const { app } = setup();
  for (const [query, status] of [['child=bad-id', 400], [`child=${randomUUID()}`, 404], ['skill=unknown&level=1', 400],
    ['skill=vowel:kamatz&level=7', 400], ['skill=vowel:kamatz', 400], ['level=1', 400], ['child=bad-id&skill=vowel:kamatz&level=1', 400]]) {
    assert.equal((await teacherGet(app, `/api/packet?${query}`)).status, status);
  }
});

test('trace is hidden unless enabled and reasons never enter other responses or disk', async () => {
  assert.deepEqual((await get(setup().app, '/api/config')).json, { trace: false });
  assert.equal((await get(setup().app, '/api/trace?turn=missing')).status, 404);
  const { app, dataDir } = setup({ trace: true });
  assert.deepEqual((await get(app, '/api/config')).json, { trace: true });
  const child = await add(app);
  const turn = await start(app, child.id);
  const responses = [await grade(app, turn.turnId), await next(app, turn.turnId), await finish(app, turn.turnId),
    await get(app, '/api/children'), await teacherGet(app, '/api/class'), await teacherGet(app, `/api/children/${child.id}/detail`),
    await teacherGet(app, `/api/packet?child=${child.id}`)];
  assert.ok(!JSON.stringify(turn).includes(privateReason));
  for (const response of responses) {
    assert.equal(response.status, 200, response.body);
    assert.ok(!response.body.includes(privateReason));
    assert.ok(!response.body.includes('"reason"'));
  }
  const trace = await teacherGet(app, `/api/trace?turn=${turn.turnId}`);
  assert.equal(trace.status, 200);
  assert.equal(trace.json.decisions.length, 2);
  assert.equal(trace.json.decisions[0].checkpoint, 0);
  assert.equal(trace.json.decisions[1].checkpoint, 1);
  assert.equal(trace.json.decisions[1].reason, privateReason);
  assert.equal(trace.json.decisions[1].explain, 'Keep practicing these sounds.');
  assert.deepEqual(Object.keys(trace.json.decisions[1]).sort(), ['checkpoint', 'decision', 'explain', 'reason', 'source']);
  assert.equal((await teacherGet(app, '/api/trace?turn=missing')).status, 404);
  const saved = fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8');
  assert.ok(!saved.includes(privateReason));
  assert.ok(!saved.includes(privateHeard));
  assert.ok(!saved.includes('"verdicts"'));
});

test('delete removes the child, all saved turns and every live or finished turn', async () => {
  const { app, dataDir } = setup({ trace: true });
  const child = await add(app);
  const saved = await start(app, child.id);
  await grade(app, saved.turnId);
  await finish(app, saved.turnId);
  const open = await start(app, child.id);
  assert.deepEqual((await request(app, `/api/children/${child.id}`, { method: 'DELETE', headers: auth })).json, { ok: true });
  assert.deepEqual(disk(dataDir), { version: 1, children: {}, turns: {} });
  assert.deepEqual((await get(app, '/api/children')).json, []);
  assert.equal((await next(app, open.turnId)).status, 404);
  for (const id of [saved.turnId, open.turnId]) assert.equal((await teacherGet(app, `/api/trace?turn=${id}`)).status, 404);
});

for (const operation of ['writeFile', 'rename']) {
  test(`a failed delete ${operation} preserves the saved child and its usable live turn`, async t => {
    const { app, dataDir } = setup({ trace: true });
    const child = await add(app);
    const turn = await start(app, child.id);
    const before = disk(dataDir);
    const failure = t.mock.method(fs.promises, operation, async () => { throw new Error('offline write failure'); });
    const response = await request(app, `/api/children/${child.id}`, { method: 'DELETE', headers: auth });
    assert.equal(response.status, 500);
    assert.deepEqual(response.json, { error: 'Request failed' });
    failure.mock.restore();
    assert.deepEqual(disk(dataDir), before);
    assert.equal((await teacherGet(app, `/api/trace?turn=${turn.turnId}`)).status, 200);
    assert.equal((await grade(app, turn.turnId)).status, 200);
    assert.equal((await next(app, turn.turnId)).status, 200);
    assert.equal((await finish(app, turn.turnId)).status, 200);
  });
}

test('child detail returns the stored turn id for each trace link', async () => {
  const { app, dataDir } = setup({ trace: true });
  const child = await add(app);
  const ids = [];
  for (let index = 0; index < 2; index++) {
    const turn = await start(app, child.id);
    await finish(app, turn.turnId);
    ids.unshift(turn.turnId);
  }
  assert.deepEqual(disk(dataDir).turns[child.id].map(turn => turn.id), ids);
  const detail = await teacherGet(app, `/api/children/${child.id}/detail`);
  assert.deepEqual(detail.json.turns.map(turn => turn.id), ids);
});

test('the store survives an app reload but open turns and private trace reasons do not', async () => {
  const { app, dataDir } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  await finish(app, turn.turnId, 6);
  const reloaded = setup({ dataDir, trace: true });
  assert.deepEqual((await get(reloaded.app, '/api/children')).json, [{ ...child, stars: 1, best: 1 }]);
  const detail = await teacherGet(reloaded.app, `/api/children/${child.id}/detail`);
  assert.equal(detail.json.turns.length, 1);
  assert.equal(detail.json.turns[0].ok, 1);
  const restarted = await start(reloaded.app, child.id);
  assert.deepEqual(reloaded.chooseNextSet.mock.calls[0].arguments[0], disk(dataDir).children[child.id].profile);
  assert.equal((await grade(reloaded.app, restarted.turnId)).status, 200);
  assert.deepEqual(disk(dataDir).children[child.id].pairs[betKamatz], [1, 1]);
  assert.equal((await teacherGet(reloaded.app, `/api/trace?turn=${turn.turnId}`)).status, 404);
  assert.deepEqual(fs.readdirSync(dataDir), ['store.json']);
});

test('turns expire thirty minutes after start without a background timer', async () => {
  let time = 1_800_000_000_000;
  const { app } = setup({ now: () => time, trace: true });
  const child = await add(app);
  const turn = await start(app, child.id);
  time += 30 * 60 * 1000;
  assert.equal((await grade(app, turn.turnId)).status, 404);
  assert.equal((await next(app, turn.turnId)).status, 404);
  assert.equal((await finish(app, turn.turnId)).status, 404);
  assert.equal((await teacherGet(app, `/api/trace?turn=${turn.turnId}`)).status, 404);
});

test('audio is never written or logged, and internal failures have no stack traces', async t => {
  const { app, dataDir } = setup();
  const realAsyncWrite = fs.promises.writeFile;
  const realWrite = fs.writeFile;
  const realSyncWrite = fs.writeFileSync;
  const paths = [];
  function check(file, data) {
    paths.push(String(file));
    assert.equal(path.dirname(String(file)), dataDir);
    assert.match(path.basename(String(file)), /^store\.json(?:\.[a-f0-9-]+\.tmp)?$/);
    const text = data.toString();
    for (const privateValue of ['FAKE_AUDIO_BYTES', 'RIFF', privateHeard, privateReason]) assert.ok(!text.includes(privateValue));
  }
  t.mock.method(fs.promises, 'writeFile', async function(file, data, ...args) { check(file, data); return realAsyncWrite.call(this, file, data, ...args); });
  t.mock.method(fs, 'writeFile', function(file, data, ...args) { check(file, data); return realWrite.call(this, file, data, ...args); });
  t.mock.method(fs, 'writeFileSync', function(file, data, ...args) { check(file, data); return realSyncWrite.call(this, file, data, ...args); });
  const streams = t.mock.method(fs, 'createWriteStream', () => { throw new Error('Unexpected stream'); });
  const logs = [t.mock.method(console, 'log', () => {}), t.mock.method(console, 'error', () => {}), t.mock.method(console, 'warn', () => {})];
  const child = await add(app);
  assert.equal((await voice(app, child)).status, 200);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  await next(app, turn.turnId);
  await finish(app, turn.turnId);
  assert.ok(paths.length >= 3);
  const failing = setup({ dataDir, listen: async () => { throw new Error('FAKE_AUDIO_BYTES secret stack'); } });
  const failedTurn = await start(failing.app, child.id);
  const response = await grade(failing.app, failedTurn.turnId);
  assert.equal(response.status, 500);
  assert.deepEqual(response.json, { error: 'Request failed' });
  assert.equal(streams.mock.callCount(), 0);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test('atomic write failure preserves the previous store and leaves no temporary file', async t => {
  const { app, dataDir } = setup();
  const child = await add(app);
  const original = fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8');
  const rename = t.mock.method(fs.promises, 'rename', async () => { throw new Error('private filesystem details'); });
  const response = await patch(app, child.id, { level: 2 });
  assert.equal(response.status, 500);
  assert.deepEqual(response.json, { error: 'Request failed' });
  assert.equal(fs.readFileSync(path.join(dataDir, 'store.json'), 'utf8'), original);
  assert.deepEqual(fs.readdirSync(dataDir), ['store.json']);
  assert.equal((await get(app, '/api/children')).json[0].level, 1);
  rename.mock.restore();
  assert.equal((await patch(app, child.id, { level: 2 })).status, 200);
});

test('concurrent child writes preserve both records and concurrent finish cannot count stars twice', async () => {
  const { app, dataDir } = setup();
  const children = await Promise.all([add(app, { name: 'Cloud' }), add(app, { name: 'Leaf' })]);
  assert.equal(Object.keys(disk(dataDir).children).length, 2);
  const turn = await start(app, children[0].id);
  await grade(app, turn.turnId);
  const outcomes = await Promise.all([finish(app, turn.turnId, 5), finish(app, turn.turnId, 5)]);
  assert.deepEqual(outcomes.map(outcome => outcome.status), [200, 200]);
  assert.equal(disk(dataDir).children[children[0].id].stars, 1);
});

test('static serving, HEAD, index fallback and path traversal protection still work', async () => {
  const { app } = setup();
  assert.equal((await get(app, '/app.js')).body, 'window.station = true;');
  assert.equal((await get(app, '/bookmark')).body, '<main>Station</main>');
  const head = await request(app, '/', { method: 'HEAD' });
  assert.equal(head.body, '');
  assert.equal(head.headers['X-Content-Type-Options'], 'nosniff');
  for (const url of ['/../app.js', '/%2e%2e/app.js', '/assets/%2e%2e/%2e%2e/package.json', '/%5c..%5cpackage.json', '/outside.js', '/%00']) {
    assert.equal((await get(app, url)).status, 403);
  }
  assert.equal((await get(app, '/%xx')).status, 400);
  assert.equal((await get(app, '/api/unknown')).status, 404);
  assert.equal((await request(app, '/bookmark')).status, 404);
  assert.equal((await get(setup({ staticDir: undefined }).app, '/')).status, 404);
  assert.equal((await get(setup({ staticDir: path.join(root, 'absent') }).app, '/')).status, 404);
});

test('invalid coach selections and dependency failures return safe errors', async () => {
  for (const chooseNextSet of [async profile => selection(profile, { itemIds: ['made-up'] }),
    async profile => selection(profile, { itemIds: [] }), async profile => selection(profile, { itemIds: ['kamatz-0', 'kamatz-0'] }),
    async profile => selection(profile, { level: 7 }), async () => { throw new Error('private model stack'); }]) {
    const { app } = setup({ chooseNextSet });
    const child = await add(app);
    const response = await request(app, '/api/start', { data: { childId: child.id } });
    assert.equal(response.status, 500);
    assert.deepEqual(response.json, { error: 'Request failed' });
  }
});


test('finish caps browser stars at the stars earned by the latest server grades', async () => {
  let result = gradeFor('wrong_vowel');
  const { app, dataDir } = setup({ gradeLine: () => result });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  result = gradeFor();
  await grade(app, turn.turnId);
  const receipt = await finish(app, turn.turnId, Number.MAX_SAFE_INTEGER);
  assert.equal(receipt.status, 200);
  assert.equal(receipt.json.child.stars, 1);
  assert.equal(receipt.json.child.best, 1);
  assert.equal(disk(dataDir).turns[child.id][0].stars, 1);
});

test('finish awards the smaller client count and never awards ungraded or failed lines', async () => {
  for (const claimed of [0, 1, 9]) {
    const { app } = setup();
    const child = await add(app);
    const turn = await start(app, child.id);
    await grade(app, turn.turnId);
    await grade(app, turn.turnId, 'kamatz-1');
    assert.equal((await finish(app, turn.turnId, claimed)).json.child.stars, Math.min(claimed, 2));
  }
  const { app } = setup({ listen: async () => { throw new Error('offline'); } });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  assert.equal((await finish(app, turn.turnId, 100)).json.child.stars, 0);
});

test('finish counts challenge bonuses and repeated items in separate sets from server grades', async () => {
  const { app } = setup({ chooseNextSet: async profile => selection(profile, { itemIds: ['kamatz-0', 'challenge'] }) });
  const child = await add(app);
  const turn = await start(app, child.id);
  for (let checkpoint = 1; checkpoint <= 2; checkpoint++) {
    await grade(app, turn.turnId);
    await grade(app, turn.turnId, 'challenge');
    await request(app, '/api/next', { data: { turnId: turn.turnId, checkpoint, elapsedMs: 10 } });
  }
  assert.equal((await finish(app, turn.turnId, 100)).json.child.stars, 6);
});

test('finish retries return the original receipt even after another turn changes totals', async () => {
  const { app, dataDir } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  const first = await finish(app, turn.turnId, 1);
  const newer = await start(app, child.id);
  await grade(app, newer.turnId);
  await finish(app, newer.turnId, 1);
  const retry = await finish(app, turn.turnId, 900);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.json, first.json);
  assert.equal(disk(dataDir).children[child.id].stars, 2);
  assert.equal(disk(dataDir).turns[child.id].length, 2);
});

test('checkpoint retries replay the saved response without coaching or consuming current grades', async () => {
  const { app, chooseNextSet, dataDir } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  const checkpoint = number => request(app, '/api/next', { data: { turnId: turn.turnId, checkpoint: number, elapsedMs: 10 } });
  await grade(app, turn.turnId);
  const first = await checkpoint(1);
  await grade(app, turn.turnId);
  const retry = await checkpoint(1);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.json, first.json);
  assert.equal(chooseNextSet.mock.callCount(), 2);
  assert.equal((await checkpoint(3)).status, 409);
  assert.equal((await checkpoint(0)).status, 409);
  assert.equal((await checkpoint(2)).status, 200);
  assert.equal((await checkpoint(1)).status, 409);
  await finish(app, turn.turnId);
  assert.equal(disk(dataDir).turns[child.id][0].pairs, 2);
});

test('concurrent checkpoint retries coach once and done checkpoints replay too', async () => {
  const { app, chooseNextSet } = setup({ chooseNextSet: mock.fn(async (profile, results) =>
    selection(profile, { done: results.length > 0 })) });
  const child = await add(app);
  const turn = await start(app, child.id);
  await grade(app, turn.turnId);
  const call = () => request(app, '/api/next', { data: { turnId: turn.turnId, checkpoint: 1, elapsedMs: 10 } });
  const responses = await Promise.all([call(), call()]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.deepEqual(responses[0].json, responses[1].json);
  assert.equal(responses[1].json.done, true);
  assert.equal(chooseNextSet.mock.callCount(), 2);
});

test('next requires an integer checkpoint identity', async () => {
  const { app } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  for (const checkpoint of [undefined, null, '1', 1.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await request(app, '/api/next', { data: { turnId: turn.turnId, elapsedMs: 1, checkpoint } })).status, 409);
  }
});

test('a new turn and a changed teacher level invalidate earlier live turns', async () => {
  const { app, dataDir } = setup({ items: [...items, { ...items[0], id: 'regular-four', level: 4 }] });
  const child = await add(app);
  const old = await start(app, child.id);
  await grade(app, old.turnId);
  const current = await start(app, child.id);
  assert.equal((await finish(app, old.turnId)).status, 404);
  assert.equal((await grade(app, old.turnId)).status, 404);
  await patch(app, child.id, { level: 4 });
  assert.equal((await finish(app, current.turnId)).status, 404);
  assert.equal(disk(dataDir).children[child.id].level, 4);
  assert.deepEqual(disk(dataDir).turns[child.id], []);
});

test('roster edits with the same level preserve the saved coach profile and live turn', async () => {
  const { app, dataDir } = setup({ ...realCoach, coachModel: 'off' });
  const child = await add(app);
  const first = await start(app, child.id);
  await grade(app, first.turnId);
  await request(app, '/api/next', { data: { turnId: first.turnId, checkpoint: 1, elapsedMs: 10 } });
  await finish(app, first.turnId);
  const before = disk(dataDir).children[child.id].profile;
  const live = await start(app, child.id);
  await patch(app, child.id, { level: before.level, name: 'Pebble', avatar: 'fox', preset: 'ashkenazi' });
  assert.deepEqual(disk(dataDir).children[child.id].profile, before);
  assert.equal((await finish(app, live.turnId)).status, 200);
});

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

for (const invalidation of ['delete', 'start', 'level', 'expiry']) {
  test(`pending checkpoint returns 404 after ${invalidation} invalidates the turn`, async () => {
    const entered = deferred(), release = deferred();
    let time = 1000;
    const { app, dataDir } = setup({ now: () => time, chooseNextSet: async (profile, results, candidates, options) => {
      if (options.useModel) { entered.resolve(); await release.promise; }
      return selection(profile);
    } });
    const child = await add(app);
    const turn = await start(app, child.id);
    const pending = request(app, '/api/next', { data: { turnId: turn.turnId, checkpoint: 1, elapsedMs: 10 } });
    await entered.promise;
    if (invalidation === 'delete') await request(app, `/api/children/${child.id}`, { method: 'DELETE', headers: auth });
    if (invalidation === 'start') await start(app, child.id);
    if (invalidation === 'level') await patch(app, child.id, { level: 3 });
    if (invalidation === 'expiry') time += 30 * 60 * 1000;
    const before = disk(dataDir);
    release.resolve();
    assert.equal((await pending).status, 404);
    assert.deepEqual(disk(dataDir), before);
  });
}

test('a start during a teacher level write waits for the saved profile', async t => {
  const { app, dataDir } = setup({ items: [...items, { ...items[0], id: 'regular-four', level: 4 }] });
  const child = await add(app);
  const entered = deferred(), release = deferred();
  const rename = fs.promises.rename;
  t.mock.method(fs.promises, 'rename', async function(from, to) {
    if (to === path.join(dataDir, 'store.json')) {
      entered.resolve();
      await release.promise;
    }
    return rename.call(this, from, to);
  });
  const editing = patch(app, child.id, { level: 4 });
  await entered.promise;
  const starting = start(app, child.id);
  // Let the start request reach the store while the teacher write is pending.
  await new Promise(resolve => setImmediate(resolve));
  release.resolve();
  assert.equal((await editing).status, 200);
  const turn = await starting;
  assert.equal(turn.level, 4);
  assert.equal((await finish(app, turn.turnId)).json.child.level, 4);
});

for (const invalidation of ['start', 'level']) {
  test(`a pending start cannot reopen a turn after a newer ${invalidation}`, async () => {
    const entered = deferred(), release = deferred();
    let calls = 0;
    const { app } = setup({ chooseNextSet: async profile => {
      if (++calls === 1) { entered.resolve(); await release.promise; }
      return selection(profile);
    } });
    const child = await add(app);
    const pending = request(app, '/api/start', { data: { childId: child.id } });
    await entered.promise;
    if (invalidation === 'start') await start(app, child.id);
    else await patch(app, child.id, { level: 4 });
    release.resolve();
    assert.equal((await pending).status, 404);
  });
}

test('a failed teacher level write preserves the live turn as well as the saved profile', async t => {
  const { app, dataDir } = setup();
  const child = await add(app);
  const turn = await start(app, child.id);
  const rename = t.mock.method(fs.promises, 'rename', async () => { throw new Error('offline write failure'); });
  assert.equal((await patch(app, child.id, { level: 4 })).status, 500);
  rename.mock.restore();
  assert.equal(disk(dataDir).children[child.id].level, 1);
  assert.equal((await grade(app, turn.turnId)).status, 200);
});
