import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSONANTS, VOWELS, tokenize } from './alphabet.js';
import { main } from './cli.js';
import { loadEnv } from './env.js';
import { hear, listen } from './hear.js';
import { looksLikeProse, parseEarOutput } from './parse.js';

const PRIMARY = 'meta-models/muse-spark-open-1026';
const FALLBACK = 'muse-wonder-1.0';
const primaryKey = 'offline-primary-placeholder';
const fallbackKey = 'offline-fallback-placeholder';
const audio = { data: Buffer.from('offline audio fixture'), format: 'wav' };

function setKeys(t, primary = primaryKey, fallback = fallbackKey) {
  const values = { BASETEN_API_KEY: primary, META_API_KEY: fallback };
  for (const [name, value] of Object.entries(values)) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function answer(raw = 'sha-bos\nba-ruch', extra = {}) {
  return Response.json({
    choices: [{ message: { content: raw, reasoning_content: 'ignore this completely' } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    ...extra,
  });
}

function safeError(error) {
  assert.ok(error instanceof Error);
  const rendered = String(error.stack);
  for (const value of [primaryKey, fallbackKey, 'Authorization', 'Bearer']) {
    assert.ok(!rendered.includes(value));
  }
  assert.equal(error.cause, undefined);
  return true;
}

async function fixtureDirectory(t) {
  const directory = fs.mkdtempSync(join(os.tmpdir(), 'kriah-ear-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('ear fixtures use the system temp folder and remove their files', async () => {
  let cleanup;
  const directory = await fixtureDirectory({ after: callback => { cleanup = callback; } });
  try {
    assert.equal(fs.realpathSync(join(directory, '..')), fs.realpathSync(os.tmpdir()));
    await writeFile(join(directory, 'clip.wav'), audio.data);
  } finally {
    await cleanup();
  }
  assert.equal(fs.existsSync(directory), false);
});

for (const raw of ["I can't hear audio.", 'No speech detected', 'Sorry.', "\"I can't hear audio.\"", 'sha,bos', 'sha.bos', 'No Speech Detected', '1. sha-vos.']) {
  test(`prose characters fail the ear call: ${raw}`, async t => {
    setKeys(t);
    assert.equal(looksLikeProse(raw), true);
    let calls = 0;
    await assert.rejects(listen(audio, { model: 'fallback', fetch: async () => {
      calls++;
      return answer(raw);
    } }), /answered in prose/);
    assert.equal(calls, 2);
  });
}

test('sound lines and their outer wrappers are not prose', async t => {
  setKeys(t);
  for (const raw of ['sha-vos\nba-ruch\n?', '"sha-vos"', "'sha-vos'", '`sha-vos`', '```\nsha-vos\n```', '“sha-vos”', '‘sha-vos’']) {
    assert.equal(looksLikeProse(raw), false);
    assert.deepEqual((await listen(audio, { model: 'fallback', fetch: async () => answer(raw) })).words, parseEarOutput(raw));
  }
  assert.equal(looksLikeProse('sha/va - ?\r\nni i'), false);
});

test('formats the parser accepts are readings, not prose', () => {
  // Capitals are a reading when every syllable is a real sound. A stray letter
  // outside the alphabet stays one uncertain syllable instead of failing the call.
  for (const raw of ['Sha-vos', 'SHA-BOS', 'Sha-vos\nBa-ruch', '1. sha-vos\n2. ba-ruch', '- sha-vos\n- ba-ruch',
    'Sounds:\nsha-vos', 'Here is what I heard:\nsha-vos', '"sha" "vos"', 'sha-wos']) {
    assert.equal(looksLikeProse(raw), false, raw);
  }
});

test('tokenize covers the exact alphabet and valid syllables', () => {
  for (const sound of [...CONSONANTS, ...VOWELS]) assert.deepEqual(tokenize(sound), [sound]);
  assert.deepEqual(tokenize('sha'), ['sh', 'a']);
  assert.deepEqual(tokenize('bos'), ['b', 'o', 's']);
  assert.deepEqual(tokenize('ruch'), ['r', 'u', 'ch']);
  assert.deepEqual(tokenize('ach'), ['a', 'ch']);
});

test('tokenize matches consonant pairs and diphthongs greedily', () => {
  assert.deepEqual(tokenize('tza'), ['tz', 'a']);
  assert.deepEqual(tokenize('chey'), ['ch', 'ey']);
  assert.deepEqual(tokenize('shoy'), ['sh', 'oy']);
  assert.deepEqual(tokenize('tzchshoyey'), ['tz', 'ch', 'sh', 'oy', 'ey']);
});

test('tokenize rejects unsupported characters and accepts a standalone question mark', () => {
  for (const invalid of ['c', 'w', 'q', 'x', 'j', 'ba!', 'ש', 'Ba', 'a?', '?a', '', 'ba-ra', null]) {
    assert.equal(tokenize(invalid), null);
  }
  assert.deepEqual(tokenize('?'), ['?']);
});

test('parse clean output and lowercase it', () => {
  assert.deepEqual(parseEarOutput(' SHA-BOS\r\nBa-Ruch\nru-ach '), [
    ['sha', 'bos'], ['ba', 'ruch'], ['ru', 'ach'],
  ]);
});

test('parse numbered and bulleted lists with wrapping quotes or backticks', () => {
  assert.deepEqual(parseEarOutput('1. "sha-bos"\n2) `ba-ruch`\n- ru-ach\n* tza\n• chey'), [
    ['sha', 'bos'], ['ba', 'ruch'], ['ru', 'ach'], ['tza'], ['chey'],
  ]);
  assert.deepEqual(parseEarOutput('"sha-bos"\n"ba-ruch"'), [['sha', 'bos'], ['ba', 'ruch']]);
  assert.deepEqual(parseEarOutput("'sha-bos' 'ba-ruch'"), [['sha', 'bos'], ['ba', 'ruch']]);
  assert.deepEqual(parseEarOutput('```\nsha-bos\nba-ruch\n```'), [['sha', 'bos'], ['ba', 'ruch']]);
});

test('parse drops a leading preamble after blank lines and list markers', () => {
  for (const preamble of ['Sounds:', 'Here is what I heard', 'Here is what I heard:', 'Here are the sounds:']) {
    assert.deepEqual(parseEarOutput(`\n  ${preamble}\nsha-bos\n`), [['sha', 'bos']]);
  }
  assert.deepEqual(parseEarOutput('1. "Sounds:"\n2. sha-bos'), [['sha', 'bos']]);
});

test('parse replaces an English word outside the sound alphabet with a question mark', () => {
  assert.deepEqual(parseEarOutput('sha-bos\nunclear\nba-ruch'), [
    ['sha', 'bos'], ['?'], ['ba', 'ruch'],
  ]);
});

test('parse splits words on spaces and preserves uncertain syllables', () => {
  assert.deepEqual(parseEarOutput('sha-? ba-ruch\n?\n?-?\n'), [
    ['sha', '?'], ['ba', 'ruch'], ['?'], ['?', '?'],
  ]);
});

test('parse collapses hyphens, drops empty syllables and blank lines', () => {
  assert.deepEqual(parseEarOutput('\n\n --sha---bos-- \n\n - \n\tba--ruch-\n'), [
    ['sha', 'bos'], ['ba', 'ruch'],
  ]);
  assert.deepEqual(parseEarOutput(' \n\t\n'), []);
  assert.deepEqual(parseEarOutput('Sounds:'), []);
});

test('listen sends the exact primary request and returns only content as the answer', async (t) => {
  setKeys(t);
  const calls = [];
  const result = await listen(audio, { fetch: async (url, init) => {
    calls.push({ url, init });
    return answer();
  } });
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, 'https://inference.baseten.co/v1/chat/completions');
  assert.equal(init.method, 'POST');
  assert.deepEqual(init.headers, {
    'Content-Type': 'application/json', Authorization: `Bearer ${primaryKey}`,
  });
  assert.ok(init.signal instanceof AbortSignal);
  const prompt = await readFile(new URL('./prompt.md', import.meta.url), 'utf8');
  assert.deepEqual(JSON.parse(init.body), {
    model: PRIMARY,
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'audio_url', audio_url: { url: `data:audio/wav;base64,${audio.data.toString('base64')}` } },
    ] }],
    max_tokens: 8192,
    temperature: 0,
  });
  assert.deepEqual(result, {
    words: [['sha', 'bos'], ['ba', 'ruch']],
    model: PRIMARY,
    raw: 'sha-bos\nba-ruch',
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });
});

