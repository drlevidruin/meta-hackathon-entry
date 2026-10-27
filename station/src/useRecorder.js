import { useEffect, useRef, useState } from 'react';
import { createSilenceDetector, rms } from './silence.js';

export function useRecorder(onStop, mockMode) {
  const [status, setStatus] = useState('ready');
  const capture = useRef(null);
  const callback = useRef(onStop);
  callback.current = onStop;
  const mounted = useRef(true);

  function release(session) {
    if (!session) return;
    clearTimeout(session.timer);
    clearInterval(session.meter);
    session.source?.disconnect();
    session.analyser?.disconnect();
    session.context?.close().catch(() => {});
    session.stream?.getTracks().forEach(track => track.stop());
    session.source = null;
    session.analyser = null;
    session.context = null;
    session.stream = null;
    if (capture.current === session) capture.current = null;
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
    if (capture.current) return;
    const session = { chunks: [], mock: mockMode, discard: false };
    capture.current = session;
    setStatus('requesting');
    try {
      if (!mockMode) {
        session.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
        if (!mounted.current || session.discard) { release(session); return; }
        const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
        session.context = new AudioContextClass();
        await session.context.resume();
        if (!mounted.current || session.discard) { release(session); return; }
        session.source = session.context.createMediaStreamSource(session.stream);
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
      setStatus('recording');
      session.timer = setTimeout(stop, 20000);
    } catch {
      session.discard = true;
      release(session);
      if (mounted.current) setStatus('off');
    }
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const session = capture.current;
      if (session) {
        session.discard = true;
        if (session.recorder?.state === 'recording') session.recorder.stop();
        session.chunks = [];
        release(session);
      }
    };
  }, []);

  return { status, toggle: () => status === 'recording' ? stop() : begin(), retry: begin };
}
