import '../../ear/env.js';
import { hear } from '../../ear/hear.js';
import { applyMeter, buildVoiceProfile, pairsApart, VoiceCheckError } from '../../ear/meter.js';
import { voiceCardToEar } from '../../ear/card-gate.js';
import { cardLabels } from '../../rulebook/voice-card.js';
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
  preset = 'ashkenazi', meter = true, card = true, ear = hear, log = console.log } = {}) {
  const store = recordingStore(await loadClips(set), directory);
  let failed = false;
  const rows = [];
  try {
    const recorded = (await store.list()).filter((clip) => clip.done);
    const readings = recorded.filter((clip) => clip.kind === 'reading');
    const voice = recorded.find((clip) => clip.kind === 'voice');
    const modelId = model === 'primary'
      ? process.env.EAR_PRIMARY_MODEL || 'muse-wonder-1.0'
      : process.env.EAR_FALLBACK_MODEL || 'meta-models/muse-spark-open-1026';
    log(`Ear model: ${model} (${modelId})`);
    const voiceAudio = voice && (meter || card) ? await store.read(voice.name) : undefined;
    let profile;
    let voiceStatus;
    if (voice && (meter || card)) {
      try {
        profile = buildVoiceProfile(voiceAudio, cardLabels(preset));
        voiceStatus = `on (${preset} voice check)`;
      } catch (error) {
        if (!(error instanceof VoiceCheckError)) throw error;
        voiceStatus = error.code === 'count'
          ? `off (voice check unusable: heard ${error.heard} sounds for 15)`
          : 'off (voice check unusable)';
      }
    }
    const meterStatus = !meter ? 'off (--no-meter)'
      : !voice ? 'off (no voice check recorded)' : voiceStatus;
    const cardStatus = !card ? 'off (--no-card)'
      : !voice ? 'off (no voice check recorded)'
      : !profile ? 'off (voice check unusable)'
      : !pairsApart(profile) ? 'off (vowels merged on the card)'
      : !voiceCardToEar(profile, null, preset) ? 'off (kamatz not checked on the card)' : 'on';
    const reference = cardStatus === 'on' ? { data: voiceAudio, format: 'wav' } : undefined;
    log(`Vowel meter: ${meterStatus}`);
    log(`Voice card to the ear: ${cardStatus}`);
    log('clip\tsaid\theard\tresult\tear');
    for (const clip of readings) {
      let heard = 'ERROR';
      let earSounds = 'ERROR';
      let result = 'MISS';
      try {
        // Only the audio reaches the ear, never the Hebrew, Say, or planted mistake.
        const audio = await store.read(clip.name);
        const earWords = await ear({ data: audio, format: 'wav' }, {
          model, ...(reference ? { reference } : {}),
        });
        earSounds = earWords.map((word) => word.join('-')).join(' ');
        const words = meter && profile ? applyMeter(earWords, audio, profile).words : earWords;
        heard = words.map((word) => word.join('-')).join(' ');
        result = matchesSay(words, clip.say) ? 'PASS' : 'MISS';
      } catch {
        failed = true;
      }
      try {
        const row = { clip: clip.name, said: clip.say, heard, result, ear: earSounds };
        rows.push(row);
        log([row.clip, row.said, row.heard, row.result, row.ear].join('\t'));
        if (result === 'MISS') failed = true;
      } finally {
        // Print the verdict, then immediately discard this child's audio.
        if (set === 'child' && !keep) await store.remove(clip.name);
      }
    }
    return { rows, code: failed || !readings.length ? 1 : 0 };
  } finally {
    if (set === 'child' && !keep) await store.deleteChildren();
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    return (await runEar(parseOptions(argv, 'ear'))).code;
  } catch (error) {
    console.error(error.message.startsWith('Set must') || error.message.startsWith('Model must')
      || error.message.startsWith('Preset must')
      || error.message.startsWith('Unknown option:') ? error.message : 'Could not run the ear test.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
