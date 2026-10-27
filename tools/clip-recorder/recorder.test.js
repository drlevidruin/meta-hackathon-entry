import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { access, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { defaultVotes } from '../../ear/hear.js';
import { cardLabels, VOICE_CARD } from '../../rulebook/voice-card.js';
import { isClipName, loadClips, parseClips } from './clips.js';
import { defaultEarModel, parseOptions } from './options.js';
import { MAX_BYTES, recordingStore } from './recordings.js';
import { main as earMain, matchesSay, runEar as runEarWithService } from './run-ear.js';
import { createRecorderServer } from './server.js';
import { encodeWav } from './wav.js';

// Keep every runner test offline unless it supplies its own phoneme fake.
const runEar = options => runEarWithService({ phonemes: async () => null, ...options });

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
const expectedNewClips = [
  ['omein_clean', 'o-meyn'],
  ['brocho_clean', 'be-ro-cho'],
  ['shomayim_clean', 'sho-ma-yim'],
  ['dovor_clean', 'do-vor'],
  ['emes_clean', 'e-mes'],
  ['toyro_clean', 'toy-ro'],
  ['mitzvo_clean', 'mitz-vo'],
  ['godol_patach-for-kamatz', 'ga-doyl'],
  ['kovod_patach-for-kamatz', 'ka-voyd'],
  ['sheym_chirik-for-tzere', 'shim'],
  ['ato_kamatz-for-patach', 'o-to'],
];
const expectedCardTests = [
  ['kamatz-card_clean', 'bo do mo go to ko'],
  ['kamatz-card_patach-for-kamatz', 'ba da ma ga ta ka'],
  ['voice-check_patach-for-kamatz', 'ba ba be bi boy da da de di doy ma ma me mi moy'],
  ['sheva-brocho_clean', "b'-ro-cho"],
  ['sheva-brocho_segol-for-sheva', 'be-ro-cho'],
  ['sheva-brocho_patach-for-sheva', 'ba-ro-cho'],
  ['sheva-neshomo_clean', "n'-sho-mo"],
  ['sheva-neshomo_segol-for-sheva', 'ne-sho-mo'],
  ['sheva-neshomo_patach-for-sheva', 'na-sho-mo'],
  ['sheva-shema_clean', "sh'-ma"],
  ['sheva-shema_segol-for-sheva', 'she-ma'],
  ['sheva-shema_patach-for-sheva', 'sha-ma'],
  ['sheva-zman_clean', "z'-man"],
  ['sheva-zman_segol-for-sheva', 'ze-man'],
  ['sheva-zman_patach-for-sheva', 'za-man'],
];

const expectedSealedClips = [
  ['odom_clean', 'o-dom'],
  ['chochom_clean', 'cho-chom'],
  ['neshomo_clean', 'ne-sho-mo'],
  ['tzedoko_clean', 'tze-do-ko'],
  ['shono_clean', 'sho-no'],
  ['bonim_clean', 'bo-nim'],
  ['kosuv_clean', 'ko-suv'],
  ['cholov_patach-for-kamatz', 'cha-lov'],
  ['bayis_kamatz-for-patach', 'bo-yis'],
  ['leyv_chirik-for-tzere', 'liv'],
  ['beney_patach-for-sheva', 'ba-ney'],
];
const expectedRound1d = [
  ['yod_clean', 'yod'],
  ['gomol_clean', 'go-mol'],
  ['dogim_clean', 'do-gim'],
  ['koton_clean', 'ko-ton'],
  ['noshim_clean', 'no-shim'],
  ['seyfer_clean', 'sey-fer'],
  ['chalo_clean', 'cha-lo'],
  ['ovinu_clean', 'o-vi-nu'],
  ['zohov_patach-for-kamatz', 'za-hov'],
  ['yom_patach-for-kamatz', 'yam'],
  ['abo_kamatz-for-patach', 'o-bo'],
  ['nachal_kamatz-for-patach', 'no-chal'],
];
const expectedRound1e = [
  ['shom_clean', 'shom'],
  ['poro_clean', 'po-ro'],
  ['kosav_clean', 'ko-sav'],
  ['nofal_clean', 'no-fal'],
  ['chag_clean', 'chag'],
  ['kadur_clean', 'ka-dur'],
  ['sabo_clean', 'sa-bo'],
  ['kal_clean', 'kal'],
  ['ochal_patach-for-kamatz', 'a-chal'],
  ['kom_patach-for-kamatz', 'kam'],
  ['gan_kamatz-for-patach', 'gon'],
  ['daf_kamatz-for-patach', 'dof'],
];
const expectedRound1f = [
  ['gal_clean', 'gal'],
  ['moyro_clean', 'moy-ro'],
  ['tal_kamatz-for-patach', 'tol'],
  ['chozok_clean', 'cho-zok'],
  ['moshol_clean', 'mo-shol'],
  ['kohol_patach-for-kamatz', 'ka-hol'],
  ['soro_clean', 'so-ro'],
  ['naal_clean', 'na-al'],
  ['omol_patach-for-kamatz', 'o-mal'],
  ['chaveyro_clean', 'cha-vey-ro'],
  ['godoyl_clean', 'go-doyl'],
  ['chom_patach-for-kamatz', 'cham'],
  ['shulchon_clean', 'shul-chon'],
];
const expectedRound1g = [
  ['sal_clean', 'sal'],
  ['shiro_clean', 'shi-ro'],
  ['dal_kamatz-for-patach', 'dol'],
  ['bosor_clean', 'bo-sor'],
  ['cholol_clean', 'cho-lol'],
  ['yofo_patach-for-kamatz', 'ya-fo'],
  ['malko_clean', 'mal-ko'],
  ['baal_clean', 'ba-al'],
  ['sholol_patach-for-kamatz', 'sho-lal'],
  ['diro_clean', 'di-ro'],
  ['oylom_clean', 'oy-lom'],
  ['dom_patach-for-kamatz', 'dam'],
  ['suko_clean', 'su-ko'],
];
const wav = Buffer.from(encodeWav(new Float32Array([0, .25, -.25, 0])));

function earAnswer(words, answers = [words]) {
  return { words, answers };
}

function syntheticWav(labels) {
  const rate = 16000;
  const length = rate / 4;
  const formants = { a: [780, 1230], o: [650, 1090], e: [700, 1600], i: [300, 2200], u: [350, 900] };
  const samples = new Float32Array(length + labels.length * length * 2);
  for (const [index, label] of labels.entries()) {
    let segment = new Float64Array(length);
    for (let i = 0; i < length; i += 1) {
      const impulse = i === 0 || Math.floor(i * 120 / rate) !== Math.floor((i - 1) * 120 / rate) ? 1 : 0;
      // Glottal rolloff matches the voiced meter fixtures.
      segment[i] = impulse + (i ? 0.95 * segment[i - 1] : 0);
    }
    const [f1, f2] = formants[label ?? 'o'];
    for (const [f, bw] of [[f1, 80], [f2, 100], [2500, 120], [3500, 150]]) {
      const c = -Math.exp(-2 * Math.PI * bw / rate);
      const b = 2 * Math.exp(-Math.PI * bw / rate) * Math.cos(2 * Math.PI * f / rate);
      const a = 1 - b - c;
      const output = new Float64Array(length);
      for (let i = 0; i < length; i += 1) {
        output[i] = a * segment[i] + (i > 0 ? b * output[i - 1] : 0) + (i > 1 ? c * output[i - 2] : 0);
      }
      segment = output;
    }
    for (let i = 0; i < length; i += 1) segment[i] *= Math.min(1, i / 320, (length - i - 1) / 320);
    const peak = segment.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    samples.set(segment.map((value) => value / peak * 0.5), length + index * length * 2);
  }
  return Buffer.from(encodeWav(samples));
}

async function fixtureDirectory(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(join(os.tmpdir(), 'kriah-recorder-test-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('recorder fixtures use the system temp folder and remove saved clips', async () => {
  let cleanup;
  const directory = await fixtureDirectory({ after: callback => { cleanup = callback; } });
  try {
    assert.equal(fs.realpathSync(join(directory, '..')), fs.realpathSync(os.tmpdir()));
    await writeFile(join(directory, 'clip.wav'), wav);
  } finally {
    await cleanup();
  }
  assert.equal(fs.existsSync(directory), false);
});

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

test('Round 1 selects only its 12 clips even when Round 1b appears first', async () => {
  const markdown = await readFile(new URL('../../docs/ear-test.md', import.meta.url), 'utf8');
  const newWordsStart = markdown.indexOf('## Round 1b: new words');
  const newWordsEnd = markdown.indexOf('\n## ', newWordsStart + 1);
  const newWordsSection = markdown.slice(newWordsStart, newWordsEnd);
  assert.deepEqual(parseClips(markdown, 'Round 1b').map(({ name, say }) => [name, say]), expectedNewClips);
  for (const source of [markdown, `${newWordsSection}\n\n${markdown}`]) {
    const clips = parseClips(source, 'Round 1');
    assert.equal(clips.length, 12);
    assert.deepEqual(clips.map(({ name, say }) => [name, say]), expectedClips);
    assert.ok(clips.every((clip) => !expectedNewClips.some(([name]) => name === clip.name)));
  }
});

test('loadClips returns both voice checks and all rounds with their sections in table order', async () => {
  const clips = await loadClips();
  assert.deepEqual(clips.map(({ name, kind, section }) => [name, kind, section]), [
    ['voice-check', 'voice', 'Voice check'],
    ...expectedNewClips.map(([name]) => [name, 'reading', 'Round 1b']),
    ...expectedSealedClips.map(([name]) => [name, 'reading', 'Round 1c']),
    ...expectedCardTests.map(([name], index) => [name, 'card', index < 3 ? 'Card tests' : 'Sheva tests']),
    ...expectedRound1d.map(([name]) => [name, 'reading', 'Round 1d']),
    ...expectedRound1e.map(([name]) => [name, 'reading', 'Round 1e']),
    ['voice-check-2', 'voice', 'Voice check 2'],
    ...expectedRound1f.map(([name]) => [name, 'reading', 'Round 1f']),
    ...expectedRound1g.map(([name]) => [name, 'reading', 'Round 1g']),
    ...expectedClips.map(([name]) => [name, 'reading', 'Round 1']),
  ]);
  assert.deepEqual(clips.filter(clip => clip.kind !== 'voice').map(({ name, say }) => [name, say]),
    [...expectedNewClips, ...expectedSealedClips, ...expectedCardTests, ...expectedRound1d, ...expectedRound1e,
      ...expectedRound1f, ...expectedRound1g, ...expectedClips]);
  assert.deepEqual(clips.find(clip => clip.name === 'voice-check-2'), {
    ...clips[0], name: 'voice-check-2', section: 'Voice check 2',
  });
  for (const clip of clips) {
    if (clip.kind === 'voice') assert.equal(Object.hasOwn(clip, 'card'), false);
    else assert.equal(clip.card, ['Round 1f', 'Round 1g'].includes(clip.section) ? 'voice-check-2' : 'voice-check');
  }
  const markdown = await readFile(new URL('../../docs/ear-test.md', import.meta.url), 'utf8');
  assert.deepEqual(parseClips(markdown, 'Round 1c').map(({ name, say }) => [name, say]), expectedSealedClips);
});

test('Round 1e clips are readings after Round 1d with table Say values for both sets', async () => {
  for (const set of ['adult', 'child']) {
    const clips = await loadClips(set);
    const prefix = set === 'child' ? 'child_' : '';
    const start = clips.findIndex(({ name }) => name === `${prefix}shom_clean`);
    assert.ok(start > 0);
    assert.equal(start, clips.findIndex(({ name }) => name === `${prefix}nachal_kamatz-for-patach`) + 1);
    assert.deepEqual(clips.slice(start, start + expectedRound1e.length).map(({ name, say, kind }) => [name, say, kind]),
      expectedRound1e.map(([name, say]) => [`${prefix}${name}`, say, 'reading']));
  }
});

test('parser follows the table instead of hardcoding its rows and rejects malformed input', async () => {
  const markdown = await readFile(new URL('../../docs/ear-test.md', import.meta.url), 'utf8');
  const changed = markdown.replace('| baruch_clean | בָּרוּךְ | bo-ruch |', '| baruch_changed | בָּרוּךְ | ba-ruch |');
  assert.deepEqual(parseClips(changed)[1], {
    name: 'baruch_changed', hebrew: 'בָּרוּךְ', say: 'ba-ruch', planted: 'nothing',
  });
  assert.throws(() => parseClips('## Round 2\n'), /missing/);
  assert.throws(() => parseClips(markdown.replaceAll('File name', 'Filename')), /columns/);
  assert.throws(() => parseClips(markdown.replace('| baruch_clean |', '| ../escape |')), /Invalid/);
  assert.throws(() => parseClips(markdown.replace('| baruch_clean |', '| shabbos_va-for-ba |')), /unique/);
});

test('parser selects the voice check section, escapes heading names and names errors for that section', async () => {
  const markdown = await readFile(new URL('../../docs/ear-test.md', import.meta.url), 'utf8');
  const voice = parseClips(markdown, 'Voice check');
  assert.deepEqual(voice, [{ name: 'voice-check', hebrew: VOICE_CARD.join(' '),
    say: 'bo ba be bi boy do da de di doy mo ma me mi moy', planted: 'nothing' }]);
  assert.deepEqual(parseClips(markdown.replace('## Voice check', '## Voice [check]. card'), 'Voice [check]. card'), voice);
  assert.throws(() => parseClips(markdown, 'Missing'), /Missing clip table is missing/);
  assert.throws(() => parseClips(markdown.replace('File name | Hebrew | Say', 'File | Hebrew | Say'), 'Voice check'), /Voice check.*columns/);
  assert.throws(() => parseClips(markdown.replace('| voice-check |', '| ../escape |'), 'Voice check'), /Invalid Voice check/);
});

test('name validation accepts only exact table names in the selected set', async () => {
  const adult = await loadClips();
  const child = await loadClips('child');
  assert.equal(adult.length, 101);
  assert.equal(adult[0].name, 'voice-check');
  assert.equal(adult[0].kind, 'voice');
  assert.deepEqual(adult.filter(clip => clip.kind === 'voice').map(clip => clip.name), ['voice-check', 'voice-check-2']);
  assert.ok(adult.filter(clip => clip.kind !== 'voice').every((clip) =>
    clip.kind === (expectedCardTests.some(([name]) => name === clip.name) ? 'card' : 'reading')));
  assert.equal(new Set(adult.map((clip) => clip.name)).size, 101);
  assert.deepEqual(child, adult.map((clip) => ({ ...clip, name: `child_${clip.name}`,
    ...(clip.card ? { card: `child_${clip.card}` } : {}),
  })));
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
  assert.equal(list.json.clips.length, 101);
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

test('server lists, saves and plays both adult and child voice checks like other clips', async (t) => {
  const directory = await fixtureDirectory(t);
  for (const set of ['adult', 'child']) {
    const server = await createRecorderServer({ set, directory });
    const names = ['voice-check', 'voice-check-2'].map(name => `${set === 'child' ? 'child_' : ''}${name}`);
    const list = await request(server, '/clips');
    assert.equal(list.json.clips.length, 101);
    const cards = list.json.clips.filter(clip => clip.kind === 'voice');
    assert.deepEqual(cards.map(clip => clip.name), names);
    assert.ok(cards.every(clip => clip.hebrew === VOICE_CARD.join(' ') && clip.say.split(' ').length === 15));
    for (const name of names) {
      assert.equal((await post(server, name)).status, 200);
      assert.deepEqual((await request(server, `/clip?name=${name}`)).body, wav);
      assert.equal((await request(server, '/clips')).json.clips.find(clip => clip.name === name).done, true);
    }
  }
  const server = await createRecorderServer({ directory });
  assert.deepEqual((await request(server, '/clips?set=child', { method: 'DELETE' })).json.deleted.sort(),
    ['child_voice-check-2.wav', 'child_voice-check.wav']);
  assert.deepEqual((await readdir(directory)).sort(), ['voice-check-2.wav', 'voice-check.wav']);
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
  const clips = (await loadClips()).filter((clip) => clip.kind === 'reading');
  const store = recordingStore(clips, directory);
  await store.save(clips[0].name, wav);
  await store.save(clips[1].name, wav);
  const output = [];
  let calls = 0;
  const result = await runEar({ directory, model: 'fallback', log: (line) => output.push(line),
    ear: async (audio, options) => {
      assert.deepEqual(audio, { data: wav, format: 'wav' });
      assert.deepEqual(options, { model: 'fallback', votes: 1 });
      return earAnswer(++calls === 1 ? [['O', 'MEYN']] : [['ba', 'ra', 'cha']]);
    } });
  assert.equal(calls, 2);
  assert.equal(result.code, 1);
  assert.match(output[0], /^Ear model: fallback \(.+\)$/);
  assert.deepEqual(output.slice(1), ['Ear votes: 1 (fallback ear)', 'Voice card: voice-check (not recorded)', 'Vowel meter: off (no voice check recorded)',
    'Voice card to the ear: off (no voice check recorded)', 'Phoneme referee: off (no voice check recorded)',
    'clip\tsaid\theard\tresult\tear\tmetered\tvotes',
    'omein_clean\to-meyn\tO-MEYN\tPASS\tO-MEYN\tO-MEYN\tO-MEYN',
    'brocho_clean\tbe-ro-cho\tba-ra-cha\tMISS\tba-ra-cha\tba-ra-cha\tba-ra-cha']);
  assert.ok((await store.list()).slice(0, 2).every((clip) => clip.done));
});

test('ear runner uses listen and logs every vote, including excluded word counts and error rows', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  for (const name of ['omein_clean', 'brocho_clean']) await store.save(name, wav);
  const previous = process.env.META_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = previous;
  });
  process.env.META_API_KEY = 'offline-primary-placeholder';
  const raws = ['a-meyn ba-ruch', 'o-meyn', 'o-meyn'];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    const raw = raws[calls++];
    if (raw === undefined) throw new Error('private provider failure');
    return Response.json({ choices: [{ message: { content: raw } }] });
  });
  const output = [];
  const result = await runEar({ directory, model: 'primary', votes: 3, meter: false, card: false, referee: false,
    log: line => output.push(line) });
  assert.equal(calls, 6);
  assert.equal(result.code, 1);
  assert.deepEqual(output.slice(6), [
    'clip\tsaid\theard\tresult\tear\tmetered\tvotes',
    'omein_clean\to-meyn\to-meyn\tPASS\to-meyn\to-meyn\ta-meyn ba-ruch | o-meyn | o-meyn',
    'brocho_clean\tbe-ro-cho\tERROR\tMISS\tERROR\tERROR\tERROR',
  ]);
  assert.equal(result.rows[0].votes, 'a-meyn ba-ruch | o-meyn | o-meyn');
  assert.equal(result.rows[1].votes, 'ERROR');
  assert.ok(output.every(line => !line.includes('private provider failure')));
});

