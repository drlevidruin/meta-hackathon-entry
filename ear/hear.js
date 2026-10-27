import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';
import './env.js';
import { looksLikeProse, parseEarOutput } from './parse.js';

const prompt = readFileSync(new URL('./prompt.md', import.meta.url), 'utf8');
const cardPrompt = readFileSync(new URL('./prompt-card.md', import.meta.url), 'utf8');
const MAX_BYTES = 25 * 1024 * 1024;
const MIME_TYPES = Object.freeze({
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
});
const PROVIDERS = {
  primary: {
    model: process.env.EAR_PRIMARY_MODEL || 'muse-wonder-1.0',
    // Wonder heard planted mistakes best on the synthetic round (docs/ear-test.md).
    url: 'https://api.meta.ai/v1/chat/completions',
    // Minimal reasoning answered in about 2 seconds instead of 15, with the same plants caught.
    reasoningEffort: () => process.env.EAR_REASONING_EFFORT || 'minimal',
    key: 'META_API_KEY',
    // The Meta Model API rejects audio_url and takes input_audio (tested 2026-10-26).
    audioPart: ({ format, base64 }) => ({
      type: 'input_audio',
      input_audio: { data: base64, format },
    }),
  },
  fallback: {
    model: process.env.EAR_FALLBACK_MODEL || 'meta-models/muse-spark-open-1026',
    url: 'https://inference.baseten.co/v1/chat/completions',
    key: 'BASETEN_API_KEY',
    // Baseten takes audio as a data URL.
    audioPart: ({ format, base64 }) => ({
      type: 'audio_url',
      audio_url: { url: `data:${MIME_TYPES[format]};base64,${base64}` },
    }),
  },
};

async function readAudio(audio) {
  if (!audio || typeof audio !== 'object') {
    throw new Error('Audio must be a file path or a Buffer with a supported format.');
  }

  let data;
  let format;
  if (typeof audio.path === 'string' && audio.path.length > 0
    && audio.data === undefined && audio.format === undefined) {
    format = extname(audio.path).slice(1).toLowerCase();
    if (!Object.hasOwn(MIME_TYPES, format)) throw new Error('Unsupported audio format.');
    let info;
    try {
      info = await stat(audio.path);
    } catch {
      throw new Error('Could not read the audio file.');
    }
    if (!info.isFile()) throw new Error('Audio path must point to a file.');
    if (info.size > MAX_BYTES) throw new Error('Audio exceeds the 25 MB limit.');
    try {
      data = await readFile(audio.path);
    } catch {
      throw new Error('Could not read the audio file.');
    }
  } else if (audio.path === undefined && Buffer.isBuffer(audio.data)) {
    data = audio.data;
    format = audio.format;
  } else {
    throw new Error('Audio must be a file path or a Buffer with a supported format.');
  }

  if (typeof format !== 'string' || !Object.hasOwn(MIME_TYPES, format)) {
    throw new Error('Unsupported audio format.');
  }
  if (data.length > MAX_BYTES) throw new Error('Audio exceeds the 25 MB limit.');
  return { format, base64: data.toString('base64') };
}

// A failure reason that is safe to show: a status code or a short phrase, never a
// response body or header, since those can echo credentials.
class EarFailure extends Error {}

async function request(provider, audio, fetcher, reference) {
  if (provider.model.endsWith('-contributor')) throw new EarFailure('contributor models are disabled');
  const key = process.env[provider.key];
  if (!key?.trim()) throw new EarFailure('no key');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetcher(provider.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [{
          role: 'user',
          content: reference ? [
            { type: 'text', text: cardPrompt },
            { type: 'text', text: 'First recording: the practice card.' },
            provider.audioPart(reference),
            { type: 'text', text: 'Second recording: the reading.' },
            provider.audioPart(audio),
          ] : [
            { type: 'text', text: prompt },
            provider.audioPart(audio),
          ],
        }],
        max_tokens: 8192,
        temperature: 0,
        ...(provider.reasoningEffort ? { reasoning_effort: provider.reasoningEffort() } : {}),
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new EarFailure(`HTTP ${response.status}`);
    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new EarFailure('empty answer');
    }
    if (looksLikeProse(raw)) throw new EarFailure('answered in prose');
    return {
      words: parseEarOutput(raw),
      model: provider.model,
      raw,
      usage: payload.usage ?? null,
      card: Boolean(reference),
    };
  } catch (error) {
    if (error instanceof EarFailure) throw error;
    throw new EarFailure(error?.name === 'AbortError' ? 'timed out' : 'network error');
  } finally {
    clearTimeout(timeout);
  }
}

export async function listen(audio, options = {}) {
  if (!options || typeof options !== 'object'
    || (options.model !== undefined && !['primary', 'fallback'].includes(options.model))) {
    throw new Error('Model must be primary or fallback.');
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('A fetch function is required.');
  const audioData = await readAudio(audio);
  const reference = options.reference === undefined ? undefined : await readAudio(options.reference);
  const models = options.model ? [options.model] : ['primary', 'fallback'];

  const failures = [];
  const tries = options.tries ?? 2;
  for (const name of models) {
    for (let attempt = 1; attempt <= tries; attempt += 1) {
      try {
        return await request(PROVIDERS[name], audioData, fetcher, name === 'primary' ? reference : undefined);
      } catch (error) {
        failures.push(`${name}: ${error instanceof EarFailure ? error.message : 'failed'}`);
        // Only a prose answer is worth a second try; anything else goes to the next model.
        if (!(error instanceof EarFailure && error.message === 'answered in prose')) break;
      }
    }
  }
  throw new Error(`No ear model returned an answer (${failures.join('; ')}).`);
}

export async function hear(audio, options) {
  return (await listen(audio, options)).words;
}
