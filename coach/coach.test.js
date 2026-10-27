import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startProfile, updateProfile, ruleNextSet, chooseNextSet, explain, turnFacts } from './index.js';
import { expectedSounds } from '../rulebook/index.js';
import { gradeLine } from '../grader/index.js';

const K = 'vowel:kamatz';
const T = 'vowel:tzere';
const B = 'letter:bet';
const P = 'pattern:closed_syllable';
const item = (id, level, focus = K, skills = [K], source = {}) => ({
  id, level, focus, skills, text: 'בָּ', words: ['בָּ'], flags: [], source,
});
const items = [1, 2, 3, 4, 5, 6].flatMap(level => [
  item(`L${level}-a`, level), item(`L${level}-b`, level), item(`L${level}-c`, level),
  item(`L${level}-d`, level, T, [T]), item(`L${level}-e`, level, B, [B, K]),
]);
const result = (itemId, missedSkills = [], overrides = {}) => ({
  itemId,
  summary: {
    pairs: 2, ok: missedSkills.length ? 1 : 2,
    wrong_letter: 0, wrong_vowel: missedSkills.length ? 1 : 0,
    skipped: 0, extra: 0, uncertain: 0, not_decoded: 0, missedSkills,
    ...overrides,
  },
  verdicts: missedSkills.length ? [{
    text: 'בָּ', verdict: 'wrong_vowel', expected: ['bo'], heard: 'vo', skills: missedSkills,
  }] : [],
});
const checkpoint = (level, missed = []) => [result(`L${level}-a`, missed), result(`L${level}-b`, missed)];
const choose = (profile, results = [], bank = items, options = {}) =>
  chooseNextSet(profile, results, bank, { useModel: false, ...options });
