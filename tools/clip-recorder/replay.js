import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildVoiceProfile, syllablePoints } from '../../ear/meter.js';
import { hearPhonemes } from '../../ear/phonemes.js';
import { applyReferee, cardCalibration, frontRefereeSettings, probeCalibration, refereeSettings } from '../../ear/referee.js';
import { cardLabels } from '../../rulebook/voice-card.js';
import { loadClips } from './clips.js';
import { recordingStore } from './recordings.js';
import { formatReferee, matchesSay } from './run-ear.js';

const usage = 'Usage: npm run -s ear-replay -- --probe on|off FILE';
const columns = ['clip', 'said', 'heard', 'result', 'ear', 'metered', 'votes'];
const header = columns.join('\t');
const needsProbe = '--probe needs a phoneme service that returns probe vectors. Restart the phoneme service from this checkout.';
const formatWords = words => words.map(word => word.join('-')).join(' ');
const formatRow = row => columns.map(column => row[column]).join('\t');

export function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--probe' && options.probe === undefined) {
      const value = argv[++index];
      if (!['on', 'off'].includes(value)) throw new Error(usage);
      options.probe = value === 'on';
    } else if (argument && !argument.startsWith('-') && options.file === undefined) options.file = argument;
    else throw new Error(usage);
  }
  if (options.probe === undefined || !options.file?.trim()) throw new Error(usage);
  return options;
}

function parseRun(text, file, clips) {
  const lines = text.split(/\r?\n/u);
  const voices = lines.filter(line => line.startsWith('Voice card:'));
  if (voices.length !== 1) throw new Error('Replay requires exactly one Voice card: line in the run.');
  const cardName = voices[0].slice('Voice card:'.length).trim();
  if (cardName === 'none recorded') throw new Error('Replay requires a recorded voice card; the run says none recorded.');
  const meterLine = lines.find(line => line.startsWith('Vowel meter:'));
  if (!/^Vowel meter: (on|off)(?:\s|$)/u.test(meterLine ?? '')) {
    throw new Error('Replay requires a Vowel meter: on or off status in the run.');
  }
  const refereeLine = lines.find(line => line.startsWith('Phoneme referee:'));
  if (!/^Phoneme referee: on(?:\s|$)/u.test(refereeLine ?? '')) {
    throw new Error('Replay requires the phoneme referee to have been on in the run.');
  }
  const cardLine = lines.find(line => line.startsWith('Voice card to the ear:'));
  if (!cardLine) throw new Error('Replay requires a Voice card to the ear: status in the run.');
  const probe = lines.some(line => /^Card probe: on(?:\s|$)/u.test(line));
  const rows = [];
  let foundHeader = false;
  for (const [index, line] of lines.entries()) {
    const at = `${file}:${index + 1}`;
    if (line === header && !foundHeader) {
      foundHeader = true;
      continue;
    }
    const cells = line.split('\t');
    const reading = clips.some(clip => clip.name === cells[0] && clip.kind === 'reading');
    if (reading && cells.length !== columns.length) throw new Error(`${at}: Expected seven tab-separated cells.`);
    if (!line.includes('\t')) continue;
    if (!foundHeader || line.startsWith('clip\t')) throw new Error(`${at}: Expected the seven-column run header once.`);
    if (cells.length !== columns.length) throw new Error(`${at}: Expected seven tab-separated cells.`);
    if (!reading) {
      throw new Error(`${at}: Unknown adult reading clip: ${cells[0]}.`);
    }
    rows.push(Object.fromEntries(columns.map((column, i) => [column, cells[i]])));
  }
  if (!foundHeader) throw new Error(`${file}: Missing the seven-column run header.`);
  if (!rows.length) throw new Error(`${file}: No readings in the run.`);
  return { cardName, voiceLine: voices[0], meterLine, cardLine,
    meter: meterLine.startsWith('Vowel meter: on'), probe, rows };
}

async function phonemesWithRetry(audio, phonemes, probe) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const tokens = probe ? await phonemes(audio, { probe: true }) : await phonemes(audio);
      if (Array.isArray(tokens)) return tokens;
    } catch {
      // Retry a missed answer without logging service errors or audio.
    }
  }
  return null;
}

function requireProbeVectors(tokens) {
  if (!tokens.length || !tokens.every(value => Array.isArray(value?.probe) && value.probe.length > 0
    && value.probe.length === tokens[0].probe.length && [...value.probe].every(Number.isFinite))) {
    throw new Error(needsProbe);
  }
}

async function readRecording(store, name) {
  try {
    return await store.read(name);
  } catch {
    throw new Error(`Could not read recording: ${name}.`);
  }
}

