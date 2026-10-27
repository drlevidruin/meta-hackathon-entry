import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { CONSONANTS, VOWELS, tokenize } from './alphabet.js';
import { main } from './cli.js';
import { loadEnv } from './env.js';
import { combineAnswers, defaultVotes, hear, listen } from './hear.js';
import { looksLikeProse, parseEarOutput } from './parse.js';

const PRIMARY = 'muse-wonder-1.0';
const FALLBACK = 'meta-models/muse-spark-open-1026';
const primaryKey = 'offline-primary-placeholder';
const fallbackKey = 'offline-fallback-placeholder';
const audio = { data: Buffer.from('offline audio fixture'), format: 'wav' };

function setKeys(t, primary = primaryKey, fallback = fallbackKey) {
  const values = { META_API_KEY: primary, BASETEN_API_KEY: fallback };
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

for (const raw of ["I can't hear audio.", 'No speech detected', 'Sorry.', "\"I can't hear audio.\"", 'sha,bos', 'sha.bos', 'No Speech Detected',
  'Sorry, I cannot hear.', 'Silent', 'Inaudible', 'no sound', "i can't hear", 'Sha-vos.', 'SHA-BOS,', "sha'vos", 'sha’vos']) {
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

for (const word of ['audio', 'hear', 'heard', 'sorry', 'cannot', 'unable', 'silent', 'silence', 'inaudible', 'speech',
  'nothing', 'unclear', 'detected', 'transcribe', 'recording']) {
  test(`a short refusal word is prose: ${word}`, () => {
    assert.equal(looksLikeProse(word), true);
    assert.equal(looksLikeProse(`? ${word} ?`), true);
  });
}

for (const [raw, clean] of [
  ['ko-mi-tav, ve-lush, tzo-ri.', 'ko-mi-tav ve-lush tzo-ri'],
  ['sha-vos, ba-ruch', 'sha-vos ba-ruch'], ['sha-vos.', 'sha-vos'],
  ['Sha-vos', 'sha-vos'], ['SHA-BOS', 'sha-bos'],
  ['1. sha-vos\n2. ba-ruch', 'sha-vos ba-ruch'], ['1. sha-vos.', 'sha-vos'],
  ['Sounds:\nsha-vos', 'sha-vos'], ['sha-wos', 'sha-wos'],
]) {
  test(`reading keeps the clean syllables: ${raw}`, async t => {
    setKeys(t);
    assert.equal(looksLikeProse(raw), false);
    assert.deepEqual(parseEarOutput(raw), parseEarOutput(clean));
    const result = await listen(audio, { model: 'fallback', fetch: async () => answer(raw) });
    assert.deepEqual(result.words, parseEarOutput(clean));
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

test('aw becomes o before syllable validation and the prose check', () => {
  assert.deepEqual(parseEarOutput('baw-ruch'), [['bo', 'ruch']]);
  assert.deepEqual(parseEarOutput('Baw-ruch\nBAW-RAW'), [['bo', 'ruch'], ['bo', 'ro']]);
  assert.equal(looksLikeProse('Baw-ruch'), false);
  assert.equal(looksLikeProse('BAW-RAW'), false);
  assert.deepEqual(parseEarOutput('bawx\nsha-wos\nw'), [['?'], ['sha', '?'], ['?']]);
  assert.equal(looksLikeProse('Bawx'), true);
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

test('defaultVotes reads whole numbers from 1 to 5 and otherwise uses 3', () => {
  for (let votes = 1; votes <= 5; votes += 1) {
    assert.equal(defaultVotes({ EAR_VOTES: String(votes) }), votes);
  }
  for (const value of [undefined, '', '0', '6', '2.5', 'text']) {
    assert.equal(defaultVotes({ EAR_VOTES: value }), 3);
  }
  assert.equal(defaultVotes({}), 3);
});

test('listen rejects invalid votes before any fetch, including for fallback', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return answer(); };
  for (const model of [undefined, 'primary', 'fallback']) {
    for (const votes of [0, 6, -1, 2.5, '3', null, true, NaN, Infinity, [], {}]) {
      await assert.rejects(listen(audio, { model, votes, fetch }), {
        message: 'Votes must be a whole number from 1 to 5.',
      });
    }
  }
  assert.equal(calls, 0);
});

test('combineAnswers votes by whole words and breaks word ties by request order', () => {
  const words = raw => raw.split(' ').map(word => word.split('-'));
  for (const [raws, expected] of [
    [['ko-voyd', 'ka-voyd', 'ka-voyd'], 'ka-voyd'],
    [['a b', 'a c', 'a b'], 'a b'],
    [['x', 'y', 'z'], 'x'],
    [['a b', 'a c', 'd c'], 'a c'],
  ]) {
    assert.deepEqual(combineAnswers(raws.map(words)), words(expected));
  }
});

test('combineAnswers chooses the most common word count with the earliest breaking ties', () => {
  const words = raw => raw.split(' ').map(word => word.split('-'));
  for (const [raws, expected] of [
    [['u v', 'a b c', 'd b f'], 'a b c'],
    [['a b', 'c d e', 'f g h i'], 'a b'],
    [['x', 'a b', 'c d e', 'f g', 'h i j'], 'a b'],
  ]) {
    assert.deepEqual(combineAnswers(raws.map(raw => ({ words: words(raw) }))), words(expected));
  }
});

test('combineAnswers ignores empty readings and keeps the earliest remaining ties', () => {
  const words = [['ko', 'voyd']];
  for (const answers of [
    [[], [], words],
    [[], words, []],
    [words, [], []],
    [[], words, [['ka', 'voyd']]],
    [[], words, [['ka', 'voyd'], ['ba', 'ruch']]],
  ]) {
    assert.deepEqual(combineAnswers(answers), words);
    assert.deepEqual(combineAnswers(answers.map(words => ({ words }))), words);
  }
});

test('combineAnswers keeps all-empty and single answers unchanged', () => {
  const words = [['ko', 'voyd']];
  for (const [answers, expected] of [
    [[], []],
    [[[]], []],
    [[[], []], []],
    [[words], words],
  ]) {
    assert.deepEqual(combineAnswers(answers), expected);
    assert.deepEqual(combineAnswers(answers.map(words => ({ words }))), expected);
  }
});

test('listen keeps real words when two primary replies parse to no words without fallback', async t => {
  setKeys(t);
  for (const empty of ['Sounds:', '---']) {
    const raws = [empty, empty, 'ko-voyd'];
    const models = [];
    const result = await listen(audio, { votes: 3, fetch: async (_url, init) => {
      const raw = raws[models.length];
      models.push(JSON.parse(init.body).model);
      return answer(raw);
    } });
    assert.deepEqual(result.words, [['ko', 'voyd']]);
    assert.deepEqual(result.votes, { asked: 3, answered: 3 });
    assert.deepEqual(models, [PRIMARY, PRIMARY, PRIMARY]);
  }
});

test('listen uses defaultVotes when votes is missing', async t => {
  setKeys(t);
  const previous = process.env.EAR_VOTES;
  t.after(() => {
    if (previous === undefined) delete process.env.EAR_VOTES;
    else process.env.EAR_VOTES = previous;
  });
  for (const [value, expected] of [[undefined, 3], ['1', 1], ['5', 5], ['2.5', 3]]) {
    if (value === undefined) delete process.env.EAR_VOTES;
    else process.env.EAR_VOTES = value;
    let calls = 0;
    const result = await listen(audio, { fetch: async () => { calls += 1; return answer(); } });
    assert.equal(defaultVotes(), expected);
    assert.equal(calls, expected);
    assert.deepEqual(result.votes, { asked: expected, answered: expected });
  }
});

test('primary votes start together and combine in request order when they finish in reverse', async t => {
  setKeys(t);
  for (const [raws, expected] of [
    [['ko-voyd', 'ka-voyd', 'ka-voyd'], [['ka', 'voyd']]],
    [['ko-voyd', 'ka-voyd', 'ke-voyd'], [['ko', 'voyd']]],
  ]) {
    const gates = Array.from({ length: 3 }, () => Promise.withResolvers());
    const finished = Array.from({ length: 3 }, () => Promise.withResolvers());
    const order = [];
    let calls = 0;
    const pending = listen(audio, { votes: 3, fetch: async (_url, init) => {
      assert.equal(JSON.parse(init.body).model, PRIMARY);
      const slot = calls++;
      await gates[slot].promise;
      order.push(slot);
      finished[slot].resolve();
      return answer(raws[slot]);
    } });
    try {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(calls, 3);
      for (const slot of [2, 1, 0]) {
        gates[slot].resolve();
        await finished[slot].promise;
      }
      const result = await pending;
      assert.deepEqual(order, [2, 1, 0]);
      assert.deepEqual(result.words, expected);
      assert.equal(result.raw, raws[0]);
      assert.deepEqual(result.votes, { asked: 3, answered: 3 });
    } finally {
      for (const gate of gates) gate.resolve();
      await pending;
    }
  }
});

test('a prose answer retries within its primary slot and retains that slot order', async t => {
  setKeys(t);
  const raws = ['I cannot hear audio.', 'ka-voyd', 'ka-voyd', 'ko-voyd'];
  let calls = 0;
  const result = await listen(audio, { votes: 3, fetch: async (_url, init) => {
    assert.equal(JSON.parse(init.body).model, PRIMARY);
    return answer(raws[calls++]);
  } });
  assert.equal(calls, 4);
  assert.deepEqual(result.words, [['ka', 'voyd']]);
  assert.equal(result.raw, 'ko-voyd');
  assert.deepEqual(result.usage, { prompt_tokens: 30, completion_tokens: 60, total_tokens: 90 });
  assert.deepEqual(result.votes, { asked: 3, answered: 3 });
});

test('each primary slot respects tries and a forced primary never calls fallback', async t => {
  setKeys(t);
  for (const tries of [1, 2, 3]) {
    let calls = 0;
    await assert.rejects(listen(audio, { model: 'primary', votes: 3, tries, fetch: async (_url, init) => {
      calls += 1;
      assert.equal(JSON.parse(init.body).model, PRIMARY);
      return answer('I cannot hear audio.');
    } }), { message: `No ear model returned an answer (${Array(3 * tries).fill('primary: answered in prose').join('; ')}).` });
    assert.equal(calls, 3 * tries);
  }
});

test('one network failure leaves two primary answers to combine without fallback', async t => {
  setKeys(t);
  let calls = 0;
  const result = await listen(audio, { votes: 3, reference: audio, fetch: async (_url, init) => {
    assert.equal(JSON.parse(init.body).model, PRIMARY);
    const slot = calls++;
    if (slot === 0) throw new Error('offline failure');
    return answer(slot === 1 ? 'ko-voyd' : 'ka-voyd');
  } });
  assert.equal(calls, 3);
  assert.deepEqual(result, {
    words: [['ko', 'voyd']], model: PRIMARY, raw: 'ko-voyd', card: true,
    usage: { prompt_tokens: 20, completion_tokens: 40, total_tokens: 60 },
    votes: { asked: 3, answered: 2 },
  });
});

test('a single successful primary answer prevents fallback and preserves its usage', async t => {
  setKeys(t);
  const usage = { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30,
    completion_tokens_details: { reasoning_tokens: 5 } };
  let calls = 0;
  const result = await listen(audio, { votes: 3, fetch: async (_url, init) => {
    assert.equal(JSON.parse(init.body).model, PRIMARY);
    if (calls++ !== 1) return new Response('', { status: 503 });
    return answer('ka-voyd', { usage });
  } });
  assert.equal(calls, 3);
  assert.deepEqual(result.words, [['ka', 'voyd']]);
  assert.equal(result.raw, 'ka-voyd');
  assert.deepEqual(result.usage, usage);
  assert.deepEqual(result.votes, { asked: 3, answered: 1 });
});

test('primary usage includes every answer even when its word count is excluded', async t => {
  setKeys(t);
  const raws = ['sha-bos', 'ka-voyd ba-ruch', 'ko-voyd ba-ruch'];
  let calls = 0;
  const result = await listen(audio, { votes: 3, fetch: async () => {
    const slot = calls++;
    return answer(raws[slot], { usage: {
      prompt_tokens: slot + 1, completion_tokens: 2 * (slot + 1), total_tokens: 3 * (slot + 1),
    } });
  } });
  assert.deepEqual(result.words, [['ka', 'voyd'], ['ba', 'ruch']]);
  assert.equal(result.raw, raws[0]);
  assert.deepEqual(result.usage, { prompt_tokens: 6, completion_tokens: 12, total_tokens: 18 });
});

test('primary usage is null if any answer omits token counts', async t => {
  setKeys(t);
  for (const usage of [null, undefined, { prompt_tokens: 10 }]) {
    let calls = 0;
    const result = await listen(audio, { votes: 3, fetch: async () => (
      calls++ === 1 ? answer('ka-voyd', { usage }) : answer('ka-voyd')
    ) });
    assert.equal(result.usage, null);
    assert.deepEqual(result.votes, { asked: 3, answered: 3 });
  }
});

test('listen sends the exact primary request and returns only content as the answer', async (t) => {
  setKeys(t);
  const calls = [];
  const result = await listen(audio, { votes: 1, fetch: async (url, init) => {
    calls.push({ url, init });
    return answer();
  } });
  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
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
      { type: 'input_audio', input_audio: { data: audio.data.toString('base64'), format: 'wav' } },
    ] }],
    max_tokens: 8192,
    temperature: 0,
    reasoning_effort: 'minimal',
  });
  assert.deepEqual(result, {
    words: [['sha', 'bos'], ['ba', 'ruch']],
    model: PRIMARY,
    raw: 'sha-bos\nba-ruch',
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    card: false,
    votes: { asked: 1, answered: 1 },
  });
});

