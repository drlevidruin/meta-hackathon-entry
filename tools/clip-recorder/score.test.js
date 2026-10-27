import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkPass, parseRun, scoreMarks, scoreRun, summarizeRows } from './score.js';
import { loadClips } from './clips.js';

const clips = [
  { name: 'shabbos', hebrew: 'שַׁבָּת', section: 'Round A', say: 'unused' },
  { name: 'line', hebrew: 'שַׁבָּת אֶחָד', section: 'Round B', say: 'unused' },
  { name: 'shema', hebrew: 'שְׁמַע יִשְׂרָאֵל', section: 'Round B', say: 'unused' },
];

function row(clip, said, heard = said, { ear = heard, metered, votes, result = 'ignored' } = {}) {
  const cells = [clip, said, heard, result, ear];
  if (metered !== undefined) cells.push(metered);
  if (votes !== undefined) cells.push(votes);
  return cells.join('\t');
}

const score = (source, options = {}) => scoreRun(source, { clips, file: 'saved.tsv', ...options });
const one = async (...args) => (await score(...args)).rows[0];
const emptyRuns = [
  ['an empty file', ''],
  ['a header-only file', 'clip\tsaid\theard\tresult\tear\n'],
  ['a status-lines-only file', 'Ear model: primary\n\nPhoneme referee: on\n'],
];

test('a clean control has no ideal or observed marks', async () => {
  const run = await score(row('shabbos', '  sha-bos  '));
  assert.equal(run.rows[0].columns.final.state, 'clean');
  assert.deepEqual(run.rows[0].ideal, []);
  assert.deepEqual(run.rows[0].columns.final.marks, []);
  assert.deepEqual(run.totals.columns.final, {
    plants: 0, caught: 0, hidden: 0, unsure: 0, other: 0, falseMarks: 0, uncertainMarks: 0,
  });
  assert.equal(run.totals.clips, 1);
  assert.equal(run.totals.earErrors, 0);
});

test('a plant is caught by matching every ideal location and verdict', async () => {
  const run = await score(row('shabbos', 'shi-bos'));
  const plant = run.rows[0];
  assert.equal(plant.columns.final.state, 'caught');
  assert.equal(plant.ideal.length, 1);
  assert.equal(plant.ideal[0].verdict, 'wrong_vowel');
  assert.equal(plant.ideal[0].wordText, 'שַׁבָּת');
  assert.equal(plant.ideal[0].text, 'שַׁ');
  assert.deepEqual(run.totals.columns.final, {
    plants: 1, caught: 1, hidden: 0, unsure: 0, other: 0, falseMarks: 0, uncertainMarks: 0,
  });
});

test('a plant is hidden when heard is the printed reading', async () => {
  const run = await score(row('shabbos', 'shi-bos', 'sha-bos'));
  assert.equal(run.rows[0].columns.final.state, 'hidden');
  assert.equal(run.totals.columns.final.hidden, 1);
  assert.equal(run.totals.columns.final.caught, 0);
});

test('a question at an ideal location makes a missed plant unsure', async () => {
  const run = await score(row('shabbos', 'shi-bos', '?-bos'));
  assert.equal(run.rows[0].columns.final.state, 'unsure');
  assert.equal(run.totals.columns.final.unsure, 1);
  assert.equal(run.totals.columns.final.uncertainMarks, 1);
  assert.equal(run.totals.columns.final.falseMarks, 0);
});

test('a different verdict at the ideal location is other and a false mark', async () => {
  const run = await score(row('shabbos', 'shi-bos', 'sa-bos'));
  assert.equal(run.rows[0].columns.final.state, 'other');
  assert.equal(run.totals.columns.final.other, 1);
  assert.equal(run.totals.columns.final.falseMarks, 1);
});

test('catching only part of a plant does not count as caught or hidden', async () => {
  const run = await score(row('line', 'shi-bos e-chid', 'shi-bos e-chod'));
  assert.equal(run.rows[0].ideal.length, 2);
  assert.equal(run.rows[0].columns.final.state, 'other');
  assert.equal(run.totals.columns.final.caught, 0);
  assert.equal(run.totals.columns.final.falseMarks, 0);
});

test('uncertainty away from ideal locations does not make a hidden plant unsure', async () => {
  const run = await score(row('line', 'shi-bos e-chod', 'sha-bos ?-chod'));
  assert.equal(run.rows[0].columns.final.state, 'hidden');
  assert.equal(run.totals.columns.final.uncertainMarks, 1);
});