export async function replayRun({ text, file = '<input>', probe, directory,
  phonemes = hearPhonemes, log = console.log } = {}) {
  if (typeof probe !== 'boolean') throw new Error(usage);
  const clips = await loadClips('adult');
  const run = parseRun(text, file, clips);
  const store = recordingStore(clips, directory);
  const voice = (await store.list()).find(clip => clip.name === run.cardName && clip.kind === 'voice');
  if (!voice?.done) throw new Error(`Voice card is not recorded: ${run.cardName}.`);
  const voiceAudio = await readRecording(store, voice.name);
  const labels = cardLabels('ashkenazi');
  let profile;
  if (run.meter) {
    try {
      profile = buildVoiceProfile(voiceAudio, labels);
    } catch {
      throw new Error(`Could not rebuild the vowel meter from voice card: ${voice.name}.`);
    }
  }
  const cardTokens = await phonemesWithRetry(voiceAudio, phonemes, probe);
  if (cardTokens === null) {
    if (probe) {
      // A plain answer distinguishes an older service from one that is unavailable.
      let plain;
      try { plain = await phonemes(voiceAudio); } catch {}
      if (Array.isArray(plain)) throw new Error(needsProbe);
    }
    throw new Error(`No answer from the phoneme service for voice card: ${voice.name}.`);
  }
  if (probe) requireProbeVectors(cardTokens);
  const calibration = cardCalibration(cardTokens, labels);
  const settings = refereeSettings(calibration);
  if (!calibration) throw new Error('Cannot replay with the phoneme referee off: card vowels did not line up.');
  if (!settings.on && !frontRefereeSettings(calibration).on) {
    throw new Error('Cannot replay with the phoneme referee off: card does not keep o and a apart.');
  }
  const cardProbe = probe ? probeCalibration(cardTokens, labels) : undefined;
  if (probe && !cardProbe) throw new Error('Could not calibrate the card probe: card vowels did not line up.');

  log(`Replay of ${basename(file)} with the probe ${probe ? 'on' : 'off'}`);
  log(run.voiceLine);
  log(run.meterLine);
  log(run.cardLine);
  log(`Phoneme referee: ${formatReferee(calibration)}`);
  log(`Card probe: ${probe ? `on (a ${cardProbe.n.a}, o ${cardProbe.n.o})` : 'off (--probe not set)'}`);
  log(header);
  const rows = [];
  const mismatches = [];
  let readings = 0;
  let checked = 0;
  let probeChose = 0;
  let probeChanged = 0;
  for (const row of run.rows) {
    let replayed = row;
    if (row.metered !== 'ERROR') {
      const audio = await readRecording(store, row.clip);
      const tokens = await phonemesWithRetry(audio, phonemes, probe);
      if (tokens === null) throw new Error(`No answer from the phoneme service for reading: ${row.clip}.`);
      if (probe && tokens.length) requireProbeVectors(tokens);
      const words = row.metered.trim() ? row.metered.trim().split(/\s+/u).map(word => word.split('-')) : [];
      let options = run.meter && profile ? { points: syllablePoints(words, audio), profile } : undefined;
      if (probe) options = { ...options, probe: cardProbe };
      const answer = applyReferee(words, tokens, calibration, options);
      readings += 1;
      if (['checked', 'aligned'].includes(answer.status)) checked += 1;
      probeChose += answer.probed ?? 0;
      probeChanged += answer.changes.filter(change => change.judge === 'probe').length;
      replayed = { ...row, heard: formatWords(answer.words), result: matchesSay(answer.words, row.said) ? 'PASS' : 'MISS' };
    }
    rows.push(replayed);
    log(formatRow(replayed));
    if (replayed.heard !== row.heard) mismatches.push(`${row.clip}: run ${row.heard}, replay ${replayed.heard}`);
  }
  log(`Phoneme referee: checked ${checked} of ${readings} readings`);
  if (probe) log(`Probe chose ${probeChose} syllables and changed ${probeChanged}.`);
  const faithful = probe === run.probe;
  if (faithful) {
    log(`Replay matches the run on ${rows.length - mismatches.length} of ${rows.length} readings.`);
    for (const mismatch of mismatches) log(mismatch);
  } else log(`Readings changed by the replay: ${mismatches.length} of ${rows.length}.`);
  return { rows, code: faithful && mismatches.length ? 1 : 0 };
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseOptions(argv);
  } catch {
    console.error(usage);
    return 2;
  }
  try {
    let text;
    try {
      text = await readFile(options.file, 'utf8');
    } catch {
      throw new Error(`Could not read run file: ${options.file}.`);
    }
    return (await replayRun({ ...options, text })).code;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
