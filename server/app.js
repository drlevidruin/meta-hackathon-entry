import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { SKILLS } from '../rulebook/index.js';
import { createStore, durable } from './store.js';
import { buildMap, recordPairs, summaryOnly, totalSummary } from './progress.js';
import { parentLine } from './hints.js';
import { makePacket } from './packet.js';

const PRESETS = new Set(['sephardi', 'ashkenazi', 'chassidish']);
const AVATARS = new Set(['lion', 'owl', 'fox', 'bear', 'rabbit', 'turtle', 'whale', 'bee',
  'cat', 'dog', 'frog', 'panda', 'koala', 'tiger', 'penguin', 'zebra']);
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TURN_TTL = 30 * 60 * 1000;
const AUDIO_LIMIT = 25 * 1024 * 1024;
const JSON_LIMIT = 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req, limit) {
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    throw new RequestError(413, 'Body too large');
  }
  const chunks = [];
  let size = 0;
  // Drain oversized requests without keeping their remaining bytes in memory.
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
    else chunks.length = 0;
  }
  if (size > limit) throw new RequestError(413, 'Body too large');
  return Buffer.concat(chunks, size);
}

function contentType(req) {
  return (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

async function jsonBody(req) {
  if (contentType(req) !== 'application/json') throw new RequestError(415, 'Use application/json');
  const bytes = await body(req, JSON_LIMIT);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RequestError(400, 'Invalid JSON');
  }
}

function validatePreset(preset) {
  if (!PRESETS.has(preset)) throw new RequestError(400, 'Invalid preset');
}

function contained(root, file) {
  return file === root || file.startsWith(root + path.sep);
}

async function staticFile(req, res, staticDir) {
  let pathname;
  try {
    // Inspect the original path before URL parsing can normalize /../ away.
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    throw new RequestError(400, 'Invalid path');
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
    throw new RequestError(403, 'Path blocked');
  }
  if (!staticDir) throw new RequestError(404, 'Not found');
  const root = path.resolve(staticDir);
  let file = path.resolve(root, '.' + pathname);
  if (!contained(root, file)) throw new RequestError(403, 'Path blocked');
  try {
    if (!(await fs.promises.stat(file)).isFile()) file = path.join(root, 'index.html');
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    file = path.join(root, 'index.html');
  }
  try {
    const [realRoot, realFile] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(file)]);
    if (!contained(realRoot, realFile)) throw new RequestError(403, 'Path blocked');
    const data = await fs.promises.readFile(realFile);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error.code === 'ENOENT') throw new RequestError(404, 'Not found');
    throw error;
  }
}

const childView = ({ id, name, avatar, preset, level, stars, best }) => ({ id, name, avatar, preset, level, stars, best });
const factsView = facts => ({ best: facts.best, next: facts.next, proven: facts.proven });

function validateId(id) {
  if (typeof id !== 'string' || !ID.test(id)) throw new RequestError(400, 'Invalid child id');
}

function validateLevel(level) {
  if (!Number.isInteger(level) || level < 1 || level > 6) throw new RequestError(400, 'Invalid level');
}

function childFields(value, partial = false) {
  if (Object.keys(value).some(key => !['name', 'avatar', 'preset', ...(partial ? ['level'] : [])].includes(key))) {
    throw new RequestError(400, 'Invalid child fields');
  }
  if (!partial || Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || [...value.name.trim()].length > 40
      || !/^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(value.name.trim())) {
      throw new RequestError(400, 'Use a first name only');
    }
    value.name = value.name.trim();
  }
  if ((!partial || Object.hasOwn(value, 'avatar')) && !AVATARS.has(value.avatar)) throw new RequestError(400, 'Invalid avatar');
  if (!partial || Object.hasOwn(value, 'preset')) validatePreset(value.preset);
  if (Object.hasOwn(value, 'level')) validateLevel(value.level);
  if (!Object.keys(value).length) throw new RequestError(400, 'No changes supplied');
  return value;
}