test('a clean control can have both false and uncertain marks', async () => {
  const run = await score(row('line', 'sha-bos e-chod', 'shi-bos ?-chod'));
  assert.equal(run.rows[0].ideal.length, 0);
  assert.equal(run.totals.columns.final.plants, 0);
  assert.equal(run.totals.columns.final.falseMarks, 1);
  assert.equal(run.totals.columns.final.uncertainMarks, 1);
});

test('an ear error counts as a clip and error without grading any column', async () => {
  const run = await score(row('shabbos', 'invalid--syllables', 'ERROR', {
    ear: 'invalid--syllables', metered: 'invalid--syllables',
  }));
  assert.equal(run.rows[0].earError, true);
  assert.deepEqual(run.rows[0].columns, {});
  assert.equal(run.totals.clips, 1);
  assert.equal(run.totals.earErrors, 1);
  for (const column of ['final', 'metered', 'ear']) {
    assert.deepEqual(run.totals.columns[column], {
      plants: 0, caught: 0, hidden: 0, unsure: 0, other: 0, falseMarks: 0, uncertainMarks: 0,
    });
  }
});

test('5-, 6- and 7-column rows preserve their scored columns and ignore result and votes', async () => {
  const source = [
    row('shabbos', 'shi-bos'),
    row('shabbos', 'shi-bos', 'sha-bos', { metered: 'shi-bos', result: 'PASS' }),
    row('shabbos', 'shi-bos', 'shi-bos', { metered: '?-bos', votes: 'not gradeable--votes' }),
  ].join('\n');
  const run = await score(source);
  assert.equal(run.rows.length, 3);
  assert.equal(run.rows[0].columns.metered, undefined);
  assert.equal(run.totals.columns.final.plants, 3);
  assert.equal(run.totals.columns.final.caught, 2);
  assert.equal(run.totals.columns.final.hidden, 1);
  assert.equal(run.totals.columns.metered.plants, 2);
  assert.equal(run.totals.columns.metered.caught, 1);
  assert.equal(run.totals.columns.metered.unsure, 1);
});

test('status lines, blank lines and the clip header are ignored, including CRLF input', async () => {
  const rows = await parseRun([
    'Ear model: primary', '', 'clip\tsaid\theard\tresult\tear\tmetered\tvotes',
    row('shabbos', 'sha-bos', 'sha-bos', { metered: 'sha-bos', votes: '' }), 'Phoneme referee: on', '',
  ].join('\r\n'), { clips, file: 'status.tsv' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clip, 'shabbos');
  assert.equal(rows[0].line, 4);
});

for (const [count, lastRow] of [
  [5, row('shabbos', 'sha-bos')],
  [6, row('shabbos', 'sha-bos', 'sha-bos', { metered: 'sha-bos' })],
  [8, `${row('shabbos', 'sha-bos', 'sha-bos', { metered: 'sha-bos', votes: '[]' })}\textra`],
]) {
  test(`${count}-cell last rows under a 7-column header are errors naming their file and line`, async () => {
    const source = [
      'Ear model: primary', 'clip\tsaid\theard\tresult\tear\tmetered\tvotes',
      row('shabbos', 'sha-bos', 'sha-bos', { metered: 'sha-bos', votes: '[]' }),
      'Phoneme referee: on', lastRow,
    ].join('\r\n');
    await assert.rejects(parseRun(source, { clips, file: 'columns.tsv' }), {
      message: `columns.tsv:5: Expected 7 tab-separated cells; found ${count}.`,
    });
  });
}

test('a 5-column header accepts 5-cell rows', async () => {
  const rows = await parseRun([
    'clip\tsaid\theard\tresult\tear', row('shabbos', 'sha-bos'), row('line', 'sha-bos e-chod'),
  ].join('\n'), { clips });
  assert.equal(rows.length, 2);
  assert.ok(rows.every(entry => !Object.hasOwn(entry, 'metered')));
});

test('headers set the row width until the next header, leaving earlier headerless rows valid', async () => {
  const sevenCells = row('shabbos', 'sha-bos', 'sha-bos', { metered: 'sha-bos', votes: '[]' });
  const source = [
    sevenCells,
    'clip\tsaid\theard\tresult\tear', row('shabbos', 'sha-bos'),
    'clip\tsaid\theard\tresult\tear\tmetered',
    row('shabbos', 'sha-bos', 'sha-bos', { metered: 'sha-bos' }),
    'clip\tsaid\theard\tresult\tear\tmetered\tvotes', sevenCells,
    'clip\tsaid\theard\tresult\tear', row('shabbos', 'sha-bos'),
  ].join('\n');
  const rows = await parseRun(source, { clips, file: 'headers.tsv' });
  assert.deepEqual(rows.map(entry => entry.line), [1, 3, 5, 7, 9]);
  await assert.rejects(parseRun(`${source}\n${sevenCells}`, { clips, file: 'headers.tsv' }), {
    message: 'headers.tsv:10: Expected 5 tab-separated cells; found 7.',
  });
});

test('a 4-column header is an error naming its file and line even without rows', async () => {
  await assert.rejects(parseRun('status\nclip\tsaid\theard\tresult', { clips, file: 'header.tsv' }), {
    message: 'header.tsv:2: Expected at least 5 tab-separated cells in header; found 4.',
  });
});

test('a status line containing a clip name after its first token is still ignored', async () => {
  const rows = await parseRun([
    'Checking shabbos and child_line', '  Waiting for child_shabbos',
    'shabbos_extra is not a clip', 'clip said heard result ear', '  ',
    row('shabbos', 'sha-bos'),
  ].join('\n'), { clips, file: 'status.tsv' });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clip, 'shabbos');
  assert.equal(rows[0].line, 6);
});

