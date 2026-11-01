import React from 'react';
import { Blob as MemoryBlob } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import App from './App.jsx';
import { CurrentLine, ReadScreen } from './Game.jsx';
import { useRecorder } from './useRecorder.js';
import { useTurn } from './useTurn.js';
import { TURN_KEY } from './storage.js';
import * as api from './api.js';
import * as wav from './wav.js';

const child = { id: 'reader', name: 'Levi', avatar: 'lion', preset: 'ashkenazi', level: 1 };
const items = [{ id: 'one', text: 'בָּ בָּרָ', source: {} },
  { id: 'two', text: 'מָ מַ', source: { challenge: true } }, { id: 'three', text: 'לָ לַ', source: {} }];
const turn = (changes = {}) => ({ turnId: 'turn', child, level: 1, set: items.slice(0, 2), lineIndex: 0,
  completedSets: 0, stars: 0, streak: 0, bestStreak: 0, bonusBurst: 0, attempts: [], setStart: 0,
  resolvedThrough: 0, setStartedAt: Date.now(), phase: 'reading', ...changes });
const grade = item => ({ itemId: item.id, words: [{ text: item.text, pairs: [{ text: item.text, verdict: 'ok' }] }],
  summary: { pairs: 1, ok: 1 } });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function microphone(sampleRate = 16000, loadModule = async () => {}) {
  const tracks = [], processors = [], contexts = [];
  let level = 0;
  const getUserMedia = vi.fn(async () => {
    const track = { stop: vi.fn(), onended: null };
    tracks.push(track);
    return { getTracks: () => [track] };
  });
  class Context {
    sampleRate = sampleRate;
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: vi.fn(loadModule) };
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
    constructor() { contexts.push(this); }
    createMediaStreamSource() { return { connect: vi.fn(), disconnect: vi.fn() }; }
    createAnalyser() {
      return { fftSize: 2048, disconnect: vi.fn(), getFloatTimeDomainData: samples => samples.fill(level) };
    }
  }
  class CaptureNode {
    port = { onmessage: null, close: vi.fn() };
    connect = vi.fn();
    disconnect = vi.fn();
    constructor() { processors.push(this); }
  }
  class Recorder {
    static isTypeSupported() { return true; }
    state = 'inactive'; mimeType = 'audio/webm';
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: new MemoryBlob(['clip']) }); this.onstop(); }
  }
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('AudioWorkletNode', CaptureNode);
  vi.stubGlobal('MediaRecorder', Recorder);
  vi.stubGlobal('Blob', MemoryBlob);
  function audio(loudness, ms = 50) {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      level = loudness;
      vi.advanceTimersByTime(50);
      contexts.at(-1).currentTime += .05;
      const input = new Float32Array(sampleRate / 20).fill(loudness);
      processors.at(-1)?.port.onmessage?.({ data: { samples: input,
        startFrame: Math.round((contexts.at(-1).currentTime - .05) * sampleRate) } });
    }
  }
  async function line() {
    await act(async () => { audio(.1, 1000); audio(0, 2000); });
  }
  return { tracks, processors, contexts, getUserMedia, audio, line };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/#/read');
  vi.spyOn(api, 'follow').mockResolvedValue({ syllables: 0 });
  vi.spyOn(wav, 'recordingToWav').mockImplementation(async blob => blob);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('one tap sends each spoken line once in order, waits for checkpoint grades, resumes after a level up and releases at turn end', async () => {
  const mic = microphone();
  const first = deferred(), second = deferred(), next = deferred(), finish = deferred();
  vi.spyOn(api, 'children').mockResolvedValue([child]);
  vi.spyOn(api, 'config').mockResolvedValue({ trace: false });
  const grading = vi.spyOn(api, 'grade').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    .mockResolvedValueOnce(grade(items[2]));
  const choose = vi.spyOn(api, 'next').mockReturnValueOnce(next.promise)
    .mockResolvedValueOnce({ done: true, level: 2, facts: {} });
  const finishing = vi.spyOn(api, 'finish').mockReturnValue(finish.promise);
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn()));
  render(React.createElement(App));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  await act(async () => { mic.audio(0, 3000); });
  expect(grading).not.toHaveBeenCalled();
  await mic.line();
  expect(document.querySelector('.current-line').textContent).toBe(items[1].text);
  expect(screen.getByRole('button', { name: 'Pause listening' }).getAttribute('aria-pressed')).toBe('true');
  expect(mic.tracks[0].stop).not.toHaveBeenCalled();
  await act(async () => { mic.audio(0, 2000); });
  expect(grading).toHaveBeenCalledOnce();
  await mic.line();
  expect(grading.mock.calls.map(([value]) => value.itemId)).toEqual(['one', 'two']);
  expect(choose).not.toHaveBeenCalled();
  await act(async () => { second.resolve(grade(items[1])); });
  expect(choose).not.toHaveBeenCalled();
  expect(document.querySelector('.previous-line .pair-ok')).toBeTruthy();
  expect(screen.getAllByLabelText('Previous line')).toHaveLength(2);
  expect(screen.getAllByLabelText('Previous line')[1].querySelector('.pair')).toBeNull();
  await act(async () => { mic.audio(.1, 2000); });
  expect(grading).toHaveBeenCalledTimes(2);
  await act(async () => { first.resolve(grade(items[0])); });
  expect(choose).toHaveBeenCalledExactlyOnceWith({ turnId: 'turn', checkpoint: 1, elapsedMs: expect.any(Number) });
  expect(document.querySelector('.previous-line .pair-ok')).toBeTruthy();
  expect(mic.tracks[0].stop).not.toHaveBeenCalled();
  await act(async () => { next.resolve({ done: false, level: 2, levelUp: true, set: [items[2]] }); });
  expect(screen.getByRole('status', { name: 'Level 2' })).toBeTruthy();
  await act(async () => { mic.audio(.1, 1500); mic.audio(0, 450); });
  expect(grading).toHaveBeenCalledTimes(2);
  await act(async () => { vi.advanceTimersByTime(50); });
  expect(document.querySelector('.current-line').textContent).toBe(items[2].text);
  await mic.line();
  expect(grading.mock.calls.map(([value]) => value.itemId)).toEqual(['one', 'two', 'three']);
  expect(mic.getUserMedia).toHaveBeenCalledOnce();
  expect(mic.tracks[0].stop).toHaveBeenCalledOnce();
  expect(mic.contexts[0].close).toHaveBeenCalledOnce();
  expect(mic.processors[0].disconnect).toHaveBeenCalledOnce();
  expect(finishing).toHaveBeenCalledExactlyOnceWith({ turnId: 'turn', stars: 4 });
  await act(async () => { finish.resolve({ child }); });
  expect(screen.getByRole('heading', { name: '4 stars!' })).toBeTruthy();
  expect(window.location.hash).toBe('#/done');
  const saved = JSON.parse(sessionStorage.getItem(TURN_KEY));
  expect(saved.streak).toBe(3);
  expect(saved.bestStreak).toBe(3);
  expect(saved.bonusBurst).toBe(1);
  expect(sessionStorage.getItem(TURN_KEY)).not.toMatch(/audio|blob|wav|base64/);
  for (const [value] of grading.mock.calls) {
    expect(value.audio.type).toBe('audio/wav');
    const bytes = new DataView(await value.audio.arrayBuffer());
    expect(bytes.getUint32(24, true)).toBe(16000);
  }
});

