import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('root scripts expose the server, station build, demo and rulebook', () => {
  const { scripts } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  assert.equal(scripts.start, 'node server/index.js');
  assert.equal(scripts.build, 'npm --prefix station ci && npm --prefix station run build -- --configLoader native');
  assert.equal(scripts.demo, 'npm --prefix station run dev');
  assert.equal(scripts.rulebook, 'node rulebook/cli.js');
});
