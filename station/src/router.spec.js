import { afterEach, expect, it, vi } from 'vitest';
import { navigate, screenForHash } from './router.js';

afterEach(() => window.history.replaceState(null, '', '/'));

it.each([['#/', 'home'], ['#/settings', 'settings'], ['#/read', 'read'], ['#/done', 'done'], ['', 'home'], ['#/missing', 'home']])
  ('maps %s to %s', (hash, screen) => expect(screenForHash(hash)).toBe(screen));

it('replaces the finished reading entry and keeps mock mode in the URL', () => {
  window.history.replaceState(null, '', '/?mock#/read');
  const replace = vi.spyOn(window.history, 'replaceState');
  const update = vi.fn();
  window.addEventListener('hashchange', update);
  navigate('/done', { replace: true });
  expect(replace).toHaveBeenCalledWith(null, '', '/?mock#/done');
  expect(window.location.hash).toBe('#/done');
  expect(update).toHaveBeenCalledOnce();
  window.removeEventListener('hashchange', update);
});
