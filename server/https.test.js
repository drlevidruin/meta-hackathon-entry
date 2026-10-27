import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';

test('the app serves /api/config over HTTPS with a temporary certificate', { timeout: 10000 }, async t => {
  const openssl = spawnSync('openssl', ['version'], { encoding: 'utf8', timeout: 5000 });
  if (openssl.error?.code === 'ENOENT') {
    t.skip('openssl is not installed');
    return;
  }
  assert.ifError(openssl.error);
  assert.equal(openssl.status, 0, openssl.stderr);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kriah-https-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const cert = path.join(directory, 'cert.pem');
  const key = path.join(directory, 'key.pem');
  const generated = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1',
    '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1',
  ], { encoding: 'utf8', timeout: 5000 });
  assert.ifError(generated.error);
  assert.equal(generated.status, 0, generated.stderr);

  for (const [name, value] of Object.entries({
    TEACHER_PIN: '2468', BASETEN_API_KEY: '', META_API_KEY: '', TRACE: '', COACH_MODEL: 'off',
    HOST: '127.0.0.1', PORT: '0', TLS_CERT: cert, TLS_KEY: key, DATA_DIR: directory,
  })) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    process.env[name] = value;
  }

  let server;
  for (const transport of [http, https]) {
    const createServer = transport.createServer;
    t.mock.method(transport, 'createServer', (...args) => {
      server = createServer(...args);
      assert.ok(server instanceof https.Server, 'TLS settings must create an HTTPS server');
      return server;
    });
  }
  t.after(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
  const lines = [];
  t.mock.method(console, 'log', line => lines.push(line));
  try {
    await import('./index.js');
    if (!server.listening) await once(server, 'listening');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code) && error.syscall === 'listen') {
      t.skip('This environment blocks local listening sockets');
      return;
    }
    throw error;
  }
  const address = `https://127.0.0.1:${server.address().port}`;
  assert.ok(lines.includes(`Kriah Listener: ${address}`));

  const response = await new Promise((resolve, reject) => {
    const request = https.get(`${address}/api/config`, { ca: fs.readFileSync(cert), agent: false }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', reject);
    });
    request.on('error', reject);
  });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { trace: false });
});