for (const truncated of ['shabbos', 'child_shabbos', '  shabbos sha-bos', 'child_line sha-bos e-chod']) {
  for (const round of [undefined, 'Round A']) {
    test(`a truncated row ${JSON.stringify(truncated)} is an error ${round ? 'with' : 'without'} --round`, async () => {
      const source = ['status', row('shabbos', 'sha-bos'), truncated].join('\r\n');
      await assert.rejects(score(source, { round }),
        error => /saved\.tsv:3:/.test(error.message) && /5 tab-separated cells/.test(error.message));
    });
  }
}

for (const [name, source] of emptyRuns) {
  for (const round of [undefined, 'Round A']) {
    test(`${name} is an error ${round === undefined ? 'without' : 'with'} --round`, async () => {
      await assert.rejects(score(source, { round }),
        error => error.message.includes('saved.tsv') && /No rows/.test(error.message));
    });
  }
}

test('a zero-clip total never passes when checkPass is called directly', () => {
  const result = checkPass({ totals: summarizeRows([]) }, 0);
  assert.equal(result.clips, 0);
  assert.equal(result.pass, false);
});

test('an unknown clip is an error naming its file and original line', async () => {
  await assert.rejects(score('status\nclip\tsaid\theard\tresult\tear\nunknown\tx\tx\tPASS\tx'),
    error => /saved\.tsv:3/.test(error.message) && /unknown/i.test(error.message));
});

test('a short tabbed row is an error naming its file and original line', async () => {
  await assert.rejects(score('status\nshabbos\tsha-bos\tsha-bos\tPASS'),
    error => /saved\.tsv:2/.test(error.message) && /5/.test(error.message));
});

test('a leading child_ prefix is stripped for lookup and preserved for reporting', async () => {
  const run = await score(row('child_shabbos', 'shi-bos'));
  assert.equal(run.rows[0].clip, 'child_shabbos');
  assert.equal(run.rows[0].round, 'Round A');
  assert.equal(run.rows[0].columns.final.state, 'caught');
  await assert.rejects(score(row('child_child_shabbos', 'sha-bos')), /saved\.tsv:1/);
});

test('round summaries follow first appearance and merge later rows of the same round', async () => {
  const run = await score([
    row('line', 'sha-bos e-chod'), row('shabbos', 'sha-bos'), row('line', 'shi-bos e-chod'),
  ].join('\n'));
  assert.deepEqual(run.rounds.map(summary => summary.round), ['Round B', 'Round A']);
  assert.deepEqual(run.rounds.map(summary => summary.clips), [2, 1]);
});

test('--round keeps only matching rows and rejects an unknown or absent round', async () => {
  const source = [row('line', 'sha-bos e-chod'), row('shabbos', 'shi-bos')].join('\n');
  const run = await score(source, { round: 'Round A' });
  assert.deepEqual(run.rows.map(entry => entry.clip), ['shabbos']);
  assert.equal(run.totals.clips, 1);
  await assert.rejects(score(source, { round: 'Round unknown' }), /Unknown round.*Round unknown/);
  await assert.rejects(score(row('shabbos', 'sha-bos'), { round: 'Round B' }),
    error => /saved\.tsv/.test(error.message) && /Round B/.test(error.message));
});

test('the pass rule requires each clip of a round once, including child_ aliases', async () => {
  const complete = [row('child_line', 'sha-bos e-chod'), row('child_shema', 'she-ma yis-ro-eyl')];
  for (const [source, pass, missing, repeated] of [
    [complete.join('\n'), true, [], []],
    [complete[0], false, ['shema'], []],
    [[...complete, row('line', 'sha-bos e-chod')].join('\n'), false, [], ['line']],
    [[complete[0], row('line', 'sha-bos e-chod')].join('\n'), false, ['shema'], ['line']],
  ]) {
    const run = await score(source, { round: 'Round B' });
    const result = checkPass(run, 0);
    assert.equal(result.pass, pass);
    assert.deepEqual(result.missingClips, missing);
    assert.deepEqual(result.repeatedClips, repeated);
    assert.equal(run.rounds[0].expectedClips, 2);
    assert.equal(run.totals.columns.final.falseMarks, 0);
  }
});

