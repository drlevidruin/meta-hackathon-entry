import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const startup = () => import('./startup.js');

test('startup PIN check rejects missing, non-digit, short and long PINs without echoing them', async () => {
  const { teacherPinError } = await startup();
  for (const pin of [undefined, '', '123', '1'.repeat(13), 'abcd', '1234\n', ' 1234']) {
    const error = teacherPinError(pin);
    assert.equal(typeof error, 'string');
    assert.match(error, /TEACHER_PIN/);
    assert.doesNotMatch(error, /\n/);
    if (pin) assert.ok(!error.includes(pin));
  }
  for (const pin of ['1234', '0'.repeat(12)]) assert.equal(teacherPinError(pin), null);
});

test('startup lines describe a missing ear key, missing station build and actual listen address', async () => {
  const { startupMessages } = await startup();
  assert.deepEqual(startupMessages({ metaApiKey: '', hasStation: false, host: '127.0.0.1', port: 8787 }), [
    'BASETEN_API_KEY and META_API_KEY are missing; the ear cannot hear and lines show gray.',
    'station/dist is missing; run npm run build.',
    'Kriah Listener: http://127.0.0.1:8787',
  ]);
  const lines = startupMessages({ metaApiKey: 'PRIVATE_KEY_VALUE', hasStation: true, host: '0.0.0.0', port: 9000 });
  assert.deepEqual(lines, ['Kriah Listener: http://0.0.0.0:9000']);
  assert.doesNotMatch(lines.join(' '), /PRIVATE|KEY_VALUE/);
});

test('startup warns about the ear only when both provider keys are blank', async () => {
  const { startupMessages } = await startup();
  for (const keys of [{ basetenApiKey: 'offline-primary' }, { metaApiKey: 'offline-fallback' },
    { basetenApiKey: 'offline-primary', metaApiKey: 'offline-fallback' }]) {
    assert.deepEqual(startupMessages({ ...keys, hasStation: true, host: 'localhost', port: 8787 }),
      ['Kriah Listener: http://localhost:8787']);
  }
  assert.match(startupMessages({ basetenApiKey: ' ', metaApiKey: '\t', hasStation: true, host: 'localhost', port: 8787 })[0],
    /BASETEN_API_KEY and META_API_KEY are missing/);
});

test('listen options default to loopback and let HOST and PORT override it', async () => {
  const { listenOptions } = await startup();
  assert.deepEqual(listenOptions({}), { host: '127.0.0.1', port: 8787 });
  assert.deepEqual(listenOptions({ HOST: '0.0.0.0', PORT: '9000' }), { host: '0.0.0.0', port: 9000 });
});

test('the server entry passes the Baseten key to startup messages', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-startup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, value] of Object.entries({ TEACHER_PIN: '2468', BASETEN_API_KEY: 'offline-primary', META_API_KEY: '', DATA_DIR: directory })) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    process.env[name] = value;
  }
  const lines = [];
  t.mock.method(console, 'log', line => lines.push(line));
  t.mock.method(http, 'createServer', () => ({
    listen(_port, _host, ready) { ready(); },
    address() { return { address: '127.0.0.1', port: 8787 }; },
  }));
  await import('./index.js');
  assert.ok(lines.some(line => line === 'Kriah Listener: http://127.0.0.1:8787'));
  assert.ok(lines.every(line => !line.includes('ear cannot hear')));
  assert.ok(lines.every(line => !line.includes('offline-primary')));
});
