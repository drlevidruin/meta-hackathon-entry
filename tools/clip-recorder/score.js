import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gradeLine } from '../../grader/index.js';
import { loadClips } from './clips.js';

const usage = [
  'Usage: npm run -s ear-score -- [--preset NAME] [--round NAME] [--detail] [--max-uncertain N --runs-needed K] FILE [FILE ...]',
  'Default preset: ashkenazi. N must be a whole number >= 0; K must be from 1 to the number of files.',
  'A run passes when final has no ear errors, every plant caught, no false marks, and at most N uncertain marks.',
].join('\n');

const wordsHeard = sounds => sounds.trim()
  ? sounds.trim().split(/\s+/u).map(word => word.split('-')) : [];

/** Parse saved runner stdout; supplying clips keeps this independent of the catalogue on disk. */
export async function parseRun(source, { file = '<input>', clips = loadClips('adult') } = {}) {
  const byName = new Map((await clips).map(clip => [clip.name, clip]));
  const rows = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.includes('\t') || line.startsWith('clip\t')) continue;
    const cells = line.split('\t');
    const at = `${file}:${index + 1}`;
    if (cells.length < 5) throw new Error(`${at}: Expected at least 5 tab-separated cells.`);
    const [name, said, heard, , ear, metered] = cells;
    const clip = byName.get(name.replace(/^child_/u, ''));
    if (!clip) throw new Error(`${at}: Unknown clip: ${name}.`);
    rows.push({
      clip: name, round: clip.section, hebrew: clip.hebrew, line: index + 1,
      said, heard, ear, ...(cells.length >= 6 ? { metered } : {}),
    });
  }
  return rows;
}

/** Stable mark locations count printed words, excluding extra heard words. */
export function marksFromGrade(result) {
  let printed = 0;
  const positions = result.words.map(word => {
    const position = printed;
    if (word.verdict !== 'extra') printed += 1;
    return position;
  });
  return result.verdicts.filter(mark => mark.verdict !== 'ok').map(mark => {
    const word = positions[mark.word];
    const location = JSON.stringify(mark.verdict === 'extra'
      ? ['extra', word, mark.text] : ['pair', word, mark.pair]);
    return {
      location, key: JSON.stringify([location, mark.verdict]),
      word, wordText: result.words[mark.word].text,
      pair: mark.pair, text: mark.text, verdict: mark.verdict,
    };
  });
}

/** Compare one column's marks with the planted reading, without changing either. */
export function scoreMarks(ideal, marks) {
  const remaining = new Map();
  for (const mark of ideal) remaining.set(mark.key, (remaining.get(mark.key) ?? 0) + 1);
  const idealLocations = new Set(ideal.map(mark => mark.location));
  const unexpected = marks.filter(mark => {
    const count = remaining.get(mark.key) ?? 0;
    if (count === 0) return true;
    remaining.set(mark.key, count - 1);
    return false;
  });
  let state = 'clean';
  if (ideal.length) {
    if ([...remaining.values()].every(count => count === 0)) state = 'caught';
    else if (marks.some(mark => mark.verdict === 'uncertain' && idealLocations.has(mark.location))) state = 'unsure';
    else if (!marks.some(mark => idealLocations.has(mark.location))) state = 'hidden';
    else state = 'other';
  }
  return {
    state, marks, unexpected,
    falseMarks: unexpected.filter(mark => mark.verdict !== 'uncertain').length,
    uncertainMarks: unexpected.filter(mark => mark.verdict === 'uncertain').length,
  };
}

export function summarizeRows(rows) {
  const names = ['final', ...(rows.some(row => Object.hasOwn(row, 'metered')) ? ['metered'] : []), 'ear'];
  const columns = Object.fromEntries(names.map(name => [name, {
    plants: 0, caught: 0, hidden: 0, unsure: 0, other: 0, falseMarks: 0, uncertainMarks: 0,
  }]));
  let earErrors = 0;
  for (const row of rows) {
    if (row.earError) {
      earErrors += 1;
      continue;
    }
    for (const [name, column] of Object.entries(row.columns)) {
      const counts = columns[name];
      if (row.ideal.length) {
        counts.plants += 1;
        counts[column.state] += 1;
      }
      counts.falseMarks += column.falseMarks;
      counts.uncertainMarks += column.uncertainMarks;
    }
  }
  return { clips: rows.length, earErrors, columns };
}

/** Score a run without the ear, audio, or any network access. */
export async function scoreRun(source, {
  file = '<input>', clips = loadClips('adult'), preset = 'ashkenazi', round,
} = {}) {
  clips = await clips;
  // Validate even if every row is an ear error (and therefore must not be graded).
  gradeLine({ text: '', heard: [], preset });
  if (round !== undefined && !clips.some(clip => clip.section === round)) {
    throw new Error(`Unknown round: ${round}.`);
  }
  const parsed = await parseRun(source, { file, clips });
  const selected = parsed.filter(row => round === undefined || row.round === round);
  if (!selected.length) {
    throw new Error(`${file}: No rows${round === undefined ? '' : ` for round: ${round}`}.`);
  }
  const rows = selected.map(row => {
    if (row.heard === 'ERROR') return { ...row, earError: true, ideal: [], columns: {} };
    try {
      const marks = sounds => marksFromGrade(gradeLine({ text: row.hebrew, heard: wordsHeard(sounds), preset }));
      const ideal = marks(row.said);
      const sounds = {
        final: row.heard, ...(Object.hasOwn(row, 'metered') ? { metered: row.metered } : {}), ear: row.ear,
      };
      const columns = Object.fromEntries(Object.entries(sounds)
        .map(([name, value]) => [name, scoreMarks(ideal, marks(value))]));
      return { ...row, earError: false, ideal, columns };
    } catch (error) {
      throw new Error(`${file}:${row.line}: ${error.message}`);
    }
  });
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.round)) groups.set(row.round, []);
    groups.get(row.round).push(row);
  }
  const rounds = [...groups].map(([round, group]) => ({ round, ...summarizeRows(group) }));
  return { file, rows, rounds, totals: summarizeRows(rows) };
}

