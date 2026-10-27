import { useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import { Avatar, AVATARS } from './Avatar.jsx';
import { loadPin, savePin, PRESETS } from './storage.js';
import { skillLabel } from './messages.js';
import { Brand, Resource, useResource } from './ui.jsx';

const encode = encodeURIComponent;
const dateLabel = date => new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

export function PinPad({ onUnlock }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (!pin || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError('');
    try {
      await api.checkPin(pin);
      savePin(pin);
      onUnlock(pin);
    } catch (error) { setError(error.message); setPin(''); }
    finally { setBusy(false); inFlight.current = false; }
  }
  return <section className="pin-screen"><h1>Teacher PIN</h1>
    <form className="pin-form" onSubmit={submit}>
      <input aria-label="Teacher PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={12}
        value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ''))} />
      <div className="pin-pad">{['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', '⌫'].map(key =>
        <button key={key} type="button" aria-label={key === '⌫' ? 'Backspace' : key} disabled={busy} onClick={() =>
          setPin(value => key === 'Clear' ? '' : key === '⌫' ? value.slice(0, -1) : (value + key).slice(0, 12))}>{key}</button>)}</div>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy || !pin}>{busy ? 'Checking…' : 'Enter'}</button>
    </form>
  </section>;
}

export function TeacherGate({ children, developer = false }) {
  const [pin, setPin] = useState(loadPin);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const lock = () => { setPin(''); setVerified(false); setError(''); };
    window.addEventListener('teacher-lock', lock);
    return () => window.removeEventListener('teacher-lock', lock);
  }, []);
  useEffect(() => {
    if (!pin || verified) return;
    let active = true;
    api.checkPin(pin).then(() => { if (active) setVerified(true); }).catch(error => {
      if (!active) return;
      if (error.status === 403) { savePin(''); setPin(''); }
      else setError(error.message);
    });
    return () => { active = false; };
  }, [pin, verified, revision]);
  function lock() { savePin(''); setPin(''); setVerified(false); }
  return <div className={`teacher-shell ${developer ? 'developer-shell' : ''}`}>
    <header className="teacher-header no-print"><Brand />
      {!developer && verified && <nav aria-label="Teacher"><a href="#/teacher">Class</a><a href="#/teacher/roster">Roster</a></nav>}
      {verified && <button className="secondary" onClick={lock}>Lock</button>}
      {!verified && <a className="secondary" href="#/">Home</a>}
    </header>
    <main tabIndex={-1}>
      {!pin ? <PinPad onUnlock={pin => { setPin(pin); setVerified(true); }} /> : !verified ?
        <div className="loading-screen">{error ? <><p role="alert">{error}</p><button className="secondary" onClick={() => { setError(''); setRevision(n => n + 1); }}>Try again</button></> : <span role="status">Checking…</span>}</div> : children}
    </main>
  </div>;
}

export function ClassView() {
  const resource = useResource(api.classView);
  return <section className="page class-page"><div className="page-heading"><h1>Class</h1></div>
    <Resource resource={resource}>{data => <div className="class-layout">
      <section className="groups"><h2>Practice groups</h2><div className="group-grid">
        {data.groups.map(group => {
          const members = group.childIds.map(id => data.children.find(child => child.id === id)).filter(Boolean);
          const level = members.length ? Math.max(...members.map(child => child.level)) : 1;
          return <a className="group-card" key={group.skill} href={`#/teacher/packet/skill/${encode(group.skill)}/${level}`}>
            <h3>{group.label}</h3><div className="group-avatars">{members.map(child => <Avatar key={child.id} name={child.avatar} label={child.name} small />)}</div>
          </a>;
        })}
      </div></section>
      <section className="class-children"><h2>Children</h2><div className="child-rows">{data.children.map(child =>
        <a className="child-row" key={child.id} href={`#/teacher/child/${encode(child.id)}`}>
          <Avatar name={child.avatar} small /><strong>{child.name}</strong><span className="level-badge">Level {child.level}</span>
          <span>{child.next ? skillLabel(child.next) : 'All practiced'}</span>
          <span className="last-turn">{child.lastTurn ? `${child.lastTurn.ok} of ${child.lastTurn.pairs} sounds` : 'No turns yet'}</span>
        </a>)}</div></section>
    </div>}</Resource>
  </section>;
}