const skill = (tries, misses, recent) => ({ tries, misses, recent });
const roundTrip = profile => JSON.parse(JSON.stringify(profile));

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function keyFor(t, key = 'offline-test-token') {
  const previous = process.env.META_API_KEY;
  if (key === null) delete process.env.META_API_KEY;
  else process.env.META_API_KEY = key;
  t.after(() => {
    if (previous === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = previous;
  });
}

const answer = content => ({ ok: true, json: async () => ({ choices: [{ message: { content } }] }) });
const idsAnswer = ids => answer(`ids: ${ids.join(', ')}\nreason: Revisit the vowel contrast in shorter lines.`);
const modelChoose = (profile, results, fetcher, bank = items) =>
  chooseNextSet(profile, results, bank, { fetch: fetcher });

for (const summaryPresent of [true, false]) {
  test(`blame: two sha-vos lines target bet without crediting kamatz, summary ${summaryPresent}`, async () => {
    const word = expectedSounds('שַׁבָּת', 'ashkenazi');
    const bank = [...items, { ...item('read', 3, B, word.skills), text: word.word }];
    const graded = gradeLine({ text: word.word, preset: 'ashkenazi', heard: [['sha', 'vos']] });
    if (!summaryPresent) graded.summary.missedSkills = [];
    const results = [1, 2].map(() => ({ itemId: 'read', ...graded }));
    const picked = await choose(startProfile({ level: 3 }), results, bank);
    assert.equal(picked.level, 2);
    assert.equal(picked.decision.target, B);
    assert.equal(picked.profile.skills[B].tries, 2);
    assert.equal(picked.profile.skills[B].misses, 2);
    assert.deepEqual(picked.profile.skills[B].recent, [1, 1]);
    assert.equal(picked.profile.skills[K], undefined);
    assert.equal(turnFacts(picked.profile).next, B);
  });
}

test('review 2: demotion consumes evidence across empty calls and needs two fresh misses', async () => {
  let picked = await choose(startProfile({ level: 4 }), checkpoint(4, [K]));
  assert.equal(picked.level, 3);
  const evidence = structuredClone(picked.profile.skills[K]);
  for (let call = 0; call < 2; call++) {
    picked = await choose(roundTrip(picked.profile));
    assert.equal(picked.level, 3);
    assert.deepEqual(picked.profile.skills[K], evidence);
    assert.equal(turnFacts(picked.profile).next, K);
  }
  picked = await choose(roundTrip(picked.profile), [result('L3-a', [K])]);
  assert.equal(picked.level, 3);
  picked = await choose(roundTrip(picked.profile), [result('L3-b', [K])]);
  assert.equal(picked.level, 2);
});

test('review 2: one demotion consumes simultaneous miss evidence for other skills', async () => {
  const picked = await choose(startProfile({ level: 4 }), [
    ...checkpoint(4, [K]), result('L4-d', [T]), result('L4-d', [T]),
  ]);
  assert.equal(picked.level, 3);
  assert.equal((await choose(roundTrip(picked.profile))).level, 3);
});

test('review 6: challenge-only checkpoints do not append holds or stop the turn early', async () => {
  let profile = startProfile({ level: 2 });
  profile.skills[K] = skill(3, 0, [0, 0, 0]);
  profile.cleanAtLevel.held = [[K], [K]];
  for (let count = 0; count < 3; count++) {
    const picked = await choose(roundTrip(profile), [result('challenge-k')], challengeBank);
    assert.equal(picked.done, false);
    assert.equal(picked.level, 2);
    assert.deepEqual(picked.profile.cleanAtLevel.held, [[K], [K]]);
    profile = picked.profile;
  }
});

test('review 7: clean turns and skills with no recent misses have no next skill', () => {
  const clean = updateProfile(startProfile({ level: 2 }), checkpoint(2), items);
  assert.equal(turnFacts(clean).next, null);
  clean.skills[T] = skill(10, 4, [0, 0, 0, 0, 0, 0]);
  assert.equal(turnFacts(clean).next, null);
});

for (const [shape, raw] of [
  ['reversed labels', 'reason: Practice the contrast.\nids: L2-a, L2-b'],
  ['mixed case labels', 'IdS: L2-a, L2-b\nReAsOn: Practice the contrast.'],
  ['extra spaces', '  ids  :   L2-a ,  L2-b   \n  reason  :  Practice the contrast.  '],
  ['surrounding blank lines', '\n\nids: L2-a, L2-b\nreason: Practice the contrast.\n\n'],
  ['wrapping code fence', '```text\nids: L2-a, L2-b\nreason: Practice the contrast.\n```'],
  ['surrounding commentary', 'Here is my choice.\nids: L2-a, L2-b\nreason: Practice the contrast.\nThat is all.'],
  ['space-separated ids', 'ids: L2-a L2-b\nreason: Practice the contrast.'],
  ['mixed separators and CRLF', 'ids: L2-a, L2-b L2-c\r\nreason: Practice the contrast.'],
]) {
  test(`model parse: accepts ${shape}`, async t => {
    keyFor(t);
    const picked = await modelChoose(startProfile({ level: 2 }), [], async () => answer(raw));
    assert.equal(picked.source, 'model');
    assert.deepEqual(picked.itemIds, shape === 'mixed separators and CRLF'
      ? ['L2-a', 'L2-b', 'L2-c'] : ['L2-a', 'L2-b']);
    assert.equal(picked.reason, 'Practice the contrast.');
  });
}

test('model parse: no ids line falls back to the rule plan', async t => {
  keyFor(t);
  const profile = startProfile({ level: 2 });
  assert.deepEqual(await modelChoose(profile, [], async () => answer('reason: Practice the contrast.')),
    await choose(profile));
});

test('startProfile returns independent versioned profiles and clamps levels', () => {
  const a = startProfile();
  const b = startProfile();
  assert.deepEqual(a, {
    version: 1, level: 1, checkpoints: 0, cleanAtLevel: { clean: false, held: [] },
    skills: {}, proven: [], seen: [],
  });
  a.seen.push('changed');
  a.skills[K] = skill(1, 0, [0]);
  assert.deepEqual(b.seen, []);
  assert.deepEqual(b.skills, {});
  assert.equal(startProfile({ level: 0 }).level, 1);
  assert.equal(startProfile({ level: 20 }).level, 6);
  assert.equal(startProfile({ level: 4 }).level, 4);
});

test('updateProfile counts one mark per skill per line without mutating any inputs', () => {
  const bank = freeze([item('line', 2, K, [B, K, K])]);
  const profile = freeze(startProfile({ level: 2 }));
  const results = freeze([result('line', [K]), result('line')]);
  const updated = updateProfile(profile, results, bank);
  assert.deepEqual(profile, startProfile({ level: 2 }));
  assert.deepEqual(updated.skills[K], skill(2, 1, [1, 0]));
  assert.deepEqual(updated.skills[B], skill(2, 0, [0, 0]));
  assert.equal(updated.checkpoints, 1);
  assert.equal(updated.level, 2);
  assert.equal(updated.cleanAtLevel.clean, false);
  assert.deepEqual(updated.seen, ['line', 'line']);
});

test('empty results clone the profile without recording a checkpoint', () => {
  const profile = startProfile();
  const copy = updateProfile(profile, [], items);
  assert.deepEqual(copy, profile);
  assert.notEqual(copy, profile);
  assert.notEqual(copy.skills, profile.skills);
});

test('recent retains six marks, seen retains 40 ids, and lifetime counts keep growing', () => {
  const bank = Array.from({ length: 45 }, (_, index) => item(`line-${index}`, 2));
  let profile = startProfile({ level: 2 });
  for (let index = 0; index < bank.length; index++) {
    profile = updateProfile(profile, [result(bank[index].id, index % 2 ? [] : [K])], bank);
  }
  assert.deepEqual(profile.skills[K], skill(45, 23, [0, 1, 0, 1, 0, 1]));
  assert.deepEqual(profile.seen, bank.slice(5).map(line => line.id));
  assert.equal(profile.checkpoints, 45);
});

test('unknown result ids fail without changing the profile', () => {
  const profile = freeze(startProfile());
  assert.throws(() => updateProfile(profile, [result('unknown')], items), /Unknown result item/);
  assert.equal(profile.checkpoints, 0);
});

test('extras, uncertain, skipped and undecoded lines cannot be clean checkpoints', () => {
  for (const status of ['wrong_letter', 'wrong_vowel', 'skipped', 'extra', 'uncertain', 'not_decoded']) {
    const profile = updateProfile(startProfile({ level: 2 }), [
      result('L2-a', [], { [status]: 1 }), result('L2-b'),
    ], items);
    assert.equal(profile.cleanAtLevel.clean, false, status);
  }
  const empty = updateProfile(startProfile({ level: 2 }), [result('L2-a', [], { pairs: 0, ok: 0 })], items);
  assert.equal(empty.cleanAtLevel.clean, false);
});

test('unplaced failures do not establish clean skills, and blame fills missing summary skills', () => {
  const failed = result('L2-e', [], { pairs: 2, ok: 0, not_decoded: 2 });
  let updated = updateProfile(startProfile({ level: 2 }), [failed], items);
  assert.deepEqual(updated.skills[B], skill(1, 1, [1]));
  assert.deepEqual(updated.skills[K], skill(1, 1, [1]));
  failed.verdicts = [{ verdict: 'wrong_letter', skills: [B, K], blame: [B] }];
  updated = updateProfile(startProfile({ level: 2 }), [failed], items);
  assert.deepEqual(updated.skills[B], skill(1, 1, [1]));
  assert.equal(updated.skills[K], undefined);
});

test('clean checkpoints step up once and returned decisions describe the chosen set', async () => {
  const original = freeze(startProfile({ level: 2 }));
  const picked = await choose(original, checkpoint(2));
  assert.equal(picked.level, 3);
  assert.equal(picked.profile.level, 3);
  assert.equal(picked.profile.checkpoints, 1);
  assert.equal(picked.itemIds.length, 3);
  assert.ok(picked.itemIds.every(id => items.find(line => line.id === id).level === 3));
  assert.deepEqual(picked.decision, {
    move: 'up', from: 2, level: 3, target: K, focus: K, recentMisses: 0,
    why: 'clean', misses: 0, challengeId: null,
  });
  assert.equal(original.level, 2);
  assert.equal(original.checkpoints, 0);
});

test('two latest misses of a skill step down once and target that skill', async () => {
  let profile = startProfile({ level: 3 });
  const first = await choose(profile, [result('L3-d', [T]), result('L3-a')]);
  assert.equal(first.level, 3);
  assert.equal(first.decision.move, 'stay');
  profile = roundTrip(first.profile);
  const second = await choose(profile, [result('L3-d', [T]), result('L3-b')]);
  assert.equal(second.level, 2);
  assert.equal(second.itemIds[0], 'L2-d');
  assert.deepEqual(second.decision, {
    move: 'down', from: 3, level: 2, target: T, focus: T, recentMisses: 2,
    why: 'missed_twice', misses: 2, challengeId: null,
  });
});

test('two misses separated by a clean mark do not trigger a drop', async () => {
  let profile = startProfile({ level: 3 });
  profile.skills[K] = skill(3, 2, [1, 0, 1]);
  profile.checkpoints = 1;
  const picked = await choose(profile);
  assert.equal(picked.level, 3);
  assert.equal(picked.decision.move, 'stay');
});

test('clean current checkpoints take priority over an older unpracticed weakness', async () => {
  const profile = startProfile({ level: 2 });
  profile.skills[T] = skill(2, 2, [1, 1]);
  assert.equal((await choose(profile, checkpoint(2))).level, 3);
});

test('levels clamp at 1 and 6 and regular high-level sets have two items', async () => {
  const down = await choose(startProfile(), checkpoint(1, [K]));
  assert.equal(down.level, 1);
  assert.equal(down.decision.move, 'stay');
  const up = await choose(startProfile({ level: 6 }), checkpoint(6));
  assert.equal(up.level, 6);
  assert.equal(up.decision.move, 'stay');
  assert.equal(up.itemIds.length, 2);
  assert.equal(ruleNextSet(startProfile({ level: 5 }), items).itemIds.length, 2);
});

test('a clean level 4 line proves its focus and a missed one does not', () => {
  const updated = updateProfile(startProfile({ level: 4 }), [result('L4-a'), result('L4-d', [T])], items);
  assert.deepEqual(updated.proven, [K]);
});

test('rule picks are deterministic across bank order and do not mutate the profile or bank', () => {
  const profile = freeze(startProfile({ level: 3 }));
  const bank = freeze(structuredClone(items));
  const picked = ruleNextSet(profile, bank);
  assert.deepEqual(Object.keys(picked).sort(), ['itemIds', 'level', 'reason']);
  assert.deepEqual(picked, ruleNextSet(profile, [...bank].reverse()));
  assert.deepEqual(picked, ruleNextSet(profile, bank));
});

test('unseen lines outrank seen focus lines and repeats only fill exhausted pools', () => {
  const profile = startProfile({ level: 2 });
  profile.checkpoints = 1;
  profile.skills[K] = skill(2, 2, [1, 1]);
  profile.seen = ['L1-a', 'L1-b', 'L1-c', 'L1-e'];
  const picked = ruleNextSet(profile, items);
  assert.equal(picked.itemIds[0], 'L1-d');
  assert.equal(new Set(picked.itemIds).size, 3);
  const manyUnseen = { ...profile, seen: ['L1-a'] };
  assert.ok(ruleNextSet(manyUnseen, items).itemIds.every(id => !manyUnseen.seen.includes(id)));
});

test('selection ranks target focus, then weak skill coverage, then id', () => {
  const profile = startProfile({ level: 3 });
  profile.checkpoints = 1;
  profile.skills[T] = skill(3, 2, [1, 0, 1]);
  const bank = [
    item('a-unrelated', 3, K), item('z-containing', 3, B, [B, T]),
    item('z-focus', 3, T, [T]), item('b-unrelated', 3, K),
  ];
  assert.deepEqual(ruleNextSet(profile, bank).itemIds, ['z-focus', 'z-containing', 'a-unrelated']);
});

test('sparse banks return available unique lines rather than inventing or repeating ids', () => {
  assert.deepEqual(ruleNextSet(startProfile(), [item('only', 1)]).itemIds, ['only']);
  assert.deepEqual(ruleNextSet(startProfile(), []).itemIds, []);
});

test('turnFacts gives most clean reads, weakest recent skill, sorted proven and deterministic ties', () => {
  const profile = startProfile();
  assert.deepEqual(turnFacts(profile), { best: null, next: null, proven: [] });
  profile.skills = {
    [T]: skill(5, 2, [1, 0, 1]), [K]: skill(4, 1, [1, 0]), [B]: skill(1, 1, [1]),
  };
  profile.proven = [T, B, K];
  const before = structuredClone(profile);
  assert.deepEqual(turnFacts(profile), { best: K, next: T, proven: [B, K, T] });
  profile.skills[B] = skill(2, 2, [1, 1]);
  assert.equal(turnFacts(profile).next, B);
  profile.skills = { [K]: skill(2, 2, [1, 1]) };
  assert.equal(turnFacts(profile).best, null);
  assert.deepEqual(before.proven, [T, B, K]);
});

test('turnFacts uses recent misses rather than lifetime misses', () => {
  const profile = startProfile();
  profile.skills = { [K]: skill(20, 10, [0, 0, 0, 0, 0, 0]), [T]: skill(2, 1, [0, 1]) };
  assert.equal(turnFacts(profile).next, T);
  assert.equal(turnFacts(profile).best, K);
});

const challengeBank = [
  ...items,
  item('challenge-k', 4, K, [K], { challenge: true }),
  item('challenge-t', 4, T, [T], { challenge: true }),
  item('challenge-pattern', 4, P, [B, K, P], { challenge: true }),
  item('challenge-unknown', 4, 'vowel:shuruk', ['vowel:shuruk'], { challenge: true }),
];

test('checkpoint 2 adds a final challenge built entirely from skills read clean', async () => {
  const first = await choose(startProfile({ level: 2 }), checkpoint(2));
  assert.equal(first.profile.checkpoints, 1);
  assert.equal(first.decision.challengeId, null);
  const second = await choose(roundTrip(first.profile), checkpoint(3, [K]), challengeBank);
  assert.equal(second.profile.checkpoints, 2);
  assert.equal(second.level, 2);
  assert.equal(second.itemIds.length, 4);
  assert.equal(second.itemIds.at(-1), 'challenge-k');
  assert.equal(second.decision.challengeId, 'challenge-k');
  assert.equal(second.decision.target, items.find(line => line.id === second.itemIds[0]).focus);
});

test('challenges are absent when no skills qualify, at odd checkpoints, and at chosen level 4', () => {
  const profile = startProfile({ level: 2 });
  profile.checkpoints = 2;
  assert.equal(ruleNextSet(profile, challengeBank).itemIds.length, 3);
  profile.skills[K] = skill(2, 2, [1, 1]);
  assert.ok(!ruleNextSet(profile, challengeBank).itemIds.some(id => id.startsWith('challenge')));
  profile.skills[K] = skill(1, 0, [0]);
  profile.checkpoints = 3;
  assert.ok(!ruleNextSet(profile, challengeBank).itemIds.some(id => id.startsWith('challenge')));
  profile.checkpoints = 2;
  profile.level = 4;
  assert.ok(!ruleNextSet(profile, challengeBank).itemIds.some(id => id.startsWith('challenge')));
});

test('challenges recur at even checkpoints and prefer unproven focus, fewest skills, then id', () => {
  const profile = startProfile({ level: 2 });
  profile.skills = { [K]: skill(1, 0, [0]), [T]: skill(1, 0, [0]), [B]: skill(1, 0, [0]), [P]: skill(1, 0, [0]) };
  profile.proven = [K];
  const bank = [...challengeBank, item('challenge-ta', 4, T, [T], { challenge: true })];
  for (const checkpoint of [2, 4, 6]) {
    profile.checkpoints = checkpoint;
    assert.equal(ruleNextSet(profile, bank).itemIds.at(-1), 'challenge-t');
  }
  profile.proven.push(T);
  assert.equal(ruleNextSet(profile, bank).itemIds.at(-1), 'challenge-pattern');
});

test('challenge picks also avoid seen items while unseen eligible challenges remain', () => {
  const profile = startProfile({ level: 2 });
  profile.checkpoints = 2;
  profile.skills = { [K]: skill(1, 0, [0]), [T]: skill(1, 0, [0]) };
  profile.seen = ['challenge-k'];
  profile.proven = [T];
  assert.equal(ruleNextSet(profile, challengeBank).itemIds.at(-1), 'challenge-t');
});

test('clean challenges prove all vowel and pattern skills plus their level 4 focus', () => {
  const profile = startProfile({ level: 2 });
  const updated = updateProfile(profile, [result('challenge-pattern')], challengeBank);
  assert.deepEqual(updated.proven, [P, K]);
  assert.ok(!updated.proven.includes(B));
  const failed = updateProfile(profile, [result('challenge-pattern', [K])], challengeBank);
  assert.deepEqual(failed.proven, []);
  const letterFocus = item('letter-focus', 4, B, [B, K, P], { challenge: true });
  assert.deepEqual(updateProfile(profile, [result(letterFocus.id)], [letterFocus]).proven, [B, P, K]);
});

test('a clean off-level challenge alone cannot cause a level increase', () => {
  const updated = updateProfile(startProfile({ level: 2 }), [result('challenge-k')], challengeBank);
  assert.equal(ruleNextSet(updated, challengeBank).level, 2);
});

test('a failed challenge prevents treating the whole checkpoint as clean', () => {
  const updated = updateProfile(startProfile({ level: 2 }), [
    ...checkpoint(2), result('challenge-t', [T]),
  ], challengeBank);
  assert.equal(updated.cleanAtLevel.clean, false);
  assert.equal(ruleNextSet(updated, challengeBank).level, 2);
});

test('stop at 240000 ms updates the profile and does not call the model', async t => {
  keyFor(t);
  const fetcher = t.mock.fn(() => { throw new Error('Must not fetch'); });
  const picked = await chooseNextSet(startProfile(), checkpoint(1), items, { elapsedMs: 240_000, fetch: fetcher });
  assert.equal(picked.done, true);
  assert.deepEqual(picked.itemIds, []);
  assert.equal(picked.profile.checkpoints, 1);
  assert.equal(picked.profile.skills[K].tries, 2);
  assert.equal(picked.decision.target, null);
  assert.equal(picked.decision.challengeId, null);
  assert.equal(fetcher.mock.callCount(), 0);
  assert.equal((await choose(startProfile(), [], items, { elapsedMs: 239_999 })).done, false);
});

test('stop at eight checkpoints without selecting or fetching', async t => {
  keyFor(t);
  const profile = startProfile({ level: 2 });
  profile.checkpoints = 7;
  const fetcher = t.mock.fn(() => { throw new Error('Must not fetch'); });
  const picked = await chooseNextSet(profile, checkpoint(2), items, { fetch: fetcher });
  assert.equal(picked.done, true);
  assert.deepEqual(picked.itemIds, []);
  assert.equal(picked.profile.checkpoints, 8);
  assert.equal(fetcher.mock.callCount(), 0);
  assert.equal((await choose({ ...profile, checkpoints: 6 })).done, false);
});

const heldCheckpoint = () => [result('L3-a', [K]), result('L3-b'), result('L3-d')];
test('stop after three held checkpoints survives JSON serialization and requires three tries per skill', async () => {
  let profile = startProfile({ level: 3 });
  for (let count = 1; count <= 3; count++) {
    const picked = await choose(roundTrip(profile), heldCheckpoint());
    assert.equal(picked.level, 3);
    assert.equal(picked.done, count === 3);
    if (picked.done) assert.deepEqual(picked.itemIds, []);
    profile = picked.profile;
  }
  const fresh = item('fresh', 3, B, [B]);
  const insufficient = await choose({ ...profile, checkpoints: 2 }, [
    ...heldCheckpoint(), result('fresh'),
  ], [...items, fresh]);
  assert.equal(insufficient.done, false);
});

test('moving levels resets held history and clean evidence', async () => {
  let profile = startProfile({ level: 3 });
  for (let count = 0; count < 2; count++) profile = (await choose(profile, heldCheckpoint())).profile;
  const moved = await choose(profile, checkpoint(3));
  assert.equal(moved.level, 4);
  assert.equal(moved.done, false);
  assert.deepEqual(moved.profile.cleanAtLevel, { clean: false, held: [] });
  const held = await choose(roundTrip(moved.profile), [result('L4-a', [K]), result('L4-b')]);
  assert.equal(held.level, 4);
  assert.equal(held.done, false);
  assert.equal(held.profile.cleanAtLevel.held.length, 1);
});

test('explain templates cover start, up, down and stay using only structured decisions', () => {
  const base = { move: 'start', from: 2, level: 2, target: K, focus: K, recentMisses: 1,
    why: 'start', misses: 0, challengeId: null };
  assert.equal(explain(base), 'Started at level 2 with a focus on the vowel kamatz.');
  assert.equal(explain({ ...base, focus: null }), 'Started at level 2.');
  assert.equal(explain({ ...base, move: 'up', level: 3, why: 'clean' }),
    'Clean set at level 2; moved up to words.');
  assert.equal(explain({ ...base, move: 'down', from: 3, why: 'missed_twice', misses: 2 }),
    '2 misses at level 3; dropped to syllables to practice the vowel kamatz.');
  assert.equal(explain({ ...base, move: 'stay', level: 3, target: T, why: 'mixed', reason: 'PRIVATE_MODEL_TEXT' }),
    'Held level 3 and gave the vowel tzere another try.');
  assert.equal(explain({ ...base, move: 'stay', target: 'unknown:PRIVATE_MODEL_TEXT' }),
    'Held level 2 and gave the focus skill another try.');
});

test('valid model picks use the specified provider and produce a decision about the actual chosen set', async t => {
  keyFor(t);
  const fetcher = t.mock.fn(async (url, init) => {
    assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers.Authorization, 'Bearer offline-test-token');
    assert.equal(init.headers['Content-Type'], 'application/json');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'muse-spark-1.3');
    assert.equal(body.max_tokens, 16000);
    assert.equal(body.temperature, 0);
    assert.ok(init.signal instanceof AbortSignal);
    return idsAnswer(['L2-d', 'L2-a']);
  });
  const picked = await modelChoose(startProfile({ level: 3 }), checkpoint(3), fetcher);
  assert.equal(picked.source, 'model');
  assert.deepEqual(picked.itemIds, ['L2-d', 'L2-a']);
  assert.equal(picked.profile.level, 2);
  assert.equal(picked.reason, 'Revisit the vowel contrast in shorter lines.');
  assert.deepEqual(picked.decision, {
    move: 'down', from: 3, level: 2, target: K, focus: T, recentMisses: 0,
    why: 'mixed', misses: 0, challengeId: null,
  });
  assert.equal(explain(picked.decision), 'Dropped to syllables.');
  assert.equal(fetcher.mock.callCount(), 1);
});