export function parseOptions(argv) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return { help: true };
  const options = { files: [], preset: 'ashkenazi', detail: false };
  const names = new Map([
    ['--preset', 'preset'], ['--round', 'round'],
    ['--max-uncertain', 'maxUncertain'], ['--runs-needed', 'runsNeeded'],
  ]);
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--') {
      options.files.push(...argv.slice(index + 1));
      break;
    }
    if (flag === '--detail') options.detail = true;
    else if (names.has(flag)) {
      if (seen.has(flag)) throw new Error(`Repeated option: ${flag}.`);
      seen.add(flag);
      const value = argv[++index];
      if (value === undefined || !value.trim() || value.startsWith('--')) {
        throw new Error(`A value must be supplied with ${flag}.`);
      }
      options[names.get(flag)] = value;
    } else if (flag.startsWith('-')) throw new Error(`Unknown option: ${flag}.`);
    else options.files.push(flag);
  }
  if (!options.files.length) throw new Error(`At least one run file is required.\n${usage}`);
  const hasMax = options.maxUncertain !== undefined;
  const hasNeeded = options.runsNeeded !== undefined;
  if (hasMax !== hasNeeded) throw new Error('--max-uncertain and --runs-needed must be supplied together.');
  if (hasMax) {
    for (const [name, flag, minimum] of [['maxUncertain', '--max-uncertain', 0], ['runsNeeded', '--runs-needed', 1]]) {
      const value = options[name];
      if (!/^\d+$/u.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) {
        throw new Error(`${flag} must be a whole number at least ${minimum}.`);
      }
      options[name] = Number(value);
    }
    if (options.runsNeeded > options.files.length) {
      throw new Error('--runs-needed cannot exceed the number of files.');
    }
  }
  return options;
}

/** The pass rule depends only on final, over all selected rows in one file. */
export function checkPass(run, maxUncertain) {
  const { clips, earErrors, columns: { final } } = run.totals;
  return {
    clips, earErrors, plants: final.plants, caught: final.caught,
    falseMarks: final.falseMarks, uncertainMarks: final.uncertainMarks,
    pass: clips > 0 && earErrors === 0 && final.caught === final.plants
      && final.falseMarks === 0 && final.uncertainMarks <= maxUncertain,
  };
}

function formatCounts(counts) {
  return `plants caught ${counts.caught} of ${counts.plants}, hidden ${counts.hidden}, unsure ${counts.unsure}, other ${counts.other}, false marks ${counts.falseMarks}, uncertain marks ${counts.uncertainMarks}`;
}

export function formatSummary(file, summary) {
  const columns = Object.entries(summary.columns).map(([name, counts]) => `${name}: ${formatCounts(counts)}`);
  return `${file} | ${summary.round}: clips ${summary.clips}, ear errors ${summary.earErrors}; ${columns.join('; ')}`;
}

export function formatDetail(row) {
  if (row.earError) return `${row.round}\t${row.clip}\tEAR ERROR`;
  const column = row.columns.final;
  const label = row.ideal.length
    ? column.state === 'caught' ? 'plant caught' : `PLANT MISSED (${column.state})`
    : column.falseMarks ? 'FALSE MARK' : 'clean';
  return [row.round, row.clip, label,
    ...column.unexpected.flatMap(mark => [mark.wordText, mark.text, mark.verdict]),
  ].join('\t');
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const options = parseOptions(argv);
    if (options.help) {
      console.log(usage);
      return 0;
    }
    const clips = await loadClips('adult');
    const runs = [];
    for (const file of options.files) {
      const source = await readFile(file, 'utf8');
      runs.push(await scoreRun(source, { ...options, clips, file }));
    }
    let passed = 0;
    for (const run of runs) {
      if (options.detail) for (const row of run.rows) console.log(formatDetail(row));
      for (const summary of run.rounds) console.log(formatSummary(run.file, summary));
      if (options.runsNeeded !== undefined) {
        const result = checkPass(run, options.maxUncertain);
        if (result.pass) passed += 1;
        console.log(`${run.file}: ${result.pass ? 'PASS' : 'FAIL'}; clips ${result.clips}, ear errors ${result.earErrors}; final: ${formatCounts(run.totals.columns.final)}`);
      }
    }
    if (options.runsNeeded === undefined) return 0;
    const pass = passed >= options.runsNeeded;
    console.log(`${options.round ?? 'All rounds'}: ${passed} of ${runs.length} runs pass; ${options.runsNeeded} needed: ${pass ? 'PASS' : 'FAIL'}`);
    return pass ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
