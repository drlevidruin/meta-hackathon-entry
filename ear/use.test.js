import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { listen } from './hear.js';

const audio = { data: Buffer.from('offline reading'), format: 'wav' };

function fakeEar(t, slots) {
  const previous = process.env.META_API_KEY;
  process.env.META_API_KEY = 'offline-primary-placeholder';
  const calls = [];
  const arrived = [];
  const aborted = [];
  const timers = [];
  t.after(() => {
    if (previous === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = previous;
    for (const timer of timers) clearTimeout(timer);
  });
  const fetch = (url, init) => new Promise((resolve, reject) => {
    const index = calls.length;
    calls.push({ url, init });
    const { delay, raw = 'ba', status = 200, error } = slots[index];
    const abort = () => {
      clearTimeout(timer);
      aborted.push(index);
      reject(init.signal.reason);
    };
    const timer = setTimeout(() => {
      init.signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else if (status !== 200) resolve(new Response('', { status }));
      else {
        arrived.push(index);
        resolve(Response.json({ choices: [{ message: { content: raw } }], usage: {
          prompt_tokens: index + 1, completion_tokens: 2 * (index + 1), total_tokens: 3 * (index + 1),
        } }));
      }
    }, delay);
    timers.push(timer);
    init.signal.addEventListener('abort', abort, { once: true });
  });
  return { fetch, calls, arrived, aborted };
}

test('use combines the first three answers in slot order and aborts both spare calls', async t => {
  const ear = fakeEar(t, [
    { delay: 100, raw: 'ba' }, { delay: 30, raw: 'ka' }, { delay: 10, raw: 'ma' },
    { delay: 90, raw: 'na' }, { delay: 20, raw: 'ra' },
  ]);
  const reference = { data: Buffer.from('offline voice card'), format: 'wav' };
  const result = await listen(audio, { votes: 5, use: 3, reference, fetch: ear.fetch });
  assert.equal(ear.calls.length, 5);
  assert.deepEqual(ear.arrived, [2, 4, 1]);
  assert.deepEqual(ear.aborted.sort(), [0, 3]);
  assert.deepEqual(ear.calls.map(({ init }) => init.signal.aborted), [true, false, false, true, false]);
  for (const { init } of ear.calls) {
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'muse-wonder-1.0');
    assert.equal(body.messages[0].content.filter(part => part.type === 'input_audio').length, 2);
  }
  assert.deepEqual(result.words, [['ka']]);
  assert.deepEqual(result.answers, [[['ka']], [['ma']], [['ra']]]);
  assert.equal(result.raw, 'ka');
  assert.equal(result.card, true);
  assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 });
  assert.deepEqual(result.votes, { asked: 5, answered: 3, used: 3 });
});

test('two failed slots still leave three answers to use', async t => {
  const ear = fakeEar(t, [
    { delay: 10, error: new Error('offline failure') }, { delay: 50, raw: 'ka' },
    { delay: 20, status: 503 }, { delay: 40, raw: 'ma' }, { delay: 30, raw: 'ka' },
  ]);
  const result = await listen(audio, { votes: 5, use: 3, fetch: ear.fetch });
  assert.equal(ear.calls.length, 5);
  assert.deepEqual(ear.arrived, [4, 3, 1]);
  assert.deepEqual(ear.aborted, []);
  assert.deepEqual(result.answers, [[['ka']], [['ma']], [['ka']]]);
  assert.deepEqual(result.words, [['ka']]);
  assert.deepEqual(result.votes, { asked: 5, answered: 3, used: 3 });
});

test('use waits for every slot when fewer than three answers can arrive', async t => {
  const ear = fakeEar(t, [
    { delay: 40, status: 503 }, { delay: 20, raw: 'ka' }, { delay: 10, status: 503 },
    { delay: 30, raw: 'ma' }, { delay: 50, status: 503 },
  ]);
  const result = await listen(audio, { votes: 5, use: 3, fetch: ear.fetch });
  assert.equal(ear.calls.length, 5);
  assert.deepEqual(ear.aborted, []);
  assert.deepEqual(result.answers, [[['ka']], [['ma']]]);
  assert.deepEqual(result.words, [['ka']]);
  assert.deepEqual(result.votes, { asked: 5, answered: 2, used: 2 });
});

test('three votes without use and with use equal to votes keep the original requests and report', async t => {
  let previous;
  for (const options of [{ votes: 3 }, { votes: 3, use: 3 }]) {
    const ear = fakeEar(t, [
      { delay: 30, raw: 'ka' }, { delay: 20, raw: 'ma' }, { delay: 10, raw: 'ra' },
    ]);
    const result = await listen(audio, { ...options, fetch: ear.fetch });
    assert.deepEqual(ear.arrived, [2, 1, 0]);
    assert.deepEqual(ear.aborted, []);
    assert.equal(ear.calls.length, 3);
    const prompt = readFileSync(new URL('./prompt.md', import.meta.url), 'utf8');
    for (const { url, init } of ear.calls) {
      assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
      assert.equal(init.method, 'POST');
      assert.deepEqual(init.headers, {
        'Content-Type': 'application/json', Authorization: 'Bearer offline-primary-placeholder',
      });
      assert.ok(init.signal instanceof AbortSignal);
      assert.equal(init.signal.aborted, false);
      assert.deepEqual(JSON.parse(init.body), {
        model: 'muse-wonder-1.0',
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'input_audio', input_audio: { data: audio.data.toString('base64'), format: 'wav' } },
        ] }],
        max_tokens: 8192, temperature: 0, reasoning_effort: process.env.EAR_REASONING_EFFORT || 'minimal',
      });
    }
    assert.deepEqual(result.words, [['ka']]);
    assert.deepEqual(result.answers, [[['ka']], [['ma']], [['ra']]]);
    assert.deepEqual(result.votes, { asked: 3, answered: 3 });
    if (previous) assert.deepEqual(result, previous);
    previous = result;
  }
});

test('use preserves failure text after every slot fails', async t => {
  const ear = fakeEar(t, Array.from({ length: 5 }, (_, index) => ({ delay: 10 * (index + 1), status: 503 })));
  await assert.rejects(listen(audio, { model: 'primary', votes: 5, use: 3, fetch: ear.fetch }), {
    message: `No ear model returned an answer (${Array(5).fill('primary: HTTP 503').join('; ')}).`,
  });
  assert.deepEqual(ear.aborted, []);
});

test('use leaves the per-call timeout active', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const ear = fakeEar(t, Array.from({ length: 5 }, () => ({ delay: 130_000 })));
  const pending = listen(audio, { model: 'primary', votes: 5, use: 3, fetch: ear.fetch });
  const rejected = assert.rejects(pending, {
    message: `No ear model returned an answer (${Array(5).fill('primary: timed out').join('; ')}).`,
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ear.calls.length, 5);
  t.mock.timers.tick(120_000);
  await rejected;
  assert.deepEqual(ear.aborted, [0, 1, 2, 3, 4]);
});

test('listen rejects invalid use before making any requests', async () => {
  let calls = 0;
  for (const use of [0, 4, -1, 2.5, '3', null, true, NaN, Infinity, [], {}]) {
    await assert.rejects(listen(audio, { votes: 3, use, fetch: async () => { calls += 1; } }), {
      message: 'Use must be a whole number from 1 to votes.',
    });
  }
  assert.equal(calls, 0);
});
