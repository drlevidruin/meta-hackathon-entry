// Starts the live station for a demo: the phoneme service first, then the server once
// the service answers. Keys come from the environment or the macOS keychain and are
// never printed. An empty roster gets two demo readers so the first screen has names.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStore, DEFAULT_DATA_DIR } from '../server/store.js';
import { VOWEL_IDS } from '../rulebook/vowels.js';
import { phonemeUrl, phonemesReady } from '../ear/phonemes.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PHONEME_WAIT_MS = 180000;

export const DEMO_READERS = [
  { name: 'Levi', avatar: 'lion', preset: 'ashkenazi' },
  { name: 'Guest', avatar: 'owl', preset: 'sephardi' },
];

export function keychainSecret(service) {
  try {
    const value = execFileSync('security', ['find-generic-password', '-s', service, '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return value.replace(/\r?\n$/, '') || undefined;
  } catch {
    return undefined;
  }
}

// The environment wins; the keychain fills a missing or blank value.
export function secret(name, service, env = process.env, read = keychainSecret) {
  const current = env[name];
  if (typeof current === 'string' && current.trim()) return current;
  return read(service);
}

export async function seedDemoReaders(store) {
  return store.update(state => {
    if (Object.keys(state.children).length) return [];
    return DEMO_READERS.map(reader => {
      const child = { id: randomUUID(), ...reader, vowels: [...VOWEL_IDS], level: 1, stars: 0, best: 0, profile: null, pairs: {} };
      state.children[child.id] = child;
      state.turns[child.id] = [];
      return child.name;
    });
  });
}

function newestChange(entry) {
  const stat = fs.statSync(entry);
  if (!stat.isDirectory()) return stat.mtimeMs;
  return Math.max(stat.mtimeMs, ...fs.readdirSync(entry).map(name => newestChange(path.join(entry, name))));
}

export function stationIsStale(root = ROOT) {
  const built = path.join(root, 'station/dist/index.html');
  if (!fs.existsSync(built)) return true;
  const sources = ['station/src', 'station/index.html', 'station/vite.config.js', 'rulebook'].map(name => path.join(root, name)).filter(fs.existsSync);
  return Math.max(...sources.map(newestChange)) > fs.statSync(built).mtimeMs;
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} stopped with code ${code}`)));
  });
}

async function waitForPhonemes(url, service) {
  const started = Date.now();
  while (Date.now() - started < PHONEME_WAIT_MS) {
    if (service && service.exitCode !== null) return false;
    if (await phonemesReady({ url, timeoutMs: 1000 })) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function main() {
  const env = { ...process.env };
  // A defined value stops loadEnv from filling SAVE_ATTEMPTS in from .env.
  env.SAVE_ATTEMPTS = '0';
  const key = secret('META_API_KEY', 'meta-model-api', env);
  const pin = secret('TEACHER_PIN', 'kriah-teacher-pin', env);
  if (key) env.META_API_KEY = key;
  if (pin) env.TEACHER_PIN = pin;
  console.log(`Meta API key: ${key ? 'found' : 'not found in the environment or keychain'}`);
  console.log(`Teacher PIN: ${pin ? 'found' : 'not found in the environment or keychain'}`);

  const added = await seedDemoReaders(createStore(env.DATA_DIR || DEFAULT_DATA_DIR));
  if (added.length) console.log(`Added demo readers: ${added.join(', ')}`);

  if (stationIsStale()) {
    console.log('Building the station');
    await run('npm', ['run', 'build'], env);
  }

  const children = [];
  const url = phonemeUrl(env);
  let service = null;
  if (url && !(await phonemesReady({ url, timeoutMs: 1000 }))) {
    // The same command as `npm run phonemes`, started directly so a stop signal reaches it.
    const python = path.join(ROOT, 'phonemes/.venv/bin/python');
    if (fs.existsSync(python)) {
      console.log('Starting the phoneme service');
      service = spawn(python, ['-I', 'phonemes/server.py'], { cwd: ROOT, env, stdio: 'inherit' });
      children.push(service);
    } else console.log('Phoneme service is not set up; run npm run phonemes:setup once');
  }
  if (url) {
    const ready = await waitForPhonemes(url, service);
    console.log(ready ? 'Phoneme service is ready' : 'Phoneme service did not answer; starting without it');
  }

  const server = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: 'inherit' });
  children.push(server);
  const stop = signal => { for (const child of children) if (child.exitCode === null) child.kill(signal); };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
  server.on('exit', code => {
    if (service?.exitCode === null) service.kill('SIGTERM');
    process.exit(code ?? 0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
