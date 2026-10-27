import { useEffect, useState } from 'react';
import { isMockMode } from './api.js';
import { useScreen, navigate } from './router.js';
import { loadPreset, savePreset, PRESETS } from './storage.js';
import { turnMessage } from './messages.js';
import { useTurn } from './useTurn.js';
import { useRecorder } from './useRecorder.js';

export function Star({ filled = false, filling = false }) {
  return <svg className={`star ${filled ? 'filled' : ''} ${filling ? 'filling' : ''}`} viewBox="0 0 32 32" aria-hidden="true">
    <path d="m16 2 4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.4-8.4-4.4-8.4 4.4 1.6-9.4L2.4 11.9l9.4-1.4Z" />
  </svg>;
}

function Stats({ progress, turn }) {
  return <aside className="stats" aria-label="Your progress">
    <a className="wordmark" href="#/" aria-label="Kriah Listener home"><span className="brand-mark" aria-hidden="true">ק</span><span>Kriah<br />Listener</span></a>
    <div className="level-badge">Level {turn?.level || progress.level}</div>
    <div className="stat"><span>Stars</span><strong><Star filled />{progress.stars}</strong></div>
    <div className="stat"><span>Streak</span><strong>{progress.streak}</strong></div>
    <div className="stat"><span>Best streak</span><strong>{progress.best}</strong></div>
    <a className="gear icon-button" href="#/settings" aria-label="Settings">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 3 1-2h4l1 2 2 1 2-.1 2 3.4-1 1.7v2l1 1.7-2 3.4-2-.1-2 1-1 2h-4l-1-2-2-1-2 .1-2-3.4 1-1.7v-2L3 7.4 5 4l2 .1Z" transform="translate(0 1)" /><circle cx="12" cy="11.5" r="3" /></svg>
    </a>
  </aside>;
}

function Home({ engine }) {
  return <div className="home-content">
    <div className="home-art" aria-hidden="true"><span>א</span><span>בּ</span><span>ג</span><Star filled /></div>
    <h1>Let’s read!</h1>
    <button className="primary start-button" onClick={() => engine.start()} disabled={engine.starting}>
      {engine.starting ? 'Starting…' : engine.startError ? 'Try again' : 'Start'}<span aria-hidden="true">↗</span>
    </button>
  </div>;
}

function Settings() {
  const [preset, setPreset] = useState(loadPreset);
  function choose(value) { setPreset(value); savePreset(value); }
  return <section className="settings-content">
    <h1>Settings</h1>
    <fieldset>
      <legend>Pronunciation</legend>
      {PRESETS.map(value => <label key={value} className={`preset-option ${preset === value ? 'selected' : ''}`}>
        <input type="radio" name="preset" value={value} checked={preset === value} onChange={() => choose(value)} />
        <span>{value[0].toUpperCase() + value.slice(1)}</span><span className="radio-mark" aria-hidden="true" />
      </label>)}
    </fieldset>
    <a className="secondary" href="#/">Home</a>
  </section>;
}

export function GradedLine({ attempt }) {
  if (!attempt) return <div className="previous-line empty" aria-hidden="true" />;
  if (!attempt.grade || attempt.status === 'failed') {
    return <div className="previous-line" dir="rtl" lang="he" aria-label="Previous line">{attempt.text}</div>;
  }
  return <div className="previous-line" dir="rtl" lang="he" aria-label="Previous line">
    {attempt.grade.words.map((word, index) => <span key={index} className={`graded-word word-${word.verdict || 'paired'}`}>
      {word.verdict === 'extra' ? <><span className="extra-dot" aria-label="Extra word" /><span>{word.text}</span></> :
        word.pairs.length ? word.pairs.map((pair, pairIndex) => <span key={pairIndex} style={{ animationDelay: `${pairIndex * 70}ms` }}
          className={`pair pair-${word.verdict === 'not_decoded' ? 'not_decoded' : word.verdict === 'skipped' ? 'skipped' : pair.verdict}`}>
          {pair.text}</span>) : <span>{word.text}</span>}
    </span>)}
  </div>;
}

function MicrophoneIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="18" y="5" width="12" height="25" rx="6" /><path d="M12 23v2a12 12 0 0 0 24 0v-2M24 37v7M17 44h14" /></svg>;
}

export function ReadScreen({ turn, onRecord, onRetryNext }) {
  const recorder = useRecorder(onRecord, isMockMode());
  if (recorder.status === 'off') return <section className="microphone-off">
    <div className="mic-off-icon" aria-hidden="true"><MicrophoneIcon /></div>
    <h1>Microphone is off</h1>
    <button className="primary" onClick={recorder.retry}>Try again</button>
  </section>;
  const item = turn.set[turn.lineIndex];
  const waiting = turn.phase !== 'reading';
  return <section className="reading-content" aria-label="Reading">
    <div className="turn-stars" role="img" aria-label={`${turn.stars} of 3 stars this turn`}>
      {[0, 1, 2].map(index => <Star key={index} filled={index < turn.stars} filling={waiting && index === turn.stars - 1 && turn.phase === 'checkpoint'} />)}
    </div>
    <GradedLine attempt={turn.attempts.at(-1)} />
    <div className="current-line" dir="rtl" lang="he">
      {item ? item.text : <Star filled filling={turn.phase !== 'next_error'} />}
    </div>
    <div className="record-area">
      {turn.phase === 'next_error' ? <button className="primary" onClick={onRetryNext}>Try again</button> :
        <button className={`record-button ${recorder.status === 'recording' ? 'recording' : ''}`} onClick={recorder.toggle}
          disabled={waiting || recorder.status === 'requesting'}
          aria-label={recorder.status === 'recording' ? 'Stop recording' : 'Record'} aria-pressed={recorder.status === 'recording'}>
          {recorder.status === 'recording' ? <span className="stop-icon" aria-hidden="true" /> : <MicrophoneIcon />}
        </button>}
    </div>
  </section>;
}

function Done({ engine }) {
  return <section className="done-content">
    <div className="done-stars" role="img" aria-label={`${engine.turn.stars} stars earned this turn`}>
      {[0, 1, 2].map(index => <Star key={index} filled={index < engine.turn.stars} />)}
    </div>
    <h1>{engine.turn.stars} stars!</h1>
    <p className="turn-message">{turnMessage(engine.turn.attempts.map(attempt => attempt.grade.summary))}</p>
    <div className="done-actions">
      <button className="primary" disabled={engine.starting} onClick={() => engine.start({ replace: true })}>
        {engine.starting ? 'Starting…' : engine.startError ? 'Try again' : 'Again'}
      </button>
      <a className="secondary" href="#/">Home</a>
    </div>
  </section>;
}

export default function App() {
  const screen = useScreen();
  const engine = useTurn();
  useEffect(() => {
    if (screen === 'read' && !engine.turn && !engine.starting && !engine.startError) engine.start({ replace: true });
    if (screen === 'read' && engine.turn?.phase === 'finished') navigate('/done', { replace: true });
    if (screen === 'done' && engine.turn?.phase !== 'finished') navigate('/', { replace: true });
  }, [screen, engine.turn, engine.starting, engine.startError]);
  useEffect(() => {
    document.title = `${({ home: 'Kriah Listener', settings: 'Settings', read: 'Read', done: 'Well done' })[screen]}`;
    document.querySelector('main')?.focus();
  }, [screen]);
  const reading = screen === 'read' && engine.turn && engine.turn.phase !== 'finished';
  return <div className={`app screen-${screen}`}>
    <Stats progress={engine.progress} turn={reading ? engine.turn : null} />
    <main tabIndex={-1}>
      {screen === 'home' && <Home engine={engine} />}
      {screen === 'settings' && <Settings />}
      {reading && <ReadScreen key={engine.turn.id} turn={engine.turn} onRecord={engine.record} onRetryNext={engine.retryNext} />}
      {screen === 'read' && !engine.turn && <div className="loading-screen">
        {engine.startError ? <button className="primary" onClick={() => engine.start({ replace: true })}>Try again</button> : <Star filled filling />}
      </div>}
      {screen === 'done' && engine.turn?.phase === 'finished' && <Done engine={engine} />}
    </main>
  </div>;
}
