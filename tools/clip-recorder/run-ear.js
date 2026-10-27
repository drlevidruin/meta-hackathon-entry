import '../../ear/env.js';
import { defaultVotes, listen } from '../../ear/hear.js';
import { applyMeter, buildVoiceProfile, pairsApart, syllablePoints, VoiceCheckError } from '../../ear/meter.js';
import { voiceCardToEar } from '../../ear/card-gate.js';
import { hearPhonemes } from '../../ear/phonemes.js';
import { applyReferee, cardCalibration, refereeSettings } from '../../ear/referee.js';
import { cardLabels } from '../../rulebook/voice-card.js';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadClips } from './clips.js';
import { defaultEarModel, parseOptions } from './options.js';
import { recordingStore } from './recordings.js';

class SelectionError extends Error {}

const formatWords = words => words.map(word => word.join('-')).join(' ');

export function matchesSay(heard, say) {
  if (!Array.isArray(heard) || !heard.every((word) => Array.isArray(word)
    && word.length && word.every((syllable) => typeof syllable === 'string'))) return false;
  const normalize = (word) => word.toLowerCase().replace(/\s/g, '');
  const expected = say.trim().split(/\s+/).map(normalize);
  return heard.length === expected.length
    && heard.every((word, index) => normalize(word.join('-')) === expected[index]);
}

async function phonemesWithRetry(audio, phonemes) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const tokens = await phonemes(audio);
      if (Array.isArray(tokens)) return tokens;
    } catch {
      // A missed answer gets one more try with the same audio.
    }
  }
  return null;
}