test('voice-only runs inspect the first recorded voice clip in list order for either set', async t => {
  for (const set of ['adult', 'child']) {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(set), directory);
    const prefix = set === 'child' ? 'child_' : '';
    const second = Buffer.from('second card');
    const first = Buffer.from('first card');
    await store.save(`${prefix}voice-check-2`, second);
    for (const [name, audio] of [['voice-check-2', second], ['voice-check', first]]) {
      if (name === 'voice-check') await store.save(`${prefix}${name}`, audio);
      const output = [];
      const calls = [];
      await runEar({ set, directory, keep: true, meter: false, card: false, log: line => output.push(line),
        ear: async () => assert.fail('no readings'), phonemes: async data => {
          calls.push(data);
          return null;
        } });
      assert.equal(output[2], `Voice card: ${prefix}${name}`);
      assert.deepEqual(calls, [audio, audio]);
    }
  }
});

test('each sitting prepares its own card once before any ear call and uses its meter, reference and referee', async t => {
  for (const set of ['adult', 'child']) {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(set), directory);
    const prefix = set === 'child' ? 'child_' : '';
    const labels = cardLabels('ashkenazi');
    const first = syntheticWav(labels);
    const second = syntheticWav(labels.map(label => label === 'a' ? 'o' : label === 'o' ? 'a' : label));
    const recordings = [
      ['omein_clean', syntheticWav(['o', 'e']), [['a', 'meyn']], 'o-meyn', first],
      ['kohol_patach-for-kamatz', syntheticWav(['o', 'a']), [['ka', 'hal']], 'ka-hol', second],
      ['baruch_clean', syntheticWav(['o', 'u']), [['ba', 'ruch']], 'bo-ruch', first],
    ];
    for (const [name, audio] of [['voice-check', first], ['voice-check-2', second], ...recordings]) {
      await store.save(`${prefix}${name}`, audio);
    }
    const output = [];
    const calls = [];
    let reads = 0;
    const blocks = [
      `Voice card: ${prefix}voice-check`,
      'Vowel meter: on (ashkenazi voice check)',
      'Voice card to the ear: on',
      'Phoneme referee: on (o 0.91, a 0.43, line 0.50)',
      `Voice card: ${prefix}voice-check-2`,
      'Vowel meter: on (ashkenazi voice check)',
      'Voice card to the ear: on',
      'Phoneme referee: on (o 0.95, a 0.65, line 0.70)',
      'clip\tsaid\theard\tresult\tear\tmetered\tvotes',
    ];
    const result = await runEar({ set, directory, keep: true, model: 'primary', log: line => output.push(line),
      ear: async (audio, options) => {
        assert.deepEqual(output.slice(2, 11), blocks);
        const [, data, words, , voice] = recordings[reads++];
        assert.deepEqual(audio, { data, format: 'wav' });
        assert.deepEqual(options, { model: 'primary', votes: defaultVotes(), reference: { data: voice, format: 'wav' } });
        return earAnswer(words);
      }, phonemes: async data => {
        calls.push(data);
        if (data.equals(first)) return phonemeCard();
        if (data.equals(second)) return phonemeCard(0.65, 0.95);
        const tokens = [phonemeVowel(0.6)];
        if (data.equals(recordings[0][1])) tokens.push({ token: 'e', top: [['e', 1]] });
        if (data.equals(recordings[1][1])) tokens.push(phonemeVowel(0.9));
        if (data.equals(recordings[2][1])) tokens.push({ token: 'u', top: [['u', 1]] });
        return tokens;
      } });
    assert.equal(reads, 3);
    assert.equal(result.code, 0);
    assert.deepEqual(calls, [first, second, ...recordings.map(([, audio]) => audio)]);
    assert.deepEqual(output.slice(2, 11), blocks);
    assert.deepEqual(result.rows.map(row => [row.clip, row.ear, row.metered, row.heard]),
      recordings.map(([name, , words, heard]) => [`${prefix}${name}`, words.map(word => word.join('-')).join(' '), heard, heard]));
    assert.deepEqual(output.slice(14), ['Phoneme referee: checked 3 of 3 readings']);
  }
});

