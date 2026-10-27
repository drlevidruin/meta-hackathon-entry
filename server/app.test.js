import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { createApp } from './app.js';

const items = ['בָּ בַּ', 'מִי מָה', 'לוֹ לִי'].map((text, index) => ({
  id: `test-${index}`, level: 1, text, words: text.split(' '),
  skills: ['vowel:kamatz'], focus: null, flags: [], source: { generated: true },
}));
const summary = { pairs: 2, ok: 2, wrong_letter: 0, wrong_vowel: 0, skipped: 0, extra: 0, uncertain: 0, not_decoded: 0, missedSkills: [] };
const grade = { words: [{ text: 'בָּ', verdict: null, pairs: [{ text: 'בָּ', verdict: 'ok', heard: 'ba', expected: ['ba'], skills: [] }] }], verdicts: [{ verdict: 'ok' }], summary };
let staticDir;

before(() => {
  staticDir = fs.mkdtempSync(path.join(fileURLToPath(new URL('.', import.meta.url)), '.test-'));
  fs.writeFileSync(path.join(staticDir, 'index.html'), '<main>Station</main>');
  fs.writeFileSync(path.join(staticDir, 'app.js'), 'window.station = true;');
  fs.symlinkSync(fileURLToPath(import.meta.url), path.join(staticDir, 'outside.js'));
});
after(() => fs.rmSync(staticDir, { recursive: true, force: true }));

function setup(overrides = {}) {
  const dependencies = {
    items, staticDir,
    listen: mock.fn(async () => ({ words: [['ba', 'ba']], model: 'fake-ear' })),
    gradeLine: mock.fn(() => grade),
    startProfile: mock.fn(({ level }) => ({ level, turns: 0 })),
    chooseNextSet: mock.fn(async profile => ({
      itemIds: items.slice(0, 2).map(item => item.id), level: profile.level,
      profile: { ...profile, turns: profile.turns + 1 }, reason: 'PRIVATE_REASON', source: 'rule',
    })),
    ...overrides,
  };
  return { app: createApp(dependencies), ...dependencies };
}

async function request(app, url, { method = 'POST', data, type = 'application/json', headers = {} } = {}) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data === undefined ? '' : JSON.stringify(data));
  const req = Readable.from([bytes]);
  Object.assign(req, { method, url, headers: { 'content-type': type, ...headers } });
  const response = { headersSent: false };
  const res = {
    headersSent: false,
    writeHead(status, values) { response.status = status; response.headers = values; this.headersSent = true; },
    end(value) { response.body = value?.toString() || ''; },
  };
  await app(req, res);
  if (response.headers['Content-Type'].includes('application/json')) response.json = JSON.parse(response.body);
  return response;
}