export async function runEar({ set = 'adult', model = defaultEarModel(), votes = defaultVotes(), keep = false, directory,
  preset = 'ashkenazi', meter = true, card = true, referee = true, cardName, round,
  phonemes = audio => hearPhonemes(audio), ear = listen, log = console.log } = {}) {
  if (set === 'child' && round !== undefined && !keep) {
    throw new SelectionError("--round with --set child requires --keep: the child's other rounds would be deleted without being graded.");
  }
  const clips = await loadClips(set);
  if (round !== undefined && !clips.some(clip => clip.section === round)) {
    throw new SelectionError(`Unknown section: ${round}.`);
  }
  const store = recordingStore(clips, directory);
  const listed = await store.list();
  const recorded = listed.filter((clip) => clip.done);
  const readings = recorded.filter((clip) => clip.kind === 'reading'
    && (round === undefined || clip.section === round));
  if (round !== undefined && !readings.length) {
    throw new SelectionError(`No recorded readings in section: ${round}.`);
  }
  let override;
  if (cardName !== undefined) {
    const name = `${set === 'child' ? 'child_' : ''}${cardName}`;
    override = listed.find(clip => clip.name === name);
    if (!override || override.kind !== 'voice') {
      throw new SelectionError(`Voice card must name a voice clip: ${cardName}.`);
    }
    if (!override.done) throw new SelectionError(`Voice card is not recorded: ${name}.`);
  }
  const voices = new Map();
  for (const clip of readings) {
    const name = override?.name ?? clip.card;
    const voice = recorded.find(clip => clip.kind === 'voice' && clip.name === name);
    if ((round !== undefined || (set === 'child' && !keep)) && !voice) {
      throw new SelectionError(`Voice card is not recorded: ${name} (section: ${clip.section}).`);
    }
    voices.set(name, voice);
  }
  // Preserve voice-card inspection for a run with no recorded readings.
  if (!readings.length) {
    const voice = override ?? recorded.find(clip => clip.kind === 'voice');
    voices.set(voice?.name, voice);
  }
  let failed = false;
  const rows = [];
  const outcomes = [];
  const cards = new Map();
  try {
    const modelId = model === 'primary'
      ? process.env.EAR_PRIMARY_MODEL || 'muse-wonder-1.0'
      : process.env.EAR_FALLBACK_MODEL || 'meta-models/muse-spark-open-1026';
    log(`Ear model: ${model} (${modelId})`);
    const earVotes = model === 'fallback' ? 1 : votes;
    log(`Ear votes: ${earVotes}${model === 'fallback' ? ' (fallback ear)' : ''}`);
    for (const [name, voice] of voices) {
      log(`Voice card: ${name ?? 'none recorded'}${name && !voice ? ' (not recorded)' : ''}`);
      const voiceAudio = voice && (meter || card || referee) ? await store.read(voice.name) : undefined;
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
        : !voiceCardToEar(profile, null, preset) ? 'off (kamatz not checked on the card)'
        // listen() never sends the card to the fallback ear.
        : model === 'fallback' ? 'off (fallback ear)' : 'on';
      const reference = cardStatus === 'on' ? { data: voiceAudio, format: 'wav' } : undefined;
      let calibration;
      let refereeStatus = !referee ? 'off (--no-referee)' : 'off (no voice check recorded)';
      if (referee && voice) {
        try {
          const tokens = await phonemesWithRetry(voiceAudio, phonemes);
          if (tokens == null) refereeStatus = 'off (no answer from the phoneme service)';
          else {
            calibration = cardCalibration(tokens, cardLabels(preset));
            const settings = refereeSettings(calibration);
            refereeStatus = !calibration ? 'off (card vowels did not line up)'
              : !settings.on ? 'off (card does not keep o and a apart)'
              : `on (o ${calibration.o.toFixed(2)}, a ${calibration.a.toFixed(2)}, line ${settings.line.toFixed(2)})`;
          }
        } catch {
          refereeStatus = 'off (no answer from the phoneme service)';
        }
      }
      cards.set(name, { profile, reference, calibration, refereeOn: refereeSettings(calibration).on });
      log(`Vowel meter: ${meterStatus}`);
      log(`Voice card to the ear: ${cardStatus}`);
      log(`Phoneme referee: ${refereeStatus}`);
    }
    log('clip\tsaid\theard\tresult\tear\tmetered\tvotes');
    for (const clip of readings) {
      const { profile, reference, calibration, refereeOn } = cards.get(override?.name ?? clip.card);
      let heard = 'ERROR';
      let earSounds = 'ERROR';
      let metered = 'ERROR';
      let voteSounds = 'ERROR';
      let result = 'MISS';
      try {
        // Only the audio reaches the ear, never the Hebrew, Say, or planted mistake.
        const audio = await store.read(clip.name);
        const answer = await ear({ data: audio, format: 'wav' }, {
          model, votes: earVotes, ...(reference ? { reference } : {}),
        });
        const earWords = answer.words;
        earSounds = formatWords(earWords);
        const missingVotes = answer.votes ? answer.votes.asked - answer.votes.answered : 0;
        voteSounds = [...answer.answers.map(formatWords), ...Array(missingVotes).fill('ERROR')].join(' | ');
        let words = meter && profile ? applyMeter(earWords, audio, profile).words : earWords;
        metered = formatWords(words);
        if (refereeOn) {
          let status = 'failed';
          try {
            const tokens = await phonemesWithRetry(audio, phonemes);
            if (tokens == null) status = null;
            else {
              const options = meter && profile ? { points: syllablePoints(words, audio), profile } : undefined;
              const answer = applyReferee(words, tokens, calibration, options);
              words = answer.words;
              status = answer.status;
            }
          } catch {
            // A phoneme failure leaves the metered words available for comparison.
          } finally {
            outcomes.push({ clip: clip.name, status });
          }
        }
        heard = formatWords(words);
        result = matchesSay(words, clip.say) ? 'PASS' : 'MISS';
      } catch {
        failed = true;
      }
      try {
        const row = { clip: clip.name, said: clip.say, heard, result, ear: earSounds, metered, votes: voteSounds };
        rows.push(row);
        log([row.clip, row.said, row.heard, row.result, row.ear, row.metered, row.votes].join('\t'));
        if (result === 'MISS') failed = true;
      } finally {
        // Print the verdict, then immediately discard this child's audio.
        if (set === 'child' && !keep) await store.remove(clip.name);
      }
    }
    if ([...cards.values()].some(card => card.refereeOn)) {
      const checked = outcomes.filter(outcome => ['checked', 'aligned'].includes(outcome.status)).length;
      const noAnswer = outcomes.filter(outcome => outcome.status === null).map(outcome => outcome.clip);
      const count = outcomes.filter(outcome => outcome.status === 'count').map(outcome => outcome.clip);
      const other = outcomes.filter(outcome => ![null, 'checked', 'aligned', 'count'].includes(outcome.status))
        .map(outcome => outcome.clip);
      log(`Phoneme referee: checked ${checked} of ${outcomes.length} readings`);
      if (noAnswer.length) log(`Phoneme referee: no answer for ${noAnswer.join(', ')}`);
      if (count.length) log(`Phoneme referee: vowels did not line up for ${count.join(', ')}`);
      if (other.length) log(`Phoneme referee: failed on ${other.join(', ')}`);
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
    console.error(error instanceof SelectionError
      || error.message.startsWith('Set must') || error.message.startsWith('Model must')
      || error.message.startsWith('Votes must')
      || error.message.startsWith('Preset must')
      || error.message.startsWith('Card name must') || error.message.startsWith('Round section must')
      || error.message.startsWith('Unknown option:') ? error.message : 'Could not run the ear test.');
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
