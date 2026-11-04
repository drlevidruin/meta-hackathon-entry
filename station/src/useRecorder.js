import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createLineEndDetector, createSilenceDetector, rms } from './silence.js';
import { encodeWav, resample, SAMPLE_RATE } from './wav.js';
// A real file, not Vite's inlined data: URL, so every browser loads the worklet as a same-origin script.
import captureWorkletUrl from './capture-worklet.js?url&no-inline';

const MAX_LINE_MS = 20000; // Keep the existing safety limit for a line with no quiet ending.
// Everything since the line appeared stays in the clip, because soft or slow first syllables sit
// below the speech level and are heard only once a louder one trips the detector. The cap only
// bounds memory for a reader who waits longer than a whole line may last.
const MAX_LEAD_IN_SECONDS = MAX_LINE_MS / 1000;
const AUDIO_TIME_EPSILON = 0.000001; // Ignore sub-microsecond rounding at an audio block boundary.
// iOS takes a moment to switch its audio session to recording; past this, the audio never started.
const START_TIMEOUT_MS = 3000;

// A rate WebKit cannot run throws NotSupportedError, so fall back to the device's own rate.
export function openAudioContext(sampleRate) {
  const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AudioContextClass) throw new Error('Web Audio is unavailable');
  if (sampleRate) {
    try { return new AudioContextClass({ sampleRate }); } catch { /* Use the device rate below. */ }
  }
  return new AudioContextClass();
}

// iPhone and iPad browsers all run WebKit; iPadOS reports itself as a Mac with touch.
export function isAppleMobile(nav = globalThis.navigator) {
  return /iPhone|iPad|iPod/.test(nav?.userAgent || '') || (nav?.platform === 'MacIntel' && nav?.maxTouchPoints > 1);
}

// Noise suppression and echo cancellation reshape vowels, so the ear hears the voice as the sealed
// rounds recorded it, with automatic gain on. iOS ties automatic gain to its voice processing, so with
// echo cancellation off an iPhone gives the raw microphone near 0.02, under the speech level, and
// no line ever starts. iPhones and iPads keep the browser's defaults, measured there at speech level.
export function microphoneConstraints(nav = globalThis.navigator) {
  return isAppleMobile(nav) ? true : { channelCount: 1, echoCancellation: false, noiseSuppression: false };
}

function join(chunks) {
  const samples = new Float32Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  return samples;
}

