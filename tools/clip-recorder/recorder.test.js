import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { isClipName, loadClips, parseClips } from './clips.js';
import { parseOptions } from './options.js';
import { MAX_BYTES, recordingStore } from './recordings.js';
import { matchesSay, runEar } from './run-ear.js';
import { createRecorderServer } from './server.js';
import { encodeWav } from './wav.js';

const expectedClips = [
  ['shabbos_va-for-ba', 'sha-vos'],
  ['baruch_clean', 'bo-ruch'],
  ['shalom_patach-for-kamatz', 'sha-loym'],
  ['melech_skipped-syllable', 'mech'],
  ['haolam_wrong-word', 'ha-ma-kom'],
  ['yisrael_shin-for-sin', 'yish-ro-eyl'],
  ['elokeinu_segol-for-tzere', 'e-loy-ke-nu'],
  ['echad_extra-syllable', 'e-cho-de'],
  ['modeh_shuruk-for-cholam', 'mu-de'],
  ['ani_clean', 'a-ni'],
  ['lefanecha_pei-for-fei', 'le-po-ne-cho'],
  ['shema-line_skipped-word', 'she-ma yis-ro-eyl a-do-noy a-do-noy e-chod'],
];
const wav = Buffer.from(encodeWav(new Float32Array([0, .25, -.25, 0])));

