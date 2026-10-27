import { useEffect, useRef, useState } from 'react';

export function useRecorder(onStop, mockMode) {
  const [status, setStatus] = useState('ready');
  const capture = useRef(null);
  const timer = useRef(null);
  const callback = useRef(onStop);
  callback.current = onStop;
  const mounted = useRef(true);

  function release(session) {
    clearTimeout(timer.current);
    session?.stream?.getTracks().forEach(track => track.stop());
    if (capture.current === session) capture.current = null;
  }

  function stop() {
    const session = capture.current;
    if (!session) return;
    clearTimeout(timer.current);
    if (session.mock) {
      release(session);
      setStatus('ready');
      callback.current(null);
    } else if (session.recorder?.state !== 'inactive') {
      session.recorder.stop();
    }
  }

  async function begin() {
    if (capture.current) return;
    const session = { stream: null, recorder: null, discard: false, chunks: [], mock: mockMode };
    capture.current = session;
    setStatus('requesting');
    try {
      if (!mockMode) {
        session.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1 } });
        if (!mounted.current || session.discard) { release(session); return; }
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
          .find(type => MediaRecorder.isTypeSupported(type));
        session.recorder = new MediaRecorder(session.stream, mimeType ? { mimeType } : undefined);
        session.recorder.ondataavailable = event => { if (event.data.size) session.chunks.push(event.data); };
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
          release(session);
          if (mounted.current) setStatus('off');
        };
        session.recorder.start();
      }
      setStatus('recording');
      timer.current = setTimeout(stop, 20000);
    } catch {
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