export function SkillMap({ map }) {
  return <section className="map-section"><h2>Reading map</h2>
    <div className="map-scroll"><table className="skill-map"><thead><tr><th scope="col">Letters</th>{map.vowels.map(vowel =>
      <th key={vowel} scope="col">{skillLabel(vowel)}</th>)}</tr></thead><tbody>
      {map.letters.map(letter => <tr key={letter}><th scope="row">{skillLabel(letter)}</th>{map.vowels.map(vowel => {
        const key = `${letter}|${vowel}`;
        const state = map.cells[key] || 'untested';
        return <td key={vowel} className={`map-cell ${state}`} aria-label={`${skillLabel(letter)}, ${skillLabel(vowel)}: ${state}`}>
          <span dir="rtl" lang="he">{map.sample[key]}</span></td>;
      })}</tr>)}
    </tbody></table></div>
    <ul className="map-legend" aria-label="Map legend">{['solid', 'shaky', 'untested'].map(state =>
      <li key={state}><span className={`legend-swatch ${state}`} />{state[0].toUpperCase() + state.slice(1)}</li>)}</ul>
  </section>;
}

function ParentLine({ text }) {
  const [state, setState] = useState('Copy');
  const line = useRef(null);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setState('Copied'); }
    catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(line.current);
      selection.removeAllRanges(); selection.addRange(range);
      setState('Copy unavailable');
    }
  }
  return <section className="parent-line"><h2>Parent line</h2><p ref={line}>{text}</p><button className="secondary" onClick={copy}>{state}</button></section>;
}

export function ChildDetail({ childId }) {
  const resource = useResource(() => api.childDetail(childId), childId);
  return <section className="page detail-page"><Resource resource={resource}>{data => <>
    <div className="page-heading"><div className="child-title"><Avatar name={data.child.avatar} small /><h1>{data.child.name}</h1><span className="level-badge">Level {data.child.level}</span></div>
      <a className="primary" href={`#/teacher/packet/child/${encode(childId)}`}>Print packet</a></div>
    <div className="detail-layout"><SkillMap map={data.map} /><section className="turn-log"><h2>Turns</h2>
      {data.turns.map((turn, index) => <article className="turn-card" key={`${turn.date}-${index}`}>
        <h3><time dateTime={turn.date}>{dateLabel(turn.date)}</time></h3>
        <div className="turn-meta"><span>Level {turn.startLevel} → {turn.endLevel}</span><span>{turn.ok} of {turn.pairs} sounds</span><span>{turn.stars} stars</span></div>
        {turn.log.map((line, index) => <p key={index}>{line}</p>)}
      </article>)}
    </section></div><ParentLine text={data.parentLine} />
  </>}</Resource></section>;
}

export function Packet({ childId, skillId, level }) {
  const resource = useResource(() => api.packet({ childId, skillId, level }), `${childId || skillId}/${level || ''}`);
  return <section className="page packet-page"><Resource resource={resource}>{data => <>
    <div className="packet-actions no-print"><a className="secondary" href={childId ? `#/teacher/child/${encode(childId)}` : '#/teacher'}>Back</a><button className="primary" onClick={() => window.print()}>Print</button></div>
    <article className="packet-sheet"><header className="packet-heading"><h1>{data.title}</h1><time>{dateLabel(new Date())}</time></header>
      {data.sections.map(section => <section className="packet-section" key={section.heading}><h2>{section.heading}</h2><div className="packet-grid">
        {section.items.map((item, index) => <div key={`${item.id}-${index}`} lang="he" dir="rtl">{item.text}</div>)}
      </div></section>)}
    </article>
  </>}</Resource></section>;
}

