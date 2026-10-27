import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { teacherPinError, listenOptions, tlsOptions, startupMessages, phonemeMessage } from './startup.js';
import { hearPhonemes, phonemesReady, phonemeUrl } from '../ear/phonemes.js';

await import('../ear/env.js');
const pinError = teacherPinError(process.env.TEACHER_PIN);
if (pinError) {
  console.error(pinError);
  process.exit(1);
}
let tls;
try {
  tls = tlsOptions();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const [{ default: items }, { listen }, { gradeLine }, { chooseNextSet, startProfile, startTurn, explain, turnFacts }] = await Promise.all([
  import('../bank/items.json', { with: { type: 'json' } }),
  import('../ear/hear.js'), import('../grader/index.js'), import('../coach/index.js'),
]);
const { host, port } = listenOptions();
const staticDir = fileURLToPath(new URL('../station/dist/', import.meta.url));
const url = phonemeUrl();
const app = createApp({
  items, listen, gradeLine, chooseNextSet, startProfile, startTurn, explain, turnFacts, staticDir,
  teacherPin: process.env.TEACHER_PIN, trace: process.env.TRACE === '1',
  coachModel: process.env.COACH_MODEL, dataDir: process.env.DATA_DIR,
  ...(url ? { phonemes: audio => hearPhonemes(audio, { url }) } : {}),
});
const server = tls ? https.createServer(tls, app) : http.createServer(app);
const ready = await phonemesReady({ url });
server.listen(port, host, () => {
  for (const line of startupMessages({
    basetenApiKey: process.env.BASETEN_API_KEY, metaApiKey: process.env.META_API_KEY,
    hasStation: fs.existsSync(staticDir),
    host: server.address().address, port: server.address().port, tls: Boolean(tls),
  })) console.log(line);
  console.log(phonemeMessage({ url, ready }));
});
