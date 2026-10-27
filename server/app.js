import fs from 'node:fs';
import path from 'node:path';

const PRESETS = new Set(['sephardi', 'ashkenazi', 'chassidish']);
const AUDIO_LIMIT = 25 * 1024 * 1024;
const JSON_LIMIT = 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

async function body(req, limit) {
  if (Number(req.headers['content-length']) > limit) {
    req.resume();
    throw new RequestError(413, 'Body too large');
  }
  const chunks = [];
  let size = 0;
  // Drain oversized requests without keeping their remaining bytes in memory.
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= limit) chunks.push(chunk);
    else chunks.length = 0;
  }
  if (size > limit) throw new RequestError(413, 'Body too large');
  return Buffer.concat(chunks, size);
}

function contentType(req) {
  return (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
}

async function jsonBody(req) {
  if (contentType(req) !== 'application/json') throw new RequestError(415, 'Use application/json');
  const bytes = await body(req, JSON_LIMIT);
  try {
    const value = JSON.parse(bytes.toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RequestError(400, 'Invalid JSON');
  }
}

function validatePreset(preset) {
  if (!PRESETS.has(preset)) throw new RequestError(400, 'Invalid preset');
}

function contained(root, file) {
  return file === root || file.startsWith(root + path.sep);
}

async function staticFile(req, res, staticDir) {
  let pathname;
  try {
    // Inspect the original path before URL parsing can normalize /../ away.
    pathname = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    throw new RequestError(400, 'Invalid path');
  }
  if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
    throw new RequestError(403, 'Path blocked');
  }
  if (!staticDir) throw new RequestError(404, 'Not found');
  const root = path.resolve(staticDir);
  let file = path.resolve(root, '.' + pathname);
  if (!contained(root, file)) throw new RequestError(403, 'Path blocked');
  try {
    if (!(await fs.promises.stat(file)).isFile()) file = path.join(root, 'index.html');
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    file = path.join(root, 'index.html');
  }
  try {
    const [realRoot, realFile] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(file)]);
    if (!contained(realRoot, realFile)) throw new RequestError(403, 'Path blocked');
    const data = await fs.promises.readFile(realFile);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (error) {
    if (error.code === 'ENOENT') throw new RequestError(404, 'Not found');
    throw error;
  }
}

export function createApp({ items, listen, gradeLine, chooseNextSet, startProfile, staticDir }) {
  const byId = new Map(items.map(item => [item.id, item]));

  function selected(selection) {
    if (!Array.isArray(selection.itemIds) || selection.itemIds.length < 2 || selection.itemIds.length > 3) {
      throw new Error('Invalid set');
    }
    return selection.itemIds.map(id => {
      const item = byId.get(id);
      if (!item) throw new Error('Unknown selected item');
      return item;
    });
  }

  return async function app(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && url.pathname === '/api/start') {
        const { preset, level } = await jsonBody(req);
        validatePreset(preset);
        if (!Number.isInteger(level) || level < 1 || level > 6) throw new RequestError(400, 'Invalid level');
        const profile = startProfile({ level });
        const next = await chooseNextSet(profile, [], items, { useModel: false });
        json(res, 200, { profile: next.profile, set: selected(next) });
      } else if (req.method === 'POST' && url.pathname === '/api/grade') {
        const item = byId.get(url.searchParams.get('item'));
        if (!item) throw new RequestError(404, 'Unknown item');
        const preset = url.searchParams.get('preset');
        validatePreset(preset);
        if (contentType(req) !== 'audio/wav') throw new RequestError(415, 'Use audio/wav');
        let data = await body(req, AUDIO_LIMIT);
        if (!data.length) throw new RequestError(400, 'Empty audio');
        let heard;
        try {
          // Only audio and its format reach the ear. No item or preset is passed.
          heard = await listen({ data, format: 'wav' });
        } finally {
          data = null;
        }
        const result = await gradeLine({ heard: heard.words, text: item.text, preset });
        json(res, 200, { itemId: item.id, model: heard.model, words: result.words, verdicts: result.verdicts, summary: result.summary });
      } else if (req.method === 'POST' && url.pathname === '/api/next') {
        const { profile, results } = await jsonBody(req);
        if (!profile || typeof profile !== 'object' || Array.isArray(profile) || !Array.isArray(results) ||
            results.length < 2 || results.length > 3 || results.some(result =>
              !result || !byId.has(result.itemId) || !result.summary || !Array.isArray(result.verdicts))) {
          throw new RequestError(400, 'Invalid progress');
        }
        const next = await chooseNextSet(profile, results, items, { useModel: true });
        json(res, 200, { profile: next.profile, level: next.level, set: selected(next) });
      } else {
        await staticFile(req, res, staticDir);
      }
    } catch (error) {
      if (!res.headersSent) json(res, error instanceof RequestError ? error.status : 500,
        { error: error instanceof RequestError ? error.message : 'Request failed' });
      else res.end();
    }
  };
}
