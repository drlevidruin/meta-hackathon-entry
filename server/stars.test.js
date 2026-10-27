import test from 'node:test';
import assert from 'node:assert/strict';
import { starFixtures } from './stars.fixtures.js';

test('server line stars cover regular, challenge, extra and uncertain grades', async () => {
  const { lineStars } = await import('./stars.js');
  for (const fixture of starFixtures) {
    assert.equal(lineStars(fixture.grade, fixture.challenge), fixture.stars, fixture.name);
  }
});
