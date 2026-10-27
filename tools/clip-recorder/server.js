import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isClipName, loadClips } from './clips.js';
import { parseOptions } from './options.js';
import { MAX_BYTES, recordingStore } from './recordings.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/wav.js', ['wav.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/fonts/Montserrat-400.ttf', ['fonts/Montserrat-400.ttf', 'font/ttf']],
  ['/fonts/Montserrat-700.ttf', ['fonts/Montserrat-700.ttf', 'font/ttf']],
  ['/fonts/FrankRuhlLibre.ttf', ['fonts/FrankRuhlLibre.ttf', 'font/ttf']],
]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readBody(request) {
  if (Number(request.headers['content-length']) > MAX_BYTES) {
    request.resume();
    throw new RequestError(413, 'Recording exceeds the 10 MB limit.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      request.resume();
      throw new RequestError(413, 'Recording exceeds the 10 MB limit.');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

export async function createRecorderServer({ set = 'adult', directory } = {}) {
  // Parse the source table once at startup, not on each request.
  const clips = await loadClips(set);
  const store = recordingStore(clips, directory);
  return createServer(async (request, response) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self'; media-src 'self' blob:; font-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const json = (status, body) => send(status, JSON.stringify(body));
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      // Reject cross-origin writes to this local service.
      if (['POST', 'DELETE'].includes(request.method) && request.headers.origin
        && request.headers.origin !== `http://${request.headers.host}`) {
        throw new RequestError(403, 'Origin is not allowed.');
      }
      if (request.method === 'GET' && url.pathname === '/clips') {
        json(200, { set, clips: await store.list() });
      } else if (request.method === 'DELETE' && url.pathname === '/clips') {
        if (url.searchParams.get('set') !== 'child') throw new RequestError(400, 'Only child recordings can be deleted.');
        json(200, { deleted: await store.deleteChildren() });
      } else if (url.pathname === '/clip' && ['GET', 'POST'].includes(request.method)) {
        const name = url.searchParams.get('name');
        if (!isClipName(name, clips)) throw new RequestError(400, 'Invalid clip name.');
        if (request.method === 'POST') {
          if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'audio/wav') {
            throw new RequestError(415, 'Expected audio/wav.');
          }
          await store.save(name, await readBody(request));
          json(200, { name, done: true });
        } else {
          send(200, await store.read(name), 'audio/wav');
        }
      } else if (['GET', 'HEAD'].includes(request.method) && assets.has(url.pathname)) {
        const [file, type] = assets.get(url.pathname);
        send(200, await readFile(new URL(file, import.meta.url)), type);
      } else json(404, { error: 'Not found.' });
    } catch (error) {
      // Never log or echo request audio, filesystem paths, or provider errors.
      if (!response.destroyed && !response.headersSent) {
        const status = error instanceof RequestError ? error.status : error.code === 'ENOENT' ? 404 : 500;
        json(status, { error: error instanceof RequestError ? error.message : status === 404 ? 'Not found.' : 'Request failed.' });
      }
    }
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseOptions(argv, 'server');
  const server = await createRecorderServer(options);
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  console.log(`http://127.0.0.1:${server.address().port}`);
  const stop = () => server.close();
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  server.once('close', () => {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? 'Port is already in use.' : error.message);
    process.exitCode = 1;
  }
}
