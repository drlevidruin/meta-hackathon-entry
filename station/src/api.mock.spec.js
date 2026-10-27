import { beforeEach, expect, it } from 'vitest';
import * as mock from './api.mock.js';
import { PRESETS } from './storage.js';

beforeEach(() => sessionStorage.clear());

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

it('seeds twelve distinct avatars, four levels, all presets and five varied practice groups', async () => {
  const roster = await mock.children();
  expect(roster).toHaveLength(12);
  expect(new Set(roster.map(child => child.id)).size).toBe(12);
  expect(new Set(roster.map(child => child.name)).size).toBe(12);
  expect(new Set(roster.map(child => child.avatar)).size).toBe(12);
  expect([...new Set(roster.map(child => child.level))].sort()).toEqual([1, 2, 3, 4]);
  expect([...new Set(roster.map(child => child.preset))].sort()).toEqual([...PRESETS].sort());
  const { children, groups } = await mock.classView();
  expect(groups.map(group => group.childIds.length)).toEqual([4, 3, 2, 2, 1]);
  expect(groups.flatMap(group => group.childIds).sort()).toEqual(roster.map(child => child.id).sort());
  const lastTurns = children.filter(child => child.lastTurn).map(child => child.lastTurn);
  expect(lastTurns).toHaveLength(11);
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
