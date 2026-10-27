const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function phonemeUrl(env = process.env) {
  const value = env.PHONEME_URL === undefined ? 'http://127.0.0.1:8791' : env.PHONEME_URL;
  try {
    if (typeof value !== 'string' || !value || value === 'off') return null;
    const url = new URL(value);
    return url.protocol === 'http:' && localHosts.has(url.hostname) ? value : null;
  } catch {
    return null;
  }
}

async function requestJson(path, { url, fetch, timeoutMs }, options) {
  let timer;
  try {
    if (!phonemeUrl({ PHONEME_URL: url })) return null;
    const controller = new AbortController();
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
    });
    const request = (async () => {
      const response = await fetch(`${url.replace(/\/+$/, '')}${path}`, {
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

export async function hearPhonemes(audio, { url = phonemeUrl(), fetch = globalThis.fetch, timeoutMs = 15000 } = {}) {
  try {
    if (!Buffer.isBuffer(audio)) return null;
    const reply = await requestJson('/phonemes', { url, fetch, timeoutMs }, {
      method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: audio,
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
