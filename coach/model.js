// The prompt receives only bank identifiers, skill identifiers and sound strings.
const identifier = /^[A-Za-z0-9_-]+$/;
const skillId = /^(letter|vowel|pattern|contrast):[a-z0-9_:-]+$/;
const safeSkills = skills => skills.filter(skill => skillId.test(skill));
const sound = value => {
  if (Array.isArray(value)) return value.map(sound).join('/');
  if (value == null || value === '') return '?';
  return typeof value === 'string' && /^[a-z?]+(?:[ /-][a-z?]+)*$/.test(value) ? value : '?';
};

function promptFor(profile, results, rule, levels, candidates) {
  const weak = Object.entries(profile.skills)
    .map(([id, record]) => [id, record.recent.reduce((sum, mark) => sum + mark, 0)])
    .filter(([id, count]) => skillId.test(id) && count > 0)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const pairs = results.flatMap(result => result.verdicts || [])
    .filter(verdict => verdict.verdict !== 'ok').slice(-12)
    .map(verdict => `${sound(verdict.expected)} -> ${sound(verdict.heard)} | ${safeSkills(verdict.skills || []).join(', ')}`);
  return [
    'Reason like a kriah teacher: find the skill behind the mistakes, not just the letter.',
    'Pick two or three unique regular lines at one allowed level, using only candidate ids.',
    'Return exactly two lines, with no other text:',
    'ids: <id>, <id>, <id>',
    'reason: <one sentence>',
    `Current level: ${profile.level}`,
    `Allowed levels: ${levels.join(', ')}`,
    `Rule pick: ${rule.itemIds.filter(id => candidates.some(item => item.id === id)).join(', ')}`,
    `Rule reason: ${rule.reason}`,
    `Weak skills with recent miss counts: ${weak.map(([id, count]) => `${id} ${count}`).join(', ') || 'none'}`,
    `Proven skills: ${safeSkills(profile.proven).sort().join(', ') || 'none'}`,
    'Recent missed pairs (expected sounds -> heard sounds | skills):',
    ...pairs,
    'Candidates (id | level | focus | skills):',
    ...candidates.map(item => `${item.id} | ${item.level} | ${item.focus || 'none'} | ${item.skills.join(', ')}`),
  ].join('\n');
}

export async function modelPick(profile, results, rule, levels, candidates, fetcher = globalThis.fetch) {
  // Omit malformed metadata rather than forwarding arbitrary text into a prompt.
  candidates = candidates.filter(item => identifier.test(item.id) &&
    (!item.focus || skillId.test(item.focus)) && item.skills.every(skill => skillId.test(skill)));
  if (candidates.length < 2) return null;
  const controller = new AbortController();
  let timer;
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, 20_000);
    });
    const request = async () => {
      const response = await fetcher('https://api.meta.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.META_API_KEY}` },
        body: JSON.stringify({
          model: 'muse-spark-1.3', max_tokens: 2000, temperature: 0,
          messages: [{ role: 'user', content: promptFor(profile, results, rule, levels, candidates) }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = await response.json();
      const raw = payload?.choices?.[0]?.message?.content;
      if (typeof raw !== 'string') return null;
      const match = /^ids: ([^\r\n]+)\r?\nreason: ([^\r\n]+)$/.exec(raw.trim());
      if (!match || !match[2].trim()) return null;
      const itemIds = match[1].split(',').map(id => id.trim());
      if (itemIds.length < 2 || itemIds.length > 3 || new Set(itemIds).size !== itemIds.length) return null;
      const selected = itemIds.map(id => candidates.find(item => item.id === id));
      if (selected.some(item => !item)) return null;
      const level = selected[0].level;
      if (!levels.includes(level) || selected.some(item => item.level !== level)) return null;
      return { itemIds, level, reason: match[2].trim() };
    };
    return await Promise.race([request(), timeout]);
  } catch {
    // Never return or log provider errors: they may contain authorization data.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
