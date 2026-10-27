import { isMockMode } from './api.js';
import { Avatar } from './Avatar.jsx';
import { Brand, Star } from './ui.jsx';
import { turnMessage } from './messages.js';
import { navigate } from './router.js';
import { useRecorder } from './useRecorder.js';

export function Stats({ turn }) {
  return <aside className="stats" aria-label="Your progress">
    <Brand />
    <div className="reader-identity"><Avatar name={turn.child.avatar} small /><strong>{turn.child.name}</strong></div>
    <div className="level-badge">Level {turn.level}</div>
    <div className="stat"><span>Stars</span><strong><Star filled />{turn.stars}</strong></div>
    <div className="stat"><span>Streak</span><strong>{turn.streak}</strong></div>
    <div className="stat"><span>Best streak</span><strong>{turn.bestStreak}</strong></div>
  </aside>;
}

export function GradedLine({ attempt }) {
  if (!attempt) return <div className="previous-line empty" aria-hidden="true" />;
  if (!attempt.grade || attempt.status === 'failed') return <div className="previous-line" dir="rtl" lang="he" aria-label="Previous line">{attempt.text}</div>;
  let pairCount = 0;
  return <div className="previous-line" dir="rtl" lang="he" aria-label="Previous line">
    {attempt.grade.words.map((word, index) => <span key={index} className={`graded-word word-${word.verdict || 'paired'}`}>
      {word.verdict === 'extra' ? <span className="extra-dot" aria-label="Extra word" /> :
        word.pairs?.length ? word.pairs.map((pair, pairIndex) => <span key={pairIndex}
          style={{ animationDelay: `${pairCount++ * 70}ms` }}
          className={`pair pair-${['not_decoded', 'skipped'].includes(word.verdict) ? word.verdict : pair.verdict}`}>
          {pair.text}{pair.verdict === 'extra' && <span className="extra-dot" aria-label="Extra word" />}</span>) : <span>{word.text}</span>}
    </span>)}
  </div>;
}

export function MicrophoneIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="18" y="5" width="12" height="25" rx="6" /><path d="M12 23v2a12 12 0 0 0 24 0v-2M24 37v7M17 44h14" /></svg>;
}

export function LevelUp({ level }) {
  return <div className="level-up" role="status" aria-label={`Level ${level}`}>
    <div className="level-badge">Level {level}</div>
    <div className="floating-letters" lang="he" dir="rtl" aria-hidden="true">{['א', 'בּ', 'ג', 'מ', 'שׁ'].map((letter, index) =>
      <span key={letter} style={{ '--index': index }}>{letter}</span>)}</div>
  </div>;
}

export function ReadScreen({ turn, onRecord, onRetryNext }) {
  const recorder = useRecorder(onRecord, isMockMode());
  if (recorder.status === 'off') return <section className="microphone-off">
    <h1>Microphone is off</h1><button className="primary" onClick={recorder.retry}>Try again</button>
  </section>;
  if (turn.phase === 'level_up') return <LevelUp level={turn.level} />;
  const item = turn.phase === 'reading' ? turn.set[turn.lineIndex] : null;
  const checkpoint = ['checkpoint', 'choosing', 'finishing', 'finish_pending'].includes(turn.phase);
  const retry = ['next_error', 'finish_error'].includes(turn.phase);
  return <section className="reading-content" aria-label="Reading">
    <div className="turn-stars" role="img" aria-label={`${turn.stars} stars this turn`}>
      {Array.from({ length: Math.max(3, turn.stars) }, (_, index) => <Star key={index} filled={index < turn.stars} />)}
      {checkpoint && <Star filling />}
      {!!turn.bonusBurst && <span key={turn.bonusBurst} className="bonus-burst" aria-hidden="true"><Star filled /><Star filled /><Star filled /></span>}
    </div>
    <GradedLine attempt={turn.attempts.at(-1)} />
    <div className={`line-frame ${item?.source?.challenge ? 'challenge-frame' : ''}`} aria-label={item?.source?.challenge ? 'Challenge' : undefined}>
      {item?.source?.challenge && <span className="challenge-badge" aria-hidden="true"><Star filled /></span>}
      <div className="current-line" dir="rtl" lang="he">{item ? item.text : <Star filled filling={checkpoint} />}</div>
    </div>
    <div className="record-area">
      {retry ? <button className="primary" onClick={onRetryNext}>Try again</button> :
        <button className={`record-button ${recorder.status === 'recording' ? 'recording' : ''}`} onClick={recorder.toggle}
          disabled={!item || recorder.status === 'requesting'} aria-label={recorder.status === 'recording' ? 'Stop recording' : 'Record'}
          aria-pressed={recorder.status === 'recording'}>
          {recorder.status === 'recording' ? <span className="stop-icon" aria-hidden="true" /> : <MicrophoneIcon />}
        </button>}
    </div>
  </section>;
}

export function DoneScreen({ turn, onNext }) {
  const starsLabel = `${turn.stars} ${turn.stars === 1 ? 'star' : 'stars'}`;
  return <section className="done-content">
    <Avatar name={turn.child.avatar} />
    <div className="done-stars" role="img" aria-label={`${starsLabel} earned this turn`}>
      {Array.from({ length: Math.min(10, turn.stars) }, (_, index) => <Star key={index} filled />)}
      {turn.stars > 10 && <span className="done-star-count" aria-hidden="true">{turn.stars}</span>}
    </div>
    <h1>{starsLabel}!</h1>
    <p className="turn-message">{turnMessage(turn.facts)}</p>
    <p className="next-friend">Go get the next friend!</p>
    <button className="primary" onClick={() => { onNext(); navigate('/', { replace: true }); }}>Next friend</button>
  </section>;
}
