import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { SKILLS } from '../rulebook/index.js';

export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

// Decisions still drop private fields. Profiles use the coach schema below.
export function durable(value) {
  if (Array.isArray(value)) return value.map(durable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['heard', 'reason', 'reasons', 'modelReason', 'modelReasons'].includes(key))
      .map(([key, entry]) => [key, durable(entry)]));
  }
  return value;
}

const skillIds = values => Array.isArray(values)
  ? values.filter(value => typeof value === 'string' && Object.hasOwn(SKILLS, value)) : [];
const counts = (value, fields) => Object.fromEntries(fields
  .filter(key => Number.isSafeInteger(value?.[key]) && value[key] >= 0)
  .map(key => [key, value[key]]));

function coachProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const safe = counts(profile, ['version', 'level', 'checkpoints']);
  if (profile.cleanAtLevel) {
    safe.cleanAtLevel = {
      clean: profile.cleanAtLevel.clean === true,
      held: Array.isArray(profile.cleanAtLevel.held)
        ? profile.cleanAtLevel.held.filter(Array.isArray).map(skillIds).slice(-3) : [],
    };
  }
  if (profile.skills) {
    safe.skills = Object.fromEntries(Object.entries(profile.skills)
      .filter(([id]) => Object.hasOwn(SKILLS, id))
      .map(([id, record]) => [id, {
        ...counts(record, ['tries', 'misses', 'demotedAt']),
        recent: Array.isArray(record?.recent) ? record.recent.filter(mark => mark === 0 || mark === 1).slice(-6) : [],
      }]));
  }
  if (profile.proven) safe.proven = skillIds(profile.proven);
  if (profile.seen) safe.seen = Array.isArray(profile.seen)
    ? profile.seen.filter(id => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id)).slice(-40) : [];
  return safe;
}

function safeState(state) {
  for (const child of Object.values(state.children)) child.profile = coachProfile(child.profile);
  for (const id of Object.keys(state.turns)) state.turns[id] = state.turns[id].slice(0, 60);
  return durable(state);
}

export function createStore(dataDir = DEFAULT_DATA_DIR) {
  const file = path.join(dataDir, 'store.json');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (state.version !== 1 || !state.children || !state.turns) throw new Error('Invalid store');
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Could not load store');
    state = { version: 1, children: {}, turns: {} };
  }
  state = safeState(state);
  let pending = Promise.resolve();
  return {
    read: () => structuredClone(state),
    ready: () => pending,
    update(change) {
      // Serialize read-modify-write transactions, including writes for different
      // children, so one request cannot overwrite another request's progress.
      const operation = pending.then(async () => {
        const next = structuredClone(state);
        const result = change(next);
        const safe = safeState(next);
        const temp = `${file}.${randomUUID()}.tmp`;
        await fs.promises.mkdir(dataDir, { recursive: true });
        try {
          await fs.promises.writeFile(temp, JSON.stringify(safe), { mode: 0o600 });
          await fs.promises.rename(temp, file);
        } catch (error) {
          await fs.promises.rm(temp, { force: true }).catch(() => {});
          throw error;
        }
        state = safe;
        return structuredClone(result);
      });
      pending = operation.catch(() => {});
      return operation;
    },
  };
}
