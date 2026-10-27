import { useEffect, useState } from 'react';

const screens = { '/': 'home', '/settings': 'settings', '/read': 'read', '/done': 'done' };

export function screenForHash(hash) {
  return screens[hash.replace(/^#/, '') || '/'] || 'home';
}

export function navigate(path, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${path}`);
    window.dispatchEvent(new Event('hashchange'));
  } else window.location.hash = path;
}

export function useScreen() {
  const [screen, setScreen] = useState(() => screenForHash(window.location.hash));
  useEffect(() => {
    const update = () => setScreen(screenForHash(window.location.hash));
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return screen;
}