test('coverage checks every appearing round unless --round selects one', async () => {
  const source = [
    row('shabbos', 'sha-bos'), row('line', 'sha-bos e-chod'), row('line', 'sha-bos e-chod'),
  ].join('\n');
  const all = checkPass(await score(source), 0);
  assert.equal(all.pass, false);
  assert.deepEqual(all.missingClips, ['shema']);
  assert.deepEqual(all.repeatedClips, ['line']);
  const selected = checkPass(await score(source, { round: 'Round A' }), 0);
  assert.equal(selected.pass, true);
  assert.deepEqual(selected.missingClips, []);
  assert.deepEqual(selected.repeatedClips, []);
});

test('an extra heard word does not shift the same wrong vowel on the second printed word', async () => {
  const plant = await one(row('shema', 'she-ma yis-ri-eyl', 'she-ma ba yis-ri-eyl'));
  assert.equal(plant.columns.final.state, 'caught');
  assert.equal(plant.columns.final.falseMarks, 1);
  const vowel = plant.columns.final.marks.find(mark => mark.verdict === 'wrong_vowel');
  assert.equal(vowel.key, plant.ideal[0].key);
  assert.equal(vowel.wordText, 'יִשְׂרָאֵל');
  assert.equal(vowel.text, 'רָ');
});

test('an extra mark matches only the same text at the same printed-word boundary', async () => {
  const caught = await one(row('shema', 'she-ma ba yis-ro-eyl'));
  assert.equal(caught.columns.final.state, 'caught');
  const changedText = await one(row('shema', 'she-ma ba yis-ro-eyl', 'she-ma da yis-ro-eyl'));
  assert.equal(changedText.columns.final.state, 'hidden');
  assert.equal(changedText.columns.final.falseMarks, 1);
  const changedBoundary = await one(row('shema', 'she-ma ba yis-ro-eyl', 'she-ma yis-ro-eyl ba'));
  assert.equal(changedBoundary.columns.final.state, 'hidden');
});

test('two identical planted extras require two observed occurrences to be caught', async () => {
  const run = await score(row('shema', 'she-ma ba ba yis-ro-eyl', 'she-ma ba yis-ro-eyl'));
  const plant = run.rows[0];
  assert.equal(plant.ideal.length, 2);
  assert.equal(plant.ideal[0].key, plant.ideal[1].key);
  assert.equal(plant.columns.final.state, 'other');
  assert.equal(run.totals.columns.final.caught, 0);
  assert.equal(run.totals.columns.final.falseMarks, 0);
});

test('two identical planted extras are caught by two observed occurrences', async () => {
  const run = await score(row('shema', 'she-ma ba ba yis-ro-eyl'));
  assert.equal(run.rows[0].columns.final.state, 'caught');
  assert.equal(run.totals.columns.final.caught, 1);
  assert.equal(run.totals.columns.final.falseMarks, 0);
});

test('one planted extra with two identical observed extras is caught with one false mark', async () => {
  const run = await score(row('shema', 'she-ma ba yis-ro-eyl', 'she-ma ba ba yis-ro-eyl'));
  assert.equal(run.rows[0].columns.final.state, 'caught');
  assert.equal(run.totals.columns.final.caught, 1);
  assert.equal(run.totals.columns.final.falseMarks, 1);
  assert.equal(run.rows[0].columns.final.unexpected.length, 1);
});

test('a clean control with two identical extras has two false marks', async () => {
  const run = await score(row('shema', 'she-ma yis-ro-eyl', 'she-ma ba ba yis-ro-eyl'));
  assert.equal(run.rows[0].columns.final.state, 'clean');
  assert.equal(run.totals.columns.final.plants, 0);
  assert.equal(run.totals.columns.final.falseMarks, 2);
  assert.equal(run.rows[0].columns.final.unexpected.length, 2);
});

test('a surplus identical uncertain mark counts as unexpected uncertainty', async () => {
  const { ideal } = await one(row('shabbos', '?-bos'));
  assert.equal(ideal.length, 1);
  const result = scoreMarks(ideal, [...ideal, ...ideal]);
  assert.equal(result.state, 'caught');
  assert.equal(result.falseMarks, 0);
  assert.equal(result.uncertainMarks, 1);
  assert.equal(result.unexpected.length, 1);
});