test('listen sends the card prompt and both recordings in order to primary only', async t => {
  setKeys(t);
  const reference = { data: Buffer.from('practice card fixture'), format: 'mp3' };
  const cardPrompt = await readFile(new URL('./prompt-card.md', import.meta.url), 'utf8');
  const calls = [];
  const result = await listen(audio, { votes: 3, reference, fetch: async (_url, init) => {
    calls.push(JSON.parse(init.body));
    return answer('Baw-ruch');
  } });
  assert.deepEqual(calls, Array(3).fill({
    model: PRIMARY,
    messages: [{ role: 'user', content: [
      { type: 'text', text: cardPrompt },
      { type: 'text', text: 'First recording: the practice card.' },
      { type: 'input_audio', input_audio: { data: reference.data.toString('base64'), format: 'mp3' } },
      { type: 'text', text: 'Second recording: the reading.' },
      { type: 'input_audio', input_audio: { data: audio.data.toString('base64'), format: 'wav' } },
    ] }],
    max_tokens: 8192,
    temperature: 0,
    reasoning_effort: 'minimal',
  }));
  assert.equal(result.card, true);
  assert.deepEqual(result.votes, { asked: 3, answered: 3 });
  assert.deepEqual(result.words, [['bo', 'ruch']]);
  assert.deepEqual(await hear(audio, { reference, fetch: async () => answer('baw-ruch') }), [['bo', 'ruch']]);
});