test('valid two- and three-line model answers are accepted', async t => {
  keyFor(t);
  for (const ids of [['L2-a', 'L2-b'], ['L2-a', 'L2-b', 'L2-c']]) {
    const picked = await modelChoose(startProfile({ level: 2 }), [], async () => idsAnswer(ids));
    assert.equal(picked.source, 'model');
    assert.deepEqual(picked.itemIds, ids);
  }
});

test('unknown ids, wrong levels, mixed levels, duplicate ids and malformed answers fall back', async t => {
  keyFor(t);
  const profile = startProfile({ level: 2 });
  const expected = await choose(profile);
  for (const raw of [
    'ids: missing, L2-b\nreason: Try these.',
    'ids: L6-a, L6-b\nreason: Try these.',
    'ids: L1-a, L3-a\nreason: Try these.',
    'ids: L2-a, L2-a\nreason: Try these.',
    'ids: L2-a\nreason: Try this.',
    'ids: L2-a, L2-b, L2-c, L2-d\nreason: Try these.',
    'ids: L2-a, L2-b\nreason:',
    '{"ids":["L2-a","L2-b"]}',
    '',
  ]) {
    const picked = await modelChoose(profile, [], async () => answer(raw));
    assert.deepEqual(picked, expected, raw);
  }
});

