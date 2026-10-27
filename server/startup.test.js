import test from 'node:test';
import assert from 'node:assert/strict';

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
    'META_API_KEY is missing; the ear cannot hear and lines show gray.',
    'station/dist is missing; run cd station && npm run build.',
    'Kriah Listener: http://127.0.0.1:8787',
  ]);
  const lines = startupMessages({ metaApiKey: 'PRIVATE_KEY_VALUE', hasStation: true, host: '0.0.0.0', port: 9000 });
  assert.deepEqual(lines, ['Kriah Listener: http://0.0.0.0:9000']);
  assert.doesNotMatch(lines.join(' '), /PRIVATE|KEY_VALUE/);
});

test('listen options default to loopback and let HOST and PORT override it', async () => {
  const { listenOptions } = await startup();
  assert.deepEqual(listenOptions({}), { host: '127.0.0.1', port: 8787 });
  assert.deepEqual(listenOptions({ HOST: '0.0.0.0', PORT: '9000' }), { host: '0.0.0.0', port: 9000 });
});
