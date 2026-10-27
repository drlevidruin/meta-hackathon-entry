import * as mock from './api.mock.js';
import { loadPin } from './storage.js';

export const isMockMode = () => new URLSearchParams(window.location.search).has('mock');

async function request(path, { teacher = false, pin = loadPin(), data, ...options } = {}) {
  const headers = { ...options.headers };
  if (teacher) headers['X-Teacher-Pin'] = pin;
  if (data !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`/api/${path}`, { ...options, headers,
    ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(60000) });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error || 'Request failed');
    error.status = response.status;
    throw error;
  }
  return body;
}

const post = (path, data, options) => request(path, { ...options, method: 'POST', data });
export const children = () => isMockMode() ? mock.children() : request('children');
export const config = () => isMockMode() ? mock.config() : request('config');
export const start = data => isMockMode() ? mock.start(data) : post('start', { childId: data.childId });
export const grade = ({ turnId, itemId, audio }) => isMockMode() ? mock.grade({ turnId, itemId }) :
  request(`grade?turn=${encodeURIComponent(turnId)}&item=${encodeURIComponent(itemId)}`, {
    method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio,
  });
export const next = data => isMockMode() ? mock.next(data) : post('next', { turnId: data.turnId, elapsedMs: data.elapsedMs });
export const finish = data => isMockMode() ? mock.finish(data) : post('finish', { turnId: data.turnId, stars: data.stars });
export const checkPin = pin => isMockMode() ? mock.checkPin(pin) : post('teacher/check', undefined, { teacher: true, pin });
export const classView = () => isMockMode() ? mock.classView() : request('class', { teacher: true });
export const childDetail = id => isMockMode() ? mock.childDetail(id) : request(`children/${encodeURIComponent(id)}/detail`, { teacher: true });
export const addChild = data => isMockMode() ? mock.addChild(data) : post('children', data, { teacher: true });
export const editChild = (id, data) => isMockMode() ? mock.editChild(id, data) :
  request(`children/${encodeURIComponent(id)}`, { teacher: true, method: 'PATCH', data });
export const deleteChild = id => isMockMode() ? mock.deleteChild(id) :
  request(`children/${encodeURIComponent(id)}`, { teacher: true, method: 'DELETE' });
export const packet = ({ childId, skillId, level }) => isMockMode() ? mock.packet({ childId, skillId, level }) :
  request(`packet?${childId ? `child=${encodeURIComponent(childId)}` : `skill=${encodeURIComponent(skillId)}&level=${level}`}`, { teacher: true });
export const trace = turnId => isMockMode() ? mock.trace(turnId) : request(`trace?turn=${encodeURIComponent(turnId)}`, { teacher: true });