test('a real bank id outside the 30 candidates is rejected', async t => {
  keyFor(t);
  const bank = Array.from({ length: 40 }, (_, n) => item(`candidate-${String(n).padStart(2, '0')}`, 2));
  const picked = await modelChoose(startProfile({ level: 2 }), [], async () =>
    idsAnswer(['candidate-38', 'candidate-39']), bank);
  assert.equal(picked.source, 'rule');
});

test('model selection cannot skip unseen items in favor of repeats', async t => {
  keyFor(t);
  const profile = startProfile({ level: 2 });
  profile.seen = ['L2-a', 'L2-b', 'L2-c', 'L2-d'];
  const rejected = await modelChoose(profile, [], async () => idsAnswer(['L2-a', 'L2-b']));
  assert.equal(rejected.source, 'rule');
  const accepted = await modelChoose(profile, [], async () => idsAnswer(['L2-e', 'L2-b']));
  assert.equal(accepted.source, 'model');
});

test('no key, blank key, and useModel false use the rule without fetching', async t => {
  const fetcher = t.mock.fn(() => { throw new Error('Must not fetch'); });
  keyFor(t, null);
  assert.equal((await modelChoose(startProfile(), [], fetcher)).source, 'rule');
  process.env.META_API_KEY = '   ';
  assert.equal((await modelChoose(startProfile(), [], fetcher)).source, 'rule');
  process.env.META_API_KEY = 'offline-test-token';
  assert.equal((await choose(startProfile(), [], items, { fetch: fetcher })).source, 'rule');
  assert.equal(fetcher.mock.callCount(), 0);
});

