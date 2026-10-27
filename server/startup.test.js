import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

test('TLS options keep HTTP when both paths are unset or empty', async () => {
  const { tlsOptions } = await startup();
  for (const env of [{}, { TLS_CERT: '', TLS_KEY: '' }]) {
    assert.equal(tlsOptions(env, () => assert.fail('HTTP must not read TLS files')), null);
  }
});

test('TLS options require both paths before reading either file', async () => {
  const { tlsOptions } = await startup();
  for (const [env, missing] of [
    [{ TLS_CERT: 'private-cert-path' }, 'TLS_KEY'],
    [{ TLS_CERT: 'private-cert-path', TLS_KEY: '' }, 'TLS_KEY'],
    [{ TLS_KEY: 'private-key-path' }, 'TLS_CERT'],
    [{ TLS_CERT: '', TLS_KEY: 'private-key-path' }, 'TLS_CERT'],
  ]) {
    assert.throws(() => tlsOptions(env, () => assert.fail('Do not read an incomplete pair')), {
      message: `${missing} is missing; set both TLS_CERT and TLS_KEY.`,
    });
  }
});

test('TLS options read the certificate and key as buffers', async () => {
  const { tlsOptions } = await startup();
  const cert = Buffer.from('TEST_CERTIFICATE_CONTENT');
  const key = Buffer.from('TEST_KEY_CONTENT');
  const paths = [];
  const options = tlsOptions({ TLS_CERT: 'certs/server-cert.pem', TLS_KEY: 'certs/server-key.pem' }, file => {
    paths.push(file);
    return file.endsWith('server-cert.pem') ? cert : key;
  });
  assert.deepEqual(paths, ['certs/server-cert.pem', 'certs/server-key.pem']);
  assert.deepEqual(options, { cert, key });
});

test('TLS read errors name the variable without leaking paths, contents or error details', async () => {
  const { tlsOptions } = await startup();
  for (const variable of ['TLS_CERT', 'TLS_KEY']) {
    const env = { TLS_CERT: 'private-cert-path', TLS_KEY: 'private-key-path' };
    assert.throws(() => tlsOptions(env, file => {
      if (file === env[variable]) throw new Error('PRIVATE_FILE_CONTENT\nprivate-path');
      return Buffer.from('PRIVATE_FILE_CONTENT');
    }), { message: `${variable} could not be read.` });
  }
});

test('startup address uses HTTPS when TLS is enabled, including IPv6', async () => {
  const { startupMessages } = await startup();
  for (const [host, address] of [['0.0.0.0', '0.0.0.0'], ['::1', '[::1]']]) {
    assert.deepEqual(startupMessages({
      metaApiKey: 'offline-fallback', hasStation: true, host, port: 9000, tls: true,
    }), [`Kriah Listener: https://${address}:9000`]);
  }
});

test('the server exits with one safe line for incomplete or unreadable TLS files', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-tls-errors-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const readable = fileURLToPath(new URL('./startup.test.js', import.meta.url));
  const missing = path.join(directory, 'missing.pem');
  for (const [tls, expected] of [
    [{ TLS_CERT: readable, TLS_KEY: '' }, 'TLS_KEY is missing; set both TLS_CERT and TLS_KEY.'],
    [{ TLS_CERT: '', TLS_KEY: readable }, 'TLS_CERT is missing; set both TLS_CERT and TLS_KEY.'],
    [{ TLS_CERT: missing, TLS_KEY: readable }, 'TLS_CERT could not be read.'],
    [{ TLS_CERT: readable, TLS_KEY: missing }, 'TLS_KEY could not be read.'],
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], {
      env: { ...process.env, TEACHER_PIN: '2468', HOST: '127.0.0.1', PORT: '0', ...tls },
      encoding: 'utf8', timeout: 5000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, `${expected}\n`);
  }
});

test('the server entry passes the Baseten key to startup messages', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-startup-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, value] of Object.entries({
    TEACHER_PIN: '2468', BASETEN_API_KEY: 'offline-primary', META_API_KEY: '', DATA_DIR: directory,
    TLS_CERT: '', TLS_KEY: '',
  })) {
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
