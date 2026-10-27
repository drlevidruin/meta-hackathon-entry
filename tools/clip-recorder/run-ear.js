import '../../ear/env.js';
import { hear } from '../../ear/hear.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadClips } from './clips.js';
import { defaultEarModel, parseOptions } from './options.js';
import { recordingStore } from './recordings.js';

export function matchesSay(heard, say) {
  if (!Array.isArray(heard) || !heard.every((word) => Array.isArray(word)
    && word.length && word.every((syllable) => typeof syllable === 'string'))) return false;
  const normalize = (word) => word.toLowerCase().replace(/\s/g, '');
  const expected = say.trim().split(/\s+/).map(normalize);
  return heard.length === expected.length
    && heard.every((word, index) => normalize(word.join('-')) === expected[index]);
}

export async function runEar({ set = 'adult', model = defaultEarModel(), keep = false, directory,
  ear = hear, log = console.log } = {}) {
  const store = recordingStore(await loadClips(set), directory);
  let failed = false;
  const rows = [];
  try {
    const recorded = (await store.list()).filter((clip) => clip.done);
    const modelId = model === 'primary'
      ? process.env.EAR_PRIMARY_MODEL || 'meta-models/muse-spark-open-1026'
      : process.env.EAR_FALLBACK_MODEL || 'muse-wonder-1.0';
    log(`Ear model: ${model} (${modelId})`);
    log('clip\tsaid\theard\tresult');
    for (const clip of recorded) {
      let heard = 'ERROR';
      let result = 'MISS';
      try {
        // Only the audio reaches the ear, never the Hebrew, Say, or planted mistake.
        const words = await ear({ data: await store.read(clip.name), format: 'wav' }, { model });
        heard = words.map((word) => word.join('-')).join(' ');
        result = matchesSay(words, clip.say) ? 'PASS' : 'MISS';
      } catch {
        failed = true;
      }
      try {
        const row = { clip: clip.name, said: clip.say, heard, result };
        rows.push(row);
        log([row.clip, row.said, row.heard, row.result].join('\t'));
        if (result === 'MISS') failed = true;
      } finally {
        // Print the verdict, then immediately discard this child's audio.
        if (set === 'child' && !keep) await store.remove(clip.name);
      }
    }
    return { rows, code: failed || !recorded.length ? 1 : 0 };
  } finally {
    if (set === 'child' && !keep) await store.deleteChildren();
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    return (await runEar(parseOptions(argv, 'ear'))).code;
  } catch (error) {
    console.error(error.message.startsWith('Set must') || error.message.startsWith('Model must')
      || error.message.startsWith('Unknown option:') ? error.message : 'Could not run the ear test.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