test('final, metered and ear are scored independently against said', async () => {
  const run = await score(row('shabbos', 'shi-bos', 'shi-bos', { metered: '?-bos', ear: 'sha-bos' }));
  assert.equal(run.rows[0].columns.final.state, 'caught');
  assert.equal(run.rows[0].columns.metered.state, 'unsure');
  assert.equal(run.rows[0].columns.ear.state, 'hidden');
  assert.equal(run.totals.columns.final.caught, 1);
  assert.equal(run.totals.columns.metered.unsure, 1);
  assert.equal(run.totals.columns.ear.hidden, 1);
});

test('a preset override changes the grading and invalid presets fail even on error-only files', async () => {
  const source = row('shabbos', 'sha-bat');
  assert.equal((await score(source)).totals.columns.final.plants, 1);
  assert.equal((await score(source, { preset: 'sephardi' })).totals.columns.final.plants, 0);
  await assert.rejects(score(row('shabbos', 'sha-bos', 'ERROR'), { preset: 'unknown' }), /Unknown preset/);
});

test('empty heard cells are graded as missing words, including a present but empty metered cell', async () => {
  const run = await score(row('shabbos', 'sha-bos', '', { metered: '' }));
  assert.equal(run.totals.earErrors, 0);
  assert.equal(run.totals.columns.final.falseMarks, 3);
  assert.equal(run.totals.columns.metered.falseMarks, 3);
});

const repository = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(new URL('./score.js', import.meta.url));

function savedRuns(t, sources) {
  const directory = mkdtempSync(join(repository, '.ear-score-test-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return sources.map((source, index) => {
    const file = join(directory, `run-${index + 1}.tsv`);
    writeFileSync(file, source);
    return file;
  });
}

function cli(...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repository, encoding: 'utf8', timeout: 10000,
  });
  assert.ifError(result.error);
  return result;
}

const passing = [row('gal_clean', 'gal'), row('tal_kamatz-for-patach', 'tol')].join('\n');
const failing = [row('gal_clean', 'gal', 'gol'), row('tal_kamatz-for-patach', 'tol', 'tal')].join('\n');
const catalogue = await loadClips('adult');

function completeRound(round, overrides = {}) {
  return catalogue.filter(clip => clip.section === round)
    .map(clip => overrides[clip.name] ?? row(clip.name, clip.say)).join('\n');
}

const completePassing = completeRound('Round 1f');

for (const [name, source] of emptyRuns) {
  for (const flags of [[], ['--round', 'Round 1f']]) {
    test(`CLI exits 2 for ${name} ${flags.length ? 'with' : 'without'} --round and pass flags`, t => {
      const [file] = savedRuns(t, [source]);
      const result = cli(file, ...flags, '--max-uncertain', '0', '--runs-needed', '1');
      assert.equal(result.status, 2, result.stdout);
      assert.ok(result.stderr.includes(file));
      assert.match(result.stderr, /No rows/);
      assert.equal(result.stdout, '');
    });
  }
}

for (const truncated of ['tal_kamatz-for-patach', 'child_tal_kamatz-for-patach tol', 'child_shom_clean']) {
  for (const flags of [[], ['--round', 'Round 1f']]) {
    for (const passFlags of [[], ['--max-uncertain', '0', '--runs-needed', '1']]) {
      test(`CLI rejects truncated ${JSON.stringify(truncated)} ${flags.length ? 'with' : 'without'} --round and ${passFlags.length ? 'with' : 'without'} pass flags`, t => {
        const [file] = savedRuns(t, [['status', completePassing, truncated].join('\r\n')]);
        const result = cli(file, ...flags, ...passFlags);
        assert.equal(result.status, 2);
        assert.ok(result.stderr.includes(`${file}:15:`));
        assert.match(result.stderr, /5 tab-separated cells/);
        assert.equal(result.stdout, '');
      });
    }
  }
}

for (const flags of [[], ['--round', 'Round 1f']]) {
  for (const [name, source, missing, repeated] of [
    ['a missing clip', completePassing.split('\n').slice(0, -1).join('\n'), 'shulchon_clean', 'none'],
    ['a repeated clip', `${completePassing}\n${row('gal_clean', 'gal')}`, 'none', 'gal_clean'],
    ['a missing clip replaced by a child_ duplicate', [
      ...completePassing.split('\n').slice(0, -1), row('child_gal_clean', 'gal'),
    ].join('\n'), 'shulchon_clean', 'gal_clean'],
  ]) {
    test(`CLI fails and names ${name} ${flags.length ? 'with' : 'without'} --round only with pass flags`, t => {
      const [file] = savedRuns(t, [source]);
      const result = cli(file, ...flags, '--max-uncertain', '0', '--runs-needed', '1');
      assert.equal(result.status, 1, result.stderr);
      assert.equal(result.stderr, '');
      const fileLine = result.stdout.split('\n').find(line => line.startsWith(`${file}: `));
      assert.ok(fileLine.startsWith(`${file}: FAIL;`));
      assert.ok(fileLine.endsWith(`; missing clips: ${missing}; repeated clips: ${repeated}`));
      assert.ok(result.stdout.includes(`Round 1f: clips ${source.split('\n').length} of 13, ear errors 0`));

      const scored = cli(file, ...flags);
      assert.equal(scored.status, 0, scored.stderr);
      assert.equal(scored.stderr, '');
      assert.ok(!scored.stdout.includes(`${file}: FAIL;`));
    });
  }
}

