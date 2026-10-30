import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { utterance, wav } from '../../ear/synth-for-tests.js';
import { cardLabels } from '../../rulebook/voice-card.js';
import { loadClips } from './clips.js';
import { recordingStore } from './recordings.js';
import { parseOptions, replayRun } from './replay.js';
import { formatReferee, runEar } from './run-ear.js';
import { scoreRun } from './score.js';

const here = dirname(fileURLToPath(import.meta.url));
const header = 'clip\tsaid\theard\tresult\tear\tmetered\tvotes';
const needsProbe = '--probe needs a phoneme service that returns probe vectors. Restart the phoneme service from this checkout.';

function phonemeVowel(score, probe) {
  return { token: score >= 0.5 ? 'ɑ' : 'a', start: 0, end: 0.02,
    top: [['ɑ', score], ['a', 1 - score]], probe };
}

function phonemeCard(a = 0.43, o = 0.91, i = 1, e = 0) {
  return cardLabels('ashkenazi').map(label => label === 'a' || label === 'o'
    ? phonemeVowel(label === 'a' ? a : o, [label === 'a' ? -1 : 1, 0])
    : { token: label || 'oɪ', start: 0, end: 0.02, top: label === 'i' || label === 'e'
      ? [['i', label === 'i' ? i : e], ['e', 1 - (label === 'i' ? i : e)]] : [[label || 'oɪ', 1]], probe: [0, 0] });
}

const readingFixtures = [
  { name: 'sal_clean', sounds: ['o'], words: [['sol']], tokens: [phonemeVowel(0.84, [-1, 0])] },
  { name: 'diro_clean', sounds: ['i', 'o'], words: [['di', 'ro']], tokens: [
    { token: 'i', start: 0, end: 0.02, top: [['i', 1]], probe: [0, 0] }, phonemeVowel(0.91, [1, 0]),
  ] },
  { name: 'yofo_patach-for-kamatz', sounds: ['a', 'o'], words: [['ya', 'fo']],
    tokens: [phonemeVowel(0.43, [-1, 0]), phonemeVowel(0.91, [1, 0])] },
];