test('listen uses the MIME type for each supported buffer format', async (t) => {
  setKeys(t);
  for (const [format, mime] of Object.entries({
    wav: 'wav', mp3: 'mpeg', flac: 'flac', ogg: 'ogg', m4a: 'mp4',
  })) {
    await listen({ data: audio.data, format }, { fetch: async (_url, init) => {
      const part = JSON.parse(init.body).messages[0].content[1];
      assert.equal(part.audio_url.url, `data:audio/${mime};base64,${audio.data.toString('base64')}`);
      return answer();
    } });
  }
});

test('listen accepts a file path and detects its format case insensitively', async (t) => {
  setKeys(t);
  const directory = await fixtureDirectory(t);
  const path = join(directory, 'clip.MP3');
  await writeFile(path, audio.data);
  await listen({ path }, { fetch: async (_url, init) => {
    const part = JSON.parse(init.body).messages[0].content[1];
    assert.equal(part.audio_url.url, `data:audio/mpeg;base64,${audio.data.toString('base64')}`);
    return answer();
  } });
});

test('listen rejects unsupported or mixed audio inputs before fetch', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return answer(); };
  for (const invalid of [
    null, 'clip.wav', {}, { path: '' }, { path: 'clip.txt' },
    { data: new Uint8Array(2), format: 'wav' }, { data: audio.data },
    { data: audio.data, format: 'aac' }, { data: audio.data, format: 'toString' },
    { path: 'clip.wav', data: audio.data, format: 'wav' },
  ]) {
    await assert.rejects(listen(invalid, { fetch }), safeError);
  }
  assert.equal(calls, 0);
});

