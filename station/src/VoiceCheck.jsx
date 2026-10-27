import { useEffect, useRef, useState } from 'react';
import { VOICE_CARD } from '../../rulebook/voice-card.js';
import * as api from './api.js';
import { Avatar } from './Avatar.jsx';
import { MicrophoneIcon } from './Game.jsx';
import { useRecorder } from './useRecorder.js';
import { recordingToWav } from './wav.js';

export function VoiceCheck({ child, engine }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  const recorder = useRecorder(async blob => {
    setSending(true);
    setError('');
    try {
      const audio = api.isMockMode() ? null : await recordingToWav(blob);
      await api.voice({ childId: child.id, audio });
      if (active.current) await engine.start({ ...child, voiceCheck: true });
    } catch (error) {
      if (active.current) setError(error.status === 422 && error.message === 'count'
        ? `Heard ${error.heard} of 15. Try again.` : 'Try again');
    } finally {
      if (active.current) setSending(false);
    }
  }, api.isMockMode());

  if (!child) return <section className="child-home"><h1>Child not found</h1><a className="secondary" href="#/">Home</a></section>;
  if (recorder.status === 'off') return <section className="microphone-off">
    <h1>Microphone is off</h1><button className="primary" onClick={recorder.retry}>Try again</button>
  </section>;
  return <section className="voice-check">
    <div className="voice-identity child-portrait"><Avatar name={child.avatar} /><h2>{child.name}</h2><h1>Read these sounds</h1></div>
    <div className="voice-reading">
      <div className="voice-card" dir="rtl" lang="he">{VOICE_CARD.map((syllable, index) => <span key={index}>{syllable}</span>)}</div>
      <div className="record-area">
        <button className={`record-button ${recorder.status === 'recording' ? 'recording' : ''}`} onClick={recorder.toggle}
          disabled={sending || engine.starting || recorder.status === 'requesting'} aria-label={recorder.status === 'recording' ? 'Stop recording' : 'Record'}
          aria-pressed={recorder.status === 'recording'}>
          {recorder.status === 'recording' ? <span className="stop-icon" aria-hidden="true" /> : <MicrophoneIcon />}
        </button>
      </div>
      {(error || engine.startError) && <p role="alert">{error || 'Try again'}</p>}
    </div>
  </section>;
}