test('provider failures fall back without exposing credentials or response data', async t => {
  keyFor(t);
  const logs = [t.mock.method(console, 'log', () => {}), t.mock.method(console, 'error', () => {})];
  for (const fetcher of [
    async () => { throw new Error(`Authorization: ${process.env.META_API_KEY}`); },
    async () => ({ ok: false, status: 500, json: () => { throw new Error('Must not read error body'); } }),
    async () => ({ ok: true, json: () => { throw new Error(process.env.META_API_KEY); } }),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => answer(null),
  ]) {
    const picked = await modelChoose(startProfile(), [], fetcher);
    assert.equal(picked.source, 'rule');
    assert.ok(!JSON.stringify(picked).includes('offline-test-token'));
  }
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test('30 second timeout aborts and falls back even if fetch ignores the signal', async t => {
  keyFor(t);
  const realSetTimeout = globalThis.setTimeout;
  const durations = [];
  t.mock.method(globalThis, 'setTimeout', (callback, duration) => {
    durations.push(duration);
    const handle = realSetTimeout(callback, duration);
    queueMicrotask(callback);
    return handle;
  });
  let signal;
  const picked = await modelChoose(startProfile(), [], async (_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  assert.deepEqual(durations, [30_000]);
  assert.equal(signal.aborted, true);
  assert.equal(picked.source, 'rule');
});

test('timeout covers a stalled response body as well as fetch', async t => {
  keyFor(t);
  const realSetTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, duration) => {
    const handle = realSetTimeout(callback, duration);
    queueMicrotask(() => queueMicrotask(callback));
    return handle;
  });
  const picked = await modelChoose(startProfile(), [], async () => ({
    ok: true, json: () => new Promise(() => {}),
  }));
  assert.equal(picked.source, 'rule');
});

test('model picks receive a challenge added by code and cannot select challenge ids themselves', async t => {
  keyFor(t);
  const profile = updateProfile(startProfile({ level: 2 }), checkpoint(2), challengeBank);
  const picked = await modelChoose(profile, checkpoint(2), async (_url, init) => {
    const prompt = JSON.parse(init.body).messages[0].content;
    assert.ok(!prompt.includes('challenge-k'));
    return idsAnswer(['L1-a', 'L1-b', 'L1-c']);
  }, challengeBank);
  assert.equal(picked.source, 'model');
  assert.equal(picked.itemIds.length, 4);
  assert.equal(picked.itemIds.at(-1), 'challenge-k');
  assert.equal(picked.decision.challengeId, 'challenge-k');
  assert.equal(picked.decision.target, K);
  const rejected = await modelChoose(profile, checkpoint(2), async () =>
    idsAnswer(['challenge-k', 'challenge-t']), challengeBank);
  assert.equal(rejected.source, 'rule');
});

test('challenge scheduling follows the model chosen level, including a choice of level 4', async t => {
  keyFor(t);
  const profile = startProfile({ level: 3 });
  profile.checkpoints = 2;
  profile.skills[K] = skill(1, 0, [0]);
  const picked = await modelChoose(profile, [], async () => idsAnswer(['L4-a', 'L4-b']), challengeBank);
  assert.equal(picked.source, 'model');
  assert.equal(picked.itemIds.length, 2);
  assert.equal(picked.decision.challengeId, null);
  profile.level = 4;
  const down = await modelChoose(profile, [], async () => idsAnswer(['L3-a', 'L3-b']), challengeBank);
  assert.equal(down.source, 'model');
  assert.equal(down.itemIds.at(-1), 'challenge-k');
  assert.equal(down.decision.challengeId, 'challenge-k');
});

test('model prompt is limited to safe metadata, 12 romanized misses and 30 candidates', async t => {
  keyFor(t);
  const bank = JSON.parse(readFileSync(new URL('../bank/items.json', import.meta.url), 'utf8'));
  const profile = startProfile({ level: 3 });
  profile.skills[B] = skill(3, 2, [0, 1, 1]);
  profile.proven = [K];
  profile.name = 'PRIVATE_STUDENT_NAME';
  const results = [result(bank.find(line => line.level === 3 && line.skills.includes(B)).id, [B])];
  results[0].verdicts = Array.from({ length: 15 }, () => ({
    verdict: 'wrong_letter', expected: ['bo'], heard: 'vo', skills: [B], text: 'בָּ',
    name: 'PRIVATE_STUDENT_NAME',
  }));
  results[0].verdicts.at(-1).expected = ['בָּ'];
  results[0].verdicts.at(-1).heard = 'בָּ';
  const picked = await modelChoose(profile, results, async (_url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.messages.length, 1);
    const prompt = body.messages[0].content;
    assert.doesNotMatch(prompt, /[\u0590-\u05ff]/u);
    assert.ok(!prompt.includes('PRIVATE_STUDENT_NAME'));
    assert.ok(!prompt.includes('offline-test-token'));
    assert.match(prompt, /bo -> vo \| letter:bet/);
    assert.match(prompt, /Weak skills with recent miss counts: letter:bet 3/);
    assert.match(prompt, /Proven skills: vowel:kamatz/);
    assert.match(prompt, /Current level: 3/);
    assert.match(prompt, /Allowed levels: 2, 3, 4/);
    assert.match(prompt, /find the skill behind the mistakes/);
    assert.equal(prompt.split('\n').filter(line => line.includes(' -> ') && !line.startsWith('Recent')).length, 12);
    const candidates = prompt.split('Candidates (id | level | focus | skills):\n')[1].split('\n');
    assert.equal(candidates.length, 30);
    assert.ok(candidates.every(line => /^L[234]-[a-f0-9]{8} \| [234] \| /.test(line)));
    const atOneLevel = candidates.filter(line => line.includes(' | 2 | ')).slice(0, 2);
    return idsAnswer(atOneLevel.map(line => line.split(' | ')[0]));
  }, bank);
  assert.equal(picked.source, 'model');
});

test('every actual-bank rule selection stays within one level, contains unique ids, and leaves inputs intact', async () => {
  const bank = freeze(JSON.parse(readFileSync(new URL('../bank/items.json', import.meta.url), 'utf8')));
  for (let level = 1; level <= 6; level++) {
    const profile = freeze(startProfile({ level }));
    const picked = await choose(profile, [], bank);
    assert.equal(picked.itemIds.length, level >= 5 ? 2 : 3);
    assert.equal(new Set(picked.itemIds).size, picked.itemIds.length);
    assert.ok(picked.itemIds.every(id => bank.find(line => line.id === id).level === level));
    assert.equal(picked.decision.focus, bank.find(line => line.id === picked.itemIds[0]).focus);
    assert.equal(picked.decision.target, null);
    assert.equal(picked.source, 'rule');
    assert.equal(picked.done, false);
    assert.equal(picked.decision.move, 'start');
  }
});