test('--card selects the card for the meter, ear reference and referee in either set', async t => {
  for (const set of ['adult', 'child']) {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(set), directory);
    const prefix = set === 'child' ? 'child_' : '';
    const voice = syntheticWav(cardLabels('ashkenazi'));
    const reading = syntheticWav(['o', 'u']);
    await store.save(`${prefix}voice-check`, syntheticWav(Array(15).fill('a')));
    await store.save(`${prefix}voice-check-2`, voice);
    await store.save(`${prefix}baruch_clean`, reading);
    const output = [];
    const calls = [];
    let reads = 0;
    const result = await runEar({ ...parseOptions(['--card', 'voice-check-2', '--set', set, '--model', 'primary'], 'ear'),
      directory, log: line => output.push(line), ear: async (audio, options) => {
        reads += 1;
        assert.deepEqual(audio, { data: reading, format: 'wav' });
        assert.deepEqual(options, { model: 'primary', votes: defaultVotes(), reference: { data: voice, format: 'wav' } });
        return earAnswer([['ba', 'ruch']]);
      }, phonemes: async data => {
        calls.push(data);
        return calls.length === 1 ? phonemeCard() : [phonemeVowel(0.9), { token: 'u', top: [['u', 1]] }];
      } });
    assert.equal(reads, 1);
    assert.equal(result.code, 0);
    assert.equal(output[2], `Voice card: ${prefix}voice-check-2`);
    assert.equal(output[3], 'Vowel meter: on (ashkenazi voice check)');
    assert.equal(output[4], 'Voice card to the ear: on');
    assert.deepEqual(calls, [voice, reading]);
    assert.deepEqual(result.rows, [{ clip: `${prefix}baruch_clean`, said: 'bo-ruch', heard: 'bo-ruch', result: 'PASS',
      ear: 'ba-ruch', metered: 'bo-ruch', votes: 'ba-ruch' }]);
    if (set === 'child') assert.deepEqual(await readdir(directory), []);
  }
});

test('--card overrides every reading card across sittings and prepares only the override', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  const voice = syntheticWav(cardLabels('ashkenazi'));
  await store.save('voice-check', Buffer.from('unused card'));
  await store.save('voice-check-2', voice);
  const readings = [
    ['omein_clean', syntheticWav(['o', 'e']), [['a', 'meyn']], [phonemeVowel(0.9), { token: 'e', top: [['e', 1]] }]],
    ['gal_clean', syntheticWav(['a']), [['gol']], [phonemeVowel(0.07)]],
  ];
  for (const [name, audio] of readings) await store.save(name, audio);
  const calls = [];
  const output = [];
  let reads = 0;
  const result = await runEar({ ...parseOptions(['--card', 'voice-check-2', '--model', 'primary'], 'ear'), directory,
    log: line => output.push(line), ear: async (audio, options) => {
      const [, data, words] = readings[reads++];
      assert.deepEqual(audio, { data, format: 'wav' });
      assert.deepEqual(options, { model: 'primary', votes: defaultVotes(), reference: { data: voice, format: 'wav' } });
      return earAnswer(words);
    }, phonemes: async data => {
      calls.push(data);
      return data.equals(voice) ? phonemeCard() : readings.find(([, audio]) => data.equals(audio))[3];
    } });
  assert.equal(reads, 2);
  assert.equal(result.code, 0);
  assert.deepEqual(calls, [voice, ...readings.map(([, audio]) => audio)]);
  assert.deepEqual(output.filter(line => line.startsWith('Voice card:')), ['Voice card: voice-check-2']);
  assert.deepEqual(result.rows.map(row => [row.ear, row.metered, row.heard]),
    [['a-meyn', 'o-meyn', 'o-meyn'], ['gol', 'gol', 'gal']]);
  assert.deepEqual(output.slice(9), ['Phoneme referee: checked 2 of 2 readings']);
});

test('--card rejects unknown, non-voice and unrecorded clips before calling either service', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  for (const name of ['voice-check', 'baruch_clean', 'voice-check_patach-for-kamatz']) await store.save(name, wav);
  let calls = 0;
  const service = async () => { calls += 1; };
  for (const [name, message] of [
    ['missing-card', 'Voice card must name a voice clip: missing-card.'],
    ['baruch_clean', 'Voice card must name a voice clip: baruch_clean.'],
    ['voice-check_patach-for-kamatz', 'Voice card must name a voice clip: voice-check_patach-for-kamatz.'],
    ['voice-check-2', 'Voice card is not recorded: voice-check-2.'],
  ]) {
    await assert.rejects(runEar({ ...parseOptions(['--card', name, '--no-meter', '--no-card', '--no-referee'], 'ear'),
      directory, ear: service, phonemes: service, log: () => assert.fail('selection must be checked first') }), { message });
  }
  assert.equal(calls, 0);
});

