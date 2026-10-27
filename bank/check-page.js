import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { expectedSounds, formatPairs, formatReading, PRESETS } from '../rulebook/index.js';
import { segmentWords, siddur, usableSegments } from './corpus.js';

function hasAlternatives(result) {
  return result.pairs.some((pair) => pair.sounds.length > 1);
}

function readingCell(result) {
  const display = (reading) => formatReading(reading)
    + (hasAlternatives(reading) ? ` (${formatPairs(reading)})` : '');
  if (result.substitute || !result.pairs.length) return result.readings.map(display).join(' / ');
  return [display(result), ...(result.readings ?? []).map(display)].join(' / ');
}

export function checkPage(sectionId) {
  const section = siddur.sections.find((entry) => entry.id === sectionId);
  if (!section) throw new RangeError(`Unknown section: ${sectionId}`);
  const lines = [
    `# ${section.title}`, '', `[${section.ref}](${section.url})`, '',
    '| # | Word | Sephardi | Ashkenazi | Chassidish | Flags |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  let number = 0;
  for (const segment of usableSegments(section)) {
    for (const word of segmentWords(segment)) {
      const results = Object.keys(PRESETS).map((preset) => expectedSounds(word, preset));
      const cells = [++number, word, ...results.map(readingCell), results[0].flags.join(', ') || '-'];
      lines.push(`| ${cells.join(' | ')} |`);
    }
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sectionId = process.argv[2];
  if (!sectionId) {
    console.error('Usage: npm run check:page -- <section>');
    process.exit(1);
  }
  const page = checkPage(sectionId);
  const directory = new URL('../docs/check/', import.meta.url);
  mkdirSync(directory, { recursive: true });
  writeFileSync(new URL(`${sectionId}.md`, directory), page);
  console.log(`Wrote docs/check/${sectionId}.md`);
}
