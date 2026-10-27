import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseNextSet, explain, ruleNextSet, startProfile } from './index.js';

const items = [1, 2, 4].flatMap(level => ['a', 'b', 'c'].map(id => ({
  id: `${level}-${id}`, level, skills: ['vowel:kamatz'], focus: 'vowel:kamatz',
})));

test('a first set snapped down to an available level starts without consuming demotion evidence', async () => {
  const profile = startProfile({ level: 6 });
  profile.skills = {
    'vowel:kamatz': { tries: 5, misses: 2, recent: [0, 0, 0, 1, 1], demotedAt: 2 },
    'letter:bet': { tries: 3, misses: 0, recent: [0, 0, 0] },
  };
  profile.cleanAtLevel = { clean: true, held: [['vowel:kamatz'], ['letter:bet']] };
  const picked = await chooseNextSet(profile, [], items, { useModel: false });
  assert.equal(picked.decision.move, 'start');
  assert.equal(picked.decision.why, 'start');
  assert.equal(picked.level, 4);
  assert.equal(picked.decision.level, 4);
  assert.equal(picked.decision.from, 4);
  assert.equal(picked.profile.level, 4);
  assert.deepEqual(picked.profile.skills, profile.skills);
  assert.deepEqual(picked.profile.cleanAtLevel, profile.cleanAtLevel);
  assert.equal(explain(picked.decision), 'Started at level 4 with a focus on the vowel kamatz.');
});

test('a first set below all available levels starts at the lowest available level', async () => {
  const bank = [2, 3].map(level => ({ ...items[0], id: `level-${level}`, level }));
  const picked = await chooseNextSet(startProfile(), [], bank, { useModel: false });
  assert.equal(picked.decision.move, 'start');
  assert.equal(picked.decision.why, 'start');
  assert.equal(picked.level, 2);
  assert.equal(picked.decision.from, 2);
  assert.equal(explain(picked.decision), 'Started at level 2 with a focus on the vowel kamatz.');
});

test('rule levels snap and move between the available regular levels', async () => {
  for (const [level, state, expected] of [[2, 'clean', 4], [4, 'missed', 2], [3, 'start', 2],
    [4, 'clean', 4], [6, 'start', 4], [3, 'mixed', 2], [1, 'missed', 1]]) {
    const profile = startProfile({ level });
    if (state !== 'start') profile.checkpoints = 1;
    profile.cleanAtLevel.clean = state === 'clean';
    if (state === 'missed') profile.skills['vowel:kamatz'] = { tries: 2, misses: 2, recent: [1, 1] };
    assert.equal(ruleNextSet(profile, items).level, expected);
    const picked = await chooseNextSet(profile, [], items, { useModel: false });
    assert.equal(picked.level, expected);
    assert.ok(picked.itemIds.length);
  }
});

test('model candidates use the snapped level and nearest available neighbors', async t => {
  const previous = process.env.META_API_KEY;
  process.env.META_API_KEY = 'offline-test';
  t.after(() => {
    if (previous === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = previous;
  });
  let prompt;
  await chooseNextSet(startProfile({ level: 4 }), [], items, { fetch: async (_, options) => {
    prompt = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ids: 2-a, 2-b\nreason: Practice.' } }] }) };
  } });
  const text = JSON.stringify(prompt);
  assert.ok(prompt.messages[0].content.includes('Allowed levels: 2, 4\n'));
  assert.ok(text.includes('2-a'));
  assert.ok(text.includes('4-a'));
  assert.ok(!text.includes('1-a'));
});

test('an empty bank or challenge-only bank throws even when the turn could stop', async () => {
  for (const bank of [[], [{ ...items[0], level: 4, source: { challenge: true } }]]) {
    assert.throws(() => ruleNextSet(startProfile(), bank), RangeError);
    await assert.rejects(chooseNextSet(startProfile(), [], bank), RangeError);
    const profile = startProfile();
    profile.checkpoints = 8;
    await assert.rejects(chooseNextSet(profile, [], bank), RangeError);
  }
});