test('--round filters recorded readings by exact section while the default grades all rounds', async t => {
  for (const set of ['adult', 'child']) {
    const directory = await fixtureDirectory(t);
    const clips = await loadClips(set);
    const store = recordingStore(clips, directory);
    const prefix = set === 'child' ? 'child_' : '';
    const names = ['gal_clean', 'sal_clean', 'shiro_clean', 'baruch_clean', 'voice-check-2', 'kamatz-card_clean'];
    for (const name of names) await store.save(`${prefix}${name}`, Buffer.from(name));
    for (const round of ['Round 1g', undefined]) {
      const readings = [];
      const output = [];
      const result = await runEar({ ...parseOptions(['--set', set, '--keep', '--no-meter', '--no-card', '--no-referee',
        ...(round === undefined ? [] : ['--round', round])], 'ear'), directory,
        log: line => output.push(line), ear: async audio => {
          const name = audio.data.toString();
          readings.push(name);
          const clip = clips.find(clip => clip.name === `${prefix}${name}`);
          return earAnswer(clip.say.split(' ').map(word => word.split('-')));
        } });
      const expected = round === 'Round 1g' ? ['sal_clean', 'shiro_clean'] : names.slice(0, 4);
      assert.equal(result.code, 0);
      assert.deepEqual(readings, expected);
      assert.deepEqual(result.rows.map(row => row.clip), expected.map(name => `${prefix}${name}`));
      assert.equal(output[2], `Voice card: ${prefix}voice-check-2`);
      assert.deepEqual(output.filter(line => line.startsWith('Voice card:')),
        (round ? ['voice-check-2'] : ['voice-check-2', 'voice-check (not recorded)']).map(name => `Voice card: ${prefix}${name}`));
    }
  }
});

test('--round rejects unknown sections and sections without recorded readings before either service', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  for (const name of ['voice-check', 'gal_clean', 'kamatz-card_clean']) await store.save(name, wav);
  let calls = 0;
  const service = async () => { calls += 1; };
  for (const [round, message] of [
    ['Round 9', 'Unknown section: Round 9.'],
    ['round 1f', 'Unknown section: round 1f.'],
    ['Round 1g', 'No recorded readings in section: Round 1g.'],
    ['Voice check', 'No recorded readings in section: Voice check.'],
    ['Card tests', 'No recorded readings in section: Card tests.'],
  ]) {
    await assert.rejects(runEar({ ...parseOptions(['--round', round], 'ear'), directory,
      ear: service, phonemes: service, log: () => assert.fail('selection must be checked first') }), { message });
  }
  assert.equal(calls, 0);
});

test('--round rejects an unrecorded sitting card before either service, even with ear features off', async t => {
  for (const set of ['adult', 'child']) {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(set), directory);
    const prefix = set === 'child' ? 'child_' : '';
    for (const name of ['voice-check', 'omein_clean', 'gal_clean']) await store.save(`${prefix}${name}`, wav);
    let calls = 0;
    const service = async () => { calls += 1; };
    for (const flags of [[], ['--no-meter', '--no-card', '--no-referee']]) {
      await assert.rejects(runEar({ ...parseOptions(['--set', set, '--keep', '--round', 'Round 1f', ...flags], 'ear'),
        directory, ear: service, phonemes: service, log: () => assert.fail('selection must be checked first') }), error => {
        assert.equal(error.constructor.name, 'SelectionError');
        assert.match(error.message, new RegExp(`${prefix}voice-check-2.*Round 1f`));
        return true;
      });
    }
    assert.equal(calls, 0);
    assert.equal((await store.list()).filter(clip => clip.done).length, 3);
  }
});

test('a plain run with an unrecorded sitting card grades that sitting with all card features off', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  await store.save('voice-check', syntheticWav(cardLabels('ashkenazi')));
  const reading = syntheticWav(['o']);
  await store.save('gal_clean', reading);
  const output = [];
  let calls = 0;
  let earOptions;
  let phonemeCalls = 0;
  const result = await runEar({ directory, model: 'primary', log: line => output.push(line),
    ear: async (audio, options) => {
      calls += 1;
      assert.deepEqual(audio, { data: reading, format: 'wav' });
      earOptions = options;
      return earAnswer([['gal']]);
    }, phonemes: async () => { phonemeCalls += 1; return phonemeCard(); } });
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(earOptions), ['model', 'votes']);
  assert.deepEqual(earOptions, { model: 'primary', votes: defaultVotes() });
  assert.equal(phonemeCalls, 0);
  assert.equal(result.code, 0);
  assert.deepEqual(output.slice(2, 6), ['Voice card: voice-check-2 (not recorded)',
    'Vowel meter: off (no voice check recorded)', 'Voice card to the ear: off (no voice check recorded)',
    'Phoneme referee: off (no voice check recorded)']);
  assert.deepEqual(result.rows, [{ clip: 'gal_clean', said: 'gal', heard: 'gal', result: 'PASS',
    ear: 'gal', metered: 'gal', votes: 'gal' }]);
  assert.equal(output.length, 8);
});

test('child selection errors leave all recordings untouched before any service call', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips('child'), directory);
  for (const name of ['child_voice-check', 'child_omein_clean', 'child_gal_clean']) await store.save(name, wav);
  for (const name of ['child_old.wav', 'adult.wav']) await writeFile(join(directory, name), wav);
  const files = (await readdir(directory)).sort();
  let calls = 0;
  const service = async () => { calls += 1; };
  for (const [args, message] of [
    [['--keep', '--round', 'Round 1ff'], /Unknown section: Round 1ff/],
    [['--card', 'missing-card'], /Voice card must name a voice clip: missing-card/],
    [['--card', 'omein_clean'], /Voice card must name a voice clip: omein_clean/],
    [['--card', 'voice-check-2'], /Voice card is not recorded: child_voice-check-2/],
    [['--keep', '--round', 'Round 1f', '--card', 'voice-check-2'], /Voice card is not recorded: child_voice-check-2/],
    [['--keep', '--round', 'Round 1f'], /child_voice-check-2.*Round 1f/],
    [['--keep', '--round', 'Round 1g'], /No recorded readings in section: Round 1g/],
  ]) {
    await assert.rejects(runEar({ ...parseOptions(['--set', 'child', ...args], 'ear'), directory,
      ear: service, phonemes: service, log: () => assert.fail('selection must be checked first') }), message);
    assert.deepEqual((await readdir(directory)).sort(), files);
    for (const name of files) assert.deepEqual(await readFile(join(directory, name)), wav);
  }
  assert.equal(calls, 0);
});

test('--round with child recordings requires --keep before reading anything and deletes nothing', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips('child'), directory);
  for (const name of ['child_voice-check', 'child_gal_clean', 'child_omein_clean']) await store.save(name, wav);
  const files = (await readdir(directory)).sort();
  for (const round of ['Round 1f', 'Round 1ff']) {
    for (const target of [directory, null]) {
      await assert.rejects(runEar({ ...parseOptions(['--set', 'child', '--round', round], 'ear'), directory: target,
        log: () => assert.fail('selection must be checked first'), ear: async () => assert.fail('no ear call'),
        phonemes: async () => assert.fail('no phoneme call') }), error => {
        assert.equal(error.constructor.name, 'SelectionError');
        assert.match(error.message, /--keep/);
        assert.match(error.message, /child's other rounds would be deleted without being graded/);
        return true;
      });
    }
    assert.deepEqual((await readdir(directory)).sort(), files);
    for (const name of files) assert.deepEqual(await readFile(join(directory, name)), wav);
  }
});

test('votes append ERROR for each call that did not answer after the returned answers', async t => {
  const directory = await fixtureDirectory(t);
  await recordingStore(await loadClips(), directory).save('ochal_patach-for-kamatz', wav);
  const previous = process.env.META_API_KEY;
  t.after(() => {
    if (previous === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = previous;
  });
  process.env.META_API_KEY = 'offline-primary-placeholder';
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    const raw = ['a-chal', 'a-chol'][calls++];
    if (raw === undefined) throw new Error('private provider failure');
    return Response.json({ choices: [{ message: { content: raw } }] });
  });
  for (const votes of [3, 5]) {
    calls = 0;
    const output = [];
    const result = await runEar({ directory, model: 'primary', votes, meter: false, card: false, referee: false,
      log: line => output.push(line) });
    assert.equal(calls, votes);
    assert.equal(result.code, 0);
    const expected = ['a-chal', 'a-chol', ...Array(votes - 2).fill('ERROR')].join(' | ');
    assert.equal(result.rows[0].votes, expected);
    assert.equal(output[7].split('\t')[6], expected);
    assert.ok(output.every(line => !line.includes('private provider failure')));
  }
});

test('voice check calibrates metered heard sounds while preserving ear sounds and audio-only calls', async (t) => {
  const directory = await fixtureDirectory(t);
  const clips = await loadClips();
  const store = recordingStore(clips, directory);
  const voice = syntheticWav(cardLabels('ashkenazi'));
  const reading = syntheticWav(['o', 'u']);
  await store.save('voice-check', voice);
  await store.save('baruch_clean', reading);
  let calls = 0;
  const output = [];
  const earWords = Object.freeze([Object.freeze(['ba', 'ruch'])]);
  const result = await runEar({ directory, model: 'primary', log: line => output.push(line),
    ear: async (audio, options) => {
      calls += 1;
      assert.deepEqual(audio, { data: reading, format: 'wav' });
      assert.deepEqual(options, { model: 'primary', votes: defaultVotes(), reference: { data: voice, format: 'wav' } });
      return earAnswer(earWords);
    } });
  assert.equal(calls, 1);
  assert.equal(result.code, 0);
  assert.equal(output[1], `Ear votes: ${defaultVotes()}`);
  assert.equal(output[3], 'Vowel meter: on (ashkenazi voice check)');
  assert.equal(output[4], 'Voice card to the ear: on');
  assert.equal(output[5], 'Phoneme referee: off (no answer from the phoneme service)');
  assert.equal(output[6], 'clip\tsaid\theard\tresult\tear\tmetered\tvotes');
  assert.equal(output[7], 'baruch_clean\tbo-ruch\tbo-ruch\tPASS\tba-ruch\tbo-ruch\tba-ruch');
  assert.equal(output.length, 8);
  assert.deepEqual(result.rows, [{ clip: 'baruch_clean', said: 'bo-ruch', heard: 'bo-ruch', result: 'PASS',
    ear: 'ba-ruch', metered: 'bo-ruch', votes: 'ba-ruch' }]);
  assert.deepEqual(earWords, [['ba', 'ruch']]);
});

