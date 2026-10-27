import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import App, { GradedLine, ReadScreen } from './App.jsx';
import * as api from './api.js';
import { items } from './api.mock.js';
import { TURN_KEY } from './storage.js';
import { useTurn } from './useTurn.js';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/?mock#/read');
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function turn(overrides = {}) {
  return { id: 'test-turn', preset: 'sephardi', profile: { level: 1, round: 0 }, level: 1,
    set: items.slice(0, 2), lineIndex: 0, completedSets: 0, stars: 0,
    setStarAwarded: false, attempts: [], setStart: 0, resolvedThrough: 0, phase: 'reading', ...overrides };
}

function grade(item, verdict = 'ok') {
  return { itemId: item.id, words: [{ text: item.text, verdict: null,
    pairs: [{ text: item.text, verdict, heard: 'a', expected: ['a'], skills: ['vowel:kamatz'] }] }],
  verdicts: [{ verdict }], summary: { pairs: 1, ok: verdict === 'ok' ? 1 : 0,
    wrong_letter: verdict === 'wrong_letter' ? 1 : 0, wrong_vowel: 0, skipped: 0, extra: 0,
    uncertain: 0, not_decoded: 0, missedSkills: verdict === 'ok' ? [] : ['vowel:kamatz'] } };
}

it('renders the current Hebrew line and record button at the mock read bookmark', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(React.createElement(App));
  const line = await screen.findByText(items[0].text);
  expect(line.getAttribute('dir')).toBe('rtl');
  expect(line.getAttribute('lang')).toBe('he');
  expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

it('finishes exactly three sets, earns stars, and replaces read with done', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const choose = vi.spyOn(api, 'next');
  const replace = vi.spyOn(window.history, 'replaceState');
  render(React.createElement(App));
  for (const item of items) {
    await screen.findByText(item.text, { selector: '.current-line' });
    fireEvent.click(screen.getByRole('button', { name: 'Record' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
  }
  expect(await screen.findByRole('heading', { name: '3 stars!' })).toBeTruthy();
  expect(screen.getByText('You read every sound just right!')).toBeTruthy();
  expect(screen.getByRole('img', { name: '3 stars earned this turn' })).toBeTruthy();
  expect(replace).toHaveBeenLastCalledWith(null, '', '/?mock#/done');
  expect(window.location.hash).toBe('#/done');
  expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
  const saved = JSON.parse(sessionStorage.getItem(TURN_KEY));
  expect(saved.completedSets).toBe(3);
  expect(saved.attempts).toHaveLength(6);
  expect(choose).toHaveBeenCalledTimes(3);
});

it('restores a current set after reload and leaves an interrupted upload gray', async () => {
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn({ lineIndex: 1,
    attempts: [{ itemId: items[0].id, text: items[0].text, status: 'pending', grade: null }] })));
  render(React.createElement(App));
  expect(await screen.findByText(items[1].text)).toBeTruthy();
  expect(screen.getByLabelText('Previous line').textContent).toBe(items[0].text);
  expect(screen.getByLabelText('Previous line').querySelector('.pair-ok')).toBeNull();
  expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy();
});

it('shows the next line immediately and applies out-of-order grades in reading order', async () => {
  let first;
  let second;
  const firstResult = new Promise(resolve => { first = resolve; });
  const secondResult = new Promise(resolve => { second = resolve; });
  vi.spyOn(api, 'grade').mockReturnValueOnce(firstResult).mockReturnValueOnce(secondResult);
  const choose = vi.spyOn(api, 'next');
  const { result } = renderHook(useTurn);
  await act(async () => { await result.current.start(); });
  act(() => { void result.current.record(null); });
  expect(result.current.turn.lineIndex).toBe(1);
  expect(result.current.turn.attempts[0].status).toBe('pending');
  act(() => { void result.current.record(null); });
  expect(result.current.turn.stars).toBe(1);
  await act(async () => { second(grade(items[1])); });
  expect(result.current.progress.streak).toBe(0);
  expect(choose).not.toHaveBeenCalled();
  await act(async () => { first(grade(items[0], 'wrong_letter')); });
  await waitFor(() => expect(choose).toHaveBeenCalledOnce());
  expect(result.current.progress.streak).toBe(1);
  expect(result.current.progress.best).toBe(1);
  expect(choose.mock.calls[0][0].results.map(entry => entry.itemId)).toEqual([items[0].id, items[1].id]);
  expect(result.current.turn.set[0].id).toBe(items[2].id);
});

it('a failed upload stays gray and still allows the next set', async () => {
  vi.spyOn(api, 'grade').mockRejectedValue(new Error('Offline'));
  const { result } = renderHook(useTurn);
  await act(async () => { await result.current.start(); });
  await act(async () => { await result.current.record(null); });
  expect(result.current.turn.lineIndex).toBe(1);
  expect(result.current.turn.attempts[0].status).toBe('failed');
  await act(async () => { await result.current.record(null); });
  await waitFor(() => expect(result.current.turn.completedSets).toBe(1));
  expect(result.current.turn.attempts.every(entry => entry.grade.summary.not_decoded > 0)).toBe(true);
  expect(result.current.progress.streak).toBe(0);
});

it('stops recording on its own after twenty seconds in mock mode', async () => {
  vi.useFakeTimers();
  const onRecord = vi.fn();
  render(React.createElement(ReadScreen, { turn: turn(), onRecord, onRetryNext: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  expect(screen.getByRole('button', { name: 'Stop recording' })).toBeTruthy();
  await act(async () => { vi.advanceTimersByTime(20000); });
  expect(onRecord).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Record' })).toBeTruthy();
});

it('microphone denial shows one retry screen and can request permission again', async () => {
  window.history.replaceState(null, '', '/#/read');
  const getUserMedia = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  render(React.createElement(ReadScreen, { turn: turn(), onRecord: vi.fn(), onRetryNext: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  expect(await screen.findByRole('heading', { name: 'Microphone is off' })).toBeTruthy();
  expect(screen.queryByText(items[0].text)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
});

it('collects a real recorder clip and releases the microphone when stopped', async () => {
  window.history.replaceState(null, '', '/#/read');
  const trackStop = vi.fn();
  const stream = { getTracks: () => [{ stop: trackStop }] };
  const onRecord = vi.fn();
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  class Recorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(input, options) { expect(input).toBe(stream); this.mimeType = options.mimeType; }
    state = 'inactive';
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['clip'], { type: this.mimeType }) });
      this.onstop();
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  render(React.createElement(ReadScreen, { turn: turn(), onRecord, onRetryNext: vi.fn() }));
  fireEvent.click(screen.getByRole('button', { name: 'Record' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
  expect(onRecord).toHaveBeenCalledOnce();
  expect(onRecord.mock.calls[0][0].type).toBe('audio/webm;codecs=opus');
  expect(onRecord.mock.calls[0][0].size).toBe(4);
  expect(trackStop).toHaveBeenCalledOnce();
});

it('grades each pair without losing its Hebrew text and marks extra words with a dot', () => {
  const attempt = { status: 'graded', grade: { words: [
    { text: 'בָּרָ', verdict: null, pairs: [{ text: 'בָּ', verdict: 'ok' }, { text: 'רָ', verdict: 'wrong_vowel' }] },
    { text: 'מִי', verdict: 'extra', pairs: [] },
  ] } };
  render(React.createElement(GradedLine, { attempt }));
  expect(document.querySelector('.pair-ok').textContent).toBe('בָּ');
  expect(document.querySelector('.pair-wrong_vowel').textContent).toBe('רָ');
  expect(screen.getByLabelText('Extra word').className).toBe('extra-dot');
});
