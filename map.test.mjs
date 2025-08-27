import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMap, pathExists } from './map.js';
import { GRID_W } from './constants.js';

test('exit placed at far right and reachable', () => {
  const { grid, start, exit } = buildMap();
  assert.equal(exit.x, GRID_W - 1);
  assert.ok(pathExists(grid, start, exit));
});

test('map contains two clear control nodes', () => {
  const { grid, nodes } = buildMap();
  assert.equal(nodes.length, 2);
  for (const n of nodes) {
    for (let y = 0; y < n.size; y++) {
      for (let x = 0; x < n.size; x++) {
        assert.equal(grid[n.z][n.y + y][n.x + x], 0);
      }
    }
  }
});