test('--no-meter leaves heard and ear columns equal and omits an unusable voice card', async (t) => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  await store.save('voice-check', Buffer.from('Unusable synthetic WAV'));
  const reading = syntheticWav(['o', 'u']);
  await store.save('baruch_clean', reading);
  const output = [];
  let calls = 0;
  const result = await runEar({ ...parseOptions(['--no-meter'], 'ear'), directory,
    log: line => output.push(line), ear: async (audio, options) => {
      calls += 1;
      assert.deepEqual(audio.data, reading);
      assert.deepEqual(options, { model: defaultEarModel(), votes: defaultEarModel() === 'fallback' ? 1 : defaultVotes() });
      return earAnswer([['ba', 'ruch']]);
    } });
  assert.equal(calls, 1);
  assert.equal(result.code, 1);
  assert.equal(output[3], 'Vowel meter: off (--no-meter)');
  assert.equal(output[4], 'Voice card to the ear: off (voice check unusable)');
  assert.equal(output[7], 'baruch_clean\tbo-ruch\tba-ruch\tMISS\tba-ruch\tba-ruch\tba-ruch');
  assert.equal(result.rows[0].heard, result.rows[0].ear);
});

test('missing and unusable voice checks log meter status and fall back to the ear', async (t) => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  const reading = syntheticWav(['o', 'u']);
  await store.save('baruch_clean', reading);
  const oneClass = syntheticWav(Array(15).fill('a'));
  // Chassidish leaves kamatz and cholam unlabeled, so only a measures here.
  const quietCard = Buffer.from(oneClass);
  for (const index of [2, 3, 7, 8, 12, 13]) {
    const offset = 44 + (4000 + index * 8000) * 2;
    for (let i = 0; i < 4000; i += 1) quietCard.writeInt16LE(i % 2 ? 16384 : -16384, offset + i * 2);
  }
  for (const [voice, preset, status] of [
    [null, 'ashkenazi', 'off (no voice check recorded)'],
    [syntheticWav(['a', 'o']), 'ashkenazi', 'off (voice check unusable: heard 2 sounds for 15)'],
    [wav, 'ashkenazi', 'off (voice check unusable: heard 0 sounds for 15)'],
    [Buffer.alloc(0), 'ashkenazi', 'off (voice check unusable)'],
    // Its six noise syllables are unvoiced, so they do not count as sounds.
    [quietCard, 'chassidish', 'off (voice check unusable: heard 9 sounds for 15)'],
  ]) {
    if (voice) await store.save('voice-check', voice);
    const output = [];
    let calls = 0;
    const result = await runEar({ directory, preset, log: line => output.push(line), ear: async (audio, options) => {
      calls += 1;
      assert.deepEqual(audio.data, reading);
      assert.deepEqual(options, { model: defaultEarModel(), votes: defaultEarModel() === 'fallback' ? 1 : defaultVotes() });
      return earAnswer([['ba', 'ruch']]);
    } });
    assert.equal(calls, 1);
    assert.equal(output[3], `Vowel meter: ${status}`);
    assert.equal(output[4], `Voice card to the ear: ${voice ? 'off (voice check unusable)' : 'off (no voice check recorded)'}`);
    assert.equal(output[7], 'baruch_clean\tbo-ruch\tba-ruch\tMISS\tba-ruch\tba-ruch\tba-ruch');
    assert.equal(result.rows[0].heard, result.rows[0].ear);
  }
});

test('voice check is a reference for every reading even when the meter is disabled', async t => {
  const directory = await fixtureDirectory(t);
  const clips = await loadClips();
  const store = recordingStore(clips, directory);
  const voice = syntheticWav(cardLabels('ashkenazi'));
  await store.save('voice-check', voice);
  const readings = clips.filter(clip => clip.kind === 'reading').slice(0, 2);
  const reading = syntheticWav(['o', 'u']);
  for (const clip of readings) await store.save(clip.name, reading);
  let calls = 0;
  const output = [];
  const result = await runEar({ directory, meter: false, model: 'primary', log: line => output.push(line),
    ear: async (audio, options) => {
      assert.deepEqual(audio, { data: reading, format: 'wav' });
      assert.deepEqual(options, { model: 'primary', votes: defaultVotes(), reference: { data: voice, format: 'wav' } });
      calls += 1;
      return earAnswer([['ba', 'ruch']]);
    } });
  assert.equal(calls, 2);
  assert.deepEqual(output.slice(3, 5), ['Vowel meter: off (--no-meter)', 'Voice card to the ear: on']);
  assert.ok(result.rows.every(row => row.heard === 'ba-ruch' && row.ear === 'ba-ruch'));
});

test('merged vowels omit the voice card with the meter on or off', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  const labels = cardLabels('ashkenazi').map(label => label === 'o' ? 'a' : label);
  await store.save('voice-check', syntheticWav(labels));
  const reading = syntheticWav(['a', 'u']);
  await store.save('baruch_clean', reading);
  for (const meter of [true, false]) {
    let calls = 0;
    const output = [];
    const result = await runEar({ directory, meter, model: 'primary', log: line => output.push(line),
      ear: async (audio, options) => {
        calls += 1;
        assert.deepEqual(audio, { data: reading, format: 'wav' });
        assert.deepEqual(options, { model: 'primary', votes: defaultVotes() });
        return earAnswer([['ba', 'ruch']]);
      } });
    assert.equal(calls, 1);
    assert.equal(output[3], meter ? 'Vowel meter: on (ashkenazi voice check)' : 'Vowel meter: off (--no-meter)');
    assert.equal(output[4], 'Voice card to the ear: off (vowels merged on the card)');
    assert.equal(result.rows[0].heard, 'ba-ruch');
  }
});

test('a usable Chassidish voice check omits the card while the same audio is a reference for Ashkenazi', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  const voice = syntheticWav(cardLabels('ashkenazi'));
  const reading = syntheticWav(['o', 'u']);
  await store.save('voice-check', voice);
  await store.save('baruch_clean', reading);
  for (const preset of ['chassidish', 'ashkenazi']) {
    const output = [];
    let calls = 0;
    const result = await runEar({ ...parseOptions(['--preset', preset, '--model', 'primary'], 'ear'), directory,
      log: line => output.push(line), ear: async (audio, options) => {
        calls += 1;
        assert.deepEqual(audio, { data: reading, format: 'wav' });
        const expected = { model: 'primary', votes: defaultVotes() };
        if (preset === 'ashkenazi') expected.reference = { data: voice, format: 'wav' };
        assert.deepEqual(options, expected);
        return earAnswer([['bo', 'ruch']]);
      } });
    assert.equal(calls, 1);
    assert.equal(result.code, 0);
    assert.equal(output[3], `Vowel meter: on (${preset} voice check)`);
    assert.equal(output[4], `Voice card to the ear: ${preset === 'chassidish'
      ? 'off (kamatz not checked on the card)' : 'on'}`);
  }
});

test('the fallback ear never gets the card, so the runner reports it off', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  await store.save('voice-check', syntheticWav(cardLabels('ashkenazi')));
  await store.save('baruch_clean', syntheticWav(['o', 'u']));
  let calls = 0;
  const output = [];
  const result = await runEar({ ...parseOptions(['--model', 'fallback'], 'ear'), directory,
    log: line => output.push(line), ear: async (_audio, options) => {
      assert.deepEqual(options, { model: 'fallback', votes: 1 });
      calls += 1;
      return earAnswer([['bo', 'ruch']]);
    } });
  assert.equal(calls, 1);
  assert.equal(result.code, 0);
  assert.deepEqual(output.slice(1, 5), [
    'Ear votes: 1 (fallback ear)', 'Voice card: voice-check', 'Vowel meter: on (ashkenazi voice check)', 'Voice card to the ear: off (fallback ear)',
  ]);
});

test('--no-card omits the reference while leaving the vowel meter enabled', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  await store.save('voice-check', syntheticWav(cardLabels('ashkenazi')));
  await store.save('baruch_clean', syntheticWav(['o', 'u']));
  let calls = 0;
  const output = [];
  const result = await runEar({ ...parseOptions(['--no-card', '--model', 'primary'], 'ear'), directory,
    log: line => output.push(line), ear: async (_audio, options) => {
      assert.deepEqual(options, { model: 'primary', votes: defaultVotes() });
      calls += 1;
      return earAnswer([['ba', 'ruch']]);
    } });
  assert.equal(calls, 1);
  assert.equal(result.code, 0);
  assert.equal(result.rows[0].heard, 'bo-ruch');
  assert.equal(result.rows[0].ear, 'ba-ruch');
  assert.deepEqual(output.slice(3, 5), [
    'Vowel meter: on (ashkenazi voice check)', 'Voice card to the ear: off (--no-card)',
  ]);
  await store.remove('voice-check');
  output.length = 0;
  await runEar({ directory, meter: false, card: false, log: line => output.push(line), ear: async () => earAnswer([['ba']]) });
  assert.equal(output[4], 'Voice card to the ear: off (--no-card)');
});