test('listen reads reference paths with the same format detection as reading paths', async t => {
  setKeys(t);
  const directory = await fixtureDirectory(t);
  const path = join(directory, 'card.FLAC');
  await writeFile(path, audio.data);
  const result = await listen(audio, { reference: { path }, fetch: async (_url, init) => {
    assert.deepEqual(JSON.parse(init.body).messages[0].content[2], {
      type: 'input_audio', input_audio: { data: audio.data.toString('base64'), format: 'flac' },
    });
    return answer();
  } });
  assert.equal(result.card, true);
});

test('reference inputs report the same validation and file errors as reading inputs before fetch', async t => {
  const directory = await fixtureDirectory(t);
  const large = join(directory, 'large.wav');
  const file = await open(large, 'w');
  await file.truncate(25 * 1024 * 1024 + 1);
  await file.close();
  const folder = join(directory, 'folder.wav');
  await mkdir(folder);
  let calls = 0;
  const fetch = async () => { calls += 1; return answer(); };
  for (const invalid of [
    null, 'clip.wav', {}, { path: '' }, { path: 'clip.txt' },
    { data: new Uint8Array(2), format: 'wav' }, { data: audio.data },
    { data: audio.data, format: 'aac' }, { data: audio.data, format: 'toString' },
    { path: 'clip.wav', data: audio.data, format: 'wav' },
    { path: join(directory, 'missing.wav') }, { path: folder }, { path: large },
    { data: Buffer.alloc(25 * 1024 * 1024 + 1), format: 'wav' },
  ]) {
    let message;
    await assert.rejects(listen(invalid, { fetch }), error => { message = error.message; return safeError(error); });
    await assert.rejects(listen(audio, { reference: invalid, fetch }), error => {
      assert.equal(error.message, message);
      return safeError(error);
    });
  }
  assert.equal(calls, 0);
});

