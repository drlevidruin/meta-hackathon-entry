import { beforeEach, expect, it, vi } from 'vitest';
import * as mock from './api.mock.js';
import { PRESETS } from './storage.js';
import { voiceCardFor } from '../../rulebook/voice-card.js';
import { VOWEL_IDS } from '../../rulebook/vowels.js';

beforeEach(() => sessionStorage.clear());

const beginnerLines = ['בָּ בַּ מָ', 'מַ לָ לַ', 'שָׁ שַׁ נָ', 'נַ בָּ מַ'];

it('gives each line the same marks across turns, children and random values', async () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const first = await mock.start({ childId: 'bim' });
  const grades = await Promise.all(mock.items.map(item => mock.grade({ turnId: first.turnId, itemId: item.id })));
  sessionStorage.clear();
  random.mockReturnValue(0.99);
  const second = await mock.start({ childId: 'nubo' });
  for (const item of [...mock.items].reverse()) {
    expect(await mock.grade({ turnId: second.turnId, itemId: item.id }))
      .toEqual(grades.find(result => result.itemId === item.id));
  }
});

it('keeps most lines correct and puts one or two amber marks on a third of the lines', async () => {
  const fullSet = mock.items.filter(item => !item.source?.beginner);
  const grades = await Promise.all(fullSet.map(item => mock.grade({ itemId: item.id })));
  const marked = grades.filter(grade => grade.summary.ok < grade.summary.pairs);
  expect(marked).toHaveLength(2);
  for (const grade of grades) {
    const verdicts = grade.words.flatMap(word => word.pairs.map(pair => pair.verdict));
    expect(grade.summary.pairs).toBe(verdicts.length);
    expect(grade.summary.ok).toBe(verdicts.filter(verdict => verdict === 'ok').length);
    expect(verdicts.every(verdict => ['ok', 'wrong_letter', 'wrong_vowel'].includes(verdict))).toBe(true);
    if (marked.includes(grade)) expect([1, 2]).toContain(grade.summary.pairs - grade.summary.ok);
    else expect(verdicts.every(verdict => verdict === 'ok')).toBe(true);
  }
});

it('places at most one challenge at the end of every mock set', async () => {
  for (const child of await mock.children()) {
    let response = await mock.start({ childId: child.id });
    const turnId = response.turnId;
    let sets = 0;
    while (!response.done) {
      const challenges = response.set.filter(item => item.source?.challenge);
      expect(challenges.length).toBeLessThanOrEqual(1);
      if (challenges.length) expect(response.set.at(-1)).toEqual(challenges[0]);
      sets++;
      expect(sets).toBeLessThanOrEqual(3);
      response = await mock.next({ turnId });
    }
    expect(sets).toBe(3);
  }
});

it('serves only the four beginner lines to Plo and wraps later sets', async () => {
  const beginner = mock.items.filter(item => item.source?.beginner);
  expect(beginner.map(item => item.text)).toEqual(beginnerLines);
  for (const [index, item] of beginner.entries()) {
    expect(item).toMatchObject({ level: 1, skills: ['vowel:kamatz', 'vowel:patach'], focus: 'vowel:kamatz',
      source: { generated: true, beginner: true, challenge: index % 2 === 1 } });
  }
  let response = await mock.start({ childId: 'plo' });
  const { turnId } = response;
  for (const expected of [beginnerLines.slice(0, 2), beginnerLines.slice(2), beginnerLines.slice(0, 2)]) {
    expect(response.set.map(item => item.text)).toEqual(expected);
    response = await mock.next({ turnId });
  }
  expect(response.done).toBe(true);
});

it('keeps the original six lines and sets for a full-set child', async () => {
  const original = mock.items.slice(0, 6);
  expect(original.map(item => item.text)).toEqual(['בָּ בַּ בֵּ', 'מָ מַ מִ', 'לָ לַ לִ', 'בִּ בֵּ בֻּ', 'שָׁ שַׁ שִׁ', 'נָ נַ נִ']);
  let response = await mock.start({ childId: 'bim' });
  const { turnId } = response;
  for (let round = 0; round < 3; round++) {
    expect(response.set).toEqual(original.slice(round * 2, round * 2 + 2));
    response = await mock.next({ turnId });
  }
  expect(response.done).toBe(true);
});

