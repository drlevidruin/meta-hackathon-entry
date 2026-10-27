import test from 'node:test';
import assert from 'node:assert/strict';
import { modelPick } from './model.js';
import { startProfile } from './index.js';

const candidates = ['one', 'two'].map(id => ({ id, level: 1, focus: 'letter:bet', skills: ['letter:bet'] }));
const rule = { itemIds: ['one', 'two'], level: 1, reason: 'Start at level 1.' };
const response = { ok: true, json: async () => ({ choices: [{ message: { content: 'ids: one, two\nreason: Practice.' } }] }) };
function effort(t, value) {
  const previous = process.env.COACH_REASONING_EFFORT;
  if (value === undefined) delete process.env.COACH_REASONING_EFFORT;
  else process.env.COACH_REASONING_EFFORT = value;
  t.after(() => {
    if (previous === undefined) delete process.env.COACH_REASONING_EFFORT;
    else process.env.COACH_REASONING_EFFORT = previous;
  });
}

for (const override of [undefined, 'low']) {
  test(`round 2.10: model request uses 16000 tokens and effort ${override || 'minimal'}`, async t => {
    effort(t, override);
    let body;
    const picked = await modelPick(startProfile(), [], rule, [1, 2], candidates, async (_url, init) => {
      body = JSON.parse(init.body);
      return response;
    });
    assert.ok(picked);
    assert.equal(body.max_tokens, 16000);
    assert.equal(body.reasoning_effort, override || 'minimal');
  });
}

test('round 2.10: prompt supplies profile, levels and candidates without the rule answer', async () => {
  let prompt;
  await modelPick(startProfile(), [], rule, [1, 2], candidates, async (_url, init) => {
    prompt = JSON.parse(init.body).messages[0].content;
    return response;
  });
  assert.match(prompt, /Current level: 1/);
  assert.match(prompt, /Allowed levels: 1, 2/);
  assert.match(prompt, /one \| 1 \| letter:bet/);
  assert.doesNotMatch(prompt, /Rule pick|Rule reason|Start at level 1/);
});

test('round 2.10: model timeout is thirty seconds and still aborts stalled requests', async t => {
  const realSetTimeout = globalThis.setTimeout;
  const durations = [];
  t.mock.method(globalThis, 'setTimeout', (callback, duration) => {
    durations.push(duration);
    const handle = realSetTimeout(callback, duration);
    queueMicrotask(callback);
    return handle;
  });
  let signal;
  const picked = await modelPick(startProfile(), [], rule, [1], candidates, async (_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  assert.equal(picked, null);
  assert.equal(signal.aborted, true);
  assert.deepEqual(durations, [30_000]);
});