test('grade passes audio alone to the ear and returns the grade with item and model', async () => {
  const { app, listen, gradeLine } = setup();
  const data = Buffer.from('test wav bytes');
  const response = await request(app, '/api/grade?item=test-0&preset=sephardi', { data, type: 'audio/wav' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json, { itemId: 'test-0', model: 'fake-ear', ...grade });
  assert.deepEqual(listen.mock.calls[0].arguments, [{ data, format: 'wav' }]);
  assert.deepEqual(gradeLine.mock.calls[0].arguments, [{ heard: [['ba', 'ba']], text: items[0].text, preset: 'sephardi' }]);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('grade rejects unknown items, invalid presets, oversized audio, and other formats', async () => {
  const { app, listen } = setup();
  for (const [url, options, status] of [
    ['/api/grade?item=missing&preset=sephardi', { type: 'audio/wav' }, 404],
    ['/api/grade?item=test-0&preset=other', { type: 'audio/wav' }, 400],
    ['/api/grade?item=test-0&preset=sephardi', { type: 'audio/wav', data: Buffer.alloc(25 * 1024 * 1024 + 1) }, 413],
    ['/api/grade?item=test-0&preset=sephardi', { type: 'audio/webm' }, 415],
    ['/api/grade?item=test-0&preset=sephardi', { type: 'audio/wav', headers: { 'content-length': 25 * 1024 * 1024 + 1 } }, 413],
  ]) {
    const response = await request(app, url, options);
    assert.equal(response.status, status);
    assert.deepEqual(Object.keys(response.json), ['error']);
  }
  assert.equal(listen.mock.callCount(), 0);
});

test('every pronunciation preset is accepted', async () => {
  const { app } = setup();
  for (const preset of ['sephardi', 'ashkenazi', 'chassidish']) {
    assert.equal((await request(app, `/api/grade?item=test-0&preset=${preset}`, {
      data: Buffer.from('wav'), type: 'audio/wav; charset=binary',
    })).status, 200);
  }
});

test('start creates a profile and requests a rule-based first set without results or a reason', async () => {
  const { app, startProfile, chooseNextSet } = setup();
  const response = await request(app, '/api/start', { data: { preset: 'ashkenazi', level: 2 } });
  assert.equal(response.status, 200);
  assert.deepEqual(startProfile.mock.calls[0].arguments, [{ level: 2 }]);
  assert.deepEqual(chooseNextSet.mock.calls[0].arguments, [{ level: 2, turns: 0 }, [], items, { useModel: false }]);
  assert.deepEqual(response.json, { profile: { level: 2, turns: 1 }, set: items.slice(0, 2) });
  assert.ok(!response.body.includes('PRIVATE_REASON'));
  assert.ok(!response.body.includes('reason'));
});

test('next forwards the set results and returns only profile, level and bank items', async () => {
  const { app, chooseNextSet } = setup();
  const profile = { level: 1, turns: 1 };
  const results = items.slice(0, 2).map(item => ({ itemId: item.id, summary, verdicts: grade.verdicts }));
  const response = await request(app, '/api/next', { data: { profile, results } });
  assert.equal(response.status, 200);
  assert.deepEqual(chooseNextSet.mock.calls[0].arguments, [profile, results, items, { useModel: true }]);
  assert.deepEqual(response.json, { profile: { level: 1, turns: 2 }, level: 1, set: items.slice(0, 2) });
  assert.ok(!response.body.includes('reason'));
  assert.ok(!response.body.includes('PRIVATE_REASON'));
});

test('JSON requests have a 1 MB cap and reject malformed input', async () => {
  const { app } = setup();
  assert.equal((await request(app, '/api/start', { data: Buffer.from('{') })).status, 400);
  assert.equal((await request(app, '/api/start', { data: Buffer.alloc(1024 * 1024 + 1) })).status, 413);
  assert.equal((await request(app, '/api/start', { data: { preset: 'other', level: 1 } })).status, 400);
  assert.equal((await request(app, '/api/start', { data: { preset: 'sephardi', level: 7 } })).status, 400);
  assert.equal((await request(app, '/api/next', { data: { profile: {}, results: [] } })).status, 400);
});

test('static files, HEAD and index fallback work; literal, encoded and symlink traversal are blocked', async () => {
  const { app } = setup();
  assert.equal((await request(app, '/app.js', { method: 'GET' })).body, 'window.station = true;');
  assert.equal((await request(app, '/bookmark', { method: 'GET' })).body, '<main>Station</main>');
  assert.equal((await request(app, '/', { method: 'HEAD' })).body, '');
  for (const url of ['/../app.js', '/%2e%2e/app.js', '/assets/%2e%2e/%2e%2e/package.json', '/%5c..%5cpackage.json', '/outside.js']) {
    assert.equal((await request(app, url, { method: 'GET' })).status, 403);
  }
});

test('audio is never written to disk, echoed, or exposed in an error', async t => {
  const writes = [
    t.mock.method(fs, 'writeFile', () => { throw new Error('Unexpected write'); }),
    t.mock.method(fs, 'writeFileSync', () => { throw new Error('Unexpected write'); }),
    t.mock.method(fs.promises, 'writeFile', async () => { throw new Error('Unexpected write'); }),
    t.mock.method(fs, 'createWriteStream', () => { throw new Error('Unexpected write'); }),
  ];
  const logs = [t.mock.method(console, 'log', () => {}), t.mock.method(console, 'error', () => {})];
  const data = Buffer.from('PRIVATE_AUDIO_BYTES');
  const success = await request(setup().app, '/api/grade?item=test-0&preset=sephardi', { data, type: 'audio/wav' });
  const failure = await request(setup({ listen: async () => { throw new Error('PRIVATE_AUDIO_BYTES secret stack'); } }).app,
    '/api/grade?item=test-0&preset=sephardi', { data, type: 'audio/wav' });
  assert.ok(!success.body.includes('PRIVATE_AUDIO_BYTES'));
  assert.equal(failure.status, 500);
  assert.deepEqual(failure.json, { error: 'Request failed' });
  for (const spy of [...writes, ...logs]) assert.equal(spy.mock.callCount(), 0);
});

test('coach cannot return items outside the bank', async () => {
  const { app } = setup({ chooseNextSet: async () => ({ profile: {}, itemIds: ['made-up', 'test-0'] }) });
  const response = await request(app, '/api/start', { data: { preset: 'sephardi', level: 1 } });
  assert.equal(response.status, 500);
  assert.deepEqual(response.json, { error: 'Request failed' });
});
