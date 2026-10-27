import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { navigate, routeForHash, screenForHash, useRoute } from './router.js';

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

it.each([
  ['#/', 'home'], ['#/child/bim', 'child'], ['#/child/bim/voice', 'voice'], ['#/read', 'read'], ['#/done', 'done'],
  ['#/teacher', 'teacher'], ['#/teacher/child/bim', 'detail'], ['#/teacher/roster', 'roster'],
  ['#/teacher/packet/child/bim', 'packet'], ['#/teacher/packet/skill/vowel%3Asheva_na/2', 'packet'],
  ['#/trace/turn-1', 'trace'], ['#/settings', 'home'], ['', 'home'], ['#/missing', 'home'],
  ['#/teacher/packet/skill/a/0', 'home'], ['#/child/%zz', 'home'],
])('maps %s to %s', (hash, screen) => expect(screenForHash(hash)).toBe(screen));

it('decodes parameters and numeric levels', () => {
  expect(routeForHash('#/teacher/packet/skill/vowel%3Asheva_na/2')).toMatchObject({ skillId: 'vowel:sheva_na', level: 2 });
  expect(routeForHash('#/child/mock%20child').childId).toBe('mock child');
  expect(routeForHash('#/child/mock%20child/voice')).toMatchObject({ screen: 'voice', childId: 'mock child' });
  expect(routeForHash('#/trace/turn-1').turnId).toBe('turn-1');
});

it('replaces the finished reading entry and preserves mock mode', () => {
  window.history.replaceState(null, '', '/?mock#/read');
  const replace = vi.spyOn(window.history, 'replaceState');
  const { result } = renderHook(useRoute);
  act(() => navigate('/done', { replace: true }));
  expect(replace).toHaveBeenCalledWith(null, '', '/?mock#/done');
  expect(result.current.screen).toBe('done');
});

it('pushes navigable screens and restores the previous screen on back', async () => {
  window.history.replaceState(null, '', '/?mock#/teacher');
  const { result } = renderHook(useRoute);
  act(() => navigate('/teacher/child/bim'));
  expect(result.current.childId).toBe('bim');
  await act(async () => {
    const back = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
    window.history.back();
    await back;
  });
  expect(result.current.screen).toBe('teacher');
});
