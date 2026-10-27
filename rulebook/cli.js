import { pathToFileURL } from 'node:url';
import { expectedSounds, formatReading, splitWords, PRESETS } from './index.js';

export function readingRows(line) {
  return splitWords(line).map(({ word, maqaf }) => {
    const results = Object.keys(PRESETS).map((preset) => expectedSounds(word + (maqaf ? '־' : ''), preset));
    return [word, ...results.map(formatReading), results[0].flags.join(', ') || '-'].join('\t');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(readingRows(process.argv.slice(2).join(' ')).join('\n'));
}
