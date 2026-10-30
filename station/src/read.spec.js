import React from 'react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import App, { DoneScreen, GradedLine, LevelUp, ReadScreen } from './App.jsx';
import * as api from './api.js';
import { items } from './api.mock.js';
import { savePin, TURN_KEY } from './storage.js';
import { lineStars, useTurn } from './useTurn.js';
import { VoiceCheck } from './VoiceCheck.jsx';
import { voiceCardFor } from '../../rulebook/voice-card.js';
import { VOWEL_IDS } from '../../rulebook/vowels.js';
import * as recorder from './useRecorder.js';
import * as wav from './wav.js';

const child = { id: 'bim', name: 'Bim', avatar: 'lion', preset: 'sephardi', level: 1, stars: 0, best: 0,
  vowels: [...VOWEL_IDS], voiceStatus: 'needed', voiceCheck: false };
const turn = overrides => ({ turnId: 'test-turn', child, level: 1, set: items.slice(0, 2), lineIndex: 0,
  completedSets: 0, stars: 0, streak: 0, bestStreak: 0, bonusBurst: 0, attempts: [], setStart: 0,
  resolvedThrough: 0, setStartedAt: Date.now(), phase: 'reading', ...overrides });
const grade = (item, verdict = 'ok') => ({ itemId: item.id, words: [{ text: item.text, verdict: null,
  pairs: [{ text: item.text, verdict }] }], summary: { pairs: 1, ok: verdict === 'ok' ? 1 : 0 } });

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState(null, '', '/?mock#/read');
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); document.querySelector('#station-test-styles')?.remove(); });

it('sends Start to the voice card for a needed child and back returns to that child', async () => {
  window.history.replaceState(null, '', '/?mock#/child/pippa');
  vi.spyOn(api, 'children').mockResolvedValue([{ ...child, id: 'pippa', name: 'Pippa', voiceCheck: true }]);
  const start = vi.spyOn(api, 'start');
  render(React.createElement(App));
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  expect(await screen.findByRole('heading', { name: 'Read these sounds', level: 1 })).toBeTruthy();
  expect(window.location.hash).toBe('#/child/pippa/voice');
  expect(document.title).toBe('Read these sounds | Kriah Listener');
  expect(start).not.toHaveBeenCalled();
  await act(async () => {
    const back = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
    window.history.back();
    await back;
  });
  expect(await screen.findByRole('button', { name: 'Start' })).toBeTruthy();
  expect(window.location.hash).toBe('#/child/pippa');
});

it.each(['none', 'done', 'skipped'])('starts a child with voiceStatus %s directly', async voiceStatus => {
  window.history.replaceState(null, '', '/?mock#/child/bim');
  vi.spyOn(api, 'children').mockResolvedValue([{ ...child, voiceStatus }]);
  const start = vi.spyOn(api, 'start');
  render(React.createElement(App));
  fireEvent.click(await screen.findByRole('button', { name: 'Start' }));
  expect(await screen.findByText(items[0].text, { selector: '.current-line' })).toBeTruthy();
  expect(start).toHaveBeenCalledExactlyOnceWith({ childId: 'bim' });
  expect(window.location.hash).toBe('#/read');
});