test('listen rejects buffers and files over 25 MB without fetching', async (t) => {
  const directory = await fixtureDirectory(t);
  const path = join(directory, 'large.wav');
  const file = await open(path, 'w');
  try {
    await file.truncate(25 * 1024 * 1024 + 1);
  } finally {
    await file.close();
  }
  let calls = 0;
  const fetch = async () => { calls += 1; return answer(); };
  for (const invalid of [
    { path }, { data: Buffer.alloc(25 * 1024 * 1024 + 1), format: 'wav' },
  ]) {
    await assert.rejects(listen(invalid, { fetch }), /25 MB/);
  }
  assert.equal(calls, 0);
});

test('listen sanitizes file read errors', async (t) => {
  const directory = await fixtureDirectory(t);
  await assert.rejects(listen({ path: join(directory, `${primaryKey}.wav`) }), safeError);
});

test('listen goes directly to fallback when the primary key is missing', async (t) => {
  setKeys(t, undefined);
  delete process.env.BASETEN_API_KEY;
  const calls = [];
  const result = await listen(audio, { fetch: async (url, init) => {
    calls.push({ url, init });
    return answer();
  } });
  assert.equal(result.model, FALLBACK);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.meta.ai/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].init.body).model, FALLBACK);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${fallbackKey}`);
});

test('listen falls back after a primary 500', async (t) => {
  setKeys(t);
  const models = [];
  const result = await listen(audio, { fetch: async (_url, init) => {
    const model = JSON.parse(init.body).model;
    models.push(model);
    return model === PRIMARY ? new Response('provider error', { status: 500 }) : answer();
  } });
  assert.deepEqual(models, [PRIMARY, FALLBACK]);
  assert.equal(result.model, FALLBACK);
});

test('listen falls back after network errors, empty content, or malformed replies', async (t) => {
  setKeys(t);
  const failures = [
    () => { throw new Error(`Authorization: Bearer ${primaryKey}`); },
    () => answer(''),
    () => answer(' \n '),
    () => answer(null),
    () => Response.json({ choices: [{ message: { reasoning_content: 'sha-bos' } }] }),
    () => new Response('invalid json'),
  ];
  for (const fail of failures) {
    let calls = 0;
    const result = await listen(audio, { fetch: async () => (++calls === 1 ? fail() : answer()) });
    assert.equal(calls, 2);
    assert.equal(result.model, FALLBACK);
  }
});

test('listen throws a credential-safe error when both providers fail', async (t) => {
  setKeys(t);
  let calls = 0;
  await assert.rejects(listen(audio, { fetch: async (_url, init) => {
    calls += 1;
    throw new Error(`Authorization: ${init.headers.Authorization}; ${primaryKey}; ${fallbackKey}`);
  } }), safeError);
  assert.equal(calls, 2);
});

test('listen does not fetch when both keys are missing', async (t) => {
  setKeys(t);
  delete process.env.BASETEN_API_KEY;
  delete process.env.META_API_KEY;
  let calls = 0;
  await assert.rejects(listen(audio, { fetch: async () => { calls += 1; return answer(); } }), safeError);
  assert.equal(calls, 0);
});

test('listen honors each forced model without trying the other provider', async (t) => {
  setKeys(t);
  for (const [model, id] of [['primary', PRIMARY], ['fallback', FALLBACK]]) {
    let calls = 0;
    const result = await listen(audio, { model, fetch: async (_url, init) => {
      calls += 1;
      assert.equal(JSON.parse(init.body).model, id);
      return answer();
    } });
    assert.equal(calls, 1);
    assert.equal(result.model, id);
    calls = 0;
    await assert.rejects(listen(audio, { model, fetch: async () => {
      calls += 1;
      return new Response('', { status: 500 });
    } }), safeError);
    assert.equal(calls, 1);
  }
});

test('a forced model with a missing key fails without using the other key', async (t) => {
  setKeys(t);
  delete process.env.BASETEN_API_KEY;
  let calls = 0;
  await assert.rejects(listen(audio, { model: 'primary', fetch: async () => {
    calls += 1;
    return answer();
  } }), safeError);
  assert.equal(calls, 0);
});

test('listen rejects an unsupported model option', async () => {
  await assert.rejects(listen(audio, { model: 'other' }), /primary or fallback/);
});

test('listen aborts each timed-out call after 120 seconds and tries fallback', async (t) => {
  setKeys(t);
  const realSetTimeout = globalThis.setTimeout;
  const durations = [];
  t.mock.method(globalThis, 'setTimeout', (callback, duration) => {
    durations.push(duration);
    const handle = realSetTimeout(callback, duration);
    queueMicrotask(callback);
    return handle;
  });
  const signals = [];
  await assert.rejects(listen(audio, { fetch: async (_url, init) => {
    signals.push(init.signal);
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error(primaryKey)), { once: true });
    });
  } }), safeError);
  assert.deepEqual(durations, [120_000, 120_000]);
  assert.equal(signals.length, 2);
  assert.notEqual(signals[0], signals[1]);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('hear returns only the words from listen', async (t) => {
  setKeys(t);
  assert.deepEqual(await hear(audio, { fetch: async () => answer() }), [['sha', 'bos'], ['ba', 'ruch']]);
});

test('env loads KEY=VALUE lines without replacing existing values', async (t) => {
  const directory = await fixtureDirectory(t);
  const path = join(directory, '.env');
  const names = ['EAR_TEST_NEW', 'EAR_TEST_EXISTING', 'EAR_TEST_EMPTY', 'EAR_TEST_QUOTED'];
  for (const name of names) {
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    delete process.env[name];
  }
  process.env.EAR_TEST_EXISTING = '';
  await writeFile(path, [
    '# comment', 'EAR_TEST_NEW=first=second', 'EAR_TEST_NEW=ignored',
    ' EAR_TEST_EXISTING=replacement ', 'EAR_TEST_EMPTY=', 'EAR_TEST_QUOTED="spaced value"',
    'invalid line', '1INVALID=ignored', '',
  ].join('\r\n'));
  const logs = t.mock.method(console, 'log', () => {});
  const errors = t.mock.method(console, 'error', () => {});
  loadEnv(path);
  assert.equal(process.env.EAR_TEST_NEW, 'first=second');
  assert.equal(process.env.EAR_TEST_EXISTING, '');
  assert.equal(process.env.EAR_TEST_EMPTY, '');
  assert.equal(process.env.EAR_TEST_QUOTED, 'spaced value');
  assert.equal(logs.mock.callCount(), 0);
  assert.equal(errors.mock.callCount(), 0);
  assert.doesNotThrow(() => loadEnv(join(directory, 'missing.env')));
});

test('CLI sorts audio files, skips subfolders, keeps going, and writes JSON results', async (t) => {
  setKeys(t);
  const directory = await fixtureDirectory(t);
  for (const name of ['c.flac', 'a.wav', 'b.mp3', 'notes.txt']) {
    await writeFile(join(directory, name), audio.data);
  }
  await mkdir(join(directory, 'private'));
  await writeFile(join(directory, 'private', 'private.wav'), audio.data);
  const logs = [];
  const errors = [];
  t.mock.method(console, 'log', (line) => logs.push(line));
  t.mock.method(console, 'error', (line) => errors.push(line));
  const mimes = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const part = JSON.parse(init.body).messages[0].content[1];
    const url = part.audio_url
      ? part.audio_url.url
      : `data:audio/${part.input_audio.format === 'mp3' ? 'mpeg' : part.input_audio.format};`;
    mimes.push(url.split(';')[0]);
    if (url.startsWith('data:audio/mpeg;')) throw new Error(`Authorization: ${primaryKey}`);
    return answer();
  });
  const output = join(directory, 'out.json');
  assert.equal(await main([directory, '--json', output]), 1);
  assert.deepEqual(mimes, ['data:audio/wav', 'data:audio/mpeg', 'data:audio/mpeg', 'data:audio/flac']);
  assert.deepEqual(logs, [`a.wav\t${PRIMARY}\tsha-bos ba-ruch`, `c.flac\t${PRIMARY}\tsha-bos ba-ruch`]);
  assert.deepEqual(errors, ['b.mp3: No ear model returned an answer (primary: network error; fallback: network error).']);
  const results = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(results.map((result) => result.file), ['a.wav', 'b.mp3', 'c.flac']);
  assert.equal(results[0].model, PRIMARY);
  assert.deepEqual(results[0].words, [['sha', 'bos'], ['ba', 'ruch']]);
  assert.equal(results[1].error, 'No ear model returned an answer (primary: network error; fallback: network error).');
});

test('CLI accepts explicit files and a forced fallback model', async (t) => {
  setKeys(t);
  const directory = await fixtureDirectory(t);
  const path = join(directory, 'clip.ogg');
  await writeFile(path, audio.data);
  const logs = [];
  t.mock.method(console, 'log', (line) => logs.push(line));
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.equal(JSON.parse(init.body).model, FALLBACK);
    return answer();
  });
  assert.equal(await main([path, '--model', 'fallback']), 0);
  assert.deepEqual(logs, [`clip.ogg\t${FALLBACK}\tsha-bos ba-ruch`]);
});

test('CLI reports invalid arguments, missing inputs, and JSON write failures', async (t) => {
  const directory = await fixtureDirectory(t);
  const errors = [];
  t.mock.method(console, 'error', (line) => errors.push(line));
  for (const args of [[], ['--model', 'other'], ['--json'], [join(directory, 'missing.wav')]]) {
    assert.equal(await main(args), 1);
  }
  assert.equal(await main([directory, '--json', directory]), 1);
  assert.ok(errors.includes('Could not write the JSON output.'));
});

test('the Meta fallback sends input_audio, Baseten sends audio_url', async (t) => {
  const audio = { data: Buffer.from('RIFF'), format: 'wav' };
  const parts = {};
  const fakeFetch = async (url, init) => {
    parts[url.includes('baseten') ? 'primary' : 'fallback'] = JSON.parse(init.body).messages[0].content[1];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'sha-bos' } }] }) };
  };
  process.env.BASETEN_API_KEY = 'test-primary';
  process.env.META_API_KEY = 'test-fallback';
  t.after(() => { delete process.env.BASETEN_API_KEY; delete process.env.META_API_KEY; });
  await listen(audio, { fetch: fakeFetch, model: 'primary' });
  await listen(audio, { fetch: fakeFetch, model: 'fallback' });
  assert.equal(parts.primary.type, 'audio_url');
  assert.match(parts.primary.audio_url.url, /^data:audio\/wav;base64,/);
  assert.deepEqual(parts.fallback, { type: 'input_audio', input_audio: { data: audio.data.toString('base64'), format: 'wav' } });
});

test('a prose refusal is a failed call and is retried', async (t) => {
  const audio = { data: Buffer.from('RIFF'), format: 'wav' };
  const answers = [
    "I don't have the ability to hear audio in this chat, so I can't hear the child reading. If you upload an audio file I can help.",
    'sha-vos',
  ];
  let calls = 0;
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: answers[calls++] } }] }) });
  process.env.META_API_KEY = 'test-fallback';
  t.after(() => { delete process.env.META_API_KEY; });
  const result = await listen(audio, { fetch: fakeFetch, model: 'fallback' });
  assert.equal(calls, 2);
  assert.deepEqual(result.words, [['sha', 'vos']]);
});

test('looksLikeProse leaves real sound lines alone', async () => {
  const { looksLikeProse } = await import('./parse.js');
  assert.equal(looksLikeProse('she-ma\nyis-ro-eyl\na-do-noy\ne-lo-key-nu\na-do-noy\ne-chod'), false);
  assert.equal(looksLikeProse('i ? have the ability to hear audio so i ? hear the child'), true);
  assert.equal(looksLikeProse('ni i ma ti ka lo mi i'), false);
  assert.equal(looksLikeProse('ni\ni\nma\nti\nka\nlo\nmi'), false);
  assert.equal(looksLikeProse("I'm sorry,\nbut I can't\nlisten to\nthis file\nright now\nfriend"), true);
  assert.equal(looksLikeProse('please\nupload\nthe\naudio\nfile\nagain\nnow'), true);
});

test('the fallback asks Wonder for minimal reasoning, and EAR_REASONING_EFFORT overrides it', async (t) => {
  setKeys(t, '');
  const previous = process.env.EAR_REASONING_EFFORT;
  t.after(() => {
    if (previous === undefined) delete process.env.EAR_REASONING_EFFORT;
    else process.env.EAR_REASONING_EFFORT = previous;
  });
  const efforts = [];
  const fetch = async (_url, init) => { efforts.push(JSON.parse(init.body).reasoning_effort); return answer(); };
  delete process.env.EAR_REASONING_EFFORT;
  await listen(audio, { fetch });
  process.env.EAR_REASONING_EFFORT = 'low';
  await listen(audio, { fetch });
  assert.deepEqual(efforts, ['minimal', 'low']);
});

test('the primary request carries no reasoning_effort', async (t) => {
  setKeys(t);
  const bodies = [];
  await listen(audio, { model: 'primary', fetch: async (_url, init) => { bodies.push(JSON.parse(init.body)); return answer(); } });
  assert.equal('reasoning_effort' in bodies[0], false);
});


for (const provider of ['primary', 'fallback']) {
  test(`ear refuses a contributor ${provider} model before fetch`, async t => {
    setKeys(t);
    const name = provider === 'primary' ? 'EAR_PRIMARY_MODEL' : 'EAR_FALLBACK_MODEL';
    const previous = process.env[name];
    t.after(() => {
      if (previous === undefined) delete process.env[name];
      else process.env[name] = previous;
    });
    process.env[name] = 'offline-model-contributor';
    const { listen: configuredListen } = await import(`./hear.js?contributor=${provider}`);
    let calls = 0;
    const fetch = async () => { calls++; return answer(); };
    await assert.rejects(configuredListen(audio, { model: provider, fetch }), /contributor/);
    assert.equal(calls, 0);
    if (provider === 'primary') {
      const result = await configuredListen(audio, { fetch });
      assert.equal(result.model, FALLBACK);
      assert.equal(calls, 1);
    }
  });
}
