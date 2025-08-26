import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, pathExists } from './map.js';
import { GRID_W } from './constants.js';

test('exit placed at far right and reachable', () => {
  const { grid, start, exit } = buildMap();
  assert.equal(exit.x, GRID_W - 1);
  assert.ok(pathExists(grid, start, exit));
});