test('ear runner uses the selected preset for voice card labels', async (t) => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  await store.save('voice-check', syntheticWav(cardLabels('sephardi')));
  await store.save('ani_clean', syntheticWav(['a', 'i']));
  const output = [];
  const result = await runEar({ ...parseOptions(['--preset', 'sephardi'], 'ear'), directory,
    log: line => output.push(line), ear: async () => earAnswer([['a', 'ne']]) });
  assert.equal(result.code, 0);
  assert.equal(output[3], 'Vowel meter: on (sephardi voice check)');
  assert.equal(output[7], 'ani_clean\ta-ni\ta-ni\tPASS\ta-ne\ta-ni\ta-ne');
});

test('child runner deletes voice checks after success, ear failure and voice-only runs, unless kept', async (t) => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips('child'), directory);
  const voice = syntheticWav(cardLabels('ashkenazi'));
  const reading = syntheticWav(['o', 'u']);
  for (const mode of ['success', 'failure', 'voice-only', 'disabled', 'keep']) {
    await store.save('child_voice-check', voice);
    if (!['voice-only', 'disabled'].includes(mode)) await store.save('child_baruch_clean', reading);
    let calls = 0;
    const result = await runEar({ set: 'child', directory, keep: mode === 'keep', meter: mode !== 'disabled',
      log: () => {}, ear: async (audio) => {
        calls += 1;
        assert.deepEqual(audio.data, reading);
        if (mode === 'failure') throw new Error('Synthetic ear failure');
        return earAnswer([['ba', 'ruch']]);
      } });
    assert.equal(calls, ['voice-only', 'disabled'].includes(mode) ? 0 : 1);
    assert.equal(result.rows.length, calls);
    assert.equal(result.code, ['success', 'keep'].includes(mode) ? 0 : 1);
    assert.deepEqual((await readdir(directory)).sort(), mode === 'keep' ? ['child_baruch_clean.wav', 'child_voice-check.wav'] : []);
  }
});

test('child runner prints then deletes each clip before the next call, including failures', async (t) => {
  const directory = await fixtureDirectory(t);
  const clips = (await loadClips('child')).filter((clip) => clip.kind === 'reading');
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
      assert.equal(line.split('\t')[3], 'PASS');
    }
  }, ear: async () => {
    calls += 1;
    if (calls === 1) return earAnswer([['o', 'meyn']]);
    await assert.rejects(access(join(directory, `${clips[0].name}.wav`)));
    assert.equal(output.length, 8);
    throw new Error('Provider error that must not be printed');
  } });
  assert.equal(result.code, 1);
  assert.equal(calls, 2);
  assert.deepEqual(await readdir(directory), ['baruch_clean.wav']);
  assert.equal(output[8], 'child_brocho_clean\tbe-ro-cho\tERROR\tMISS\tERROR\tERROR\tERROR');
  assert.ok(output.every((line) => !line.includes('Provider error')));
});

