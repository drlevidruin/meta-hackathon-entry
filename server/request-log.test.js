import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { logRequests } from './app.js';

async function serve(app) {
  const lines = [];
  const server = http.createServer(logRequests(app, line => lines.push(line)));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const send = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });
  return { lines, send, port, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

// The close event lands just after the client sees the response end.
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

test('logs one line per API request with method, path, status and milliseconds only', async () => {
  const id = '0b0c7e3a-1d2e-4f5a-8b9c-0d1e2f3a4b5c';
  const { lines, send, close } = await serve((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(req.url.startsWith('/api/children/') ? 403 : 200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
  });
  try {
    await send('/api/grade?turn=secret-turn&item=kamatz-0', {
      method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: Buffer.from('RIFFaudio-bytes'),
    });
    await send(`/api/children/${id}`, {
      method: 'PATCH', headers: { 'X-Teacher-Pin': '4321', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Levi' }),
    });
    await send('/api/teacher/check');
    await send('/assets/index.js');
    await send('/');
    await settle();
    assert.equal(lines.length, 3);
    assert.match(lines[0], /^POST \/api\/grade 200 \d+ms$/);
    assert.match(lines[1], /^PATCH \/api\/children\/:id 403 \d+ms$/);
    assert.match(lines[2], /^GET \/api\/teacher\/check 200 \d+ms$/);
    for (const secret of ['secret-turn', 'kamatz', id, '4321', 'Levi', 'RIFF', 'audio']) {
      assert.ok(!lines.join('\n').includes(secret), `log must not contain ${secret}`);
    }
  } finally {
    await close();
  }
});

test('logs a request the client abandons before the reply as aborted', async () => {
  let arrived;
  const received = new Promise(resolve => { arrived = resolve; });
  const { lines, port, close } = await serve(() => arrived());
  try {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/follow?turn=t', method: 'POST' });
    req.on('error', () => {});
    req.end('audio');
    await received;
    req.destroy();
    await settle();
    assert.deepEqual(lines.map(line => line.replace(/\d+ms$/, 'Nms')), ['POST /api/follow aborted Nms']);
  } finally {
    await close();
  }
});