export function createApp({
  items, listen, gradeLine, chooseNextSet, startProfile, explain, turnFacts, staticDir,
  dataDir = process.env.DATA_DIR, teacherPin = process.env.TEACHER_PIN,
  trace = process.env.TRACE === '1', coachModel = process.env.COACH_MODEL, now = Date.now,
}) {
  const byId = new Map(items.map(item => [item.id, item]));
  const store = createStore(dataDir);
  const turns = new Map();
  const traceEnabled = trace === true || trace === '1';

  function teacher(req) {
    if (!teacherPin) throw new RequestError(403, 'Teacher PIN not set');
    const supplied = Buffer.from(String(req.headers['x-teacher-pin'] || ''));
    const expected = Buffer.from(teacherPin);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new RequestError(403, 'Invalid teacher PIN');
    }
  }

  function childIn(state, id) {
    validateId(id);
    const child = state.children[id];
    if (!child) throw new RequestError(404, 'Unknown child');
    return child;
  }

  function getChild(id) {
    return childIn(store.read(), id);
  }

  function selected(selection) {
    if (!Number.isInteger(selection.level) || selection.level < 1 || selection.level > 6
      || !selection.profile || !Array.isArray(selection.itemIds) || !selection.itemIds.length
      || new Set(selection.itemIds).size !== selection.itemIds.length) throw new Error('Invalid set');
    return selection.itemIds.map(id => {
      const item = byId.get(id);
      if (!item) throw new Error('Unknown selected item');
      return item;
    });
  }

  function decisionEntry(selection, checkpoint) {
    return {
      checkpoint, source: selection.source, decision: durable(selection.decision),
      explain: explain(selection.decision), reason: selection.reason,
    };
  }

  function turnOperation(id, operation) {
    const turn = turns.get(id);
    if (!turn) throw new RequestError(404, 'Unknown turn');
    const result = turn.pending.then(async () => {
      if (turns.get(id) !== turn || turn.finished || now() - turn.createdAt >= TURN_TTL) {
        throw new RequestError(404, 'Unknown turn');
      }
      getChild(turn.childId);
      return operation(turn);
    });
    turn.pending = result.catch(() => {});
    return result;
  }

  function factsFor(child) {
    return factsView(turnFacts(child.profile || startProfile({ level: child.level })));
  }

  return async function app(req, res) {
    try {
      // Prune on requests rather than keeping a timer or persisting open turns.
      for (const [id, turn] of turns) if (now() - turn.createdAt >= TURN_TTL) turns.delete(id);
      const rawPath = decodeURIComponent(req.url.split('?')[0]);
      if (rawPath.includes('\0') || rawPath.includes('\\') || rawPath.split('/').includes('..')) {
        throw new RequestError(403, 'Path blocked');
      }
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      const childRoute = pathname.match(/^\/api\/children\/([^/]+)(\/detail)?$/u);
      if (pathname === '/api/trace' && !traceEnabled) throw new RequestError(404, 'Not found');
      if (pathname.startsWith('/api/teacher/') || childRoute || ['/api/class', '/api/packet', '/api/trace'].includes(pathname)
        || (pathname === '/api/children' && req.method !== 'GET')) teacher(req);

      if (req.method === 'GET' && pathname === '/api/config') {
        json(res, 200, { trace: traceEnabled });
      } else if (req.method === 'POST' && pathname === '/api/teacher/check') {
        json(res, 200, { ok: true });
      } else if (req.method === 'GET' && pathname === '/api/children') {
        json(res, 200, Object.values(store.read().children).map(childView));
      } else if (req.method === 'POST' && pathname === '/api/children') {
        const fields = childFields(await jsonBody(req));
        const child = { id: randomUUID(), ...fields, level: 1, stars: 0, best: 0, profile: null, pairs: {} };
        await store.update(state => { state.children[child.id] = child; state.turns[child.id] = []; });
        json(res, 200, childView(child));
      } else if (req.method === 'PATCH' && childRoute && !childRoute[2]) {
        const id = childRoute[1];
        getChild(id);
        const fields = childFields(await jsonBody(req), true);
        const child = await store.update(state => {
          const current = childIn(state, id);
          Object.assign(current, fields);
          if (Object.hasOwn(fields, 'level')) current.profile = startProfile({ level: fields.level });
          return current;
        });
        json(res, 200, childView(child));
      } else if (req.method === 'DELETE' && childRoute && !childRoute[2]) {
        const id = childRoute[1];
        await store.update(state => {
          childIn(state, id);
          delete state.children[id];
          delete state.turns[id];
        });
        for (const [turnId, turn] of turns) if (turn.childId === id) turns.delete(turnId);
        json(res, 200, { ok: true });
      } else if (req.method === 'POST' && pathname === '/api/start') {
        const { childId } = await jsonBody(req);
        const child = getChild(childId);
        const profile = child.profile || startProfile({ level: child.level });
        const next = await chooseNextSet(profile, [], items, { useModel: false });
        const set = selected(next);
        const entry = decisionEntry(next, 0);
        getChild(childId);
        const turnId = randomUUID();
        turns.set(turnId, {
          id: turnId, childId, preset: child.preset, createdAt: now(), startLevel: child.level,
          level: next.level, profile: next.profile, set, results: new Map(), completed: [],
          decisions: [entry], done: false, finished: false, pending: Promise.resolve(),
        });
        json(res, 200, { turnId, level: next.level, set });
      } else if (req.method === 'POST' && url.pathname === '/api/grade') {
        await turnOperation(url.searchParams.get('turn'), async turn => {
          const item = turn.set.find(candidate => candidate.id === url.searchParams.get('item'));
          if (!item) throw new RequestError(404, 'Unknown item');
          if (contentType(req) !== 'audio/wav') throw new RequestError(415, 'Use audio/wav');
          let data = await body(req, AUDIO_LIMIT);
          if (!data.length) throw new RequestError(400, 'Empty audio');
          let heard;
          try {
            // The ear receives audio alone, with no text, child, or preset.
            heard = await listen({ data, format: 'wav' });
          } finally {
            data = null;
          }
          const grade = await gradeLine({ heard: heard.words, text: item.text, preset: turn.preset });
          const result = { itemId: item.id, summary: summaryOnly(grade.summary), verdicts: grade.verdicts };
          await store.update(state => recordPairs(childIn(state, turn.childId).pairs, result.verdicts));
          turn.results.set(item.id, result);
          json(res, 200, { itemId: item.id, words: grade.words, summary: result.summary });
        });
      } else if (req.method === 'POST' && url.pathname === '/api/next') {
        const { turnId, elapsedMs } = await jsonBody(req);
        if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RequestError(400, 'Invalid elapsed time');
        await turnOperation(turnId, async turn => {
          if (turn.done) throw new RequestError(400, 'Turn is complete');
          const results = turn.set.flatMap(item => turn.results.has(item.id) ? [turn.results.get(item.id)] : []);
          const next = await chooseNextSet(turn.profile, results, items, { useModel: coachModel !== 'off', elapsedMs });
          if (!Number.isInteger(next.level) || next.level < 1 || next.level > 6 || !next.profile) throw new Error('Invalid progress');
          const set = next.done ? [] : selected(next);
          const entry = decisionEntry(next, turn.decisions.length);
          const levelUp = next.level > turn.level;
          const facts = next.done ? factsView(turnFacts(next.profile)) : null;
          // Earlier sets need only summaries for finish. Keep full verdicts
          // only while the coach still needs the current set's results.
          turn.completed.push(...results.map(({ itemId, summary }) => ({ itemId, summary })));
          turn.results = new Map();
          turn.profile = next.profile;
          turn.level = next.level;
          turn.set = set;
          turn.done = Boolean(next.done);
          turn.decisions.push(entry);
          json(res, 200, next.done ? { done: true, level: next.level, levelUp, facts }
            : { done: false, level: next.level, levelUp, set });
        });
      } else if (req.method === 'POST' && pathname === '/api/finish') {
        const { turnId, stars } = await jsonBody(req);
        if (!Number.isSafeInteger(stars) || stars < 0) throw new RequestError(400, 'Invalid stars');
        await turnOperation(turnId, async turn => {
          const results = [...turn.completed, ...turn.results.values()];
          const summary = totalSummary(results);
          const record = {
            id: turn.id, date: new Date(now()).toISOString(), startLevel: turn.startLevel, endLevel: turn.level,
            ok: summary.ok, pairs: summary.pairs, stars,
            log: turn.decisions.map(entry => entry.explain),
            summaries: results.map(({ itemId, summary: itemSummary }) => ({ itemId, summary: itemSummary })),
            decisions: turn.decisions.map(({ checkpoint, source, decision, explain: line }) => ({ checkpoint, source, decision, explain: line })),
          };
          const child = await store.update(state => {
            const current = childIn(state, turn.childId);
            if (!Number.isSafeInteger(current.stars + stars)) throw new RequestError(400, 'Invalid stars');
            current.profile = turn.profile;
            current.level = turn.level;
            current.stars += stars;
            current.best = Math.max(current.best, stars);
            (state.turns[turn.childId] ||= []).unshift(record);
            return current;
          });
          turn.finished = true;
          turn.results.clear();
          turn.completed = [];
          json(res, 200, { child: childView(child) });
        });
      } else if (req.method === 'GET' && pathname === '/api/class') {
        const state = store.read();
        const groups = new Map();
        const children = Object.values(state.children).map(child => {
          const next = factsFor(child).next ?? null;
          if (next) {
            if (!groups.has(next)) groups.set(next, { skill: next, label: SKILLS[next] || next, childIds: [] });
            groups.get(next).childIds.push(child.id);
          }
          const last = state.turns[child.id]?.[0];
          return {
            id: child.id, name: child.name, avatar: child.avatar, level: child.level, next,
            lastTurn: last ? { date: last.date, ok: last.ok, pairs: last.pairs, stars: last.stars } : null,
          };
        });
        json(res, 200, { children, groups: [...groups.values()].sort((a, b) => b.childIds.length - a.childIds.length || a.label.localeCompare(b.label)) });
      } else if (req.method === 'GET' && childRoute?.[2]) {
        const state = store.read();
        const child = childIn(state, childRoute[1]);
        const history = state.turns[child.id] || [];
        const lastSummary = history[0] ? totalSummary(history[0].summaries) : totalSummary([]);
        const historyView = history.slice(0, 20).map(({ date, startLevel, endLevel, ok, pairs, stars, log }) =>
          ({ date, startLevel, endLevel, ok, pairs, stars, log }));
        json(res, 200, { child: childView(child), map: buildMap(items, child), turns: historyView,
          parentLine: parentLine(child.name, lastSummary, child.preset) });
      } else if (req.method === 'GET' && pathname === '/api/packet') {
        const childId = url.searchParams.get('child');
        let child, skill, level;
        if (childId !== null) {
          if (url.searchParams.has('skill') || url.searchParams.has('level')) throw new RequestError(400, 'Choose child or skill');
          child = getChild(childId);
          level = child.level;
          skill = factsFor(child).next || items.find(item => item.level <= level && item.focus)?.focus;
        } else {
          skill = url.searchParams.get('skill');
          level = Number(url.searchParams.get('level'));
          validateLevel(level);
          if (!Object.hasOwn(SKILLS, skill)) throw new RequestError(400, 'Invalid skill');
        }
        json(res, 200, makePacket({ items, child, skill, level }));
      } else if (req.method === 'GET' && pathname === '/api/trace') {
        const turn = turns.get(url.searchParams.get('turn'));
        if (!turn) throw new RequestError(404, 'Unknown turn');
        json(res, 200, { decisions: turn.decisions });
      } else {
        if (pathname.startsWith('/api/') || !['GET', 'HEAD'].includes(req.method)) throw new RequestError(404, 'Not found');
        await staticFile(req, res, staticDir);
      }
    } catch (error) {
      const failure = error instanceof URIError ? new RequestError(400, 'Invalid path') : error;
      if (!res.headersSent) json(res, failure instanceof RequestError ? failure.status : 500,
        { error: failure instanceof RequestError ? failure.message : 'Request failed' });
      else res.end();
    }
  };
}