test('fallback always keeps the plain request and reports card false even with a reference', async t => {
  setKeys(t);
  const reference = { data: Buffer.from('practice card fixture'), format: 'wav' };
  const prompt = await readFile(new URL('./prompt.md', import.meta.url), 'utf8');
  const expected = {
    model: FALLBACK,
    messages: [{ role: 'user', content: [
      { type: 'text', text: prompt },
      { type: 'audio_url', audio_url: { url: `data:audio/wav;base64,${audio.data.toString('base64')}` } },
    ] }],
    max_tokens: 8192,
    temperature: 0,
  };
  for (const mode of ['plain', 'forced', 'missing key', 'HTTP', 'network', 'empty', 'prose']) {
    if (mode === 'missing key') delete process.env.META_API_KEY;
    else process.env.META_API_KEY = primaryKey;
    let primaryCalls = 0, fallbackCalls = 0;
    const result = await listen(audio, {
      votes: 3,
      ...(mode === 'plain' ? {} : { reference }),
      ...(['plain', 'forced'].includes(mode) ? { model: 'fallback' } : {}),
      fetch: async (_url, init) => {
        const body = JSON.parse(init.body);
        if (body.model === PRIMARY) {
          primaryCalls += 1;
          assert.equal(body.messages[0].content.length, 5);
          if (mode === 'network') throw new Error('offline failure');
          if (mode === 'empty') return answer('');
          if (mode === 'prose') return answer('I cannot hear audio.');
          return new Response('', { status: 500 });
        }
        fallbackCalls += 1;
        assert.deepEqual(body, expected);
        return answer();
      },
    });
    assert.equal(result.card, false);
    assert.equal(result.model, FALLBACK);
    assert.equal(fallbackCalls, 1);
    assert.equal(primaryCalls, ['plain', 'forced', 'missing key'].includes(mode) ? 0 : mode === 'prose' ? 6 : 3);
    assert.deepEqual(result.votes, { asked: 1, answered: 1 });
  }
});

