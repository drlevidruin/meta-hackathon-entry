import { readdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { listen } from './hear.js';

const supported = new Set(['.wav', '.mp3', '.flac', '.ogg', '.m4a']);
const usage = 'Usage: node ear/cli.js <folder or files> [--model primary|fallback] [--json out.json]';

function argumentsFor(argv) {
  const inputs = [];
  const options = {};
  let json;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--model') {
      options.model = argv[++index];
      if (!['primary', 'fallback'].includes(options.model)) {
        throw new Error('Model must be primary or fallback.');
      }
    } else if (argument === '--json') {
      json = argv[++index];
      if (!json || json.startsWith('--')) throw new Error('The JSON output path is required.');
    } else if (argument.startsWith('-')) {
      throw new Error(usage);
    } else {
      inputs.push(resolve(argument));
    }
  }
  if (!inputs.length) throw new Error(usage);
  return { inputs, options, json };
}

async function collect(inputs) {
  const files = new Map();
  for (const path of inputs) {
    try {
      const info = await stat(path);
      if (info.isDirectory()) {
        const entries = (await readdir(path, { withFileTypes: true }))
          .filter((entry) => entry.isFile() && supported.has(extname(entry.name).toLowerCase()));
        if (!entries.length) files.set(path, { path, error: 'No supported audio files found.' });
        for (const entry of entries) {
          const file = join(path, entry.name);
          files.set(file, { path: file });
        }
      } else if (info.isFile() && supported.has(extname(path).toLowerCase())) {
        files.set(path, { path });
      } else {
        files.set(path, { path, error: 'Unsupported audio file.' });
      }
    } catch {
      files.set(path, { path, error: 'Could not read the input.' });
    }
  }
  return [...files.values()].sort((a, b) => (
    basename(a.path).localeCompare(basename(b.path)) || a.path.localeCompare(b.path)
  ));
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    console.log(usage);
    return 0;
  }

  let args;
  try {
    args = argumentsFor(argv);
  } catch (error) {
    console.error(error.message);
    return 1;
  }

  const results = [];
  let failed = false;
  for (const entry of await collect(args.inputs)) {
    const file = basename(entry.path);
    try {
      if (entry.error) throw new Error(entry.error);
      const result = await listen({ path: entry.path }, args.options);
      results.push({ file, ...result });
      const words = result.words.map((syllables) => syllables.join('-')).join(' ');
      console.log(`${file}\t${result.model}\t${words}`);
    } catch (error) {
      failed = true;
      results.push({ file, error: error.message });
      console.error(`${file}: ${error.message}`);
    }
  }

  if (args.json) {
    try {
      await writeFile(args.json, `${JSON.stringify(results, null, 2)}\n`);
    } catch {
      failed = true;
      console.error('Could not write the JSON output.');
    }
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