async function savedRun(t, { probe = true, meter = true, readings = readingFixtures, cardTokens = phonemeCard() } = {}) {
  const directory = await realpath(await mkdtemp(join(here, '.replay-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = recordingStore(await loadClips('adult'), directory);
  const voice = wav(utterance(cardLabels('ashkenazi').map(label => label ?? 'o')));
  await store.save('voice-check-2', voice);
  const fixtures = readings.map(reading => ({ ...reading, audio: wav(utterance(reading.sounds)) }));
  for (const fixture of fixtures) await store.save(fixture.name, fixture.audio);
  const phonemes = async (audio, options) => {
    assert.ok(Buffer.isBuffer(audio));
    const tokens = audio.equals(voice) ? cardTokens : fixtures.find(fixture => fixture.audio.equals(audio))?.tokens;
    assert.ok(tokens, 'only recorded audio reaches the phoneme service');
    return options?.probe ? tokens : tokens.map(({ probe, ...token }) => token);
  };
  const output = [];
  const result = await runEar({ directory, model: 'primary', votes: 3, probe, meter, cardName: 'voice-check-2',
    ear: async ({ data, format }) => {
      assert.equal(format, 'wav');
      const fixture = fixtures.find(fixture => fixture.audio.equals(data));
      assert.ok(fixture);
      return { words: fixture.words, answers: [fixture.words, fixture.words], votes: { asked: 3, answered: 2 } };
    }, phonemes, log: line => output.push(line) });
  return { directory, voice, fixtures, phonemes, rows: result.rows, text: `${output.join('\n')}\n` };
}

async function replay(run, options = {}) {
  const output = [];
  const result = await replayRun({ text: run.text, file: 'saved/run-1.tsv', probe: true,
    directory: run.directory, phonemes: run.phonemes, ...options, log: line => output.push(line) });
  return { ...result, output };
}

function changeRow(text, name, column, value) {
  return text.split('\n').map(line => {
    const cells = line.split('\t');
    if (cells[0] === name) cells[column] = value;
    return cells.join('\t');
  }).join('\n');
}

test('referee reporting keeps the a and o numbers for an older calibration without front scores', () => {
  assert.equal(formatReferee({ version: 1, a: 0.43, o: 0.91, n: { a: 3, o: 3 } }),
    'on (o 0.91, a 0.43, line 0.50); i/e off (card i and e unavailable)');
});

for (const [mode, cardTokens, status, heard] of [
  ['on', phonemeCard(0.43, 0.91, 0.9, 0.1),
    'on (o 0.91, a 0.43, line 0.50); i/e on (i 0.90, e 0.10, line 0.50)', 'di-re'],
  ['too close', phonemeCard(0.43, 0.91, 0.55, 0.45),
    'on (o 0.91, a 0.43, line 0.50); i/e off (i 0.55, e 0.45, line 0.50)', 'de-ri'],
  ['unavailable', phonemeCard().map(value => value.token === 'i' ? { ...value, top: [] } : value),
    'on (o 0.91, a 0.43, line 0.50); i/e off (card i and e unavailable)', 'de-ri'],
  ['on with a and o off', phonemeCard(0.55, 0.6, 0.9, 0.1),
    'on (a/o off: card does not keep o and a apart); i/e on (i 0.90, e 0.10, line 0.50)', 'di-re'],
]) {
  test(`the runner and replay report i/e ${mode} and apply the same front-high changes`, async t => {
    const run = await savedRun(t, { probe: false, meter: false, cardTokens, readings: [
      { name: 'diro_clean', sounds: ['i', 'e'], words: [['de', 'ri']], tokens: [
        { token: 'i', top: [['i', 0.9], ['e', 0.1]] },
        { token: 'e', top: [['i', 0.1], ['e', 0.9]] },
      ] },
    ] });
    assert.ok(run.text.split('\n').includes(`Phoneme referee: ${status}`));
    assert.equal(run.rows[0].heard, heard);
    assert.equal(run.rows[0].metered, 'de-ri');
    assert.equal(run.rows[0].ear, 'de-ri');
    const result = await replay(run, { probe: false });
    assert.equal(result.code, 0);
    assert.deepEqual(result.rows, run.rows);
    assert.ok(result.output.includes(`Phoneme referee: ${status}`));
  });
}

test('a probe replay reproduces the saved runner output and keeps recordings unchanged', async t => {
  const run = await savedRun(t);
  const before = await readdir(run.directory);
  const calls = [];
  const result = await replay(run, { phonemes: async (...args) => {
    calls.push(args);
    return run.phonemes(...args);
  } });
  assert.equal(result.code, 0);
  assert.deepEqual(result.rows, run.rows);
  assert.deepEqual(result.output.slice(0, 7), [
    'Replay of run-1.tsv with the probe on',
    'Voice card: voice-check-2',
    'Vowel meter: on (ashkenazi voice check)',
    'Voice card to the ear: on',
    'Phoneme referee: on (o 0.91, a 0.43, line 0.50); i/e on (i 1.00, e 0.00, line 0.50)',
    'Card probe: on (a 3, o 3)',
    header,
  ]);
  assert.deepEqual(result.output.slice(-3), [
    'Phoneme referee: checked 3 of 3 readings',
    'Probe chose 1 syllables and changed 1.',
    'Replay matches the run on 3 of 3 readings.',
  ]);
  assert.deepEqual(calls, [[run.voice, { probe: true }],
    ...run.rows.map(row => [run.fixtures.find(fixture => fixture.name === row.clip).audio, { probe: true }])]);
  assert.deepEqual(await readdir(run.directory), before);
  assert.deepEqual(await readFile(join(run.directory, 'voice-check-2.wav')), run.voice);
  for (const fixture of run.fixtures) {
    assert.deepEqual(await readFile(join(run.directory, `${fixture.name}.wav`)), fixture.audio);
  }
});

test('a probe replay accepts an empty phoneme token list for a reading', async t => {
  const run = await savedRun(t, { probe: true,
    readings: readingFixtures.map((reading, index) => index === 0 ? { ...reading, tokens: [] } : reading) });
  const result = await replay(run, { probe: true });
  assert.equal(result.code, 0);
  assert.deepEqual(result.rows, run.rows);
  assert.equal(result.output.at(-1), 'Replay matches the run on 3 of 3 readings.');
});

test('an altered heard answer reports the clip mismatch and exits 1', async t => {
  const run = await savedRun(t);
  const result = await replay(run, { text: changeRow(run.text, 'sal_clean', 2, 'sul') });
  assert.equal(result.code, 1);
  assert.deepEqual(result.output.slice(-2), [
    'Replay matches the run on 2 of 3 readings.',
    'sal_clean: run sul, replay sal',
  ]);
  assert.equal(result.rows.find(row => row.clip === 'sal_clean').heard, 'sal');
});

test('the probe can choose a different vowel from the meter on the same saved words', async t => {
  const run = await savedRun(t);
  const on = await replay(run);
  const calls = [];
  const off = await replay(run, { probe: false, phonemes: async (...args) => {
    calls.push(args);
    return run.phonemes(...args);
  } });
  assert.equal(on.rows.find(row => row.clip === 'sal_clean').heard, 'sal');
  assert.equal(off.rows.find(row => row.clip === 'sal_clean').heard, 'sol');
  assert.equal(off.rows.find(row => row.clip === 'sal_clean').result, 'MISS');
  assert.equal(off.code, 0);
  assert.equal(off.output.at(-1), 'Readings changed by the replay: 1 of 3.');
  assert.ok(off.output.includes('Card probe: off (--probe not set)'));
  assert.ok(!off.output.some(line => line.startsWith('Probe chose')));
  assert.ok(calls.every(args => args.length === 1));
  for (const row of off.rows) {
    const original = run.rows.find(original => original.clip === row.clip);
    for (const column of ['clip', 'said', 'ear', 'metered', 'votes']) assert.equal(row[column], original[column]);
  }
});

test('a run made without the probe uses the same faithfulness check even when a reading misses', async t => {
  const run = await savedRun(t, { probe: false });
  const result = await replay(run, { probe: false });
  assert.equal(result.code, 0);
  assert.deepEqual(result.rows, run.rows);
  assert.equal(result.output.at(-1), 'Replay matches the run on 3 of 3 readings.');
  const on = await replay(run);
  assert.equal(on.code, 0);
  assert.equal(on.output.at(-1), 'Readings changed by the replay: 1 of 3.');
});

test('a missing card probe status means the saved run did not use the probe', async t => {
  const run = await savedRun(t, { probe: false });
  const result = await replay(run, { probe: false, text: run.text.replace(/^Card probe:.*\n/mu, '') });
  assert.equal(result.code, 0);
  assert.equal(result.output.at(-1), 'Replay matches the run on 3 of 3 readings.');
});

test('an ERROR row is copied without reading its audio or calling the phoneme service', async t => {
  const run = await savedRun(t);
  const errorRow = 'bosor_clean\tbo-sor\tERROR\tMISS\tERROR\tERROR\tERROR';
  const text = run.text.replace('Phoneme referee: checked', `${errorRow}\nPhoneme referee: checked`);
  const result = await replay(run, { text });
  assert.equal(result.code, 0);
  assert.ok(result.output.includes(errorRow));
  assert.equal(result.rows.at(-1).metered, 'ERROR');
  assert.equal(result.output.at(-3), 'Phoneme referee: checked 3 of 3 readings');
  assert.equal(result.output.at(-1), 'Replay matches the run on 4 of 4 readings.');
});

test('the replay scores exactly like a saved run with the same rows', async t => {
  const run = await savedRun(t);
  const result = await replay(run);
  const source = `${result.output.join('\n')}\n`;
  const expected = await scoreRun(run.text);
  const actual = await scoreRun(source);
  assert.deepEqual(actual.totals, expected.totals);
  assert.deepEqual(actual.rounds, expected.rounds);
  assert.deepEqual(actual.rows.map(({ line, ...row }) => row), expected.rows.map(({ line, ...row }) => row));
  assert.equal(actual.totals.columns.final.plants, 1);
  assert.equal(actual.totals.columns.final.caught, 1);
  const file = join(run.directory, 'replayed.tsv');
  await writeFile(file, source);
  const scored = spawnSync(process.execPath, [join(here, 'score.js'), file], { encoding: 'utf8' });
  assert.equal(scored.status, 0, scored.stderr);
  assert.match(scored.stdout, /plants caught 1 of 1/u);
});

for (const [cellCount, cut] of [[1, 'clip name'], [2, 'second cell']]) {
  for (const position of ['before the header', 'between readings', 'after the summary']) {
    test(`replay stops with a reading cut off after its ${cut} ${position}`, async t => {
      const run = await savedRun(t);
      const lines = run.text.trimEnd().split('\n');
      const index = lines.findIndex(line => line.startsWith('diro_clean\t'));
      const [row] = lines.splice(index, 1);
      const at = position === 'before the header' ? lines.indexOf(header)
        : position === 'after the summary' ? lines.length : index;
      lines.splice(at, 0, row.split('\t').slice(0, cellCount).join('\t'));
      const text = lines.join('\n');
      const file = join(run.directory, 'cut-off-run.tsv');
      const message = `${file}:${at + 1}: Expected seven tab-separated cells.`;
      await assert.rejects(replay(run, { text, file, phonemes: async () => assert.fail('no service call') }), { message });
      await writeFile(file, text);
      const result = spawnSync(process.execPath, [join(here, 'replay.js'), '--probe', 'on', file], { encoding: 'utf8' });
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, `${message}\n`);
    });
  }
}

for (const [name, change, message] of [
  ['no voice card line', text => text.replace(/^Voice card:.*\n/mu, ''), /exactly one Voice card:/u],
  ['two voice card lines', text => `Voice card: voice-check-2\n${text}`, /exactly one Voice card:/u],
  ['no recorded card in the run', text => text.replace('Voice card: voice-check-2', 'Voice card: none recorded'), /requires a recorded voice card/u],
  ['an unrecorded card', text => text.replace('Voice card: voice-check-2', 'Voice card: voice-check-3'), /Voice card is not recorded: voice-check-3/u],
  ['a reading named as the card', text => text.replace('Voice card: voice-check-2', 'Voice card: sal_clean'), /Voice card is not recorded: sal_clean/u],
  ['the referee off', text => text.replace(/^Phoneme referee: on.*$/mu, 'Phoneme referee: off (--no-referee)'), /referee to have been on/u],
]) {
  test(`replay stops before the service with ${name}`, async t => {
    const run = await savedRun(t);
    await assert.rejects(replay(run, { text: change(run.text), phonemes: async () => assert.fail('no service call') }), message);
  });
}

for (const probe of [false, true]) {
  for (const stage of ['voice card', 'reading']) {
    for (const failure of ['unanswered', 'thrown']) {
      test(`replay stops for a ${stage} that is ${failure} with the probe ${probe ? 'on' : 'off'}`, async t => {
        const run = await savedRun(t, { probe });
        const calls = [];
        await assert.rejects(replay(run, { probe, phonemes: async (...args) => {
          calls.push(args);
          if (stage === 'voice card' || !args[0].equals(run.voice)) {
            if (failure === 'thrown') throw new Error('private service failure');
            return null;
          }
          return run.phonemes(...args);
        } }), new RegExp(`No answer from the phoneme service for ${stage}:`, 'u'));
        const missed = calls.filter(args => (stage === 'voice card') === args[0].equals(run.voice));
        assert.equal(missed.length, probe && stage === 'voice card' ? 3 : 2);
        assert.ok(missed.slice(0, 2).every(args => probe ? args[1]?.probe === true : args.length === 1));
      });
    }
  }
}

for (const mode of ['plain service', 'card without vectors', 'reading without vectors']) {
  test(`probe replay stops with the runner message for a ${mode}`, async t => {
    const run = await savedRun(t);
    const calls = [];
    await assert.rejects(replay(run, { phonemes: async (...args) => {
      calls.push(args);
      if (mode === 'plain service') return args[1]?.probe ? null : run.phonemes(args[0]);
      if (mode === 'card without vectors' || !args[0].equals(run.voice)) return run.phonemes(args[0]);
      return run.phonemes(...args);
    } }), { message: needsProbe });
    if (mode === 'plain service') assert.deepEqual(calls, [[run.voice, { probe: true }], [run.voice, { probe: true }], [run.voice]]);
  });
}

for (const mode of ['misaligned', 'merged']) {
  test(`replay stops when the rebuilt referee card is ${mode}`, async t => {
    const run = await savedRun(t);
    await assert.rejects(replay(run, { phonemes: async () => mode === 'misaligned' ? phonemeCard().slice(1)
      : phonemeCard(0.43, 0.91, 0.5, 0.5).map(value => value.token === 'ɑ' ? phonemeVowel(0.45, value.probe) : value) }),
    /Cannot replay with the phoneme referee off:/u);
  });
}

for (const meter of [false, true]) {
  test(`the replay ${meter ? 'uses' : 'omits'} meter points when the run had the meter ${meter ? 'on' : 'off'}`, async t => {
    const run = await savedRun(t, { probe: false, meter,
      readings: [{ ...readingFixtures[0], sounds: ['a'] }] });
    const result = await replay(run, { probe: false });
    assert.equal(result.code, 0);
    assert.equal(result.rows[0].metered, 'sol');
    assert.equal(result.rows[0].heard, meter ? 'sal' : 'sol');
    assert.ok(result.output.includes(meter ? 'Vowel meter: on (ashkenazi voice check)' : 'Vowel meter: off (--no-meter)'));
  });
}

test('replay retries card and reading requests with the same probe setting', async t => {
  const run = await savedRun(t);
  const calls = [];
  const result = await replay(run, { phonemes: async (...args) => {
    calls.push(args);
    return calls.length % 2 ? null : run.phonemes(...args);
  } });
  assert.equal(result.code, 0);
  assert.equal(calls.length, 8);
  for (let index = 0; index < calls.length; index += 2) {
    assert.deepEqual(calls[index], calls[index + 1]);
    assert.deepEqual(calls[index][1], { probe: true });
  }
});

test('the replay CLI requires exactly one run and an explicit on or off probe setting', () => {
  assert.deepEqual(parseOptions(['--probe', 'on', 'run.tsv']), { probe: true, file: 'run.tsv' });
  assert.deepEqual(parseOptions(['run.tsv', '--probe', 'off']), { probe: false, file: 'run.tsv' });
  for (const args of [[], ['run.tsv'], ['--probe'], ['--probe', 'on'], ['--probe', 'yes', 'run.tsv'],
    ['--probe', 'on', 'one.tsv', 'two.tsv'], ['--probe', 'on', '--probe', 'off', 'run.tsv'],
    ['--probe', 'off', '--unknown', 'run.tsv'], ['--help']]) {
    const result = spawnSync(process.execPath, [join(here, 'replay.js'), ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'Usage: npm run -s ear-replay -- --probe on|off FILE\n');
  }
});

test('the replay CLI exits 1 when the run file cannot be read', () => {
  const result = spawnSync(process.execPath, [join(here, 'replay.js'), '--probe', 'off', join(here, 'missing-run.tsv')],
    { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Could not read run file:/u);
});