it('ends a line of steady noise 20 seconds after its first sound, once, and keeps listening for the next line', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result, rerender } = renderHook(({ lineKey }) => useRecorder(onStop, false, { continuous: true, lineKey }),
    { initialProps: { lineKey: 'one' } });
  await act(async () => result.current.toggle());
  act(() => mic.audio(.1, 19950));
  expect(onStop).not.toHaveBeenCalled();
  act(() => mic.audio(.1, 100));
  expect(onStop).toHaveBeenCalledOnce();
  expect(onStop.mock.calls[0][0]).toBeInstanceOf(MemoryBlob);
  expect(onStop.mock.calls[0][0].size).toBeLessThanOrEqual(44 + 20000 * 16 * 2);
  expect(result.current.status).toBe('waiting');
  act(() => mic.audio(.1, 2000));
  expect(onStop).toHaveBeenCalledOnce();
  rerender({ lineKey: 'two' });
  await mic.line();
  expect(onStop).toHaveBeenCalledTimes(2);
  expect(mic.getUserMedia).toHaveBeenCalledOnce();
  expect(mic.tracks[0].stop).not.toHaveBeenCalled();
  expect(mic.contexts[0].close).not.toHaveBeenCalled();
});

it('counts the 20-second limit from the first sound, so a quiet start is never cut off', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  expect(mic.getUserMedia).toHaveBeenCalledWith({ audio: expect.objectContaining({ echoCancellation: false, noiseSuppression: false }) });
  act(() => mic.audio(0, 25000));
  expect(onStop).not.toHaveBeenCalled();
  await mic.line();
  expect(onStop).toHaveBeenCalledOnce();
});

