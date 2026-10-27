import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));

// Profiles are opaque to the server. Strip private fields even if a dependency
// accidentally includes them in a profile or decision.
export function durable(value) {
  if (Array.isArray(value)) return value.map(durable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !['heard', 'reason', 'reasons', 'modelReason', 'modelReasons'].includes(key))
      .map(([key, entry]) => [key, durable(entry)]));
  }
  return value;
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
  let pending = Promise.resolve();
  return {
    read: () => structuredClone(state),
    update(change) {
      // Serialize read-modify-write transactions, including writes for different
      // children, so one request cannot overwrite another request's progress.
      const operation = pending.then(async () => {
        const next = structuredClone(state);
        const result = change(next);
        const safe = durable(next);
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
