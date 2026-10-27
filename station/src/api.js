import * as mock from './api.mock.js';

export const isMockMode = () => new URLSearchParams(window.location.search).has('mock');

async function request(path, options) {
  const response = await fetch(`/api/${path}`, { ...options, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

function post(path, data) {
  return request(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
}

export function start({ preset, level }) {
  return isMockMode() ? mock.start({ preset, level }) : post('start', { preset, level });
}

export function grade({ itemId, preset, audio }) {
  return isMockMode() ? mock.grade({ itemId }) : request(`grade?item=${encodeURIComponent(itemId)}&preset=${encodeURIComponent(preset)}`, {
    method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio,
  });
}

export function next({ profile, results }) {
  return isMockMode() ? mock.next({ profile, results }) : post('next', { profile, results });
}
