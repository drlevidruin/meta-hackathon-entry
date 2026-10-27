import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as api from './api.js';
import { savePin } from './storage.js';

beforeEach(() => {
  sessionStorage.clear(); window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
});
afterEach(() => vi.unstubAllGlobals());

it('sends only the API v2 turn fields and raw WAV', async () => {
  const audio = new Blob(['wav'], { type: 'audio/wav' });
  await api.start({ childId: 'c1', preset: 'ignored' });
  await api.grade({ turnId: 't 1', itemId: 'i/1', audio });
  await api.next({ turnId: 't1', elapsedMs: 200, checkpoint: 1, results: ['ignored'] });
  await api.finish({ turnId: 't1', stars: 3 });
  const calls = fetch.mock.calls;
  expect(calls[0][0]).toBe('/api/start'); expect(JSON.parse(calls[0][1].body)).toEqual({ childId: 'c1' });
  expect(calls[1][0]).toBe('/api/grade?turn=t%201&item=i%2F1');
  expect(calls[1][1].headers['Content-Type']).toBe('audio/wav'); expect(calls[1][1].body).toBe(audio);
  expect(JSON.parse(calls[2][1].body)).toEqual({ turnId: 't1', elapsedMs: 200, checkpoint: 1 });
  expect(JSON.parse(calls[3][1].body)).toEqual({ turnId: 't1', stars: 3 });
  calls.forEach(([, options]) => expect(options.headers['X-Teacher-Pin']).toBeUndefined());
});

it('uses the PIN header for teacher routes only', async () => {
  savePin('4321');
  await api.checkPin('1234'); await api.classView(); await api.childDetail('bim');
  await api.addChild({ name: 'Mippo', avatar: 'whale', preset: 'sephardi' });
  await api.editChild('bim', { level: 2 }); await api.deleteChild('bim');
  await api.packet({ skillId: 'vowel:sheva_na', level: 2 }); await api.packet({ childId: 'bim' }); await api.trace('t1');
  fetch.mock.calls.forEach(([path, options], index) => {
    expect(options.headers['X-Teacher-Pin']).toBe(index === 0 ? '1234' : '4321');
    expect(path).not.toMatch(/1234|4321/);
  });
  expect(fetch.mock.calls[4][1].method).toBe('PATCH'); expect(fetch.mock.calls[5][1].method).toBe('DELETE');
  expect(fetch.mock.calls[6][0]).toBe('/api/packet?skill=vowel%3Asheva_na&level=2');
  await api.children(); await api.config();
  expect(fetch.mock.calls.at(-1)[1].headers['X-Teacher-Pin']).toBeUndefined();
});

it('keeps the short server error and status', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({ error: 'Teacher PIN not set' }) });
  await expect(api.checkPin('1234')).rejects.toMatchObject({ status: 403, message: 'Teacher PIN not set' });
});

it('posts raw voice WAV without a PIN and clears voice with the teacher PIN', async () => {
  savePin('2468');
  const audio = new Blob(['synthetic wav'], { type: 'audio/wav' });
  await api.voice({ childId: 'c /1', audio });
  await api.clearVoice('c /1');
  const [[voicePath, voiceOptions], [clearPath, clearOptions]] = fetch.mock.calls;
  expect(voicePath).toBe('/api/voice?child=c%20%2F1');
  expect(voiceOptions.method).toBe('POST');
  expect(voiceOptions.headers).toEqual({ 'Content-Type': 'audio/wav' });
  expect(voiceOptions.body).toBe(audio);
  expect(clearPath).toBe('/api/children/c%20%2F1/voice');
  expect(clearOptions.method).toBe('DELETE');
  expect(clearOptions.headers['X-Teacher-Pin']).toBe('2468');
});

it('preserves count error fields from a 422 voice response', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 422,
    json: async () => ({ error: 'count', heard: 9, expected: 15 }) });
  await expect(api.voice({ childId: 'c1', audio: new Blob() })).rejects
    .toMatchObject({ status: 422, message: 'count', heard: 9, expected: 15 });
});

it('uses mock voice functions without fetching', async () => {
  window.history.replaceState(null, '', '/?mock');
  await expect(api.voice({ childId: 'pippa', audio: null })).resolves.toEqual({ voiceCheck: true });
  await expect(api.clearVoice('pippa')).resolves.toMatchObject({ id: 'pippa', voiceCheck: false });
  expect(fetch).not.toHaveBeenCalled();
});