export function useRecorder(onStop, mockMode, { continuous = false, lineKey, lineText = '', preset, finished = false, onFollow } = {}) {
  const [status, setStatus] = useState('ready');
  const capture = useRef(null);
  const callback = useRef(onStop);
  const mounted = useRef(true);
  const options = useRef(null);
  const paused = useRef(null);
  const following = useRef(false);
  const audio = useRef(null);

  // Runs synchronously inside the tap, before any await. WebKit starts audio only while the tap's
  // user activation is live; a resume() requested later never settles, and the button would hang.
  function wakeAudio(sampleRate) {
    let shared = audio.current;
    if (!shared || shared.context.state === 'closed') {
      shared = audio.current = { context: openAudioContext(sampleRate), module: null };
    }
    Promise.resolve(shared.context.resume?.()).catch(() => {});
    return shared;
  }

  function suspendAudio() {
    Promise.resolve(audio.current?.context.suspend?.()).catch(() => {});
  }

  function closeAudio() {
    const shared = audio.current;
    audio.current = null;
    Promise.resolve(shared?.context.close?.()).catch(() => {});
  }

  function watchAudio(session) {
    const context = session.context;
    session.onAudioState = () => {
      if (capture.current !== session || session.stopping || session.discard) return;
      if (context.state === 'running') session.running = true;
      // A call, Siri or a backgrounded page stops the context ('interrupted' on WebKit); only a new tap restarts it.
      // A context that closes before it ever ran gets the same treatment.
      else if (context.state === 'closed' || (session.running && ['interrupted', 'suspended'].includes(context.state))) interrupt(session);
    };
    context.addEventListener?.('statechange', session.onAudioState);
    session.running = context.state === 'running';
    session.startCheck = setTimeout(() => {
      if (!session.running && ['suspended', 'interrupted', 'closed'].includes(context.state)
        && capture.current === session && !session.stopping) interrupt(session);
    }, START_TIMEOUT_MS);
  }

  function interrupt(session) {
    if (continuous) { pause(); return; }
    session.discard = true;
    session.chunks = [];
    if (session.recorder?.state === 'recording') session.recorder.stop();
    release(session);
    closeAudio();
    if (mounted.current) setStatus('ready');
  }

  function release(session) {
    if (!session) return;
    clearTimeout(session.timer);
    clearTimeout(session.startCheck);
    clearInterval(session.meter);
    clearInterval(session.follow);
    if (session.onAudioState) session.context?.removeEventListener?.('statechange', session.onAudioState);
    session.onAudioState = null;
    if (session.processor) {
      session.processor.onprocessorerror = null;
      session.processor.port.onmessage = null;
      session.processor.port.close();
    }
    session.processor?.disconnect();
    session.source?.disconnect();
    session.analyser?.disconnect();
    session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    session.source = null;
    session.processor = null;
    session.analyser = null;
    session.context = null;
    session.stream = null;
    if (capture.current === session) capture.current = null;
  }

  function captureFailed(session) {
    session.discard = true;
    session.chunks = [];
    paused.current = null;
    release(session);
    closeAudio();
    if (mounted.current) setStatus('off');
  }

  function clip(session, sampleRate = session.context.sampleRate) {
    const samples = join(session.chunks);
    const pcm = sampleRate === session.context.sampleRate ? samples : resample(samples, session.context.sampleRate, sampleRate);
    return new Blob([encodeWav(pcm, sampleRate)], { type: 'audio/wav' });
  }

  function reading(session) {
    return !session.discard && session.lineKey != null && session.lineKey === options.current.lineKey
      && !options.current.finished && capture.current === session;
  }

  function endLine(session) {
    if (!reading(session)) return;
    const blob = session.mock ? null : clip(session);
    session.chunks = [];
    session.lineKey = null;
    clearTimeout(session.timer);
    setStatus('waiting');
    callback.current(blob, session.completedKey);
  }

  function resetLine(session, key) {
    clearTimeout(session.timer);
    session.lineKey = key;
    session.completedKey = key;
    session.chunks = [];
    session.visibleAt = session.context?.currentTime;
    session.capturedAt = null;
    session.silent ??= createLineEndDetector();
    session.silent.reset({ text: options.current.lineText, preset: options.current.preset });
    setStatus(key == null ? 'waiting' : 'recording');
    if (session.mock && key != null) session.timer = setTimeout(() => endLine(session), MAX_LINE_MS);
  }

  function pause() {
    const session = capture.current;
    if (!session) return;
    paused.current = reading(session) ? { lineKey: session.lineKey, chunks: session.chunks,
      silent: session.silent, sampleRate: session.context?.sampleRate, capturedAt: session.capturedAt } : null;
    session.chunks = [];
    session.discard = true;
    release(session);
    // Keep the context for the next tap: iOS limits how many can be opened.
    suspendAudio();
    setStatus('ready');
  }

  function stop() {
    const session = capture.current;
    if (!session || session.stopping) return;
    session.stopping = true;
    clearTimeout(session.timer);
    clearInterval(session.meter);
    if (session.mock) {
      release(session);
      setStatus('ready');
      callback.current(null);
    } else if (session.recorder?.state === 'recording') session.recorder.stop();
  }

  async function begin() {
    if (capture.current || (continuous && (options.current.finished || options.current.lineKey == null))) return;
    const session = { chunks: [], mock: mockMode, discard: false, clockOffsetMs: 0 };
    capture.current = session;
    setStatus('requesting');
    try {
      if (!mockMode) {
        const microphone = navigator.mediaDevices.getUserMedia({ audio: microphoneConstraints() });
        let shared;
        try {
          shared = wakeAudio(paused.current?.sampleRate);
        } catch (error) {
          microphone.then(stream => stream.getTracks().forEach(track => track.stop()), () => {});
          throw error;
        }
        session.context = shared.context;
        session.stream = await microphone;
        if (!mounted.current || session.discard) { release(session); return; }
        if (continuous) session.stream.getTracks().forEach(track => {
          track.onended = () => captureFailed(session);
        });
        session.source = session.context.createMediaStreamSource(session.stream);
        if (continuous) {
          shared.module ??= shared.context.audioWorklet.addModule(captureWorkletUrl);
          await shared.module;
          if (!mounted.current || session.discard) { release(session); return; }
          resetLine(session, options.current.lineKey);
          if (paused.current?.lineKey === session.lineKey) {
            const held = paused.current;
            // A replacement context can run at another rate; one clip must hold one rate.
            session.chunks = held.sampleRate === session.context.sampleRate ? held.chunks
              : [resample(join(held.chunks), held.sampleRate, session.context.sampleRate)];
            session.silent = paused.current.silent;
            session.capturedAt = paused.current.capturedAt;
            // Continue the capture clock across contexts without counting time spent paused.
            session.clockOffsetMs = (session.capturedAt ?? 0) - session.visibleAt * 1000;
            session.silent.resume();
            if (session.silent.heardSpeech) {
              session.timer = setTimeout(() => endLine(session), MAX_LINE_MS);
            }
          }
          paused.current = null;
          // PCM snapshots remain decodable while capture continues. The output
          // stays silent so the microphone is never played through the speakers.
          session.processor = new AudioWorkletNode(session.context, 'kriah-capture', {
            numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1,
            channelCountMode: 'explicit', outputChannelCount: [1],
          });
          session.processor.onprocessorerror = () => captureFailed(session);
          session.processor.port.onmessage = event => {
            if (!reading(session)) return;
            const { samples: input, startFrame } = event.data;
            // Audio-thread frames remain accurate when main-thread messages are delayed or lost.
            const inputStart = startFrame / session.context.sampleRate;
            // Trim queued samples from before this line appeared, retaining its opening sound.
            const firstVisibleSample = Math.max(0,
              Math.ceil((session.visibleAt - inputStart - AUDIO_TIME_EPSILON) * session.context.sampleRate));
            const samples = input.subarray(firstVisibleSample);
            if (!samples.length) return;
            // Quiet and tail durations follow captured frames even when messages arrive late.
            session.capturedAt = session.clockOffsetMs + (startFrame + input.length) * 1000 / session.context.sampleRate;
            const heardSpeech = session.silent.heardSpeech;
            const silent = session.silent(rms(samples), session.capturedAt, samples.length * 1000 / session.context.sampleRate);
            setStatus(session.silent.finishing ? 'finishing' : 'recording');
            if (!heardSpeech && session.silent.heardSpeech) {
              // Count from speech so looking at the line or room hum cannot use up the limit.
              session.timer = setTimeout(() => endLine(session), MAX_LINE_MS);
            }
            session.chunks.push(new Float32Array(samples));
            if (!session.silent.heardSpeech) {
              let held = session.chunks.reduce((size, chunk) => size + chunk.length, 0);
              const limit = session.context.sampleRate * MAX_LEAD_IN_SECONDS;
              while (session.chunks.length > 1 && held - session.chunks[0].length >= limit) held -= session.chunks.shift().length;
              return;
            }
            if (silent) endLine(session);
          };
          session.source.connect(session.processor);
          session.processor.connect(session.context.destination);
          session.follow = setInterval(async () => {
            if (following.current || !reading(session) || !session.silent.heardSpeech || !options.current.onFollow) return;
            following.current = true;
            const key = session.lineKey;
            // Date the snapshot by its last PCM sample, which can lag the current audio clock.
            const capturedAt = session.capturedAt;
            const isCurrent = () => mounted.current && reading(session) && session.lineKey === key;
            try {
              const word = await options.current.onFollow(clip(session, SAMPLE_RATE), isCurrent);
              if (isCurrent()) session.silent.follow(word, capturedAt);
            } catch { /* Following must never interrupt a reading. */ }
            finally { following.current = false; }
          }, 400);
        } else {
          session.analyser = session.context.createAnalyser();
          session.analyser.fftSize = 2048;
          session.source.connect(session.analyser);
          const samples = new Float32Array(session.analyser.fftSize);
          const silent = createSilenceDetector();
          const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
            .find(type => MediaRecorder.isTypeSupported(type));
          // A later tap may already own a new context by the time onstop fires.
          const own = session.context;
          const closeOwnAudio = () => { if (audio.current?.context === own) closeAudio(); };
          session.recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
          session.recorder.ondataavailable = event => { if (!session.discard && event.data.size) session.chunks.push(event.data); };
          session.recorder.onstop = () => {
            const blob = new Blob(session.chunks, { type: session.recorder.mimeType });
            session.chunks = [];
            release(session);
            // One recording per tap here, and the next tap opens a fresh context inside its gesture.
            closeOwnAudio();
            if (!session.discard && mounted.current) {
              setStatus('ready');
              callback.current(blob);
            }
          };
          session.recorder.onerror = () => {
            session.discard = true;
            if (session.recorder.state === 'recording') session.recorder.stop();
            session.chunks = [];
            release(session);
            closeOwnAudio();
            if (mounted.current) setStatus('off');
          };
          session.recorder.start();
          session.meter = setInterval(() => {
            session.analyser.getFloatTimeDomainData(samples);
            if (silent(rms(samples), performance.now())) stop();
          }, 50);
        }
        watchAudio(session);
      } else if (continuous) {
        resetLine(session, options.current.lineKey);
      }
      setStatus('recording');
      if (!continuous) session.timer = setTimeout(stop, MAX_LINE_MS);
    } catch {
      // A denied microphone prompt lands here too, so the button never stays on starting.
      const current = capture.current === session;
      session.discard = true;
      release(session);
      // A session already replaced by a newer tap must not close the context that tap now uses.
      if (!current) return;
      closeAudio();
      if (mounted.current) setStatus('off');
    }
  }

  useLayoutEffect(() => {
    // Capture belongs to committed UI only, including when React is rendering a later line.
    options.current = { lineKey, lineText, preset, finished, onFollow };
    callback.current = onStop;
  });

  useLayoutEffect(() => {
    if (!continuous) return;
    const session = capture.current;
    if (finished) {
      paused.current = null;
      if (session) {
        session.discard = true;
        session.chunks = [];
        release(session);
      }
      closeAudio();
      setStatus('ready');
    } else {
      if (paused.current?.lineKey !== lineKey) paused.current = null;
      if (session && session.lineKey !== lineKey) resetLine(session, lineKey);
    }
  }, [continuous, lineKey, finished]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      paused.current = null;
      const session = capture.current;
      if (session) {
        session.discard = true;
        if (session.recorder?.state === 'recording') session.recorder.stop();
        session.chunks = [];
        release(session);
      }
      closeAudio();
    };
  }, []);

  useEffect(() => {
    // iOS mutes the microphone of a hidden page, which would read as the reader going quiet.
    const hidden = () => {
      const session = capture.current;
      if (document.visibilityState === 'hidden' && session && !session.mock && !session.stopping) interrupt(session);
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  });

  return { status, toggle: () => ['recording', 'finishing', 'waiting'].includes(status)
    ? (continuous ? pause() : stop()) : begin(), retry: begin };
}
