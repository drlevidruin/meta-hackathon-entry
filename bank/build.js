import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { cleanWord, expectedSounds, tagSkills } from '../rulebook/index.js';
import { sortedUnique } from '../rulebook/skills.js';
import { lineText, pointedWord, punctuatedPhrases, segmentWords, siddur, usableSegment } from './corpus.js';
import { beginnerLines, generatedDrills, nonsenseLines } from './generate.js';
import { mulberry32 } from './random.js';

function makeItem(level, words, focus, source) {
  const text = lineText(words);
  const hash = createHash('sha1').update(`${level}|${text}`).digest('hex').slice(0, 8);
  return {
    id: `L${level}-${hash}`, level, text, words,
    skills: sortedUnique(words.flatMap(tagSkills)), focus,
    flags: sortedUnique(words.flatMap((word) => expectedSounds(word, 'sephardi').flags)), source,
  };
}

function wordLines(section) {
  const words = [];
  const seen = new Set();
  for (const segment of section.segments.filter(usableSegment)) {
    for (const raw of segmentWords(segment)) {
      if (expectedSounds(raw, 'sephardi').flags.length) continue;
      const word = cleanWord(raw);
      if (seen.has(word)) continue;
      seen.add(word);
      words.push({ word, skills: tagSkills(word), order: words.length });
    }
  }
  const skills = sortedUnique(words.flatMap((entry) => entry.skills));
  const lines = [];
  for (const focus of skills) {
    const matching = words.filter((entry) => entry.skills.includes(focus));
    for (let start = 0; start + 4 <= matching.length; start += 4) {
      const group = matching.slice(start, start + 4);
      lines.push({ words: group.map((entry) => entry.word), focus, order: group[0].order });
    }
  }
  return lines.sort((left, right) => left.order - right.order);
}

export function cutLines(words, minimum, maximum) {
  if (words.length < minimum) return [];
  const lines = [];
  let start = 0;
  while (words.length - start > maximum) {
    const count = Math.min(maximum, words.length - start - minimum);
    lines.push(words.slice(start, start + count));
    start += count;
  }
  lines.push(words.slice(start));
  return lines;
}

export function buildBank({ seed = 5787, onShortfall = () => {} } = {}) {
  const random = mulberry32(seed);
  const drills = generatedDrills(random);
  const levels = [[], [], [], [], [], []];
  const ids = new Set();
  const wordUses = new Map();
  const add = (level, words, focus, source) => {
    if (level === 3 && words.some(word => (wordUses.get(word) ?? 0) >= 2)) return;
    const item = makeItem(level, words, focus, source);
    if (ids.has(item.id)) return;
    ids.add(item.id);
    levels[level - 1].push(item);
    if (level === 3) for (const word of words) wordUses.set(word, (wordUses.get(word) ?? 0) + 1);
  };
  for (const { words, focus } of drills.level1) add(1, words, focus, { generated: true });
  for (const { words, focus } of drills.level2) add(2, words, focus, { generated: true });
  const corpusWords = new Set(siddur.sections.flatMap((section) => section.segments.flatMap(segmentWords))
    .filter((word) => pointedWord(word)).map(cleanWord));
  const nonsense = nonsenseLines(corpusWords, random);
  for (const { words, focus } of nonsense.lines) {
    add(4, words, focus, { generated: true });
  }
  for (const { words, focus } of nonsense.challenges) {
    add(4, words, focus, { generated: true, challenge: true });
  }
  for (const section of siddur.sections) {
    const source = { section: section.id, ref: section.ref };
    for (const { words, focus } of wordLines(section)) {
      if (levels[2].length >= 80) break;
      add(3, words, focus, source);
    }
    for (const segment of section.segments.filter(usableSegment)) {
      for (const phrase of punctuatedPhrases(segment)) {
        for (const words of cutLines(phrase, 3, 5)) add(5, words, null, source);
        for (const words of cutLines(phrase, 4, 9)) add(6, words, null, source);
      }
    }
  }
  const phraseTexts = new Set(levels[4].map(item => item.text));
  levels[5] = levels[5].filter(item => !phraseTexts.has(item.text));
  const beginners = beginnerLines(mulberry32(seed + 1), corpusWords,
    levels[3].flatMap(item => item.words), levels.flat().map(item => item.text));
  for (const shortfall of beginners.shortfalls) onShortfall(shortfall);
  for (const { level, words, focus } of beginners.lines) {
    add(level, words, focus, { generated: true, beginner: true });
  }
  return levels.flat();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const items = buildBank({ onShortfall: shortfall => console.warn(JSON.stringify({ shortfall })) });
  writeFileSync(new URL('./items.json', import.meta.url), JSON.stringify(items, null, 2) + '\n');
  const counts = Object.fromEntries([1, 2, 3, 4, 5, 6].map((level) => [level,
    items.filter((item) => item.level === level).length]));
  console.log(JSON.stringify({ items: items.length, levels: counts }));
}