test('a complete child_ run passes with no missing or repeated clips', t => {
  const source = completePassing.split('\n').map(line => `child_${line}`).join('\n');
  const [file] = savedRuns(t, [source]);
  const result = cli(file, '--round', 'Round 1f', '--max-uncertain', '0', '--runs-needed', '1');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`${file}: PASS;`));
  assert.match(result.stdout, /Round 1f: clips 13 of 13/);
  assert.match(result.stdout, /; missing clips: none; repeated clips: none\n/);
});

for (const complete of [true, false]) {
  test(`without --round, a ${complete ? 'complete' : 'partially complete'} two-round file ${complete ? 'passes' : 'fails'}`, t => {
    const second = completeRound('Round 1g').split('\n');
    if (!complete) second.pop();
    const [file] = savedRuns(t, [[completePassing, ...second].join('\n')]);
    const result = cli(file, '--max-uncertain', '0', '--runs-needed', '1');
    assert.equal(result.status, complete ? 0 : 1, result.stderr);
    assert.equal(result.stderr, '');
    assert.ok(result.stdout.includes(`${file}: ${complete ? 'PASS' : 'FAIL'};`));
    assert.match(result.stdout, /Round 1f: clips 13 of 13/);
    assert.ok(result.stdout.includes(`Round 1g: clips ${complete ? 13 : 12} of 13`));
    assert.ok(result.stdout.includes(`; missing clips: ${complete ? 'none' : 'suko_clean'}; repeated clips: none`));
  });
}

test('the scorer defaults to loadClips(adult) for Hebrew and round metadata', async () => {
  const run = await scoreRun(passing);
  assert.equal(run.rounds[0].round, 'Round 1f');
  assert.equal(run.totals.columns.final.plants, 1);
  assert.equal(run.totals.columns.final.caught, 1);
  assert.equal(run.totals.columns.final.falseMarks, 0);
});

test('CLI prints per-file round summaries in file order and first-appearance order', t => {
  const [first, second] = savedRuns(t, [
    [row('gal_clean', 'gal'), row('shom_clean', 'shom'), row('tal_kamatz-for-patach', 'tol')].join('\n'),
    failing,
  ]);
  const result = cli(first, second);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[0].startsWith(`${first} | Round 1f: clips 2 of 13, ear errors 0; final:`));
  assert.ok(lines[1].startsWith(`${first} | Round 1e: clips 1 of 12, ear errors 0; final:`));
  assert.ok(lines[2].startsWith(`${second} | Round 1f: clips 2 of 13, ear errors 0; final:`));
  assert.match(lines[0], /plants caught 1 of 1, hidden 0, unsure 0, other 0, false marks 0, uncertain marks 0/);
  assert.match(lines[0], /; ear: plants caught 1 of 1/);
  assert.ok(!lines[0].includes('metered:'));
  assert.ok(!result.stdout.includes('runs pass;'));
});

test('CLI reports final, metered and ear summary counts separately', t => {
  const [file] = savedRuns(t, [row('tal_kamatz-for-patach', 'tol', 'tol', { metered: '?', ear: 'tal' })]);
  const result = cli(file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /final: plants caught 1 of 1, hidden 0, unsure 0, other 0, false marks 0, uncertain marks 0/);
  assert.match(result.stdout, /metered: plants caught 0 of 1, hidden 0, unsure 1, other 0, false marks 0, uncertain marks 2/);
  assert.match(result.stdout, /ear: plants caught 0 of 1, hidden 1, unsure 0, other 0, false marks 0, uncertain marks 0/);
});

