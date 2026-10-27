import { beforeEach, expect, it, vi } from 'vitest';
import * as mock from './api.mock.js';
import { PRESETS } from './storage.js';

beforeEach(() => sessionStorage.clear());

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
  const grades = await Promise.all(mock.items.map(item => mock.grade({ itemId: item.id })));
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

it('seeds thirteen distinct avatars, four levels, all presets and five varied practice groups', async () => {
  const roster = await mock.children();
  expect(roster).toHaveLength(13);
  expect(new Set(roster.map(child => child.id)).size).toBe(13);
  expect(new Set(roster.map(child => child.name)).size).toBe(13);
  expect(new Set(roster.map(child => child.avatar)).size).toBe(13);
  expect([...new Set(roster.map(child => child.level))].sort()).toEqual([1, 2, 3, 4]);
  expect([...new Set(roster.map(child => child.preset))].sort()).toEqual([...PRESETS].sort());
  const { children, groups } = await mock.classView();
  expect(groups.map(group => group.childIds.length)).toEqual([3, 3, 2, 2, 1]);
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

it('seeds one child needing a voice check, and saves voice and clearVoice changes', async () => {
  const children = await mock.children();
  expect(children.filter(child => child.voiceCheck)).toHaveLength(12);
  expect(children.filter(child => child.voiceCheck === false).map(child => child.id)).toEqual(['pippa']);
  expect(await mock.voice({ childId: 'pippa' })).toEqual({ voiceCheck: true });
  expect((await mock.children()).find(child => child.id === 'pippa').voiceCheck).toBe(true);
  expect(await mock.clearVoice('pippa')).toMatchObject({ id: 'pippa', voiceCheck: false });
  expect((await mock.children()).find(child => child.id === 'pippa').voiceCheck).toBe(false);
});

it('requires a voice check for new children and clears it only when a preset changes', async () => {
  const child = await mock.addChild({ name: 'Mippo', avatar: 'whale', preset: 'sephardi' });
  expect(child.voiceCheck).toBe(false);
  await mock.voice({ childId: child.id });
  expect(await mock.editChild(child.id, { preset: 'sephardi', level: 2 })).toMatchObject({ voiceCheck: true });
  expect(await mock.editChild(child.id, { preset: 'ashkenazi' })).toMatchObject({ voiceCheck: false });
});