it.each([true, false])('waits through hum and ends after speech in continuous mode %s', async continuous => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.03, 15000));
  expect(onStop).not.toHaveBeenCalled();
  expect(result.current.status).toBe('recording');
  act(() => mic.audio(.1, 1000));
  act(() => mic.audio(.03, continuous ? 1950 : 1200));
  expect(onStop).not.toHaveBeenCalled();
  act(() => mic.audio(.03, 50));
  expect(onStop).toHaveBeenCalledOnce();
});

it('stops a single recording 20 seconds after it starts, even in steady hum', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.03, 19950));
  expect(onStop).not.toHaveBeenCalled();
  act(() => mic.audio(.03, 50));
  expect(onStop).toHaveBeenCalledOnce();
});

it('counts the line safety limit from speech after hum', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.03, 10000));
  act(() => mic.audio(.1, 20000));
  expect(onStop).not.toHaveBeenCalled();
  act(() => mic.audio(.1, 50));
  expect(onStop).toHaveBeenCalledOnce();
});

it('keeps only one second of hum before actual speech in the graded audio', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.03, 5000));
  act(() => mic.audio(.1, 1000));
  act(() => mic.audio(.03, 2000));
  expect(onStop).toHaveBeenCalledOnce();
  expect(onStop.mock.calls[0][0].size).toBe(44 + 4000 * 16 * 2);
});

it('preserves the room floor across lines while waiting for the next reader sound', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result, rerender } = renderHook(({ lineKey }) => useRecorder(onStop, false, { continuous: true, lineKey }),
    { initialProps: { lineKey: 'one' } });
  await act(async () => result.current.toggle());
  act(() => { mic.audio(.03, 1000); mic.audio(.1, 1000); mic.audio(.03, 2000); });
  expect(onStop).toHaveBeenCalledOnce();
  rerender({ lineKey: 'two' });
  act(() => mic.audio(.03, 25000));
  expect(onStop).toHaveBeenCalledOnce();
  act(() => { mic.audio(.1, 1000); mic.audio(.03, 2000); });
  expect(onStop).toHaveBeenCalledTimes(2);
});

it('resumes the same speech and room levels without counting time spent paused as quiet', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  act(() => { mic.audio(.03, 1000); mic.audio(.1, 1000); mic.audio(.03, 500); });
  act(() => result.current.toggle());
  act(() => vi.advanceTimersByTime(5000));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.03, 1950));
  expect(onStop).not.toHaveBeenCalled();
  act(() => mic.audio(.03, 50));
  expect(onStop).toHaveBeenCalledOnce();
  expect(onStop.mock.calls[0][0].size).toBe(44 + 4500 * 16 * 2);
});

it('releases the microphone and offers retry when the capture module cannot load', async () => {
  const mic = microphone(16000, async () => { throw new Error('Module load failed'); }), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  expect(result.current.status).toBe('off');
  expect(mic.tracks[0].stop).toHaveBeenCalledOnce();
  expect(mic.contexts[0].close).toHaveBeenCalledOnce();
  expect(mic.processors).toHaveLength(0);
  expect(onStop).not.toHaveBeenCalled();
});

it('releases a session unmounted while its capture module is still loading', async () => {
  const module = deferred(), mic = microphone(16000, () => module.promise), onStop = vi.fn();
  const { result, unmount } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  let starting;
  await act(async () => { starting = result.current.toggle(); });
  expect(result.current.status).toBe('requesting');
  expect(mic.contexts[0].audioWorklet.addModule).toHaveBeenCalledOnce();
  unmount();
  await act(async () => { module.resolve(); await starting; });
  expect(mic.tracks[0].stop).toHaveBeenCalledOnce();
  expect(mic.contexts[0].close).toHaveBeenCalledOnce();
  expect(mic.processors).toHaveLength(0);
  expect(onStop).not.toHaveBeenCalled();
});

it.each(['track', 'processor'])('drops partial audio and releases the session when the %s fails, then retries the same line', async source => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.1, 200));
  act(() => source === 'track' ? mic.tracks[0].onended() : mic.processors[0].onprocessorerror());
  expect(result.current.status).toBe('off');
  expect(onStop).not.toHaveBeenCalled();
  expect(mic.tracks[0].stop).toHaveBeenCalledOnce();
  expect(mic.contexts[0].close).toHaveBeenCalledOnce();
  expect(mic.processors[0].disconnect).toHaveBeenCalledOnce();
  expect(mic.processors[0].port.onmessage).toBeNull();
  expect(mic.processors[0].port.close).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(20000));
  expect(onStop).not.toHaveBeenCalled();
  await act(async () => result.current.retry());
  expect(result.current.status).toBe('recording');
  expect(mic.getUserMedia).toHaveBeenCalledTimes(2);
  await mic.line();
  expect(onStop).toHaveBeenCalledOnce();
  expect(onStop.mock.calls[0][0].size).toBe(44 + 3000 * 16 * 2);
});