test('--detail lists final row outcomes and only nonideal marks before summaries', t => {
  const [file] = savedRuns(t, [[
    row('gal_clean', 'gal'), row('gal_clean', 'gal', 'gol'),
    row('tal_kamatz-for-patach', 'tol'), row('tal_kamatz-for-patach', 'tol', 'tal'),
    row('tal_kamatz-for-patach', 'tol', '?'), row('tal_kamatz-for-patach', 'tol', 'dol'),
    row('gal_clean', 'gal', 'ERROR'),
  ].join('\n')]);
  const result = cli('--detail', file);
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 8);
  assert.equal(lines[0], 'Round 1f\tgal_clean\tclean');
  assert.equal(lines[1], 'Round 1f\tgal_clean\tFALSE MARK\tגַּל\tגַּ\twrong_vowel');
  assert.equal(lines[2], 'Round 1f\ttal_kamatz-for-patach\tplant caught');
  assert.equal(lines[3], 'Round 1f\ttal_kamatz-for-patach\tPLANT MISSED (hidden)');
  assert.match(lines[4], /^Round 1f\ttal_kamatz-for-patach\tPLANT MISSED \(unsure\)\tטַל\tטַ\tuncertain/);
  assert.match(lines[5], /^Round 1f\ttal_kamatz-for-patach\tPLANT MISSED \(other\)/);
  assert.equal(lines[6], 'Round 1f\tgal_clean\tEAR ERROR');
  assert.ok(lines[7].startsWith(`${file} | Round 1f:`));
});

test('--detail shows uncertainty on a clean control without calling it a false mark', t => {
  const [file] = savedRuns(t, [row('gal_clean', 'gal', '?')]);
  const result = cli(file, '--detail');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^Round 1f\tgal_clean\tclean\tגַּל\tגַּ\tuncertain\tגַּל\tל\tuncertain\n/);
});

test('--round filters detail, summaries and the pass rule to the selected round', t => {
  const [file] = savedRuns(t, [[completePassing, row('shom_clean', 'shom', 'ERROR')].join('\n')]);
  const result = cli(file, '--round', 'Round 1f', '--detail', '--max-uncertain', '0', '--runs-needed', '1');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes('Round 1e'));
  assert.ok(!result.stdout.includes('shom_clean'));
  assert.match(result.stdout, /clips 13 of 13, ear errors 0/);
  assert.match(result.stdout, /Round 1f: 1 of 1 runs pass; 1 needed: PASS\n$/);
});

test('the pass rule prints a PASS and FAIL file and passes when enough files pass', t => {
  const [good, bad] = savedRuns(t, [completePassing, failing]);
  const result = cli('--max-uncertain', '0', '--runs-needed', '1', good, bad);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`${good}: PASS; clips 13, ear errors 0; final: plants caught 4 of 4`));
  assert.ok(result.stdout.includes(`${bad}: FAIL; clips 2, ear errors 0; final: plants caught 0 of 1`));
  assert.match(result.stdout, /All rounds: 1 of 2 runs pass; 1 needed: PASS\n$/);
});

test('the pass rule exits 1 when fewer than K files pass', t => {
  const files = savedRuns(t, [completePassing, failing]);
  const result = cli(...files, '--max-uncertain', '0', '--runs-needed', '2');
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /All rounds: 1 of 2 runs pass; 2 needed: FAIL\n$/);
});

for (const spelling of ['same path', 'dot component', 'symlink']) {
  for (const flags of [[], ['--max-uncertain', '0', '--runs-needed', '2']]) {
    test(`CLI rejects the same file via ${spelling} ${flags.length ? 'with' : 'without'} pass flags`, t => {
      const [file] = savedRuns(t, [completePassing]);
      let alias = file;
      if (spelling === 'dot component') alias = `${dirname(file)}/./${basename(file)}`;
      if (spelling === 'symlink') {
        alias = join(dirname(file), 'linked.tsv');
        symlinkSync(file, alias);
      }
      const result = cli(...flags, file, alias);
      assert.equal(result.status, 2, result.stdout);
      assert.ok(result.stderr.includes(`${file} and ${alias}`));
      assert.match(result.stderr, /same file/);
      assert.equal(result.stdout, '');
    });
  }
}

test('CLI checks for duplicate files before parsing any run', t => {
  const [invalid, good] = savedRuns(t, ['unknown\tx\tx\tPASS\tx', completePassing]);
  const result = cli(invalid, good, good);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes(`${good} and ${good}`));
  assert.match(result.stderr, /same file/);
  assert.equal(result.stdout, '');
});

test('two different files with identical contents count as two passing runs', t => {
  const files = savedRuns(t, [completePassing, completePassing]);
  const result = cli('--max-uncertain', '0', '--runs-needed', '2', ...files);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  for (const file of files) assert.ok(result.stdout.includes(`${file}: PASS;`));
  assert.match(result.stdout, /All rounds: 2 of 2 runs pass; 2 needed: PASS\n$/);
});