test('--keep retains child audio and an all-PASS run succeeds', async (t) => {
  const directory = await fixtureDirectory(t);
  const clips = (await loadClips('child')).filter((clip) => clip.kind === 'reading');
  await recordingStore(clips, directory).save(clips[0].name, wav);
  const result = await runEar({ set: 'child', keep: true, directory, log: () => {}, ear: async (_audio, options) => {
    assert.deepEqual(options, { model: defaultEarModel(), votes: defaultEarModel() === 'fallback' ? 1 : defaultVotes() });
    return earAnswer([['o', 'meyn']]);
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

test('recorder options use dependency-free vote defaults without importing the ear', async () => {
  const [votes, options] = await Promise.all([
    readFile(new URL('../../ear/votes.js', import.meta.url), 'utf8'),
    readFile(new URL('./options.js', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(votes, /\bimport\b/);
  assert.doesNotMatch(options, /['"]\.\.\/\.\.\/ear\/hear\.js['"]/);
  assert.match(options, /from ['"]\.\.\/\.\.\/ear\/votes\.js['"]/);
});

test('CLI flags have safe defaults and reject invalid sets, models, presets, ports and unknown flags', () => {
  assert.deepEqual(parseOptions([], 'server'), { set: 'adult', port: 8790 });
  assert.deepEqual(parseOptions(['--set', 'child', '--port', '9123'], 'server'), { set: 'child', port: 9123 });
  assert.deepEqual(parseOptions([], 'ear'), {
    set: 'adult', model: defaultEarModel(), votes: defaultEarModel() === 'fallback' ? 1 : defaultVotes(),
    keep: false, preset: 'ashkenazi', meter: true, card: true, referee: true,
  });
  assert.deepEqual(parseOptions(['--set', 'child', '--model', 'fallback', '--keep'], 'ear'), {
    set: 'child', model: 'fallback', votes: 1, keep: true, preset: 'ashkenazi', meter: true, card: true, referee: true,
  });
  assert.deepEqual(parseOptions(['--preset', 'sephardi', '--no-meter'], 'ear'), {
    set: 'adult', model: defaultEarModel(), votes: defaultEarModel() === 'fallback' ? 1 : defaultVotes(),
    keep: false, preset: 'sephardi', meter: false, card: true, referee: true,
  });
  assert.equal(parseOptions(['--preset', 'chassidish'], 'ear').preset, 'chassidish');
  for (const args of [['--set'], ['--set', 'x'], ['--port'], ['--port', '0'], ['--port', '65536'],
    ['--port', '1.5'], ['--port', 'oops'], ['--host', '0.0.0.0'], ['--preset', 'sephardi'], ['--no-meter']]) {
    assert.throws(() => parseOptions(args, 'server'));
  }
  for (const args of [['--set', 'x'], ['--model'], ['--model', 'other'], ['--port', '9000']]) {
    assert.throws(() => parseOptions(args, 'ear'));
  }
  for (const args of [['--preset'], ['--preset', 'unknown'], ['--preset', 'toString']]) {
    assert.throws(() => parseOptions(args, 'ear'), /^Error: Preset must be one of: sephardi, ashkenazi, chassidish$/);
  }
});

test('--card and --round parse independently of the set and ear feature flags and require values', () => {
  const options = parseOptions(['--card', 'voice-check-2', '--round', 'Round 1g', '--set', 'child', '--no-card'], 'ear');
  assert.equal(options.cardName, 'voice-check-2');
  assert.equal(options.round, 'Round 1g');
  assert.equal(options.set, 'child');
  assert.equal(options.card, false);
  assert.equal(parseOptions([], 'ear').cardName, undefined);
  assert.equal(parseOptions([], 'ear').round, undefined);
  for (const [flag, message] of [
    ['--card', 'Card name must be supplied with --card.'],
    ['--round', 'Round section must be supplied with --round.'],
  ]) {
    for (const args of [[flag], [flag, ''], [flag, '  '], [flag, '--no-meter']]) {
      assert.throws(() => parseOptions(args, 'ear'), { message });
    }
    assert.throws(() => parseOptions([flag, 'anything'], 'server'), /Unknown option:/);
  }
});

test('ear CLI displays clear card and round selection errors', async t => {
  const errors = [];
  t.mock.method(console, 'error', line => errors.push(line));
  t.mock.method(console, 'log', () => assert.fail('invalid selection'));
  t.mock.method(globalThis, 'fetch', async () => assert.fail('invalid selection must not call a service'));
  for (const [args, message] of [
    [['--card'], 'Card name must be supplied with --card.'],
    [['--round'], 'Round section must be supplied with --round.'],
    [['--card', 'missing-card'], 'Voice card must name a voice clip: missing-card.'],
    [['--round', 'Round 9'], 'Unknown section: Round 9.'],
  ]) {
    assert.equal(await earMain(args), 1);
    assert.equal(errors.at(-1), message);
  }
  assert.equal(errors.length, 4);
});

test('--no-card parses independently of --no-meter and is only an ear option', () => {
  assert.deepEqual(parseOptions(['--no-card'], 'ear'), {
    set: 'adult', model: defaultEarModel(), votes: defaultEarModel() === 'fallback' ? 1 : defaultVotes(),
    keep: false, preset: 'ashkenazi', meter: true, card: false, referee: true,
  });
  assert.deepEqual(parseOptions(['--no-card', '--no-meter'], 'ear'), {
    set: 'adult', model: defaultEarModel(), votes: defaultEarModel() === 'fallback' ? 1 : defaultVotes(),
    keep: false, preset: 'ashkenazi', meter: false, card: false, referee: true,
  });
  assert.throws(() => parseOptions(['--no-card'], 'server'), /Unknown option: --no-card/);
});

test('--no-referee is independent of the other ear flags and is rejected by the recorder', () => {
  assert.equal(parseOptions([], 'ear').referee, true);
  assert.equal(parseOptions(['--no-referee'], 'ear').referee, false);
  const options = parseOptions(['--no-referee', '--no-meter', '--no-card'], 'ear');
  assert.equal(options.referee, false);
  assert.equal(options.meter, false);
  assert.equal(options.card, false);
  assert.throws(() => parseOptions(['--no-referee'], 'server'), /Unknown option: --no-referee/);
});

function phonemeVowel(score, token = score >= 0.5 ? 'ɑ' : 'a') {
  return { token, start: 0, end: 0.02, top: [['ɑ', score], ['a', 1 - score]] };
}

function phonemeCard(a = 0.43, o = 0.91) {
  return cardLabels('ashkenazi').map(label => label === 'a' || label === 'o'
    ? phonemeVowel(label === 'a' ? a : o)
    : { token: label || 'oɪ', start: 0, end: 0.02, top: [[label || 'oɪ', 1]] });
}

for (const [mode, expected] of [
  ['disabled', 'off (--no-referee)'],
  ['missing', 'off (no voice check recorded)'],
  ['unavailable', 'off (no answer from the phoneme service)'],
  ['throws', 'off (no answer from the phoneme service)'],
  ['count', 'off (card vowels did not line up)'],
  ['merged', 'off (card does not keep o and a apart)'],
  ['on', 'on (o 0.91, a 0.43, line 0.50)'],
]) {
  test(`ear runner reports the ${mode} phoneme referee status after the voice card`, async t => {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(), directory);
    const card = syntheticWav(cardLabels('ashkenazi'));
    if (mode !== 'missing') await store.save('voice-check', card);
    const calls = [];
    const output = [];
    await runEar({ directory, meter: false, card: false, referee: mode !== 'disabled',
      phonemes: async (...args) => {
        calls.push(args);
        if (mode === 'throws') throw new Error('private failure');
        return mode === 'unavailable' ? null : mode === 'count' ? []
          : mode === 'merged' ? phonemeCard(0.55, 0.6) : phonemeCard();
      }, ear: async () => assert.fail('no readings'), log: line => output.push(line) });
    assert.equal(output[4], 'Voice card to the ear: off (--no-card)');
    assert.equal(output[5], `Phoneme referee: ${expected}`);
    assert.equal(output[6], 'clip\tsaid\theard\tresult\tear\tmetered\tvotes');
    assert.deepEqual(calls, ['disabled', 'missing'].includes(mode) ? []
      : ['unavailable', 'throws'].includes(mode) ? [[card], [card]] : [[card]]);
    assert.deepEqual(output.slice(7), mode === 'on' ? ['Phoneme referee: checked 0 of 0 readings'] : []);
    assert.ok(output.every(line => !line.includes('private failure')));
  });
}

test('referee calibrates once and grades final sounds while keeping ear and metered columns', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  const card = syntheticWav(cardLabels('ashkenazi'));
  const reading = syntheticWav(['a', 'a']);
  await store.save('voice-check', card);
  for (const name of ['koton_clean', 'gomol_clean']) await store.save(name, reading);
  const calls = [];
  const output = [];
  let reads = 0;
  const result = await runEar({ directory, model: 'primary',
    phonemes: async (...args) => {
      calls.push(args);
      return calls.length === 1 ? phonemeCard() : [phonemeVowel(0.9), phonemeVowel(0.8)];
    }, ear: async () => earAnswer(++reads === 1 ? [['ga', 'mal']] : [['ka', 'tan']]), log: line => output.push(line) });
  assert.equal(result.code, 1);
  assert.deepEqual(calls, [[card], [reading], [reading]]);
  assert.deepEqual(result.rows, [
    { clip: 'gomol_clean', said: 'go-mol', heard: 'go-mal', result: 'MISS', ear: 'ga-mal', metered: 'ga-mal', votes: 'ga-mal' },
    { clip: 'koton_clean', said: 'ko-ton', heard: 'ko-ton', result: 'PASS', ear: 'ka-tan', metered: 'ka-tan', votes: 'ka-tan' },
  ]);
  assert.equal(output[8], 'koton_clean\tko-ton\tko-ton\tPASS\tka-tan\tka-tan\tka-tan');
  assert.deepEqual(output.slice(9), ['Phoneme referee: checked 2 of 2 readings']);
});

for (const [label, heard, result] of [['a', 'ga-mal', 'MISS'], ['o', 'go-mol', 'PASS']]) {
  test(`runner passes meter points and the profile to the band and final-l rules for measured ${label}`, async t => {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(), directory);
    await store.save('voice-check', syntheticWav(cardLabels('ashkenazi')));
    await store.save('gomol_clean', syntheticWav([label, label]));
    let calls = 0;
    const answer = await runEar({ directory, ear: async () => earAnswer([['go', 'mol']]),
      phonemes: async () => ++calls === 1 ? phonemeCard() : [phonemeVowel(0.37), phonemeVowel(0.84)],
      log: () => {} });
    assert.deepEqual(answer.rows, [{ clip: 'gomol_clean', said: 'go-mol', heard, result,
      ear: 'go-mol', metered: 'go-mol', votes: 'go-mol' }]);
    assert.equal(answer.code, result === 'PASS' ? 0 : 1);
  });
}

test('runner counts an aligned reading as checked and leaves a syllable at a gap alone', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  await store.save('voice-check', syntheticWav(cardLabels('ashkenazi')));
  await store.save('baruch_clean', syntheticWav(['a', 'u', 'i']));
  let calls = 0;
  const output = [];
  const answer = await runEar({ directory, ear: async () => earAnswer([['ba', 'ruch', 'mi']]),
    phonemes: async () => ++calls === 1 ? phonemeCard()
      : [phonemeVowel(0.9), { token: 'u', top: [['u', 1]] }], log: line => output.push(line) });
  assert.deepEqual(answer.rows, [{ clip: 'baruch_clean', said: 'bo-ruch', heard: 'bo-ruch-mi', result: 'MISS',
    ear: 'ba-ruch-mi', metered: 'ba-ruch-mi', votes: 'ba-ruch-mi' }]);
  assert.deepEqual(output.slice(8), ['Phoneme referee: checked 1 of 1 readings']);
});

test('referee runs after the meter and can undo its o while preserving the metered column', async t => {
  const directory = await fixtureDirectory(t);
  const store = recordingStore(await loadClips(), directory);
  await store.save('voice-check', syntheticWav(cardLabels('ashkenazi')));
  await store.save('baruch_clean', syntheticWav(['o', 'u']));
  let calls = 0;
  const output = [];
  const result = await runEar({ directory, ear: async () => earAnswer([['ba', 'ruch']]),
    phonemes: async () => ++calls === 1 ? phonemeCard()
      : [phonemeVowel(0.07), { token: 'u', top: [['u', 1]] }], log: line => output.push(line) });
  assert.equal(result.code, 1);
  assert.deepEqual(result.rows, [{ clip: 'baruch_clean', said: 'bo-ruch', heard: 'ba-ruch', result: 'MISS',
    ear: 'ba-ruch', metered: 'bo-ruch', votes: 'ba-ruch' }]);
  assert.equal(output[7], 'baruch_clean\tbo-ruch\tba-ruch\tMISS\tba-ruch\tbo-ruch\tba-ruch');
});

for (const failure of ['null', 'throws', 'count', 'object', 'unreadable']) {
  test(`a ${failure} phoneme reading keeps the metered runner answer`, async t => {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(), directory);
    await store.save('voice-check', syntheticWav(cardLabels('ashkenazi')));
    await store.save('baruch_clean', syntheticWav(['o', 'u']));
    let calls = 0;
    const output = [];
    const result = await runEar({ directory, ear: async () => earAnswer([['ba', 'ruch']]), log: line => output.push(line),
      phonemes: async () => {
        if (++calls === 1) return phonemeCard();
        if (failure === 'throws') throw new Error('private failure');
        // A token the referee cannot read makes it fail after the service answered.
        if (failure === 'unreadable') return [{ get token() { throw new Error('private failure'); } }];
        return failure === 'count' ? [] : failure === 'object' ? {} : null;
      } });
    assert.equal(result.code, 0);
    assert.equal(result.rows[0].heard, 'bo-ruch');
    assert.equal(result.rows[0].metered, 'bo-ruch');
    assert.equal(calls, ['count', 'unreadable'].includes(failure) ? 2 : 3);
    assert.deepEqual(output.slice(8), ['Phoneme referee: checked 0 of 1 readings', failure === 'count'
      ? 'Phoneme referee: vowels did not line up for baruch_clean'
      : failure === 'unreadable' ? 'Phoneme referee: failed on baruch_clean'
        : 'Phoneme referee: no answer for baruch_clean']);
    assert.ok(output.slice(8).every(line => !line.includes('\t') && !line.includes('private failure')));
  });
}

for (const failure of ['null', 'throws']) {
  test(`a reading with a ${failure} phoneme answer is retried once and checked`, async t => {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(), directory);
    const card = syntheticWav(cardLabels('ashkenazi'));
    const reading = syntheticWav(['o', 'o']);
    await store.save('voice-check', card);
    await store.save('gomol_clean', reading);
    const calls = [];
    const output = [];
    let reads = 0;
    const result = await runEar({ directory, meter: false, card: false,
      ear: async (audio) => {
        reads += 1;
        assert.deepEqual(audio, { data: reading, format: 'wav' });
        return earAnswer([['ga', 'mal']]);
      }, phonemes: async (...args) => {
        calls.push(args);
        if (calls.length === 1) return phonemeCard();
        if (calls.length === 2) {
          if (failure === 'throws') throw new Error('private failure');
          return null;
        }
        return [phonemeVowel(0.9), phonemeVowel(0.8)];
      }, log: line => output.push(line) });
    assert.equal(reads, 1);
    assert.deepEqual(calls, [[card], [reading], [reading]]);
    assert.strictEqual(calls[1][0], calls[2][0]);
    assert.equal(result.code, 1);
    assert.deepEqual(result.rows, [{ clip: 'gomol_clean', said: 'go-mol', heard: 'go-mal', result: 'MISS',
      ear: 'ga-mal', metered: 'ga-mal', votes: 'ga-mal' }]);
    assert.deepEqual(output.slice(8), ['Phoneme referee: checked 1 of 1 readings']);
  });

  test(`a voice card with a ${failure} phoneme answer is retried once`, async t => {
    const directory = await fixtureDirectory(t);
    const store = recordingStore(await loadClips(), directory);
    const card = syntheticWav(cardLabels('ashkenazi'));
    await store.save('voice-check', card);
    const calls = [];
    const output = [];
    const result = await runEar({ directory, meter: false, card: false,
      ear: async () => assert.fail('no readings'), phonemes: async (...args) => {
        calls.push(args);
        if (calls.length === 1) {
          if (failure === 'throws') throw new Error('private failure');
          return null;
        }
        return phonemeCard();
      }, log: line => output.push(line) });
    assert.equal(result.code, 1);
    assert.deepEqual(calls, [[card], [card]]);
    assert.strictEqual(calls[0][0], calls[1][0]);
    assert.equal(output[5], 'Phoneme referee: on (o 0.91, a 0.43, line 0.50)');
    assert.deepEqual(output.slice(7), ['Phoneme referee: checked 0 of 0 readings']);
  });
}

test('referee summary lists missed readings in order, excludes ear failures and preserves child deletion', async t => {
  const directory = await fixtureDirectory(t);
  const clips = await loadClips('child');
  const store = recordingStore(clips, directory);
  const readings = clips.filter(clip => clip.kind === 'reading').slice(0, 5);
  await store.save('child_voice-check', syntheticWav(cardLabels('ashkenazi')));
  for (const clip of readings) await store.save(clip.name, wav);
  const output = [];
  let calls = 0;
  let reads = 0;
  const result = await runEar({ set: 'child', directory, meter: false, card: false,
    ear: async () => {
      if (reads) await assert.rejects(access(join(directory, `${readings[reads - 1].name}.wav`)));
      reads += 1;
      if (reads === 5) throw new Error('private failure');
      return earAnswer([readings[reads - 1].say.split('-')]);
    }, phonemes: async () => {
      calls += 1;
      if (calls === 1) return phonemeCard();
      if (reads === 1) return [phonemeVowel(0.9), phonemeVowel(0.8, 'e')];
      return reads === 4 ? [] : null;
    }, log: line => output.push(line) });
  assert.equal(result.code, 1);
  assert.equal(calls, 7);
  assert.equal(result.rows.length, 5);
  assert.equal(result.rows[4].heard, 'ERROR');
  assert.deepEqual(output.slice(12), [
    'Phoneme referee: checked 1 of 4 readings',
    'Phoneme referee: no answer for child_brocho_clean, child_shomayim_clean',
    'Phoneme referee: vowels did not line up for child_dovor_clean',
  ]);
  assert.ok(output.slice(12).every(line => !line.includes('\t')));
  assert.ok(output.slice(6, 12).every(line => line.split('\t').length === 7));
  assert.deepEqual(await readdir(directory), []);
});

test('ear model default prefers Meta, then Baseten, and otherwise primary', () => {
  assert.equal(defaultEarModel({}), 'primary');
  assert.equal(defaultEarModel({ META_API_KEY: 'test-meta-key' }), 'primary');
  assert.equal(defaultEarModel({ META_API_KEY: '  ', BASETEN_API_KEY: '  ' }), 'primary');
  assert.equal(defaultEarModel({ BASETEN_API_KEY: 'test-baseten-key' }), 'fallback');
  assert.equal(defaultEarModel({ META_API_KEY: 'test-meta-key', BASETEN_API_KEY: 'test-baseten-key' }), 'primary');
});

test('--votes accepts 1 to 5, rejects invalid values, and is only an ear option', () => {
  for (let votes = 1; votes <= 5; votes += 1) {
    assert.equal(parseOptions(['--model', 'primary', '--votes', String(votes)], 'ear').votes, votes);
  }
  for (const args of [['--votes'], ['--votes', '--model', 'primary'],
    ...['0', '6', '2.5', 'text', '-1', 'NaN', 'Infinity', ''].map(value => ['--votes', value])]) {
    assert.throws(() => parseOptions(args, 'ear'), { message: 'Votes must be a whole number from 1 to 5.' });
  }
  for (const args of [['--model', 'fallback', '--votes', '5'], ['--votes', '5', '--model', 'fallback']]) {
    assert.equal(parseOptions(args, 'ear').votes, 1);
  }
  assert.throws(() => parseOptions(['--votes', '1'], 'server'), /Unknown option: --votes/);
});

test('ear CLI reports an invalid vote count before running', async t => {
  const errors = [];
  t.mock.method(console, 'error', line => errors.push(line));
  assert.equal(await earMain(['--votes', '6']), 1);
  assert.deepEqual(errors, ['Votes must be a whole number from 1 to 5.']);
});

test('ear runner passes --votes and prints the count immediately after the model', async t => {
  const directory = await fixtureDirectory(t);
  const clips = (await loadClips()).filter(clip => clip.kind === 'reading');
  await recordingStore(clips, directory).save(clips[0].name, wav);
  for (const votes of [1, 5]) {
    const output = [];
    let calls = 0;
    const result = await runEar({ ...parseOptions(['--model', 'primary', '--votes', String(votes)], 'ear'), directory,
      log: line => output.push(line), ear: async (_audio, options) => {
        calls += 1;
        assert.deepEqual(options, { model: 'primary', votes });
        return earAnswer([['o', 'meyn']]);
      } });
    assert.equal(result.code, 0);
    assert.equal(calls, 1);
    assert.match(output[0], /^Ear model: primary /);
    assert.equal(output[1], `Ear votes: ${votes}`);
  }
});

test('ear runner and options read EAR_VOTES while fallback always uses one', async t => {
  const previous = process.env.EAR_VOTES;
  t.after(() => {
    if (previous === undefined) delete process.env.EAR_VOTES;
    else process.env.EAR_VOTES = previous;
  });
  process.env.EAR_VOTES = '4';
  assert.equal(parseOptions(['--model', 'primary'], 'ear').votes, defaultVotes());
  assert.equal(parseOptions(['--model', 'fallback'], 'ear').votes, 1);
  const directory = await fixtureDirectory(t);
  const clips = (await loadClips()).filter(clip => clip.kind === 'reading');
  await recordingStore(clips, directory).save(clips[0].name, wav);
  for (const [settings, votes, line] of [
    [{ model: 'primary' }, 4, 'Ear votes: 4'],
    [{ model: 'fallback', votes: 5 }, 1, 'Ear votes: 1 (fallback ear)'],
  ]) {
    const output = [];
    let calls = 0;
    const result = await runEar({ ...settings, directory, log: text => output.push(text), ear: async (_audio, options) => {
      calls += 1;
      assert.deepEqual(options, { model: settings.model, votes });
      return earAnswer([['o', 'meyn']]);
    } });
    assert.equal(calls, 1);
    assert.equal(result.code, 0);
    assert.equal(output[1], line);
  }
});

test('ear runner and CLI select and print the default model and honor explicit overrides', async (t) => {
  const names = ['BASETEN_API_KEY', 'META_API_KEY', 'EAR_PRIMARY_MODEL', 'EAR_FALLBACK_MODEL'];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  t.after(() => {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  });
  process.env.META_API_KEY = 'test-meta-key';
  delete process.env.BASETEN_API_KEY;
  delete process.env.EAR_PRIMARY_MODEL;
  delete process.env.EAR_FALLBACK_MODEL;
  const directory = await fixtureDirectory(t);
  const clips = (await loadClips()).filter((clip) => clip.kind === 'reading');
  await recordingStore(clips, directory).save(clips[0].name, wav);
  for (const [metaKey, basetenKey, model, id] of [
    ['test-meta-key', undefined, 'primary', 'muse-wonder-1.0'],
    [undefined, 'test-baseten-key', 'fallback', 'meta-models/muse-spark-open-1026'],
    ['test-meta-key', 'test-baseten-key', 'primary', 'muse-wonder-1.0'],
    [undefined, undefined, 'primary', 'muse-wonder-1.0'],
  ]) {
    if (metaKey === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = metaKey;
    if (basetenKey === undefined) delete process.env.BASETEN_API_KEY;
    else process.env.BASETEN_API_KEY = basetenKey;
    assert.equal(parseOptions([], 'ear').model, model);
    const votes = model === 'fallback' ? 1 : defaultVotes();
    assert.equal(parseOptions([], 'ear').votes, votes);
    const output = [];
    const result = await runEar({ directory, log: line => output.push(line), ear: async (_audio, options) => {
      assert.equal(options.model, model);
      assert.equal(options.votes, votes);
      return earAnswer([['o', 'meyn']]);
    } });
    assert.equal(result.code, 0);
    assert.equal(output[0], `Ear model: ${model} (${id})`);
    assert.equal(output[1], `Ear votes: ${votes}${model === 'fallback' ? ' (fallback ear)' : ''}`);
  }
  delete process.env.BASETEN_API_KEY;
  process.env.EAR_PRIMARY_MODEL = 'test-primary-model';
  const explicit = parseOptions(['--model', 'primary'], 'ear');
  assert.equal(explicit.model, 'primary');
  const output = [];
  await runEar({ ...explicit, directory, log: line => output.push(line), ear: async (_audio, options) => {
    assert.equal(options.model, 'primary');
    assert.equal(options.votes, defaultVotes());
    return earAnswer([['o', 'meyn']]);
  } });
  assert.equal(output[0], 'Ear model: primary (test-primary-model)');
  assert.equal(output[1], `Ear votes: ${defaultVotes()}`);
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
