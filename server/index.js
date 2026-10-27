import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

// Node 22 resolves `node --test server/` to this directory entry point.
if (process.env.NODE_TEST_CONTEXT) {
  await import('./app.test.js');
} else {
  await import('../ear/env.js');
  const [{ default: items }, { listen }, { gradeLine }, { chooseNextSet, startProfile, explain, turnFacts }] = await Promise.all([
    import('../bank/items.json', { with: { type: 'json' } }),
    import('../ear/hear.js'), import('../grader/index.js'), import('../coach/index.js'),
  ]);
  const port = Number(process.env.PORT || 8787);
  const staticDir = fileURLToPath(new URL('../station/dist/', import.meta.url));
  const server = http.createServer(createApp({
    items, listen, gradeLine, chooseNextSet, startProfile, explain, turnFacts, staticDir,
    teacherPin: process.env.TEACHER_PIN, trace: process.env.TRACE === '1',
    coachModel: process.env.COACH_MODEL, dataDir: process.env.DATA_DIR,
  }));
  server.listen(port, () => {
    console.log(`Kriah Listener: http://localhost:${server.address().port}`);
  });
}
