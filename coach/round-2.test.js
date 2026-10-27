import test from 'node:test';
import assert from 'node:assert/strict';
import * as coach from './index.js';
import { gradeLine } from '../grader/index.js';
import { expectedSounds } from '../rulebook/index.js';

const K = 'vowel:kamatz';
const B = 'letter:bet';
const item = (id, level, focus = K) => ({ id, level, text: 'בָּ', words: ['בָּ'],
  focus, skills: [B, K], source: {}, flags: [] });
const items = [1, 2, 3, 4, 5, 6].flatMap(level =>
  ['a', 'b', 'c'].map(id => item(`${level}-${id}`, level)));
const choose = (profile, results = [], bank = items, options = {}) =>
  coach.chooseNextSet(profile, results, bank, { useModel: false, ...options });
const read = (id, heard) => ({ itemId: id,
  ...gradeLine({ text: 'בָּ', preset: 'ashkenazi', heard }) });

test('round 2.1: startTurn resets only per-turn state and returns an independent copy', async () => {
  assert.equal(typeof coach.startTurn, 'function');
  const profile = coach.startProfile({ level: 3 });
  Object.assign(profile, { checkpoints: 8, cleanAtLevel: { clean: true, held: [[K], [B], [K]] },
    skills: { [K]: { tries: 12, misses: 3, recent: [1, 1, 0], demotedAt: 10 } },
    seen: ['3-a'], proven: [K] });
  const before = structuredClone(profile);
  const started = coach.startTurn(profile);
  assert.deepEqual(started, { ...profile, checkpoints: 0, cleanAtLevel: { clean: false, held: [] } });
  const selected = await choose(started);
  assert.equal(selected.done, false);
  assert.equal(selected.level, 3);
  assert.equal(selected.decision.why, 'start');
  started.skills[K].recent.push(1);
  started.seen.push('3-b');
  started.proven.push(B);
  assert.deepEqual(profile, before);
});

test('round 2.1: empty results never return done even with old stop state', async () => {
  const profile = coach.startProfile({ level: 3 });
  profile.checkpoints = 8;
  profile.skills[K] = { tries: 9, misses: 3, recent: [1, 0, 1] };
  profile.cleanAtLevel.held = [[K], [K], [K]];
  const picked = await choose(profile, [], items, { elapsedMs: 240_000 });
  assert.equal(picked.done, false);
  assert.ok(picked.itemIds.length);
});

test('round 2.1: challenge cadence starts again at checkpoint two of each turn', async () => {
  assert.equal(typeof coach.startTurn, 'function');
  const bank = [...items, { ...item('challenge', 4), source: { challenge: true } }];
  let profile = coach.startProfile();
  profile.checkpoints = 7;
  profile.skills = Object.fromEntries([B, K].map(id => [id, { tries: 5, misses: 0, recent: [0] }]));
  for (let turn = 0; turn < 2; turn++) {
    profile = coach.startTurn(profile);
    assert.equal((await choose(profile, [], bank)).decision.challengeId, null);
    for (let checkpoint = 1; checkpoint <= 2; checkpoint++) {
      const id = `${profile.level}-a`;
      const picked = await choose(profile, [read(id, [['bo']])], bank);
      assert.equal(picked.profile.checkpoints, checkpoint);
      assert.equal(picked.decision.challengeId, checkpoint === 2 ? 'challenge' : null);
      profile = picked.profile;
    }
  }
});

for (const summaryOnly of [false, true]) {
  test(`round 2.3: two extra-only lines add tries without misses, summary only ${summaryOnly}`, async () => {
    const results = ['2-a', '2-b'].map(id => read(id, [['bo'], ['ga']]));
    for (const result of results) {
      assert.equal(result.summary.ok, result.summary.pairs);
      assert.equal(result.summary.extra, 1);
      if (summaryOnly) delete result.verdicts;
    }
    const picked = await choose(coach.startProfile({ level: 2 }), results);
    assert.equal(picked.level, 2);
    assert.equal(picked.profile.cleanAtLevel.clean, false);
    for (const id of [B, K]) assert.deepEqual(picked.profile.skills[id],
      { tries: 2, misses: 0, recent: [0, 0] });
  });

  test(`round 2.3: uncertain-only lines add no misses, summary only ${summaryOnly}`, async () => {
    const result = read('2-a', [['?']]);
    if (summaryOnly) delete result.verdicts;
    const picked = await choose(coach.startProfile({ level: 2 }), [result]);
    assert.equal(picked.level, 2);
    assert.equal(picked.profile.cleanAtLevel.clean, false);
    assert.ok(Object.values(picked.profile.skills).every(record => record.misses === 0));
    assert.equal(picked.profile.skills[B], undefined);
  });
}

test('round 2.4: not_decoded and a wrong vowel elsewhere both record misses', () => {
  const text = 'הָעוֹלָם שַׁבָּת';
  const word = item('mixed', 3);
  word.text = text;
  word.skills = [...new Set(text.split(' ').flatMap(text => expectedSounds(text, 'ashkenazi').skills))];
  const graded = gradeLine({ text, preset: 'ashkenazi', heard: [['ha', 'ma', 'kom'], ['shi', 'bos']] });
  assert.equal(graded.words[0].verdict, 'not_decoded');
  assert.equal(graded.words[1].pairs[0].verdict, 'wrong_vowel');
  for (const summaryPresent of [true, false]) {
    const result = structuredClone({ itemId: 'mixed', ...graded });
    if (!summaryPresent) delete result.summary.missedSkills;
    const profile = coach.updateProfile(coach.startProfile({ level: 3 }), [result], [word]);
    for (const id of ['letter:hei', 'letter:ayin', 'vowel:patach']) {
      assert.equal(profile.skills[id]?.misses, 1, `${id}, summary ${summaryPresent}`);
    }
  }
});

test('round 2.7: a step down names the missed skill even when the first focus differs', async () => {
  const bank = items.map(item => ({ ...item, focus: B }));
  const picked = await choose(coach.startProfile({ level: 3 }),
    ['3-a', '3-b'].map(id => read(id, [['bi']])), bank);
  assert.equal(picked.decision.target, K);
  assert.equal(picked.decision.focus, B);
  assert.equal(coach.explain(picked.decision),
    '2 misses at level 3; dropped to syllables to practice the vowel kamatz.');
});

test('round 2.7: a retry names the recent miss rather than the first focus', async () => {
  const bank = items.map(item => ({ ...item, focus: B }));
  const picked = await choose(coach.startProfile({ level: 3 }), [read('3-a', [['bi']])], bank);
  assert.equal(picked.decision.target, K);
  assert.equal(coach.explain(picked.decision), 'Held level 3 and gave the vowel kamatz another try.');
});

test('round 2.7: a hold without a recent miss uses plain wording', async () => {
  const picked = await choose(coach.startProfile({ level: 3 }), [read('3-a', [['bo'], ['ga']])]);
  assert.equal(coach.explain(picked.decision), 'Held level 3 for more practice.');
});

test('round 2.7: a model step down without a recent miss uses plain wording', () => {
  assert.equal(coach.explain({ move: 'down', from: 3, level: 2, target: K,
    focus: B, recentMisses: 0, why: 'mixed', misses: 0 }), 'Dropped to syllables.');
});

test('round 2.7: a clamped step down says held at level one', async () => {
  const picked = await choose(coach.startProfile(), ['1-a', '1-b'].map(id => read(id, [['bi']])));
  assert.equal(picked.decision.move, 'stay');
  assert.equal(coach.explain(picked.decision), 'Held level 1 and gave the vowel kamatz another try.');
});