const blankChild = () => ({ name: '', avatar: 'lion', preset: 'sephardi' });
export function Roster() {
  const resource = useResource(api.children);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankChild);
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const editor = useRef(null);
  const deleteTrigger = useRef(null);
  useEffect(() => {
    if (!confirming) deleteTrigger.current?.focus();
  }, [confirming]);
  function reset() { setEditing(null); setForm(blankChild()); setError(''); }
  function edit(child) {
    setEditing(child.id); setForm({ name: child.name, avatar: child.avatar, preset: child.preset, level: child.level });
    setError(''); editor.current?.focus(); editor.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }
  async function mutate(action) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await action(); reset(); setConfirming(null); resource.retry(); }
    catch (error) {
      if (error.status === 403) { savePin(''); window.dispatchEvent(new Event('teacher-lock')); }
      setError(error.message);
    } finally { inFlight.current = false; setBusy(false); }
  }
  function submit(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || /\s/.test(name)) { setError('First name only'); return; }
    const data = { ...form, name };
    void mutate(() => editing ? api.editChild(editing, data) : api.addChild(data));
  }
  return <section className="page roster-page"><h1>Roster</h1><div className="roster-layout">
    <div><Resource resource={resource}>{children => <div className="roster-list">{children.map(child =>
      <article className="roster-row" key={child.id}><Avatar name={child.avatar} small /><div><h2>{child.name}</h2><span>Level {child.level}</span></div>
        <div className="roster-actions"><button className="primary" disabled={busy} onClick={() => edit(child)}>Edit <span className="sr-only">{child.name}</span></button>
          <button className="roster-delete" disabled={busy} onClick={event => { deleteTrigger.current = event.currentTarget; setError(''); setConfirming(child); }}>Delete <span className="sr-only">{child.name}</span></button></div>
      </article>)}</div>}</Resource></div>
    <form className="roster-form" onSubmit={submit}><h2>{editing ? 'Edit child' : 'Add child'}</h2>
      <label>First name<input ref={editor} required maxLength={40} autoComplete="off" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <fieldset><legend>Avatar</legend><div className="avatar-picker">{AVATARS.map(avatar => <button type="button" key={avatar} aria-label={avatar} aria-pressed={form.avatar === avatar}
        onClick={() => setForm({ ...form, avatar })}><Avatar name={avatar} small /></button>)}</div></fieldset>
      <label>Preset<select value={form.preset} onChange={event => setForm({ ...form, preset: event.target.value })}>{PRESETS.map(preset => <option key={preset} value={preset}>{preset[0].toUpperCase() + preset.slice(1)}</option>)}</select></label>
      {editing && <label>Level<select value={form.level} onChange={event => setForm({ ...form, level: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 6].map(level => <option key={level}>{level}</option>)}</select></label>}
      {error && !confirming && <p role="alert">{error}</p>}
      <div className="form-actions"><button className="primary" disabled={busy}>{editing ? 'Save' : 'Add child'}</button>{editing && <button className="secondary" type="button" onClick={reset} disabled={busy}>Cancel</button>}</div>
    </form>
  </div>
    {confirming && <div className="modal-backdrop"><div role="alertdialog" aria-modal="true" aria-labelledby="delete-title" className="confirm-dialog"
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) setConfirming(null);
        if (event.key === 'Tab') {
          const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
          const first = buttons[0], last = buttons.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}><h2 id="delete-title">Delete {confirming.name}?</h2>
      {error && <p role="alert">{error}</p>}
      <div className="form-actions"><button autoFocus className="secondary" disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => void mutate(() => api.deleteChild(confirming.id))}>Delete {confirming.name}</button></div>
    </div></div>}
  </section>;
}

export function Trace({ turnId }) {
  const resource = useResource(() => api.trace(turnId), turnId);
  const plain = value => Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : JSON.stringify(value);
  return <section className="page trace-page"><h1>Coach trace</h1><Resource resource={resource}>{data => <div className="table-scroll">
    <table className="trace-table"><thead><tr>{['Checkpoint', 'Source', 'Explain', 'Reason'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>
      {data.decisions.map((decision, index) => <tr key={index}><td data-label="Checkpoint">{decision.checkpoint}</td><td data-label="Source">{decision.source}</td><td data-label="Explain">{plain(decision.explain)}</td><td data-label="Reason">{plain(decision.reason)}</td></tr>)}
    </tbody></table>
  </div>}</Resource></section>;
}