it('filters child packets and keeps full-set child and class packets unchanged', async () => {
  const plo = await mock.packet({ childId: 'plo' });
  expect(plo.sections[0].items.map(item => item.text)).toEqual(beginnerLines.slice(0, 2));
  expect(plo.sections[1].items.map(item => item.text)).toEqual(beginnerLines);
  expect(plo.sections[2].items.map(item => item.text)).toEqual([beginnerLines[3]]);
  for (const fields of [{ childId: 'bim' }, { skillId: 'vowel:kamatz' }]) {
    const packet = await mock.packet(fields);
    expect(packet.sections.map(section => section.items)).toEqual([
      mock.items.slice(0, 2), mock.items.slice(0, 6), [mock.items[5]],
    ]);
  }
});

it('falls back to the original lines for every round and packet when no lines fit', async () => {
  const child = await mock.addChild({ name: 'Mippo', avatar: 'koala', preset: 'sephardi', vowels: ['tzere'] });
  let response = await mock.start({ childId: child.id });
  const { turnId } = response;
  for (let round = 0; round < 3; round++) {
    expect(response.set).toEqual(mock.items.slice(round * 2, round * 2 + 2));
    response = await mock.next({ turnId });
  }
  expect(response.done).toBe(true);
  expect((await mock.packet({ childId: child.id })).sections[1].items).toEqual(mock.items.slice(0, 6));
});

it('seeds thirteen distinct avatars, four levels, all presets and six varied practice groups', async () => {
  const roster = await mock.children();
  expect(roster).toHaveLength(13);
  expect(new Set(roster.map(child => child.id)).size).toBe(13);
  expect(new Set(roster.map(child => child.name)).size).toBe(13);
  expect(new Set(roster.map(child => child.avatar)).size).toBe(13);
  expect([...new Set(roster.map(child => child.level))].sort()).toEqual([1, 2, 3, 4]);
  expect([...new Set(roster.map(child => child.preset))].sort()).toEqual([...PRESETS].sort());
  const { children, groups } = await mock.classView();
  expect(groups.map(group => group.childIds.length)).toEqual([3, 2, 2, 2, 1, 1]);
  expect(groups.flatMap(group => group.childIds).sort()).toEqual(children.filter(child => child.lastTurn).map(child => child.id).sort());
  const lastTurns = children.filter(child => child.lastTurn).map(child => child.lastTurn);
  expect(lastTurns).toHaveLength(11);
  const fresh = children.find(child => !child.lastTurn);
  expect(fresh.next).toBeNull();
  expect(groups.some(group => group.childIds.includes(fresh.id))).toBe(false);
  expect(new Set(lastTurns.map(turn => `${turn.ok}/${turn.pairs}`)).size).toBe(11);
  expect(new Set(lastTurns.map(turn => turn.stars)).size).toBeGreaterThan(3);
  const beginner = children.find(child => !child.lastTurn);
  expect(beginner).toMatchObject({ stars: 0, best: 0 });
  expect((await mock.childDetail(beginner.id)).turns).toEqual([]);
});

it('keeps each practice skill attached to its child when the roster changes', async () => {
  const before = await mock.classView();
  await mock.deleteChild('bim');
  const after = await mock.classView();
  for (const child of after.children) {
    expect(child.next).toBe(before.children.find(previous => previous.id === child.id).next);
  }
});

it('leaves a new child without invented turns until a turn is completed', async () => {
  const child = await mock.addChild({ name: 'Mippo', avatar: 'koala', preset: 'sephardi' });
  expect((await mock.childDetail(child.id)).turns).toEqual([]);
  const { turnId, set } = await mock.start({ childId: child.id });
  await mock.grade({ turnId, itemId: set[0].id });
  await mock.finish({ turnId, stars: 1 });
  expect((await mock.childDetail(child.id)).turns).toHaveLength(1);
  expect((await mock.classView()).children.find(entry => entry.id === child.id).lastTurn.stars).toBe(1);
});

