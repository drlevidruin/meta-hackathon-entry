import { readFile } from 'node:fs/promises';

const tableURL = new URL('../../docs/ear-test.md', import.meta.url);

export function checkSet(set) {
  if (!['adult', 'child'].includes(set)) throw new Error('Set must be adult or child.');
  return set;
}

export function parseClips(markdown, section = 'Round 1') {
  const lines = markdown.split(/\r?\n/);
  const heading = new RegExp(`^##\\s+${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const start = lines.findIndex((line) => heading.test(line));
  if (start === -1) throw new Error(`${section} clip table is missing.`);
  const content = lines.slice(start + 1);
  const end = content.findIndex((line) => /^##\s/.test(line));
  const rows = (end === -1 ? content : content.slice(0, end))
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const header = rows.findIndex((row) => row[0] === 'File name');
  const columns = ['File name', 'Hebrew', 'Say', 'Planted'];
  if (header === -1 || columns.some((column, index) => rows[header][index] !== column)) {
    throw new Error(`${section} clip table has invalid columns.`);
  }
  const clips = rows.slice(header + 1)
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map(([name, hebrew, say, planted]) => {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || name.startsWith('child_')
        || !hebrew || !say || !planted) throw new Error(`Invalid ${section} clip row.`);
      return { name, hebrew, say, planted };
    });
  if (!clips.length || new Set(clips.map((clip) => clip.name)).size !== clips.length) {
    throw new Error(`${section} clip names must be present and unique.`);
  }
  return clips;
}

export async function loadClips(set = 'adult') {
  checkSet(set);
  const markdown = await readFile(tableURL, 'utf8');
  const clips = [
    ['Voice check', 'voice'],
    ['Round 1b', 'reading', 'voice-check'],
    ['Round 1c', 'reading', 'voice-check'],
    ['Card tests', 'card', 'voice-check'],
    ['Sheva tests', 'card', 'voice-check'],
    ['Round 1d', 'reading', 'voice-check'],
    ['Round 1e', 'reading', 'voice-check'],
    ['Voice check 2', 'voice'],
    ['Round 1f', 'reading', 'voice-check-2'],
    ['Round 1g', 'reading', 'voice-check-2'],
    ['Round 1h', 'reading', 'voice-check-2'],
    ['Voice check 3', 'voice'],
    ['Voice check 4', 'voice'],
    ['Round 1i', 'reading', 'voice-check-4'],
    ['Round 1j', 'reading', 'voice-check-4'],
    ['Voice check 5', 'voice'],
    ['Round 1k', 'reading', 'voice-check-5'],
    ['Round 1', 'reading', 'voice-check'],
  ].flatMap(([section, kind, card]) => parseClips(markdown, section)
    .map((clip) => ({ ...clip, kind, section, ...(card ? { card } : {}) })));
  if (new Set(clips.map((clip) => clip.name)).size !== clips.length) {
    throw new Error('Clip names must be unique across sections.');
  }
  return clips.map((clip) => ({
    ...clip, name: `${set === 'child' ? 'child_' : ''}${clip.name}`,
    ...(clip.card ? { card: `${set === 'child' ? 'child_' : ''}${clip.card}` } : {}),
  }));
}

export function isClipName(name, clips) {
  return typeof name === 'string' && clips.some((clip) => clip.name === name);
}
