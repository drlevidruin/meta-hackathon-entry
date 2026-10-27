import { readFile } from 'node:fs/promises';

const tableURL = new URL('../../docs/ear-test.md', import.meta.url);

export function checkSet(set) {
  if (!['adult', 'child'].includes(set)) throw new Error('Set must be adult or child.');
  return set;
}

export function parseClips(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Round 1\b/.test(line));
  if (start === -1) throw new Error('Round 1 clip table is missing.');
  const section = lines.slice(start + 1);
  const end = section.findIndex((line) => /^##\s/.test(line));
  const rows = (end === -1 ? section : section.slice(0, end))
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()));
  const header = rows.findIndex((row) => row[0] === 'File name');
  const columns = ['File name', 'Hebrew', 'Say', 'Planted'];
  if (header === -1 || columns.some((column, index) => rows[header][index] !== column)) {
    throw new Error('Round 1 clip table has invalid columns.');
  }
  const clips = rows.slice(header + 1)
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map(([name, hebrew, say, planted]) => {
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(name) || name.startsWith('child_')
        || !hebrew || !say || !planted) throw new Error('Invalid Round 1 clip row.');
      return { name, hebrew, say, planted };
    });
  if (!clips.length || new Set(clips.map((clip) => clip.name)).size !== clips.length) {
    throw new Error('Round 1 clip names must be present and unique.');
  }
  return clips;
}

export async function loadClips(set = 'adult') {
  checkSet(set);
  return parseClips(await readFile(tableURL, 'utf8')).map((clip) => ({
    ...clip, name: `${set === 'child' ? 'child_' : ''}${clip.name}`,
  }));
}

export function isClipName(name, clips) {
  return typeof name === 'string' && clips.some((clip) => clip.name === name);
}
