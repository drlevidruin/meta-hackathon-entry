import { useEffect, useRef, useState } from 'react';
import { createSilenceDetector, rms, SPEECH_THRESHOLD } from './silence.js';
import { encodeWav } from './wav.js';

export function useRecorder(onStop, mockMode, { continuous = false, lineKey, finished = false, onFollow } = {}) {
  const [status, setStatus] = useState('ready');
  const capture = useRef(null);
  const callback = useRef(onStop);
  callback.current = onStop;
  const mounted = useRef(true);
  const options = useRef(null);
  options.current = { lineKey, finished, onFollow };
  const paused = useRef(null);
  const following = useRef(false);

  function release(session) {
    if (!session) return;
    clearTimeout(session.timer);
    clearInterval(session.meter);
    clearInterval(session.follow);
    if (session.processor) session.processor.onaudioprocess = null;
    session.processor?.disconnect();
    session.source?.disconnect();
    session.analyser?.disconnect();
    session.context?.close().catch(() => {});
    session.stream?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    session.source = null;
    session.processor = null;
    session.analyser = null;
    session.context = null;
    session.stream = null;
    if (capture.current === session) capture.current = null;
  }

  function clip(session) {
    const samples = new Float32Array(session.chunks.reduce((size, chunk) => size + chunk.length, 0));
    let offset = 0;
    for (const chunk of session.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    return new Blob([encodeWav(samples, session.context.sampleRate)], { type: 'audio/wav' });
  }

  function reading(session) {
    return !session.discard && session.lineKey != null && session.lineKey === options.current.lineKey
      && !options.current.finished && capture.current === session;
  }

  function endLine(session) {
    if (!reading(session)) return;
    const blob = session.mock ? null : clip(session);
    session.chunks = [];
    session.heardSpeech = false;
    session.lineKey = null;
    clearTimeout(session.timer);
    callback.current(blob);
  }

  function resetLine(session, key) {
    clearTimeout(session.timer);
    session.lineKey = key;
    session.chunks = [];
    session.heardSpeech = false;
    session.silent = createSilenceDetector();
    if (session.mock && key != null) session.timer = setTimeout(() => endLine(session), 20000);
  }

  function pause() {
    const session = capture.current;
    if (!session) return;
    paused.current = reading(session) ? { lineKey: session.lineKey, chunks: session.chunks,
      heardSpeech: session.heardSpeech, sampleRate: session.context?.sampleRate } : null;
    session.chunks = [];
    session.discard = true;
    release(session);
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
    const session = { chunks: [], mock: mockMode, discard: false };
    capture.current = session;
    setStatus('requesting');
    try {
      if (!mockMode) {
        session.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
        if (!mounted.current || session.discard) { release(session); return; }
        if (continuous) session.stream.getTracks().forEach(track => {
          track.onended = () => {
            session.discard = true;
            session.chunks = [];
            paused.current = null;
            release(session);
            if (mounted.current) setStatus('off');
          };
        });
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        session.context = new AudioContextClass(paused.current?.sampleRate ? { sampleRate: paused.current.sampleRate } : undefined);
        await session.context.resume();
        if (!mounted.current || session.discard) { release(session); return; }
        session.source = session.context.createMediaStreamSource(session.stream);
        if (continuous) {
          resetLine(session, options.current.lineKey);
          if (paused.current?.lineKey === session.lineKey) {
            session.chunks = paused.current.chunks;
            session.heardSpeech = paused.current.heardSpeech;
            if (session.heardSpeech) {
              session.silent(SPEECH_THRESHOLD, performance.now());
              session.timer = setTimeout(() => endLine(session), 20000);
            }
          }
          paused.current = null;
          // PCM snapshots remain decodable while capture continues. The output
          // stays silent so the microphone is never played through the speakers.
          session.processor = session.context.createScriptProcessor(2048, 1, 1);
          session.processor.onaudioprocess = event => {
            event.outputBuffer.getChannelData(0).fill(0);
            if (!reading(session)) return;
            const samples = event.inputBuffer.getChannelData(0);
            const loudness = rms(samples);
            if (!session.heardSpeech && loudness >= SPEECH_THRESHOLD) {
              session.heardSpeech = true;
              // The 20-second limit counts from the first sound, so a reader who looks
              // before reading is never cut off, and steady noise still ends the line.
              session.timer = setTimeout(() => endLine(session), 20000);
            }
            session.chunks.push(new Float32Array(samples));
            if (!session.heardSpeech) {
              // Keep a second of lead-in so a quiet first consonant reaches
              // grading, while an idle microphone uses bounded memory.
              if (session.chunks.length > Math.ceil(session.context.sampleRate / samples.length)) session.chunks.shift();
              return;
            }
            if (session.silent(loudness, performance.now())) endLine(session);
          };
          session.source.connect(session.processor);
          session.processor.connect(session.context.destination);
          session.follow = setInterval(async () => {
            if (following.current || !reading(session) || !session.heardSpeech || !options.current.onFollow) return;
            following.current = true;
            const key = session.lineKey;
            try {
              await options.current.onFollow(clip(session), () => mounted.current && reading(session) && session.lineKey === key);
            } catch { /* Following must never interrupt a reading. */ }
            finally { following.current = false; }
          }, 700);
        } else {
          session.analyser = session.context.createAnalyser();
          session.analyser.fftSize = 2048;
          session.source.connect(session.analyser);
          const samples = new Float32Array(session.analyser.fftSize);
          const silent = createSilenceDetector();
          const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
            .find(type => MediaRecorder.isTypeSupported(type));
          session.recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
          session.recorder.ondataavailable = event => { if (!session.discard && event.data.size) session.chunks.push(event.data); };
          session.recorder.onstop = () => {
            const blob = new Blob(session.chunks, { type: session.recorder.mimeType });
            session.chunks = [];
            release(session);
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
            if (mounted.current) setStatus('off');
          };
          session.recorder.start();
          session.meter = setInterval(() => {
            session.analyser.getFloatTimeDomainData(samples);
            if (silent(rms(samples), performance.now())) stop();
          }, 50);
        }
      } else if (continuous) {
        resetLine(session, options.current.lineKey);
      }
      setStatus('recording');
      if (!continuous) session.timer = setTimeout(stop, 20000);
    } catch {
      session.discard = true;
      release(session);
      if (mounted.current) setStatus('off');
    }
  }

  useEffect(() => {
    if (!continuous) return;
    const session = capture.current;
    if (finished) {
      paused.current = null;
      if (session) {
        session.discard = true;
        session.chunks = [];
        release(session);
      }
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
    };
  }, []);

  return { status, toggle: () => status === 'recording' ? (continuous ? pause() : stop()) : begin(), retry: begin };
}