test('the uncertain cap is inclusive and the pass rule uses final only', t => {
  const [file] = savedRuns(t, [completeRound('Round 1f', {
    gal_clean: row('gal_clean', 'gal', '?', { metered: 'gol', ear: 'gol' }),
    'tal_kamatz-for-patach': row('tal_kamatz-for-patach', 'tol', 'tol', { metered: 'tal', ear: 'tal' }),
  })]);
  const accepted = cli(file, '--max-uncertain', '2', '--runs-needed', '1');
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /false marks 0, uncertain marks 2/);
  assert.match(accepted.stdout, /All rounds: 1 of 1 runs pass; 1 needed: PASS\n$/);
  const rejected = cli(file, '--max-uncertain', '1', '--runs-needed', '1');
  assert.equal(rejected.status, 1, rejected.stderr);
  assert.match(rejected.stdout, /All rounds: 0 of 1 runs pass; 1 needed: FAIL\n$/);
});

for (const [name, source, counts] of [
  ['ear error', row('gal_clean', 'gal', 'ERROR'), /ear errors 1/],
  ['hidden plant', row('tal_kamatz-for-patach', 'tol', 'tal'), /plants caught 3 of 4, hidden 1/],
  ['unsure plant', row('tal_kamatz-for-patach', 'tol', '?'), /plants caught 3 of 4, hidden 0, unsure 1/],
  ['false mark', row('gal_clean', 'gal', 'gol'), /false marks 1/],
]) {
  test(`the pass rule fails independently for an ${name}`, t => {
    const [file] = savedRuns(t, [completeRound('Round 1f', { [source.split('\t')[0]]: source })]);
    const result = cli(file, '--max-uncertain', '100', '--runs-needed', '1');
    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stdout.includes(`${file}: FAIL;`));
    assert.match(result.stdout, counts);
    assert.match(result.stdout, /; missing clips: none; repeated clips: none\n/);
  });
}

test('--preset changes CLI grading', t => {
  const [file] = savedRuns(t, [row('gal_clean', 'gal'), row('tal_kamatz-for-patach', 'tal')]);
  const result = cli('--preset', 'sephardi', file);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /final: plants caught 0 of 0/);
});

for (const [name, flags] of [
  ['one pass flag alone', ['--max-uncertain', '0']],
  ['the other pass flag alone', ['--runs-needed', '1']],
  ['K larger than the file count', ['--max-uncertain', '0', '--runs-needed', '2']],
  ['a non-numeric N', ['--max-uncertain', 'many', '--runs-needed', '1']],
  ['a negative N', ['--max-uncertain', '-1', '--runs-needed', '1']],
  ['a fractional N', ['--max-uncertain', '1.5', '--runs-needed', '1']],
  ['an unsafe integer N', ['--max-uncertain', '9007199254740992', '--runs-needed', '1']],
  ['K of zero', ['--max-uncertain', '0', '--runs-needed', '0']],
  ['a fractional K', ['--max-uncertain', '0', '--runs-needed', '1.5']],
  ['an unknown flag', ['--unknown']],
  ['a missing round value', ['--round']],
  ['a missing preset value', ['--preset']],
  ['a missing N value', ['--max-uncertain']],
  ['an invalid preset', ['--preset', 'unknown']],
  ['an unknown round', ['--round', 'Round nonexistent']],
  ['a known round absent from a file', ['--round', 'Round 1e']],
]) {
  test(`CLI exits 2 for ${name}`, t => {
    const [file] = savedRuns(t, [passing]);
    const result = cli(file, ...flags);
    assert.equal(result.status, 2, result.stdout);
    assert.notEqual(result.stderr, '');
    assert.equal(result.stdout, '');
    if (name === 'a known round absent from a file') assert.ok(result.stderr.includes(file));
  });
}

test('CLI input errors name the file and line and exit 2', t => {
  const [unknown, short] = savedRuns(t, ['status\nunknown\tx\tx\tPASS\tx', 'status\ngal_clean\tgal']);
  for (const file of [unknown, short]) {
    const result = cli(file);
    assert.equal(result.status, 2);
    assert.ok(result.stderr.includes(`${file}:2`));
    assert.equal(result.stdout, '');
  }
});

test('CLI needs at least one file and reports unreadable input as exit 2', t => {
  assert.equal(cli().status, 2);
  const [file] = savedRuns(t, [passing]);
  const result = cli(`${file}.missing`);
  assert.equal(result.status, 2);
  assert.ok(result.stderr.includes(`${file}.missing`));
});

test('--help exits 0 and describes the pass flags', () => {
  const result = cli('--help');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /--max-uncertain/);
  assert.match(result.stdout, /--runs-needed/);
  assert.equal(result.stderr, '');
});