test('a successful primary retry still reports that it used the card', async t => {
  setKeys(t);
  let calls = 0;
  const result = await listen(audio, { votes: 1, reference: audio, fetch: async (_url, init) => {
    assert.equal(JSON.parse(init.body).messages[0].content.length, 5);
    return ++calls === 1 ? answer('I cannot hear audio.') : answer('baw-ruch');
  } });
  assert.equal(calls, 2);
  assert.equal(result.card, true);
});

test('listen uses the MIME type for each supported buffer format', async (t) => {
  setKeys(t);
  for (const [format, mime] of Object.entries({
    wav: 'wav', mp3: 'mpeg', flac: 'flac', ogg: 'ogg', m4a: 'mp4',
  })) {
    await listen({ data: audio.data, format }, { model: 'fallback', fetch: async (_url, init) => {
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
  await listen({ path }, { model: 'fallback', fetch: async (_url, init) => {
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
  delete process.env.META_API_KEY;
  const calls = [];
  const result = await listen(audio, { fetch: async (url, init) => {
    calls.push({ url, init });
    return answer();
  } });
  assert.equal(result.model, FALLBACK);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://inference.baseten.co/v1/chat/completions');
  assert.equal(JSON.parse(calls[0].init.body).model, FALLBACK);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${fallbackKey}`);
});

test('listen falls back after a primary 500', async (t) => {
  setKeys(t);
  const models = [];
  const result = await listen(audio, { votes: 1, fetch: async (_url, init) => {
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
    const result = await listen(audio, { votes: 1, fetch: async () => (++calls === 1 ? fail() : answer()) });
    assert.equal(calls, 2);
    assert.equal(result.model, FALLBACK);
  }
});

test('listen throws a credential-safe error when both providers fail', async (t) => {
  setKeys(t);
  let calls = 0;
  await assert.rejects(listen(audio, { votes: 1, fetch: async (_url, init) => {
    calls += 1;
    throw new Error(`Authorization: ${init.headers.Authorization}; ${primaryKey}; ${fallbackKey}`);
  } }), safeError);
  assert.equal(calls, 2);
});

test('listen does not fetch when both keys are missing', async (t) => {
  setKeys(t);
  delete process.env.META_API_KEY;
  delete process.env.BASETEN_API_KEY;
  let calls = 0;
  await assert.rejects(listen(audio, { fetch: async () => { calls += 1; return answer(); } }), safeError);
  assert.equal(calls, 0);
});

test('listen honors each forced model without trying the other provider', async (t) => {
  setKeys(t);
  for (const [model, id] of [['primary', PRIMARY], ['fallback', FALLBACK]]) {
    let calls = 0;
    const result = await listen(audio, { model, votes: 1, fetch: async (_url, init) => {
      calls += 1;
      assert.equal(JSON.parse(init.body).model, id);
      return answer();
    } });
    assert.equal(calls, 1);
    assert.equal(result.model, id);
    calls = 0;
    await assert.rejects(listen(audio, { model, votes: 1, fetch: async () => {
      calls += 1;
      return new Response('', { status: 500 });
    } }), safeError);
    assert.equal(calls, 1);
  }
});

test('a forced model with a missing key fails without using the other key', async (t) => {
  setKeys(t);
  delete process.env.META_API_KEY;
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
  await assert.rejects(listen(audio, { votes: 3, fetch: async (_url, init) => {
    signals.push(init.signal);
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error(primaryKey)), { once: true });
    });
  } }), safeError);
  assert.deepEqual(durations, Array(4).fill(120_000));
  assert.equal(signals.length, 4);
  assert.equal(new Set(signals).size, 4);
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
  const votes = defaultVotes();
  const failure = `No ear model returned an answer (${[...Array(votes).fill('primary: network error'), 'fallback: network error'].join('; ')}).`;
  assert.deepEqual(mimes, [
    ...Array(votes).fill('data:audio/wav'), ...Array(votes + 1).fill('data:audio/mpeg'), ...Array(votes).fill('data:audio/flac'),
  ]);
  assert.deepEqual(logs, [`a.wav\t${PRIMARY}\tsha-bos ba-ruch`, `c.flac\t${PRIMARY}\tsha-bos ba-ruch`]);
  assert.deepEqual(errors, [`b.mp3: ${failure}`]);
  const results = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(results.map((result) => result.file), ['a.wav', 'b.mp3', 'c.flac']);
  assert.equal(results[0].model, PRIMARY);
  assert.deepEqual(results[0].words, [['sha', 'bos'], ['ba', 'ruch']]);
  assert.equal(results[1].error, failure);
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

test('the Meta primary sends input_audio, Baseten fallback sends audio_url', async (t) => {
  const audio = { data: Buffer.from('RIFF'), format: 'wav' };
  const parts = {};
  const fakeFetch = async (url, init) => {
    parts[url.includes('baseten') ? 'fallback' : 'primary'] = JSON.parse(init.body).messages[0].content[1];
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'sha-bos' } }] }) };
  };
  process.env.BASETEN_API_KEY = 'test-fallback';
  process.env.META_API_KEY = 'test-primary';
  t.after(() => { delete process.env.BASETEN_API_KEY; delete process.env.META_API_KEY; });
  await listen(audio, { fetch: fakeFetch, model: 'primary' });
  await listen(audio, { fetch: fakeFetch, model: 'fallback' });
  assert.equal(parts.fallback.type, 'audio_url');
  assert.match(parts.fallback.audio_url.url, /^data:audio\/wav;base64,/);
  assert.deepEqual(parts.primary, { type: 'input_audio', input_audio: { data: audio.data.toString('base64'), format: 'wav' } });
});

test('a prose refusal is a failed call and is retried', async (t) => {
  const audio = { data: Buffer.from('RIFF'), format: 'wav' };
  const answers = [
    "I don't have the ability to hear audio in this chat, so I can't hear the child reading. If you upload an audio file I can help.",
    'sha-vos',
  ];
  let calls = 0;
  const fakeFetch = async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: answers[calls++] } }] }) });
  process.env.META_API_KEY = 'test-primary';
  t.after(() => { delete process.env.META_API_KEY; });
  const result = await listen(audio, { fetch: fakeFetch, model: 'primary', votes: 1 });
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

test('the primary asks Wonder for minimal reasoning, and EAR_REASONING_EFFORT overrides it', async (t) => {
  setKeys(t);
  const previous = process.env.EAR_REASONING_EFFORT;
  t.after(() => {
    if (previous === undefined) delete process.env.EAR_REASONING_EFFORT;
    else process.env.EAR_REASONING_EFFORT = previous;
  });
  const efforts = [];
  const fetch = async (_url, init) => { efforts.push(JSON.parse(init.body).reasoning_effort); return answer(); };
  delete process.env.EAR_REASONING_EFFORT;
  await listen(audio, { fetch, votes: 1 });
  process.env.EAR_REASONING_EFFORT = 'low';
  await listen(audio, { fetch, votes: 1 });
  assert.deepEqual(efforts, ['minimal', 'low']);
});

test('the fallback request carries no reasoning_effort', async (t) => {
  setKeys(t);
  const bodies = [];
  await listen(audio, { model: 'fallback', fetch: async (_url, init) => { bodies.push(JSON.parse(init.body)); return answer(); } });
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