it('gives saved and sample turns ids for teacher trace links', async () => {
  const initial = await mock.childDetail('bim');
  expect(initial.turns[0].id).toBe('mock-history-bim');
  const { turnId } = await mock.start({ childId: 'bim' });
  await mock.finish({ turnId, stars: 0 });
  const detail = await mock.childDetail('bim');
  expect(detail.turns.map(turn => turn.id)).toEqual([turnId, 'mock-history-bim']);
});

it('seeds Pippa and beginner Plo needing voice checks, and saves voice and clearVoice changes', async () => {
  const children = await mock.children();
  expect(children.filter(child => child.voiceCheck)).toHaveLength(11);
  expect(children.filter(child => child.voiceStatus === 'needed').map(child => child.id)).toEqual(['plo', 'pippa']);
  for (const child of children) {
    expect(child.vowels).toEqual(child.id === 'plo' ? ['kamatz', 'patach'] : VOWEL_IDS);
    expect(child.voiceStatus).toBe(['plo', 'pippa'].includes(child.id) ? 'needed' : 'done');
    expect(child.voiceCheck).toBe(child.voiceStatus !== 'needed');
  }
  const plo = children.find(child => child.id === 'plo');
  expect(plo).toMatchObject({ preset: 'ashkenazi', level: 1, next: 'vowel:patach' });
  expect(voiceCardFor(plo.vowels, plo.preset)).toHaveLength(12);
  expect(await mock.voice({ childId: 'pippa' })).toEqual({ voiceCheck: true });
  expect((await mock.children()).find(child => child.id === 'pippa')).toMatchObject({ voiceStatus: 'done', voiceCheck: true });
  expect(await mock.clearVoice('pippa')).toMatchObject({ id: 'pippa', voiceStatus: 'needed', voiceCheck: false });
  expect((await mock.children()).find(child => child.id === 'pippa')).toMatchObject({ voiceStatus: 'needed', voiceCheck: false });
});

it('requires a voice check for new children and clears saved voice only when vowels or preset change', async () => {
  const child = await mock.addChild({ name: 'Mippo', avatar: 'whale', preset: 'sephardi' });
  expect(child).toMatchObject({ vowels: VOWEL_IDS, voiceStatus: 'needed', voiceCheck: false });
  await mock.voice({ childId: child.id });
  expect(await mock.editChild(child.id, { preset: 'sephardi', level: 2, vowels: [...VOWEL_IDS].reverse() }))
    .toMatchObject({ vowels: VOWEL_IDS, voiceStatus: 'done', voiceCheck: true });
  expect(await mock.editChild(child.id, { preset: 'ashkenazi' })).toMatchObject({ voiceStatus: 'needed', voiceCheck: false });
  await mock.voice({ childId: child.id });
  expect(await mock.editChild(child.id, { vowels: ['patach', 'kamatz'] }))
    .toMatchObject({ vowels: ['kamatz', 'patach'], voiceStatus: 'needed', voiceCheck: false });
  await mock.voice({ childId: child.id });
  expect(await mock.editChild(child.id, { name: 'Mippo', avatar: 'bee', level: 3, vowels: ['patach', 'kamatz'] }))
    .toMatchObject({ voiceStatus: 'done', voiceCheck: true });
});

it('uses none when there is no usable voice card and rejects voice audio with 409', async () => {
  const child = await mock.addChild({ name: 'Mippo', avatar: 'whale', preset: 'sephardi', vowels: ['patach', 'kamatz'] });
  expect(child).toMatchObject({ vowels: ['kamatz', 'patach'], voiceStatus: 'none', voiceCheck: true });
  expect(voiceCardFor(child.vowels, child.preset)).toEqual([]);
  await expect(mock.voice({ childId: child.id })).rejects.toMatchObject({ status: 409, message: 'No voice check' });
  expect(await mock.clearVoice(child.id)).toMatchObject({ voiceStatus: 'none', voiceCheck: true });
  expect(await mock.skipVoice(child.id)).toMatchObject({ voiceStatus: 'none', voiceCheck: true });
  expect(await mock.editChild(child.id, { preset: 'ashkenazi' })).toMatchObject({ voiceStatus: 'skipped', voiceCheck: true });
});