async function fixtureDirectory(t) {
  const directory = await mkdtemp(join(fileURLToPath(new URL('.', import.meta.url)), '.recorder-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

// Exercise the real server handler with streams, without network calls or ports.
async function request(server, url, { method = 'GET', data = [], headers = {} } = {}) {
  const req = Readable.from(Array.isArray(data) ? data : [data]);
  Object.assign(req, { method, url, headers });
  const response = { headersSent: false, destroyed: false };
  response.writeHead = (status, values) => {
    response.status = status;
    response.headers = values;
    response.headersSent = true;
  };
  response.end = (body) => { response.body = body ?? ''; };
  await server.listeners('request')[0](req, response);
  if (response.headers['Content-Type'].startsWith('application/json')) {
    response.json = JSON.parse(response.body);
  }
  return response;
}

function post(server, name, data = wav, headers = {}) {
  return request(server, `/clip?name=${encodeURIComponent(name)}`, {
    method: 'POST', data, headers: { 'content-type': 'audio/wav', ...headers },
  });
}

test('Round 1 markdown has all 12 adult names, Say values, Hebrew and planted mistakes', async () => {
  const markdown = await readFile(new URL('../../docs/ear-test.md', import.meta.url), 'utf8');
  const clips = parseClips(markdown);
  assert.deepEqual(clips.map(({ name, say }) => [name, say]), expectedClips);
  assert.equal(clips[0].hebrew, 'שַׁבָּת');
  assert.equal(clips[0].planted, 'בּ read as v');
  assert.equal(clips[11].planted, 'אֱלֹהֵינוּ skipped');
  assert.ok(clips.every(({ hebrew, planted }) => hebrew && planted));
  assert.deepEqual(parseClips(markdown.replace(/\n/g, '\r\n')), clips);
  assert.deepEqual(parseClips(`${markdown}\n| not-round-one | ignored | ignored | ignored |`), clips);
  await assert.rejects(loadClips('unknown'), /adult or child/);
});

test('parser follows the table instead of hardcoding its rows and rejects malformed input', async () => {
  const markdown = await readFile(new URL('../../docs/ear-test.md', import.meta.url), 'utf8');
  const changed = markdown.replace('| baruch_clean | בָּרוּךְ | bo-ruch |', '| baruch_changed | בָּרוּךְ | ba-ruch |');
  assert.deepEqual(parseClips(changed)[1], {
    name: 'baruch_changed', hebrew: 'בָּרוּךְ', say: 'ba-ruch', planted: 'nothing',
  });
  assert.throws(() => parseClips('## Round 2\n'), /missing/);
  assert.throws(() => parseClips(markdown.replace('File name', 'Filename')), /columns/);
  assert.throws(() => parseClips(markdown.replace('baruch_clean', '../escape')), /Invalid/);
  assert.throws(() => parseClips(markdown.replace('baruch_clean', 'shabbos_va-for-ba')), /unique/);
});

test('name validation accepts only exact table names in the selected set', async () => {
  const adult = await loadClips();
  const child = await loadClips('child');
  assert.equal(adult.length, 12);
  assert.deepEqual(child, adult.map((clip) => ({ ...clip, name: `child_${clip.name}` })));
  for (const clip of adult) {
    assert.equal(isClipName(clip.name, adult), true);
    assert.equal(isClipName(`child_${clip.name}`, adult), false);
    assert.equal(isClipName(clip.name, child), false);
    assert.equal(isClipName(`child_${clip.name}`, child), true);
  }
  for (const name of ['../x', 'unknown', 'shabbos_va-for-ba.wav', '../baruch_clean',
    '/baruch_clean', 'child_../x', 'BARUCH_CLEAN', 'baruch_clean\0', null, undefined]) {
    assert.equal(isClipName(name, adult), false);
    assert.equal(isClipName(name, child), false);
  }
});

test('server serves the page, browser modules and bundled fonts, but no arbitrary files', async (t) => {
  const server = await createRecorderServer({ directory: await fixtureDirectory(t) });
  const page = await request(server, '/');
  assert.equal(page.status, 200);
  assert.match(page.body.toString(), /dir="rtl" lang="he"/);
  assert.match(page.body.toString(), /Delete child recordings/);
  assert.equal(page.headers['Cache-Control'], 'no-store');
  for (const path of ['/app.js', '/wav.js', '/styles.css', '/fonts/Montserrat-400.ttf',
    '/fonts/Montserrat-700.ttf', '/fonts/FrankRuhlLibre.ttf']) {
    const response = await request(server, path);
    assert.equal(response.status, 200, path);
    assert.ok(response.body.length > 0);
  }
  assert.equal((await request(server, '/', { method: 'HEAD' })).body, '');
  for (const path of ['/recordings/private/baruch_clean.wav', '/../../.env', '/%2e%2e/.env', '/server.js']) {
    assert.equal((await request(server, path)).status, 404);
  }
});

test('server writes a posted WAV, lists completion, and reads it back from the selected set', async (t) => {
  const directory = await fixtureDirectory(t);
  const server = await createRecorderServer({ directory });
  let list = await request(server, '/clips');
  assert.equal(list.json.set, 'adult');
  assert.equal(list.json.clips.length, 12);
  assert.ok(list.json.clips.every((clip) => !clip.done));
  const response = await post(server, 'baruch_clean');
  assert.equal(response.status, 200);
  assert.deepEqual(await readFile(join(directory, 'baruch_clean.wav')), wav);
  assert.deepEqual(await readdir(directory), ['baruch_clean.wav']);
  list = await request(server, '/clips');
  assert.deepEqual(list.json.clips.filter((clip) => clip.done).map((clip) => clip.name), ['baruch_clean']);
  const playback = await request(server, '/clip?name=baruch_clean');
  assert.equal(playback.headers['Content-Type'], 'audio/wav');
  assert.deepEqual(playback.body, wav);
  const childServer = await createRecorderServer({ set: 'child', directory });
  assert.equal((await post(childServer, 'child_baruch_clean')).status, 200);
  assert.equal((await post(childServer, 'baruch_clean')).status, 400);
  assert.deepEqual(await readFile(join(directory, 'child_baruch_clean.wav')), wav);
  assert.equal((await request(childServer, '/clips')).json.set, 'child');
});

test('server rejects traversal, unknown names, wrong sets, wrong MIME, and cross-origin writes', async (t) => {
  const directory = await fixtureDirectory(t);
  const server = await createRecorderServer({ directory });
  for (const name of ['../x', 'unknown', 'child_baruch_clean', 'baruch_clean.wav']) {
    assert.equal((await post(server, name)).status, 400);
  }
  assert.equal((await post(server, 'baruch_clean', wav, { 'content-type': 'audio/webm' })).status, 415);
  assert.equal((await post(server, 'baruch_clean', wav, { origin: 'https://example.invalid', host: '127.0.0.1:8790' })).status, 403);
  assert.deepEqual(await readdir(directory), []);
});

test('server refuses declared and streaming bodies over 10 MB without overwriting a clip', async (t) => {
  const directory = await fixtureDirectory(t);
  const server = await createRecorderServer({ directory });
  await post(server, 'baruch_clean');
  const declared = await post(server, 'baruch_clean', [], { 'content-length': String(MAX_BYTES + 1) });
  assert.equal(declared.status, 413);
  const streaming = await post(server, 'baruch_clean', [Buffer.alloc(MAX_BYTES / 2), Buffer.alloc(MAX_BYTES / 2 + 1)]);
  assert.equal(streaming.status, 413);
  assert.deepEqual(await readFile(join(directory, 'baruch_clean.wav')), wav);
  assert.deepEqual(await readdir(directory), ['baruch_clean.wav']);
  assert.equal((await post(server, 'ani_clean', Buffer.alloc(MAX_BYTES))).status, 200);
});

test('DELETE removes every child WAV, preserving adult clips, unrelated files and directories', async (t) => {
  const directory = await fixtureDirectory(t);
  for (const name of ['baruch_clean.wav', 'child_baruch_clean.wav', 'child_old-clip.wav', 'child_notes.txt', 'notes.wav']) {
    await writeFile(join(directory, name), wav);
  }
  await mkdir(join(directory, 'child_folder.wav'));
  await writeFile(join(directory, 'child_folder.wav', 'keep.wav'), wav);
  const server = await createRecorderServer({ directory });
  for (const path of ['/clips', '/clips?set=adult', '/clips?set=unknown']) {
    assert.equal((await request(server, path, { method: 'DELETE' })).status, 400);
  }
  const response = await request(server, '/clips?set=child', { method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.json.deleted.sort(), ['child_baruch_clean.wav', 'child_old-clip.wav']);
  assert.deepEqual((await readdir(directory)).sort(), ['baruch_clean.wav', 'child_folder.wav', 'child_notes.txt', 'notes.wav']);
  assert.deepEqual(await readFile(join(directory, 'child_folder.wav', 'keep.wav')), wav);
  assert.deepEqual((await request(server, '/clips?set=child', { method: 'DELETE' })).json.deleted, []);
});

test('recording writes replace symlinks without touching their targets and refuse linked directories', async (t) => {
  const directory = await fixtureDirectory(t);
  const target = join(directory, 'keep.wav');
  await writeFile(target, 'keep');
  await symlink(target, join(directory, 'baruch_clean.wav'));
  const server = await createRecorderServer({ directory });
  assert.equal((await request(server, '/clips')).json.clips.find((clip) => clip.name === 'baruch_clean').done, false);
  assert.equal((await post(server, 'baruch_clean')).status, 200);
  assert.equal(await readFile(target, 'utf8'), 'keep');
  assert.deepEqual(await readFile(join(directory, 'baruch_clean.wav')), wav);
  const linked = join(directory, 'linked');
  await symlink(directory, linked);
  const unsafe = await createRecorderServer({ directory: linked });
  assert.equal((await post(unsafe, 'ani_clean')).status, 500);
  await assert.rejects(access(join(directory, 'ani_clean.wav')));
});

test('missing private directory lists empty and is created only when saving', async (t) => {
  const directory = join(await fixtureDirectory(t), 'private');
  const server = await createRecorderServer({ directory });
  assert.ok((await request(server, '/clips')).json.clips.every((clip) => !clip.done));
  assert.equal((await request(server, '/clip?name=baruch_clean')).status, 404);
  assert.equal((await post(server, 'baruch_clean')).status, 200);
  assert.deepEqual(await readFile(join(directory, 'baruch_clean.wav')), wav);
});

test('server never logs audio or includes it in error responses', async (t) => {
  const server = await createRecorderServer({ directory: await fixtureDirectory(t) });
  const log = t.mock.method(console, 'log', () => {});
  const error = t.mock.method(console, 'error', () => {});
  const body = Buffer.from('PRIVATE_RECORDING_BYTES');
  const good = await post(server, 'baruch_clean', body);
  const bad = await post(server, '../x', body);
  assert.ok(!String(good.body).includes(body.toString()));
  assert.ok(!String(bad.body).includes(body.toString()));
  assert.equal(log.mock.callCount(), 0);
  assert.equal(error.mock.callCount(), 0);
});

test('comparison ignores case and spaces but preserves syllables, word boundaries, order and count', () => {
  assert.equal(matchesSay([['SHA', ' VOS ']], ' sha-vos '), true);
  assert.equal(matchesSay([['she', 'ma'], ['YIS', 'RO', 'EYL']], 'she-ma   yis-ro-eyl'), true);
  for (const heard of [[['sha', 'bos']], [['sha', 'vos', '?']], [['sha'], ['vos']], [['sha-vos', 'a']], []]) {
    assert.equal(matchesSay(heard, 'sha-vos'), false);
  }
  assert.equal(matchesSay([['ab'], ['c']], 'a bc'), false);
  assert.equal(matchesSay([['ni'], ['a']], 'a ni'), false);
  assert.equal(matchesSay([['shavos']], 'sha-vos'), false);
  assert.equal(matchesSay([['?']], 'sha-vos'), false);
  assert.equal(matchesSay(null, 'sha-vos'), false);
});

test('ear runner sends only audio, respects the model, and prints PASS and MISS next to Say', async (t) => {
  const directory = await fixtureDirectory(t);
  const clips = await loadClips();
  const store = recordingStore(clips, directory);
  await store.save(clips[0].name, wav);
  await store.save(clips[1].name, wav);
  const output = [];
  let calls = 0;
  const result = await runEar({ directory, model: 'fallback', log: (line) => output.push(line),
    ear: async (audio, options) => {
      assert.deepEqual(audio, { data: wav, format: 'wav' });
      assert.deepEqual(options, { model: 'fallback' });
      return ++calls === 1 ? [['SHA', 'VOS']] : [['ba', 'ruch']];
    } });
  assert.equal(calls, 2);
  assert.equal(result.code, 1);
  assert.deepEqual(output, ['clip\tsaid\theard\tresult',
    'shabbos_va-for-ba\tsha-vos\tSHA-VOS\tPASS', 'baruch_clean\tbo-ruch\tba-ruch\tMISS']);
  assert.ok((await store.list()).slice(0, 2).every((clip) => clip.done));
});

test('child runner prints then deletes each clip before the next call, including failures', async (t) => {
  const directory = await fixtureDirectory(t);
  const clips = await loadClips('child');
  const store = recordingStore(clips, directory);
  for (const clip of clips.slice(0, 2)) await store.save(clip.name, wav);
  await writeFile(join(directory, 'baruch_clean.wav'), wav);
  await writeFile(join(directory, 'child_old.wav'), wav);
  const output = [];
  let calls = 0;
  const result = await runEar({ set: 'child', directory, log: (line) => {
    output.push(line);
    if (line.startsWith(`${clips[0].name}\t`)) {
      // The output is emitted before deletion is scheduled.
      assert.equal(line.endsWith('PASS'), true);
    }
  }, ear: async () => {
    calls += 1;
    if (calls === 1) return [['sha', 'vos']];
    await assert.rejects(access(join(directory, `${clips[0].name}.wav`)));
    assert.equal(output.length, 2);
    throw new Error('Provider error that must not be printed');
  } });
  assert.equal(result.code, 1);
  assert.equal(calls, 2);
  assert.deepEqual(await readdir(directory), ['baruch_clean.wav']);
  assert.equal(output[2], 'child_baruch_clean\tbo-ruch\tERROR\tMISS');
  assert.ok(output.every((line) => !line.includes('Provider error')));
});

test('--keep retains child audio and an all-PASS run succeeds', async (t) => {
  const directory = await fixtureDirectory(t);
  const clips = await loadClips('child');
  await recordingStore(clips, directory).save(clips[0].name, wav);
  const result = await runEar({ set: 'child', keep: true, directory, log: () => {}, ear: async (_audio, options) => {
    assert.deepEqual(options, { model: 'primary' });
    return [['sha', 'vos']];
  } });
  assert.equal(result.code, 0);
  assert.deepEqual(await readFile(join(directory, `${clips[0].name}.wav`)), wav);
});

test('child audio is still deleted when printing fails; empty sets make no ear calls', async (t) => {
  const directory = await fixtureDirectory(t);
  const clips = await loadClips('child');
  const store = recordingStore(clips, directory);
  await store.save(clips[0].name, wav);
  await assert.rejects(runEar({ set: 'child', directory, log: () => { throw new Error('output failed'); },
    ear: async () => { assert.fail('Ear should not be called'); } }), /output failed/);
  assert.deepEqual(await readdir(directory), []);
  assert.equal((await runEar({ directory, log: () => {}, ear: async () => { assert.fail('No recordings'); } })).code, 1);
});

test('CLI flags have safe defaults and reject invalid sets, models, ports and unknown flags', () => {
  assert.deepEqual(parseOptions([], 'server'), { set: 'adult', port: 8790 });
  assert.deepEqual(parseOptions(['--set', 'child', '--port', '9123'], 'server'), { set: 'child', port: 9123 });
  assert.deepEqual(parseOptions([], 'ear'), { set: 'adult', model: 'primary', keep: false });
  assert.deepEqual(parseOptions(['--set', 'child', '--model', 'fallback', '--keep'], 'ear'), {
    set: 'child', model: 'fallback', keep: true,
  });
  for (const args of [['--set'], ['--set', 'x'], ['--port'], ['--port', '0'], ['--port', '65536'],
    ['--port', '1.5'], ['--port', 'oops'], ['--host', '0.0.0.0']]) {
    assert.throws(() => parseOptions(args, 'server'));
  }
  for (const args of [['--set', 'x'], ['--model'], ['--model', 'other'], ['--port', '9000']]) {
    assert.throws(() => parseOptions(args, 'ear'));
  }
});

test('WAV encoder writes mono 16 kHz PCM headers, sample count, signed samples and clipping', () => {
  const samples = new Float32Array([-2, -1, -.5, 0, .5, 1, 2, NaN]);
  const wav = encodeWav(samples);
  const data = new DataView(wav);
  const bytes = Buffer.from(wav);
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.getUint32(4, true), wav.byteLength - 8);
  assert.equal(bytes.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(data.getUint32(16, true), 16);
  assert.equal(data.getUint16(20, true), 1);
  assert.equal(data.getUint16(22, true), 1);
  assert.equal(data.getUint32(24, true), 16000);
  assert.equal(data.getUint32(28, true), 32000);
  assert.equal(data.getUint16(32, true), 2);
  assert.equal(data.getUint16(34, true), 16);
  assert.equal(bytes.toString('ascii', 36, 40), 'data');
  assert.equal(data.getUint32(40, true) / 2, samples.length);
  assert.equal(wav.byteLength, 44 + samples.length * 2);
  assert.deepEqual(samples.map((_sample, index) => data.getInt16(44 + index * 2, true)),
    new Float32Array([-32768, -32768, -16384, 0, 16384, 32767, 32767, 0]));
  assert.equal(encodeWav(new Float32Array(16000)).byteLength, 32044);
  assert.equal(encodeWav(new Float32Array()).byteLength, 44);
  assert.equal(new DataView(encodeWav(new Float32Array(8), 8000)).getUint32(24, true), 8000);
  assert.throws(() => encodeWav([], 16000), TypeError);
});
