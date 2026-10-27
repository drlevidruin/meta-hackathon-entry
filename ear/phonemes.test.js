import test from 'node:test';
import assert from 'node:assert/strict';
import { hearPhonemes, phonemesReady, phonemeTimeout, phonemeUrl } from './phonemes.js';

const url = 'http://127.0.0.1:8791';
const tokens = [{ token: 'ɑ', start: 0.02, end: 0.06, top: [['ɑ', 0.91], ['a', 0.09]] }];
const reply = (value, status = 200) => ({ status, json: async () => value });

test('phonemeUrl defaults to loopback and accepts only local HTTP URLs', () => {
  assert.equal(phonemeUrl({}), url);
  for (const value of ['http://localhost:8791', 'http://[::1]:8791', url]) {
    assert.equal(phonemeUrl({ PHONEME_URL: value }), value);
  }
  for (const value of ['off', '', 'not a url', 'http://192.168.1.5:8791', 'https://127.0.0.1:8791',
    'http://localhost.example.com:8791']) assert.equal(phonemeUrl({ PHONEME_URL: value }), null);
  for (const value of [`${url}/`, 'http://user:secret@127.0.0.1:8791/base?query=1#part']) {
    assert.equal(phonemeUrl({ PHONEME_URL: value }), url);
  }
});

test('hearPhonemes posts to the origin of an explicit URL', async () => {
  let address;
  await hearPhonemes(Buffer.from('wav'), { url: 'http://user:secret@127.0.0.1:8791/base?query=1',
    fetch: async target => { address = target; return reply({ tokens }); } });
  assert.equal(address, `${url}/phonemes`);
});

test('hearPhonemes posts only the WAV buffer with an abort signal and refuses redirects', async () => {
  const audio = Buffer.from('WAV fixture');
  const result = await hearPhonemes(audio, { url, fetch: async (address, options) => {
    assert.equal(address, `${url}/phonemes`);
    assert.equal(options.method, 'POST');
    assert.deepEqual(options.headers, { 'Content-Type': 'audio/wav', 'X-Timeout-Ms': '15000' });
    assert.equal(options.body, audio);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.redirect, 'error');
    return reply({ tokens });
  } });
  assert.deepEqual(result, tokens);
});

test('hearPhonemes rejects error responses, bad JSON and malformed tokens', async () => {
  const badTokens = [null, {}, [{ ...tokens[0], token: 1 }], [{ ...tokens[0], start: Infinity }],
    [{ ...tokens[0], end: NaN }], [{ ...tokens[0], top: null }], [{ ...tokens[0], top: [['a', '0.1']] }],
    [{ ...tokens[0], top: [[1, 0.1]] }], [{ ...tokens[0], top: [['a', Infinity]] }],
    [{ ...tokens[0], top: [['a', 0.1, 'extra']] }], [null]];
  const fetches = [async () => reply({ tokens }, 201), async () => reply({ tokens }, 500),
    async () => ({ status: 200, json: async () => { throw new Error('bad JSON'); } }),
    async () => { throw new Error('offline'); }, ...badTokens.map(value => async () => reply({ tokens: value }))];
  for (const fetch of fetches) assert.equal(await hearPhonemes(Buffer.from('wav'), { url, fetch }), null);
});

test('hearPhonemes aborts a slow request and bounds a fetch that ignores abort', async () => {
  let signal;
  assert.equal(await hearPhonemes(Buffer.from('wav'), { url, timeoutMs: 5,
    fetch: async (_url, options) => { signal = options.signal; return new Promise(() => {}); } }), null);
  assert.equal(signal.aborted, true);
});

test('the default phoneme time limit grows with the audio length', () => {
  assert.equal(phonemeTimeout(Buffer.alloc(0)), 15000);
  assert.equal(phonemeTimeout(Buffer.alloc(5 * 32000)), 15000);
  assert.equal(phonemeTimeout(Buffer.alloc(6 * 32000)), 18000);
  assert.equal(phonemeTimeout(Buffer.alloc(672044)), 66000);
});

test('hearPhonemes refuses remote, HTTPS and disabled explicit URLs without calling fetch', async () => {
  for (const value of [null, '', 'off', 'https://127.0.0.1:8791', 'http://example.com']) {
    assert.equal(await hearPhonemes(Buffer.from('wav'), { url: value,
      fetch: () => assert.fail('unsafe URL reached fetch') }), null);
  }
});

test('phonemesReady checks local health and contains every failure', async () => {
  assert.equal(await phonemesReady({ url, fetch: async (address, options) => {
    assert.equal(address, `${url}/health`);
    assert.equal(options.method, 'GET');
    return reply({ ok: true });
  } }), true);
  for (const fetch of [async () => reply({ ok: false }), async () => reply({ ok: true }, 503),
    async () => reply(null), async () => { throw new Error('offline'); },
    async () => ({ status: 200, json: async () => { throw new Error('bad JSON'); } })]) {
    assert.equal(await phonemesReady({ url, fetch }), false);
  }
  assert.equal(await phonemesReady({ url, timeoutMs: 5, fetch: () => new Promise(() => {}) }), false);
  assert.equal(await phonemesReady({ url: 'http://example.com', fetch: () => assert.fail('remote health') }), false);
});