it('preserves skips through vowel and preset changes, and DELETE clears both a skip and a saved voice', async () => {
  expect(await mock.skipVoice('bim')).toMatchObject({ vowels: VOWEL_IDS, voiceStatus: 'skipped', voiceCheck: true });
  expect(await mock.editChild('bim', { vowels: ['segol', 'kamatz', 'patach'] }))
    .toMatchObject({ vowels: ['kamatz', 'patach', 'segol'], voiceStatus: 'skipped', voiceCheck: true });
  expect(await mock.editChild('bim', { vowels: ['tzere'] })).toMatchObject({ voiceStatus: 'none', voiceCheck: true });
  expect(await mock.editChild('bim', { preset: 'ashkenazi', vowels: ['kamatz', 'patach'] }))
    .toMatchObject({ voiceStatus: 'skipped', voiceCheck: true });
  expect(await mock.clearVoice('bim')).toMatchObject({ voiceStatus: 'needed', voiceCheck: false });
  await mock.skipVoice('bim');
  await mock.voice({ childId: 'bim' });
  expect((await mock.children()).find(child => child.id === 'bim')).toMatchObject({ voiceStatus: 'done', voiceCheck: true });
  expect(await mock.clearVoice('bim')).toMatchObject({ voiceStatus: 'needed', voiceCheck: false });
});

it('clears a hidden skip with DELETE while there is no card', async () => {
  await mock.skipVoice('bim');
  await mock.editChild('bim', { vowels: ['tzere'] });
  expect(await mock.clearVoice('bim')).toMatchObject({ voiceStatus: 'none', voiceCheck: true });
  expect(await mock.editChild('bim', { vowels: [...VOWEL_IDS] })).toMatchObject({ voiceStatus: 'needed', voiceCheck: false });
});

it.each(['none', 'done', 'skipped', 'needed'])('returns consistent vowels and voice fields in every child view for %s', async status => {
  if (status === 'none') await mock.editChild('bim', { vowels: ['tzere'] });
  if (status === 'skipped') await mock.skipVoice('bim');
  if (status === 'needed') await mock.clearVoice('bim');
  const child = (await mock.children()).find(child => child.id === 'bim');
  expect(child).toMatchObject({ voiceStatus: status, voiceCheck: status !== 'needed' });
  expect((await mock.classView()).children.find(child => child.id === 'bim')).toMatchObject(child);
  expect((await mock.childDetail('bim')).child).toEqual(child);
  const { turnId } = await mock.start({ childId: 'bim' });
  expect((await mock.finish({ turnId, stars: 0 })).child).toEqual(child);
});

it.each([[], ['kamatz', 'kamatz'], ['unknown'], null])('rejects invalid mock vowels %j without changing a child', async vowels => {
  const before = await mock.children();
  await expect(mock.addChild({ name: 'Mippo', preset: 'ashkenazi', avatar: 'bee', vowels }))
    .rejects.toMatchObject({ status: 400, message: 'Invalid vowels' });
  await expect(mock.editChild('bim', { preset: 'ashkenazi', vowels }))
    .rejects.toMatchObject({ status: 400, message: 'Invalid vowels' });
  expect(await mock.children()).toEqual(before);
});

it('ignores mock sessions from the previous storage key', async () => {
  sessionStorage.setItem('kriah.mock.v4', JSON.stringify({ children: [{ id: 'old', voiceCheck: true }], turns: {} }));
  expect(await mock.children()).toHaveLength(13);
  await mock.skipVoice('bim');
  expect(JSON.parse(sessionStorage.getItem('kriah.mock.v5')).children).toHaveLength(13);
});

it('ends every set with its challenge line for a child with some of the vowels', async () => {
  const child = (await mock.children()).find(child => child.id === 'bim');
  await mock.editChild(child.id, { vowels: ['kamatz', 'patach', 'chirik'] });
  let response = await mock.start({ childId: child.id });
  const { turnId } = response;
  while (!response.done) {
    const flags = response.set.map(item => Boolean(item.source?.challenge));
    expect(flags).toEqual([...flags].sort((a, b) => Number(a) - Number(b)));
    expect(new Set(response.set.map(item => item.id)).size).toBe(response.set.length);
    response = await mock.next({ turnId });
  }
});
