import { useEffect } from 'react';
import * as api from './api.js';
import { useRoute, navigate } from './router.js';
import { useTurn } from './useTurn.js';
import { Avatar } from './Avatar.jsx';
import { Brand, ErrorView, Loading, Resource, Star, useResource } from './ui.jsx';
import { DoneScreen, ReadScreen, Stats } from './Game.jsx';
import { ChildDetail, ClassView, Packet, Roster, TeacherGate, Trace } from './Teacher.jsx';
export { GradedLine, ReadScreen, LevelUp, DoneScreen } from './Game.jsx';
export { Star } from './ui.jsx';

function Home({ children }) {
  return <section className="page home-page"><h1>Who’s reading?</h1><div className="children-grid">{children.map(child =>
    <a className="child-tile" href={`#/child/${encodeURIComponent(child.id)}`} key={child.id}>
      <Avatar name={child.avatar} /><strong>{child.name}</strong>
    </a>)}</div></section>;
}

function ChildHome({ child, engine }) {
  if (!child) return <section className="child-home"><h1>Child not found</h1><a className="secondary" href="#/">Home</a></section>;
  return <section className="child-home"><div className="child-portrait"><Avatar name={child.avatar} /><h1>{child.name}</h1></div>
    <div className="child-welcome"><div className="level-badge">Level {child.level}</div>
      <dl className="child-totals"><div><dt>Lifetime stars</dt><dd><Star filled />{child.stars}</dd></div><div><dt>Best turn</dt><dd><Star filled />{child.best}</dd></div></dl>
      <button className="primary start-button" disabled={engine.starting} onClick={() => void engine.start(child)}>{engine.starting ? 'Starting…' : engine.startError ? 'Try again' : 'Start'}</button>
    </div>
  </section>;
}

export default function App() {
  const route = useRoute();
  const engine = useTurn();
  const roster = useResource(api.children, `${route.path}:${engine.turn?.phase === 'finished'}`);
  const configuration = useResource(api.config);
  const mock = api.isMockMode();
  useEffect(() => {
    if (route.screen === 'read') {
      if (engine.turn?.phase === 'finished') navigate('/done', { replace: true });
      else if (!engine.turn && !engine.starting && !engine.startError) {
        if (mock && roster.data?.[0]) void engine.start(roster.data[0], { replace: true });
        else if (!mock || (roster.data && !roster.data.length)) navigate('/', { replace: true });
      }
    }
    if (route.screen === 'done' && engine.turn?.phase !== 'finished' && !mock) navigate('/', { replace: true });
    if (route.screen === 'trace' && configuration.data?.trace === false) navigate('/', { replace: true });
  }, [route.screen, engine.turn, engine.starting, engine.startError, roster.data, configuration.data, mock]);
  useEffect(() => {
    const names = { home: 'Who’s reading?', child: 'Let’s read', read: 'Read', done: 'Well done', teacher: 'Class', detail: 'Reading map', roster: 'Roster', packet: 'Practice packet', trace: 'Coach trace' };
    document.title = `${names[route.screen]} | Kriah Listener`;
    document.querySelector('main')?.focus();
  }, [route.path]);

  if (route.screen === 'trace') {
    if (!configuration.data) return <Resource resource={configuration}>{() => null}</Resource>;
    if (!configuration.data.trace) return <Loading />;
    return <TeacherGate developer><Trace turnId={route.turnId} /></TeacherGate>;
  }
  if (['teacher', 'detail', 'roster', 'packet'].includes(route.screen)) return <TeacherGate>
    {route.screen === 'teacher' && <ClassView />}
    {route.screen === 'detail' && <ChildDetail childId={route.childId} trace={configuration.data?.trace === true} />}
    {route.screen === 'roster' && <Roster />}
    {route.screen === 'packet' && <Packet childId={route.childId} skillId={route.skillId} level={route.level} />}
  </TeacherGate>;
  const reading = route.screen === 'read' && engine.turn?.phase !== 'finished' && engine.turn;
  const demoDone = mock && roster.data?.[0] ? { child: roster.data[0], stars: 5, facts: { best: 'letter:bet', next: 'vowel:sheva_na' } } : null;
  const done = engine.turn?.phase === 'finished' ? engine.turn : demoDone;
  return <div className={`app screen-${route.screen}`}>
    {reading ? <Stats turn={engine.turn} /> : <header className="child-header"><Brand />
      {route.screen === 'home' ? <a className="teacher-link" href="#/teacher">Teacher</a> : <a className="secondary" href="#/">Home</a>}
    </header>}
    <main tabIndex={-1}>
      {route.screen === 'home' && <Resource resource={roster}>{children => <Home children={children} />}</Resource>}
      {route.screen === 'child' && <Resource resource={roster}>{children => <ChildHome child={children.find(child => child.id === route.childId)} engine={engine} />}</Resource>}
      {reading && <ReadScreen key={engine.turn.turnId} turn={engine.turn} onRecord={engine.record} onRetryNext={engine.retryNext} />}
      {route.screen === 'read' && !reading && (engine.startError || roster.error ?
        <ErrorView retry={() => roster.error ? roster.retry() : engine.start(roster.data?.[0], { replace: true })} /> : <Loading />)}
      {route.screen === 'done' && (done ? <DoneScreen turn={done} onNext={engine.clear} /> : <Loading />)}
    </main>
  </div>;
}