it('reloads the voice bookmark with the full Hebrew card in five columns and no helper text', async () => {
  window.history.replaceState(null, '', '/?mock#/child/pippa/voice');
  const start = vi.spyOn(api, 'start');
  const first = render(React.createElement(App));
  await screen.findByRole('heading', { name: 'Read these sounds' });
  first.unmount();
  render(React.createElement(App));
  await screen.findByRole('heading', { name: 'Read these sounds' });
  const card = document.querySelector('.voice-card');
  expect(card.getAttribute('dir')).toBe('rtl');
  expect(card.getAttribute('lang')).toBe('he');
  expect([...card.children].map(element => element.textContent)).toEqual(voiceCardFor(VOWEL_IDS, 'sephardi'));
  expect(card.children).toHaveLength(15);
  expect(card.style.getPropertyValue('--columns')).toBe('5');
  expect(document.querySelector('.voice-identity .avatar')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Pippa' })).toBeTruthy();
  expect(document.querySelectorAll('.voice-check p')).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Record' }).disabled).toBe(false);
  expect(start).not.toHaveBeenCalled();
});

it('records a successful mock voice check and starts the reading turn without an extra refresh', async () => {
  window.history.replaceState(null, '', '/?mock#/child/pippa/voice');
  const voice = vi.spyOn(api, 'voice');
  const start = vi.spyOn(api, 'start');
  const children = vi.spyOn(api, 'children');
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(React.createElement(App));
  fireEvent.click(await screen.findByRole('button', { name: 'Record' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  expect(await screen.findByText(items[0].text, { selector: '.current-line' })).toBeTruthy();
  expect(voice).toHaveBeenCalledExactlyOnceWith({ childId: 'pippa', audio: null });
  expect(start).toHaveBeenCalledExactlyOnceWith({ childId: 'pippa' });
  expect(children).toHaveBeenCalledTimes(2);
  expect(JSON.parse(sessionStorage.getItem(TURN_KEY)).child.voiceCheck).toBe(true);
  expect(JSON.parse(sessionStorage.getItem(TURN_KEY)).child.voiceStatus).toBe('done');
  expect(window.location.hash).toBe('#/read');
  expect(fetch).not.toHaveBeenCalled();
});

it('converts a recording to WAV and disables recording until the voice upload completes', async () => {
  window.history.replaceState(null, '', '/#/child/bim/voice');
  let onStop, finish;
  const blob = new Blob(['synthetic recording']);
  const audio = new Blob(['synthetic WAV'], { type: 'audio/wav' });
  vi.spyOn(recorder, 'useRecorder').mockImplementation(callback => {
    onStop = callback;
    return { status: 'ready', toggle: vi.fn() };
  });
  const convert = vi.spyOn(wav, 'recordingToWav').mockResolvedValue(audio);
  const voice = vi.spyOn(api, 'voice').mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const engine = { start: vi.fn(async () => {}), starting: false };
  render(React.createElement(VoiceCheck, { child, engine }));
  let upload;
  await act(async () => { upload = onStop(blob); });
  expect(convert).toHaveBeenCalledExactlyOnceWith(blob);
  expect(voice).toHaveBeenCalledExactlyOnceWith({ childId: child.id, audio });
  expect(screen.getByRole('button', { name: 'Record' }).disabled).toBe(true);
  expect(engine.start).not.toHaveBeenCalled();
  await act(async () => { finish({ voiceCheck: true }); await upload; });
  expect(engine.start).toHaveBeenCalledExactlyOnceWith({ ...child, voiceStatus: 'done', voiceCheck: true });
});

it('uses the expected count from the server and lets the child record again before starting', async () => {
  window.history.replaceState(null, '', '/?mock#/child/plo/voice');
  const start = vi.spyOn(api, 'start');
  vi.spyOn(api, 'voice').mockRejectedValueOnce(Object.assign(new Error('count'), { status: 422, heard: 9, expected: 12 }));
  render(React.createElement(App));
  fireEvent.click(await screen.findByRole('button', { name: 'Record' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Heard 9 of 12. Try again.');
  expect(start).not.toHaveBeenCalled();
  expect(window.location.hash).toBe('#/child/plo/voice');
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  expect(await screen.findByText('בָּ בַּ מָ', { selector: '.current-line' })).toBeTruthy();
});

it.each([
  ['ashkenazi', ['kamatz', 'patach'], 12, 4],
  ['sephardi', ['kamatz', 'patach', 'segol'], 9, 3],
])('shows the %s subset card for %s with %i syllables and %i columns', (preset, vowels, count, columns) => {
  render(React.createElement(VoiceCheck, { child: { ...child, preset, vowels }, engine: { start: vi.fn() } }));
  const card = document.querySelector('.voice-card');
  expect(card.children).toHaveLength(count);
  expect([...card.children].map(element => element.textContent)).toEqual(voiceCardFor(vowels, preset));
  expect(card.style.getPropertyValue('--columns')).toBe(String(columns));
  expect(card.getAttribute('dir')).toBe('rtl');
});

it('starts the turn after a 409 voice response', async () => {
  window.history.replaceState(null, '', '/?mock#/child/pippa/voice');
  const start = vi.spyOn(api, 'start');
  vi.spyOn(api, 'voice').mockRejectedValue(Object.assign(new Error('No voice check'), { status: 409 }));
  render(React.createElement(App));
  fireEvent.click(await screen.findByRole('button', { name: 'Record' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  expect(await screen.findByText(items[0].text, { selector: '.current-line' })).toBeTruthy();
  expect(start).toHaveBeenCalledExactlyOnceWith({ childId: 'pippa' });
  expect(window.location.hash).toBe('#/read');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(JSON.parse(sessionStorage.getItem(TURN_KEY)).child).toMatchObject({ voiceStatus: 'none', voiceCheck: true });
});

it('starts the turn once instead of showing an empty voice card', async () => {
  const noCardChild = { ...child, vowels: ['kamatz', 'patach'], voiceStatus: 'none', voiceCheck: true };
  expect(voiceCardFor(noCardChild.vowels, noCardChild.preset)).toEqual([]);
  const start = vi.fn(async () => {});
  const view = render(React.createElement(React.StrictMode, null,
    React.createElement(VoiceCheck, { child: noCardChild, engine: { start } })));
  await waitFor(() => expect(start).toHaveBeenCalledExactlyOnceWith(noCardChild));
  view.rerender(React.createElement(React.StrictMode, null,
    React.createElement(VoiceCheck, { child: noCardChild, engine: { start, starting: true } })));
  expect(start).toHaveBeenCalledOnce();
  expect(document.querySelector('.voice-card')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
});

it('lets an empty-card child retry starting a turn after a failure', async () => {
  const noCardChild = { ...child, vowels: ['kamatz', 'patach'], voiceStatus: 'none', voiceCheck: true };
  const start = vi.fn(async () => {});
  const engine = { start, startError: true };
  render(React.createElement(VoiceCheck, { child: noCardChild, engine }));
  await waitFor(() => expect(start).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(start).toHaveBeenCalledTimes(2);
});

it.each([[422, 'quiet'], [415, 'Use 16 kHz mono WAV'], [500, 'Request failed']])
  ('shows only Try again for a voice failure %i %s', async (status, message) => {
    vi.spyOn(api, 'voice').mockRejectedValue(Object.assign(new Error(message), { status }));
    const engine = { start: vi.fn() };
    render(React.createElement(VoiceCheck, { child, engine }));
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Try again');
    expect(engine.start).not.toHaveBeenCalled();
  });

it('matches the reading microphone-off state on the voice screen', async () => {
  window.history.replaceState(null, '', '/#/child/bim/voice');
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  render(React.createElement(VoiceCheck, { child, engine: { start: vi.fn() } }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  expect(await screen.findByRole('heading', { name: 'Microphone is off' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
});

it.each(['/', '/read', '/done', '/teacher'])('shows a gray Demo pill only in mock mode on %s', async route => {
  vi.spyOn(api, 'children').mockResolvedValue([child]);
  vi.spyOn(api, 'config').mockResolvedValue({ trace: false });
  vi.spyOn(api, 'checkPin').mockResolvedValue({ ok: true });
  vi.spyOn(api, 'classView').mockResolvedValue({ children: [], groups: [] });
  for (const mock of [true, false]) {
    window.history.replaceState(null, '', `/${mock ? '?mock' : ''}#${route}`);
    savePin('2468');
    sessionStorage.setItem(TURN_KEY, JSON.stringify(turn({ phase: route === '/done' ? 'finished' : 'reading' })));
    const style = document.createElement('style'); style.id = 'station-test-styles';
    style.textContent = readFileSync('src/styles.css', 'utf8'); document.head.append(style);
    const view = render(React.createElement(App));
    await screen.findByRole('link', { name: 'Kriah Listener home' });
    if (mock) {
      const pill = await screen.findByText('Demo');
      expect(pill.closest('header, aside')).toBeTruthy();
      expect(pill.classList.contains('level-badge')).toBe(true);
      expect(getComputedStyle(pill).color).toBe('rgb(101, 113, 123)');
      expect(getComputedStyle(pill).backgroundColor).toBe('rgb(240, 242, 243)');
    } else expect(screen.queryByText('Demo')).toBeNull();
    view.unmount(); style.remove();
  }
});

it('renders the Hebrew line and record button, then a gold frame for the last challenge', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(React.createElement(App));
  const line = await screen.findByText(items[0].text);
  expect(line.getAttribute('dir')).toBe('rtl');
  expect(line.getAttribute('lang')).toBe('he');
  expect(line.closest('.challenge-frame')).toBeNull();
  expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop recording' }));
  const challenge = await screen.findByText(items[1].text, { selector: '.current-line' });
  expect(challenge.closest('.challenge-frame')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([[0, '0 stars!'], [1, '1 star!'], [4, '4 stars!'], [10, '10 stars!'], [14, '14 stars!']])
  ('celebrates %i stars with the child avatar, earned stars and the correct stars line', (stars, heading) => {
    const onNext = vi.fn();
    render(React.createElement(DoneScreen, { turn: turn({ stars }), onNext }));
    const celebration = document.querySelector('.done-content');
    expect(celebration.firstElementChild.classList.contains('avatar')).toBe(true);
    const row = screen.getByRole('img', { name: `${stars} ${stars === 1 ? 'star' : 'stars'} earned this turn` });
    expect(row.querySelectorAll('.star.filled')).toHaveLength(Math.min(stars, 10));
    expect(row.querySelector('.done-star-count')?.textContent).toBe(stars > 10 ? String(stars) : undefined);
    expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    expect([...celebration.children].map(element => element.tagName.toLowerCase()))
      .toEqual(['svg', 'div', 'h1', 'p', 'button']);
    expect(celebration.querySelector('.turn-message').textContent).toBe('You read so well today!');
    expect(screen.queryByText('Go get the next friend!')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next friend' }));
    expect(onNext).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#/');
  });

it('finishes when the server says done, saves line and bonus stars, and replaces read with done', async () => {
  vi.spyOn(api, 'grade').mockImplementation(async ({ itemId }) => grade(items.find(item => item.id === itemId)));
  const choose = vi.spyOn(api, 'next');
  const finish = vi.spyOn(api, 'finish');
  const replace = vi.spyOn(window.history, 'replaceState');
  render(React.createElement(App));
  for (const item of items.filter(item => !item.source?.beginner)) {
    await screen.findByText(item.text, { selector: '.current-line' }, { timeout: 3500 });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
  }
  expect(await screen.findByRole('heading', { name: '9 stars!' })).toBeTruthy();
  expect(screen.queryByText('Go get the next friend!')).toBeNull();
  expect(screen.getByText(/You nailed the bet with a dot/)).toBeTruthy();
  expect(replace).toHaveBeenLastCalledWith(null, '', '/?mock#/done');
  const saved = JSON.parse(sessionStorage.getItem(TURN_KEY));
  expect(saved.completedSets).toBe(3);
  expect(saved.attempts).toHaveLength(6);
  expect(choose).toHaveBeenCalledTimes(3);
  expect(choose.mock.calls[0][0]).toEqual({ turnId: saved.turnId, elapsedMs: expect.any(Number), checkpoint: 1 });
  expect(finish).toHaveBeenCalledWith({ turnId: saved.turnId, stars: 9 });
  fireEvent.click(screen.getByRole('button', { name: 'Next friend' }));
  expect(await screen.findByRole('heading', { name: 'Who’s reading?' })).toBeTruthy();
  expect(sessionStorage.getItem(TURN_KEY)).toBeNull();
});

it('restores a turn after reload and leaves an interrupted upload plain', async () => {
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn({ lineIndex: 1, attempts: [
    { itemId: items[0].id, text: items[0].text, status: 'pending', grade: null },
  ] })));
  const start = vi.spyOn(api, 'start');
  render(React.createElement(App));
  expect(await screen.findByText(items[1].text)).toBeTruthy();
  expect(screen.getByLabelText('Previous line').textContent).toBe(items[0].text);
  expect(screen.getByLabelText('Previous line').querySelector('.pair-ok')).toBeNull();
  expect(start).not.toHaveBeenCalled();
});

it('advances immediately, scores resolved grades in reading order, and sends no client grades to next', async () => {
  let first, second;
  vi.spyOn(api, 'grade').mockReturnValueOnce(new Promise(resolve => { first = resolve; }))
    .mockReturnValueOnce(new Promise(resolve => { second = resolve; }));
  const choose = vi.spyOn(api, 'next');
  const { result } = renderHook(useTurn);
  await act(async () => { await result.current.start(child); });
  act(() => { void result.current.record(null); });
  expect(result.current.turn.lineIndex).toBe(1);
  expect(result.current.turn.stars).toBe(0);
  act(() => { void result.current.record(null); });
  await act(async () => { second(grade(items[1])); });
  expect(result.current.turn.streak).toBe(0);
  expect(choose).not.toHaveBeenCalled();
  await act(async () => { first(grade(items[0], 'wrong_letter')); });
  await waitFor(() => expect(choose).toHaveBeenCalledOnce());
  expect(result.current.turn.streak).toBe(1);
  expect(result.current.turn.bestStreak).toBe(1);
  expect(result.current.turn.stars).toBe(2);
  expect(result.current.turn.set[0].id).toBe(items[2].id);
  expect(Object.keys(choose.mock.calls[0][0]).sort()).toEqual(['checkpoint', 'elapsedMs', 'turnId']);
});

it('awards a star at 80 percent and a bonus only for a perfect challenge', () => {
  const result = grade(items[0]);
  expect(lineStars({ ...result, summary: { pairs: 10, ok: 8 } })).toBe(1);
  expect(lineStars({ ...result, summary: { pairs: 10, ok: 7 } })).toBe(0);
  expect(lineStars(result, true)).toBe(2);
  expect(lineStars({ ...result, summary: { pairs: 1, ok: 1, extra: 1 } }, true)).toBe(1);
  expect(lineStars(grade(items[0], 'uncertain'), true)).toBe(0);
});

it('continues after a failed upload without awarding a star', async () => {
  vi.spyOn(api, 'grade').mockRejectedValue(new Error('Offline'));
  const { result } = renderHook(useTurn);
  await act(async () => { await result.current.start(child); });
  await act(async () => { await result.current.record(null); });
  expect(result.current.turn.attempts[0].status).toBe('failed');
  await act(async () => { await result.current.record(null); });
  await waitFor(() => expect(result.current.turn.completedSets).toBe(1));
  expect(result.current.turn.stars).toBe(0);
  expect(result.current.turn.streak).toBe(0);
});

it('honors an early server ending and retries finish without requesting another set', async () => {
  const choose = vi.spyOn(api, 'next').mockResolvedValue({ done: true, level: 1, levelUp: false, facts: {} });
  const finish = vi.spyOn(api, 'finish').mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ child });
  const { result } = renderHook(useTurn);
  await act(async () => { await result.current.start(child); });
  await act(async () => { await result.current.record(null); });
  await act(async () => { await result.current.record(null); });
  expect(result.current.turn.phase).toBe('finish_error');
  expect(result.current.turn.completedSets).toBe(1);
  await act(async () => result.current.retryNext());
  expect(result.current.turn.phase).toBe('finished');
  expect(choose).toHaveBeenCalledOnce(); expect(finish).toHaveBeenCalledTimes(2);
  const saved = sessionStorage.getItem(TURN_KEY);
  expect(saved).not.toMatch(/audio|blob|wav|base64/);
});

it('releases a microphone that arrives after the read screen has unmounted', async () => {
  window.history.replaceState(null, '', '/#/read');
  let grant;
  const trackStop = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => new Promise(resolve => { grant = resolve; }) } });
  const view = render(React.createElement(ReadScreen, { turn: turn(), onRecord: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  view.unmount();
  await act(async () => grant({ getTracks: () => [{ stop: trackStop }] }));
  expect(trackStop).toHaveBeenCalledOnce();
});

it('shows the new level for two seconds between sets', async () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const { result } = renderHook(useTurn);
  await act(async () => { await result.current.start(child); });
  for (let index = 0; index < 4; index++) await act(async () => { await result.current.record(null); });
  expect(result.current.turn.phase).toBe('level_up');
  expect(result.current.turn.level).toBe(2);
  render(React.createElement(LevelUp, { level: result.current.turn.level }));
  expect(screen.getByRole('status', { name: 'Level 2' })).toBeTruthy();
  act(() => vi.advanceTimersByTime(1999));
  expect(result.current.turn.phase).toBe('level_up');
  act(() => vi.advanceTimersByTime(1));
  expect(result.current.turn.phase).toBe('reading');
});

it('stops a mock recording after twenty seconds', async () => {
  vi.useFakeTimers();
  const onRecord = vi.fn();
  render(React.createElement(ReadScreen, { turn: turn(), onRecord, onRetryNext: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
  await act(async () => { vi.advanceTimersByTime(20000); });
  expect(onRecord).toHaveBeenCalledOnce();
});

it('allows retry after microphone denial', async () => {
  window.history.replaceState(null, '', '/#/read');
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  render(React.createElement(ReadScreen, { turn: turn(), onRecord: vi.fn(), onRetryNext: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  expect(await screen.findByRole('heading', { name: 'Microphone is off' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
});

it('uses an AnalyserNode to stop after speech and 1.2 seconds of quiet and releases audio', async () => {
  vi.useFakeTimers();
  window.history.replaceState(null, '', '/#/read');
  let loudness = 0;
  const trackStop = vi.fn(), close = vi.fn(async () => {}), onRecord = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: trackStop }] })) } });
  class Context {
    resume = async () => {};
    close = close;
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
    createAnalyser() { return { fftSize: 2048, disconnect: vi.fn(), getFloatTimeDomainData: samples => samples.fill(loudness) }; }
  }
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new Blob(['clip']) }); this.onstop(); }
  }
  vi.stubGlobal('AudioContext', Context); vi.stubGlobal('MediaRecorder', Recorder);
  render(React.createElement(ReadScreen, { turn: turn(), onRecord, onRetryNext: vi.fn() }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  act(() => vi.advanceTimersByTime(3000));
  expect(onRecord).not.toHaveBeenCalled();
  loudness = .1;
  act(() => vi.advanceTimersByTime(100));
  loudness = 0;
  act(() => vi.advanceTimersByTime(1200));
  expect(onRecord).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(50));
  expect(onRecord).toHaveBeenCalledOnce();
  expect(trackStop).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
});

it('preserves Hebrew pairs and marks an extra word with a dot only, never what the ear heard', () => {
  render(React.createElement(GradedLine, { attempt: { status: 'graded', grade: { words: [
    { text: 'בָּרָ', verdict: null, pairs: [{ text: 'בָּ', verdict: 'ok' }, { text: 'רָ', verdict: 'wrong_vowel' }] },
    { text: 'ba', verdict: 'extra', pairs: [] },
  ] } } }));
  expect(document.querySelector('.previous-line').textContent).not.toContain('ba');
  expect(document.querySelector('.pair-ok').textContent).toBe('בָּ');
  expect(document.querySelector('.pair-wrong_vowel').textContent).toBe('רָ');
  expect(screen.getByLabelText('Extra word').className).toBe('extra-dot');
});

it('uses no error red on read, recording, marked pairs, or done', () => {
  const style = document.createElement('style'); style.id = 'station-test-styles';
  style.textContent = readFileSync('src/styles.css', 'utf8'); document.head.append(style);
  const attempt = { status: 'graded', grade: { words: ['ok', 'wrong_letter', 'wrong_vowel', 'skipped', 'uncertain', 'not_decoded', 'extra'].map(verdict =>
    ({ text: 'בָּ', verdict: verdict === 'extra' ? 'extra' : null, pairs: [{ text: 'בָּ', verdict }] })) } };
  const view = render(React.createElement(ReadScreen, { turn: turn({ attempts: [attempt] }), onRecord: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  function check() {
    document.querySelectorAll('main *, section *').forEach(element => {
      const computed = getComputedStyle(element);
      for (const property of ['color', 'backgroundColor', 'borderColor', 'textDecorationColor', 'fill', 'stroke'])
        expect(computed[property]).not.toMatch(/#d64545|rgb\(214,\s*69,\s*69\)|\bred\b|#ff0000/i);
    });
  }
  check();
  expect(getComputedStyle(document.querySelector('.pair-wrong_vowel')).color).toBe('rgb(104, 115, 110)');
  view.unmount();
  render(React.createElement(DoneScreen, { turn: turn({ stars: 4 }), onNext: vi.fn() })); check();
  expect(style.sheet.cssRules.length).toBeGreaterThan(50);
});


it('server and station line star rules agree on the same grade fixtures', async () => {
  const { lineStars: serverStars } = await import('../../server/stars.js');
  const { starFixtures } = await import('../../server/stars.fixtures.js');
  for (const fixture of starFixtures) {
    expect(lineStars(fixture.grade, fixture.challenge), fixture.name).toBe(fixture.stars);
    expect(serverStars(fixture.grade, fixture.challenge), fixture.name).toBe(lineStars(fixture.grade, fixture.challenge));
  }
});

it('retries a lost checkpoint response with the same completed-set count after reload', async () => {
  const choose = vi.spyOn(api, 'next').mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValue({ done: false, level: 1, set: items.slice(2, 4) });
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn({ phase: 'checkpoint', lineIndex: 2, completedSets: 2 })));
  const first = renderHook(useTurn);
  await waitFor(() => expect(first.result.current.turn.phase).toBe('next_error'));
  first.unmount();
  const second = renderHook(useTurn);
  await act(async () => second.result.current.retryNext());
  await waitFor(() => expect(second.result.current.turn.phase).toBe('reading'));
  expect(choose.mock.calls.map(([data]) => data.checkpoint)).toEqual([3, 3]);
  expect(second.result.current.turn.completedSets).toBe(3);
});

it.each(['grade', 'next', 'finish'])('clears an unknown saved turn on %s 404 and returns to Who’s reading', async call => {
  window.history.replaceState(null, '', '/#/read');
  vi.spyOn(api, 'children').mockResolvedValue([child]);
  vi.spyOn(api, 'config').mockResolvedValue({ trace: false });
  vi.spyOn(api, 'isMockMode').mockReturnValue(true);
  vi.spyOn(api, call).mockRejectedValue(Object.assign(new Error('Unknown turn'), { status: 404 }));
  const phase = call === 'next' ? 'choosing' : call === 'finish' ? 'finishing' : 'reading';
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn({ phase })));
  render(React.createElement(App));
  if (call === 'grade') {
    fireEvent.click(await screen.findByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
  }
  expect(await screen.findByRole('heading', { name: 'Who’s reading?' })).toBeTruthy();
  expect(sessionStorage.getItem(TURN_KEY)).toBeNull();
  expect(window.location.hash).toBe('#/');
});

it('a late unknown-turn response does not clear a newer turn', async () => {
  let reject;
  vi.spyOn(api, 'grade').mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  const { result } = renderHook(useTurn);
  await act(async () => result.current.start(child));
  let upload;
  act(() => { upload = result.current.record(null); });
  await act(async () => result.current.start(child));
  const newer = result.current.turn.turnId;
  await act(async () => { reject(Object.assign(new Error('Unknown turn'), { status: 404 })); await upload; });
  expect(result.current.turn.turnId).toBe(newer);
});