it('pauses without submitting, releases the track and resumes the same partial line with one new tap', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.1, 200));
  act(() => result.current.toggle());
  expect(result.current.status).toBe('ready');
  expect(mic.tracks[0].stop).toHaveBeenCalledOnce();
  expect(mic.contexts[0].close).toHaveBeenCalledOnce();
  expect(onStop).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(5000));
  await act(async () => result.current.toggle());
  await mic.line();
  expect(onStop).toHaveBeenCalledOnce();
  expect(mic.getUserMedia).toHaveBeenCalledTimes(2);
  const audio = onStop.mock.calls[0][0];
  // The 200 ms before pausing and 3000 ms after resuming are both retained.
  expect(audio.size).toBe(44 + 3200 * 16 * 2);
  expect(mic.tracks[1].stop).not.toHaveBeenCalled();
});

it('releases the microphone immediately when a finished turn also shows a level up', async () => {
  const mic = microphone(), onRecord = vi.fn();
  const view = render(React.createElement(ReadScreen, { turn: turn(), onRecord }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  act(() => mic.audio(.1, 100));
  view.rerender(React.createElement(ReadScreen, {
    turn: turn({ phase: 'level_up', afterLevelUp: 'finish_pending', level: 2 }), onRecord,
  }));
  expect(screen.getByRole('status', { name: 'Level 2' })).toBeTruthy();
  expect(mic.tracks[0].stop).toHaveBeenCalledOnce();
  expect(mic.contexts[0].close).toHaveBeenCalledOnce();
  expect(onRecord).not.toHaveBeenCalled();
});

it('retains a quiet first consonant before the louder vowel in the graded audio', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result } = renderHook(() => useRecorder(onStop, false, { continuous: true, lineKey: 'one' }));
  await act(async () => result.current.toggle());
  act(() => mic.audio(.01, 200));
  expect(onStop).not.toHaveBeenCalled();
  await mic.line();
  const audio = onStop.mock.calls[0][0];
  const bytes = new DataView(await audio.arrayBuffer());
  expect(bytes.getInt16(44, true)).toBe(328);
  expect(bytes.getInt16(44 + 200 * 16 * 2, true)).toBe(3277);
});

it.each(['/', '/child/reader', '/teacher'])('releases the microphone and drops partial audio when leaving for %s', async route => {
  const mic = microphone();
  const grading = vi.spyOn(api, 'grade');
  vi.spyOn(api, 'children').mockResolvedValue([child]);
  vi.spyOn(api, 'config').mockResolvedValue({ trace: false });
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn()));
  render(React.createElement(App));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  act(() => mic.audio(.1, 100));
  await act(async () => { window.location.hash = `#${route}`; vi.advanceTimersByTime(1); });
  expect(mic.tracks[0].stop).toHaveBeenCalledOnce();
  expect(mic.contexts[0].close).toHaveBeenCalledOnce();
  expect(grading).not.toHaveBeenCalled();
  expect(mic.processors[0].port.onmessage).toBeNull();
  expect(mic.processors[0].port.close).toHaveBeenCalledOnce();
});

it('keeps listening after a failed grade and lets the next spoken line reach the checkpoint', async () => {
  const mic = microphone();
  const grading = vi.spyOn(api, 'grade').mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(grade(items[1]));
  vi.spyOn(api, 'next').mockResolvedValue({ done: false, level: 1, set: [items[2]] });
  function Reading() {
    const engine = useTurn();
    return React.createElement(ReadScreen, { turn: engine.turn, onRecord: engine.record, onRetryNext: engine.retryNext });
  }
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn()));
  render(React.createElement(Reading));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  await mic.line();
  expect(JSON.parse(sessionStorage.getItem(TURN_KEY)).attempts[0].status).toBe('failed');
  expect(screen.getByRole('button', { name: 'Pause listening' })).toBeTruthy();
  await mic.line();
  expect(grading).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.current-line').textContent).toBe(items[2].text);
  expect(mic.getUserMedia).toHaveBeenCalledOnce();
});

