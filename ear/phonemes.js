const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function phonemeUrl(env = process.env) {
  const value = env.PHONEME_URL === undefined ? 'http://127.0.0.1:8791' : env.PHONEME_URL;
  try {
    if (typeof value !== 'string' || !value || value === 'off') return null;
    const url = new URL(value);
    // Only the origin is kept, so a path, query or user name in the setting never
    // reaches a request or the startup line.
    return url.protocol === 'http:' && localHosts.has(url.hostname) ? url.origin : null;
  } catch {
    return null;
  }
}

async function requestJson(path, { url, fetch, timeoutMs }, options) {
  let timer;
  try {
    const base = phonemeUrl({ PHONEME_URL: url });
    if (!base) return null;
    const controller = new AbortController();
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
    });
    const request = (async () => {
      const response = await fetch(`${base}${path}`, {
        ...options, signal: controller.signal, redirect: 'error',
      });
      return response.status === 200 ? await response.json() : null;
    })();
    return await Promise.race([request, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// A 21-second voice card took up to 13 seconds on the iMac under load, so allow
// 3 seconds per second of 16 kHz mono audio, and never less than 15 seconds.
export function phonemeTimeout(audio) {
  return Math.max(15000, Math.ceil(audio.length / 32000) * 3000);
}

export async function hearPhonemes(audio, { url = phonemeUrl(), fetch = globalThis.fetch, timeoutMs } = {}) {
  try {
    if (!Buffer.isBuffer(audio)) return null;
    const wait = timeoutMs ?? phonemeTimeout(audio);
    // The service skips a recording still queued when this wait runs out.
    const reply = await requestJson('/phonemes', { url, fetch, timeoutMs: wait }, {
      method: 'POST', headers: { 'Content-Type': 'audio/wav', 'X-Timeout-Ms': String(wait) }, body: audio,
    });
    if (!Array.isArray(reply?.tokens) || !reply.tokens.every(value => value && typeof value.token === 'string'
      && Number.isFinite(value.start) && Number.isFinite(value.end) && Array.isArray(value.top)
      && value.top.every(pair => Array.isArray(pair) && pair.length === 2
        && typeof pair[0] === 'string' && Number.isFinite(pair[1])))) return null;
    return reply.tokens;
  } catch {
    return null;
  }
}

export async function phonemesReady({ url = phonemeUrl(), fetch = globalThis.fetch, timeoutMs = 2000 } = {}) {
  const reply = await requestJson('/health', { url, fetch, timeoutMs }, { method: 'GET' });
  return reply?.ok === true;
}
