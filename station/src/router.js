import { useEffect, useState } from 'react';

export function routeForHash(hash) {
  const path = hash.replace(/^#/, '') || '/';
  const exact = { '/': 'home', '/read': 'read', '/done': 'done', '/teacher': 'teacher', '/teacher/roster': 'roster' };
  if (exact[path]) return { screen: exact[path], path };
  const routes = [
    [/^\/child\/([^/]+)\/voice$/, 'voice', ['childId']],
    [/^\/child\/([^/]+)$/, 'child', ['childId']],
    [/^\/teacher\/child\/([^/]+)$/, 'detail', ['childId']],
    [/^\/teacher\/packet\/child\/([^/]+)$/, 'packet', ['childId']],
    [/^\/teacher\/packet\/skill\/([^/]+)\/([1-6])$/, 'packet', ['skillId', 'level']],
    [/^\/trace\/([^/]+)$/, 'trace', ['turnId']],
  ];
  for (const [pattern, screen, keys] of routes) {
    const match = path.match(pattern);
    if (match) {
      try {
        return { screen, path, ...Object.fromEntries(keys.map((key, index) =>
          [key, key === 'level' ? Number(match[index + 1]) : decodeURIComponent(match[index + 1])])) };
      } catch { break; }
    }
  }
  return { screen: 'home', path: '/' };
}

export const screenForHash = hash => routeForHash(hash).screen;

export function navigate(path, { replace = false } = {}) {
  const url = `${window.location.pathname}${window.location.search}#${path}`;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
  window.dispatchEvent(new Event('hashchange'));
}

export function useRoute() {
  const [route, setRoute] = useState(() => routeForHash(window.location.hash));
  useEffect(() => {
    const update = () => setRoute(routeForHash(window.location.hash));
    window.addEventListener('hashchange', update);
    window.addEventListener('popstate', update);
    return () => {
      window.removeEventListener('hashchange', update);
      window.removeEventListener('popstate', update);
    };
  }, []);
  return route;
}

export const useScreen = () => useRoute().screen;