it('dispatches WAV grades in reading order when conversion of the first line is delayed', async () => {
  const converted = deferred(), firstGrade = deferred();
  vi.spyOn(wav, 'recordingToWav').mockReturnValueOnce(converted.promise).mockResolvedValueOnce('second WAV');
  const grading = vi.spyOn(api, 'grade').mockReturnValueOnce(firstGrade.promise).mockResolvedValueOnce(grade(items[1]));
  vi.spyOn(api, 'next').mockResolvedValue({ done: false, level: 1, set: [items[2]] });
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn()));
  const { result } = renderHook(useTurn);
  let first, second;
  await act(async () => { first = result.current.record('first'); second = result.current.record('second'); });
  expect(grading).not.toHaveBeenCalled();
  await act(async () => { converted.resolve('first WAV'); });
  expect(grading.mock.calls.map(([value]) => [value.itemId, value.audio])).toEqual([['one', 'first WAV'], ['two', 'second WAV']]);
  expect(api.next).not.toHaveBeenCalled();
  await act(async () => { firstGrade.resolve(grade(items[0])); await Promise.all([first, second]); });
  expect(api.next).toHaveBeenCalledOnce();
});

it('polls cumulative line audio every 400 ms with one request at a time, ignores failures and stale replies, and stops at line end', async () => {
  const mic = microphone(), pending = deferred();
  const following = vi.spyOn(api, 'follow').mockReturnValueOnce(pending.promise)
    .mockRejectedValueOnce(new Error('Offline')).mockResolvedValue({ syllables: 2 });
  const onRecord = vi.fn();
  const view = render(React.createElement(ReadScreen, { turn: turn(), onRecord }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  await act(async () => { mic.audio(.1, 350); });
  expect(following).not.toHaveBeenCalled();
  await act(async () => { mic.audio(.1, 50); });
  expect(following).toHaveBeenCalledOnce();
  expect(following.mock.calls[0][0]).toEqual({ turnId: 'turn', itemId: 'one', audio: expect.any(MemoryBlob) });
  await act(async () => { mic.audio(.1, 1200); });
  expect(following).toHaveBeenCalledOnce();
  await act(async () => { pending.resolve({ syllables: 2 }); });
  expect(document.querySelector('.reading-word-current').textContent).toBe('בָּ');
  await act(async () => { mic.audio(.1, 400); });
  expect(following).toHaveBeenCalledTimes(2);
  expect(following.mock.calls[1][0].audio.size).toBeGreaterThan(following.mock.calls[0][0].audio.size);
  expect(onRecord).not.toHaveBeenCalled();
  const late = deferred();
  following.mockReturnValueOnce(late.promise);
  await act(async () => { mic.audio(.1, 400); });
  await act(async () => { mic.audio(0, 2000); });
  expect(onRecord).toHaveBeenCalledOnce();
  view.rerender(React.createElement(ReadScreen, { turn: turn({ lineIndex: 1 }), onRecord }));
  await act(async () => { late.resolve({ syllables: 2 }); });
  expect(document.querySelector('.reading-word-current')).toBeNull();
  const calls = following.mock.calls.length;
  await act(async () => { mic.audio(0, 2000); });
  expect(following).toHaveBeenCalledTimes(calls);
  await act(async () => { mic.audio(.1, 400); });
  expect(following.mock.calls.at(-1)[0].itemId).toBe('two');
  fireEvent.click(screen.getByRole('button', { name: 'Pause listening' }));
  const pausedCalls = following.mock.calls.length;
  await act(async () => { vi.advanceTimersByTime(1200); });
  expect(following).toHaveBeenCalledTimes(pausedCalls);
});

it('ignores a follow reply after pause and prevents overlap when recording resumes', async () => {
  const mic = microphone(), pending = deferred();
  const following = vi.spyOn(api, 'follow').mockReturnValueOnce(pending.promise).mockResolvedValue({ syllables: 1 });
  render(React.createElement(ReadScreen, { turn: turn(), onRecord: vi.fn() }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  await act(async () => { mic.audio(.1, 400); });
  fireEvent.click(screen.getByRole('button', { name: 'Pause listening' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  await act(async () => { mic.audio(.1, 400); });
  expect(following).toHaveBeenCalledOnce();
  await act(async () => { pending.resolve({ syllables: 2 }); });
  expect(document.querySelector('.reading-word-current')).toBeNull();
  await act(async () => { mic.audio(.1, 400); });
  expect(document.querySelector('.reading-word-current').textContent).toBe('בָּ');
});

it.each([48000, 44100])('follows %i Hz capture as 16 kHz PCM without decoding or opening another context', async sampleRate => {
  const mic = microphone(sampleRate), onRecord = vi.fn();
  const following = vi.spyOn(api, 'follow').mockResolvedValue({ syllables: 2 });
  render(React.createElement(ReadScreen, { turn: turn(), onRecord }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  await act(async () => { mic.audio(.25, 400); });
  expect(following).toHaveBeenCalledOnce();
  const audio = following.mock.calls[0][0].audio;
  expect(audio.type).toBe('audio/wav');
  const bytes = new DataView(await audio.arrayBuffer());
  expect(bytes.getUint16(22, true)).toBe(1);
  expect(bytes.getUint32(24, true)).toBe(16000);
  expect(bytes.getUint32(40, true)).toBe(11200);
  expect(bytes.getInt16(44, true)).toBe(8192);
  expect(bytes.getInt16(bytes.byteLength - 2, true)).toBe(8192);
  await act(async () => { mic.audio(.25, 400); });
  expect(following).toHaveBeenCalledTimes(2);
  expect(wav.recordingToWav).not.toHaveBeenCalled();
  expect(mic.contexts).toHaveLength(1);
  await mic.line();
  const graded = new DataView(await onRecord.mock.calls[0][0].arrayBuffer());
  expect(graded.getUint32(24, true)).toBe(sampleRate);
});

it('only enlarges the next word per answer, never moves back, and starts each new line plain', async () => {
  const mic = microphone(), onRecord = vi.fn();
  const following = vi.spyOn(api, 'follow').mockResolvedValue({ syllables: 100 });
  const set = [{ ...items[0], text: items.map(item => item.text).join(' ') }, items[1]];
  const view = render(React.createElement(ReadScreen, { turn: turn({ set }), onRecord }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  expect(document.querySelector('.reading-word-current')).toBeNull();
  for (const [word, expected] of [[4, 0], [4, 1], [0, 1], [null, 1], [-1, 1], [1.5, 1], [4, 2], [2, 2], [5, 3], [1, 3]]) {
    following.mockResolvedValueOnce({ syllables: Number.isInteger(word) && word >= 0 ? word + 2 : word });
    await act(async () => { mic.audio(.1, 400); });
    const words = [...document.querySelectorAll('.reading-word')];
    expect(words.findIndex(element => element.classList.contains('reading-word-current')), `answer ${word}`).toBe(expected);
  }
  view.rerender(React.createElement(ReadScreen, { turn: turn({ set, lineIndex: 1 }), onRecord }));
  expect(document.querySelector('.reading-word-current')).toBeNull();
  await act(async () => { mic.audio(.1, 400); });
  expect(document.querySelector('.reading-word-current')).toBe(document.querySelector('.reading-word'));
});

it('preserves printed text and word indexes across spaces, maqaf and punctuation and keeps the active word in view', () => {
  const scroll = vi.fn();
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = scroll;
  try {
    const item = { id: 'wrap', text: 'בָּ־בָּרָ  בָּרָכָה׃' };
    const view = render(React.createElement(CurrentLine, { item, word: 1 }));
    expect(document.querySelector('.current-line').textContent).toBe(item.text);
    expect(document.querySelectorAll('.reading-word')).toHaveLength(3);
    expect(document.querySelector('.reading-word-current').textContent).toBe('בָּרָ');
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    view.rerender(React.createElement(CurrentLine, { item, word: 2 }));
    expect(document.querySelector('.reading-word-current').textContent).toBe('בָּרָכָה');
    expect(scroll).toHaveBeenCalledTimes(2);
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\.reading-word-current \{ transform: scale\(1\.15\); \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.reading-word-current \{ transform: none; color: var\(--navy\); \}/);
    expect(css).toMatch(/\.current-line \{[^}]*overflow: auto;/);
  } finally {
    if (original) Element.prototype.scrollIntoView = original;
    else delete Element.prototype.scrollIntoView;
  }
});

it('shows finishing while retaining at least 450 ms of soft final vowel, then keeps the next line listening', async () => {
  const mic = microphone(), onRecord = vi.fn();
  vi.spyOn(api, 'follow').mockResolvedValue({ syllables: 100 });
  const set = [{ id: 'adon', text: 'אֲדוֹן לְבַדּוֹ אֶחָד בְּיָדוֹ' }, items[1]];
  const view = render(React.createElement(ReadScreen, { turn: turn({ set }), onRecord }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Record' })));
  await act(async () => { mic.audio(.1, 2400); });
  await act(async () => { mic.audio(0, 1550); });
  const button = screen.getByRole('button', { name: 'Pause listening' });
  expect(button.getAttribute('aria-busy')).toBe('true');
  expect(button.querySelector('.thinking-icon')).toBeTruthy();
  expect(onRecord).not.toHaveBeenCalled();
  await act(async () => { mic.audio(.01, 400); });
  expect(onRecord).not.toHaveBeenCalled();
  await act(async () => { mic.audio(.01, 50); });
  expect(onRecord).toHaveBeenCalledOnce();
  const bytes = new DataView(await onRecord.mock.calls[0][0].arrayBuffer());
  for (let offset = bytes.byteLength - 450 * 16 * 2; offset < bytes.byteLength; offset += 2) {
    expect(bytes.getInt16(offset, true)).toBe(328);
  }
  expect(onRecord.mock.calls[0][1]).toBe('turn:0:0');
  view.rerender(React.createElement(ReadScreen, { turn: turn({ set, lineIndex: 1 }), onRecord }));
  expect(screen.getByRole('button', { name: 'Pause listening' }).getAttribute('aria-busy')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Pause listening' }));
  expect(screen.getByRole('button', { name: 'Record' }).getAttribute('aria-pressed')).toBe('false');
});

it('excludes speech before the next line appears, including a queued input buffer delivered after it appears', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result, rerender } = renderHook(({ lineKey }) => useRecorder(onStop, false,
    { continuous: true, lineKey, lineText: 'בָּ בָּ' }), { initialProps: { lineKey: 'one' } });
  await act(async () => result.current.toggle());
  await mic.line();
  act(() => mic.audio(.75, 2000));
  expect(onStop).toHaveBeenCalledOnce();
  rerender({ lineKey: 'two' });
  act(() => mic.processors[0].port.onmessage({ data: {
    samples: new Float32Array(800).fill(.75), startFrame: Math.round((mic.contexts[0].currentTime - 1.05) * 16000),
  } }));
  await act(async () => { mic.audio(.2, 1000); mic.audio(0, 2000); });
  expect(onStop).toHaveBeenCalledTimes(2);
  const bytes = new DataView(await onStop.mock.calls[1][0].arrayBuffer());
  expect(bytes.getInt16(44, true)).toBe(6553);
  for (let offset = 44; offset < bytes.byteLength; offset += 2) expect(bytes.getInt16(offset, true)).toBeLessThanOrEqual(6553);
  expect(bytes.byteLength).toBe(44 + 3000 * 16 * 2);
});

it.each([
  { sampleRate: 16000, fraction: 0 },
  { sampleRate: 16000, fraction: .25 },
  { sampleRate: 44100, fraction: 0 },
  { sampleRate: 48000, fraction: .25 },
])('keeps the opening sound from a buffer spanning a line change at $sampleRate Hz with a $fraction sample boundary offset', async ({ sampleRate, fraction }) => {
  const mic = microphone(sampleRate), onStop = vi.fn(), onFollow = vi.fn(async () => null);
  const { result, rerender } = renderHook(({ lineKey }) => useRecorder(onStop, false,
    { continuous: true, lineKey, lineText: 'בָּ בָּ', onFollow }), { initialProps: { lineKey: 'one' } });
  await act(async () => result.current.toggle());
  await mic.line();
  onFollow.mockClear();
  const context = mic.contexts[0], frameStart = context.currentTime;
  const prefixLength = 733, input = new Float32Array(2048).fill(.01);
  input.fill(.75, 0, prefixLength);
  context.currentTime = frameStart + (prefixLength - fraction) / sampleRate;
  rerender({ lineKey: 'two' });
  context.currentTime = frameStart + input.length / sampleRate;
  act(() => {
    vi.advanceTimersByTime(input.length / sampleRate * 1000);
    mic.processors[0].port.onmessage({ data: { samples: input, startFrame: Math.round(frameStart * sampleRate) } });
  });
  await act(async () => { mic.audio(0, 400); });
  expect(onFollow).not.toHaveBeenCalled();
  expect(onStop).toHaveBeenCalledOnce();
  await mic.line();
  expect(onStop).toHaveBeenCalledTimes(2);
  expect(onStop.mock.calls[1][1]).toBe('two');
  const pcm = new Int16Array(await onStop.mock.calls[1][0].arrayBuffer(), 44);
  const openingLength = input.length - prefixLength;
  expect(pcm).toHaveLength(openingLength + sampleRate * 3.4);
  expect(pcm.subarray(0, openingLength).every(value => value === 328)).toBe(true);
  expect(pcm[openingLength]).toBe(0);
  expect(pcm[openingLength + sampleRate * .4]).toBe(3277);
  expect(pcm.every(value => value <= 3277)).toBe(true);
});

it('rejects a recorder callback from an older displayed line and keeps late grades on their own attempts', async () => {
  const firstGrade = deferred(), secondGrade = deferred();
  const grading = vi.spyOn(api, 'grade').mockReturnValueOnce(firstGrade.promise).mockReturnValueOnce(secondGrade.promise);
  const choosing = vi.spyOn(api, 'next').mockResolvedValue({ done: false, level: 1, set: [items[2]] });
  sessionStorage.setItem(TURN_KEY, JSON.stringify(turn()));
  const { result } = renderHook(useTurn);
  let first, second;
  await act(async () => { first = result.current.record('first', 'turn:0:0'); });
  await act(async () => { await result.current.record('stale', 'turn:0:0'); });
  expect(grading).toHaveBeenCalledOnce();
  await act(async () => { second = result.current.record('second', 'turn:0:1'); });
  expect(grading.mock.calls.map(([value]) => [value.setIndex, value.lineIndex])).toEqual([[0, 0], [0, 1]]);
  await act(async () => { secondGrade.resolve(grade(items[1])); await second; });
  expect(result.current.turn.attempts.map(attempt => [attempt.itemId, attempt.status]))
    .toEqual([['one', 'pending'], ['two', 'graded']]);
  expect(choosing).not.toHaveBeenCalled();
  await act(async () => { firstGrade.resolve(grade(items[0])); await first; });
  expect(result.current.turn.attempts.map(attempt => attempt.grade.itemId)).toEqual(['one', 'two']);
  expect(choosing).toHaveBeenCalledOnce();
});

it('preserves the measured room floor when the next displayed line has different words', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result, rerender } = renderHook(({ lineKey, lineText }) => useRecorder(onStop, false,
    { continuous: true, lineKey, lineText }), { initialProps: { lineKey: 'one', lineText: 'בָּ בָּ' } });
  await act(async () => result.current.toggle());
  act(() => { mic.audio(.002, 1000); mic.audio(.1, 1000); mic.audio(.002, 2000); });
  expect(onStop).toHaveBeenCalledOnce();
  rerender({ lineKey: 'two', lineText: 'מָ מָ' });
  act(() => { mic.audio(.025, 1000); mic.audio(.002, 2000); });
  expect(onStop).toHaveBeenCalledTimes(2);
});

it.each([16000, 44100, 48000])('keeps complete short readings after dropped capture callbacks at %i Hz', async sampleRate => {
  const mic = microphone(sampleRate), onStop = vi.fn();
  const { result, rerender } = renderHook(({ lineKey }) => useRecorder(onStop, false,
    { continuous: true, lineKey, lineText: 'בָּ בָּ' }), { initialProps: { lineKey: 'one' } });
  await act(async () => result.current.toggle());
  await mic.line();
  // The audio clock keeps running while capture callbacks are lost under load.
  act(() => {
    vi.advanceTimersByTime(2500);
    mic.contexts[0].currentTime += 2.5;
  });
  rerender({ lineKey: 'two' });
  await mic.line();
  expect(onStop).toHaveBeenCalledTimes(2);
  expect(onStop.mock.calls[1][1]).toBe('two');
  const pcm = new Int16Array(await onStop.mock.calls[1][0].arrayBuffer(), 44);
  expect(pcm).toHaveLength(sampleRate * 3);
  expect(pcm.subarray(0, sampleRate).every(value => value === 3277)).toBe(true);
  expect(pcm.subarray(sampleRate).every(value => value === 0)).toBe(true);
  rerender({ lineKey: 'three' });
  await mic.line();
  expect(onStop).toHaveBeenCalledTimes(3);
  expect(onStop.mock.calls[2][0].size).toBe(44 + sampleRate * 3 * 2);
});

it('keeps a delayed input block from before a screen change out of the new line using its capture frame', async () => {
  const mic = microphone(), onStop = vi.fn();
  const { result, rerender } = renderHook(({ lineKey }) => useRecorder(onStop, false,
    { continuous: true, lineKey, lineText: 'בָּ בָּ' }), { initialProps: { lineKey: 'one' } });
  await act(async () => result.current.toggle());
  await mic.line();
  const startFrame = Math.round(mic.contexts[0].currentTime * 16000);
  mic.contexts[0].currentTime += .05;
  rerender({ lineKey: 'two' });
  mic.contexts[0].currentTime += .05;
  act(() => mic.processors[0].port.onmessage({ data: { samples: new Float32Array(800).fill(.75), startFrame } }));
  await act(async () => { mic.audio(.2, 1000); mic.audio(0, 2000); });
  expect(onStop).toHaveBeenCalledTimes(2);
  const bytes = new DataView(await onStop.mock.calls[1][0].arrayBuffer());
  expect(bytes.getInt16(44, true)).toBe(6553);
  expect(bytes.byteLength).toBe(44 + 3000 * 16 * 2);
});
