import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gradeLine } from './index.js';

const usage = 'Usage: node grader/cli.js --preset ashkenazi --line "<hebrew>" --heard "sha-vos ba-ruch" [--accept-other-traditions]';

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) {
    console.log(usage);
    return 0;
  }
  try {
    const args = {};
    const options = {};
    for (let index = 0; index < argv.length; index += 1) {
      const flag = argv[index];
      if (flag === '--accept-other-traditions') options.acceptOtherTraditions = true;
      else if (['--preset', '--line', '--heard'].includes(flag)) {
        const value = argv[++index];
        if (value === undefined || value.startsWith('--')) throw new Error(usage);
        args[flag.slice(2)] = value;
      } else throw new Error(usage);
    }
    if (['preset', 'line', 'heard'].some((name) => args[name] === undefined)) throw new Error(usage);
    const heard = args.heard.trim() ? args.heard.trim().split(/\s+/u).map((word) => word.split('-')) : [];
    const result = gradeLine({ ...args, text: args.line, heard }, options);
    for (const [index, word] of result.words.entries()) {
      console.log(`${word.text}\t${word.verdict ?? 'aligned'}`);
      for (const verdict of result.verdicts.filter((entry) => entry.word === index)) {
        const tradition = verdict.otherTradition ? `\totherTradition=${verdict.otherTradition}` : '';
        console.log(`  ${verdict.pair}\t${verdict.text}\t${verdict.verdict}\theard=${verdict.heard || '(nothing)'}\texpected=${verdict.expected.join('/') || '(nothing)'}${tradition}`);
      }
    }
    console.log(JSON.stringify(result.summary));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main();
}
