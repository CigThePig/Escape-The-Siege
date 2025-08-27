import {
  GRID_W,
  GRID_H,
  GRID_D,
  CHESTS_PER_RUN,
  SPAWN_MIN_RADIUS,
  NODE_SIZE,
  NODE_BUFFER,
  NODE_CAPTURE_TURNS,
} from './constants.js';

function generateMaze(width, height, depth) {
  const w = width % 2 === 0 ? width - 1 : width,
    h = height % 2 === 0 ? height - 1 : height,
    d = depth % 2 === 0 ? depth - 1 : depth;
  const grid = Array.from({ length: depth }, () =>
    Array.from({ length: height }, () => Array(width).fill(1)),
  );
  function inBoundsCarve(x, y, z) {
    return x > 0 && x < w - 1 && y > 0 && y < h - 1 && z > 0 && z < d - 1;
  }
  const stack = [];
  let cx = 1,
    cy = 1,
    cz = 1;
  grid[cz][cy][cx] = 0;
  stack.push([cx, cy, cz]);
  function neighbors(x, y, z) {
    return [
      [x + 2, y, z],
      [x - 2, y, z],
      [x, y + 2, z],
      [x, y - 2, z],
      [x, y, z + 2],
      [x, y, z - 2],
    ].filter(
      ([nx, ny, nz]) => inBoundsCarve(nx, ny, nz) && grid[nz][ny][nx] === 1,
    );
  }
  while (stack.length) {
    const [x, y, z] = stack[stack.length - 1];
    const nbs = neighbors(x, y, z);
    if (!nbs.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, nz] = nbs[(Math.random() * nbs.length) | 0];
    grid[nz][ny][nx] = 0;
    grid[z + (nz - z) / 2][y + (ny - y) / 2][x + (nx - x) / 2] = 0;
    stack.push([nx, ny, nz]);
  }
  for (let z = 1; z < depth - 1; z++) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (grid[z][y][x] === 0 && Math.random() < 0.22) {
          if (grid[z][y][x + 1] === 1) grid[z][y][x + 1] = 0;
          if (grid[z][y + 1][x] === 1) grid[z][y + 1][x] = 0;
          if (grid[z + 1][y][x] === 1) grid[z + 1][y][x] = 0;
        }
      }
    }
  }
  return grid;
}
function carveRect(grid, x, y, w, h, z = 0, d = grid.length) {
  for (let kz = z; kz < z + d; kz++)
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const gx = x + i,
          gy = y + j;
        if (
          gx > 0 &&
          gy > 0 &&
          gx < GRID_W - 1 &&
          gy < GRID_H - 1 &&
          kz > 0 &&
          kz < GRID_D - 1
        )
          grid[kz][gy][gx] = 0;
      }
}
function carveGuidedPath(grid, start, exit) {
  let x = start.x,
    y = start.y,
    z = start.z;
  grid[z][y][x] = 0;
  if (y + 1 < GRID_H) grid[z][y + 1][x] = 0;
  if (z + 1 < GRID_D) grid[z + 1][y][x] = 0;
  const steps = GRID_W * 2;
  let dirY = 0,
    dirZ = 0;
  for (let s = 0; s < steps && x < exit.x - 1; s++) {
    const r = Math.random();
    if (r < 0.7) {
      x = Math.min(GRID_W - 2, x + 1);
    } else {
      if (Math.random() < 0.5) {
        if (dirY === 0) dirY = Math.random() < 0.5 ? -1 : 1;
        else if (Math.random() < 0.4) dirY = 0;
        y = Math.max(1, Math.min(GRID_H - 3, y + dirY));
      } else {
        if (dirZ === 0) dirZ = Math.random() < 0.5 ? -1 : 1;
        else if (Math.random() < 0.4) dirZ = 0;
        z = Math.max(1, Math.min(GRID_D - 3, z + dirZ));
      }
    }
    grid[z][y][x] = 0;
    if (y + 1 < GRID_H) grid[z][y + 1][x] = 0;
    if (z + 1 < GRID_D) grid[z + 1][y][x] = 0;
    if (Math.random() < 0.3 && x < exit.x - 2) {
      grid[z][y][x + 1] = 1;
      if (y + 1 < GRID_H) grid[z][y + 1][x + 1] = 1;
      if (z + 1 < GRID_D) grid[z + 1][y][x + 1] = 1;
      const offY = Math.random() < 0.5 ? -1 : 1;
      const offZ = Math.random() < 0.5 ? -1 : 1;
      const yy = Math.max(1, Math.min(GRID_H - 3, y + offY));
      const zz = Math.max(1, Math.min(GRID_D - 3, z + offZ));
      grid[zz][yy][x] = 0;
      if (yy + 1 < GRID_H) grid[zz][yy + 1][x] = 0;
      if (zz + 1 < GRID_D) grid[zz + 1][yy][x] = 0;
      grid[zz][yy][x + 2] = 0;
      if (yy + 1 < GRID_H) grid[zz][yy + 1][x + 2] = 0;
      if (zz + 1 < GRID_D) grid[zz + 1][yy][x + 2] = 0;
      x = x + 2;
      y = yy;
      z = zz;
    }
  }
  grid[exit.z][exit.y][exit.x] = 0;
  if (exit.x - 1 >= 0) grid[exit.z][exit.y][exit.x - 1] = 0;
}
function addRoomsAndConnectors(grid) {
  const roomCount = 3 + ((Math.random() * 2) | 0);
  for (let r = 0; r < roomCount; r++) {
    const rw = 3 + ((Math.random() * 3) | 0),
      rh = 3 + ((Math.random() * 2) | 0),
      rx = 2 + ((Math.random() * (GRID_W - rw - 4)) | 0),
      ry = 2 + ((Math.random() * (GRID_H - rh - 4)) | 0);
    carveRect(grid, rx, ry, rw, rh);
  }
  for (let z = 0; z < GRID_D; z++) {
    for (let y = 2; y < GRID_H - 2; y++) {
      for (let x = 2; x < GRID_W - 2; x++) {
        if (grid[z][y][x] !== 1) continue;
        const horiz =
          grid[z][y][x - 1] === 0 &&
          grid[z][y][x + 1] === 0 &&
          grid[z][y - 1][x] === 1 &&
          grid[z][y + 1][x] === 1;
        const vert =
          grid[z][y - 1][x] === 0 &&
          grid[z][y + 1][x] === 0 &&
          grid[z][y][x - 1] === 1 &&
          grid[z][y][x + 1] === 1;
        if ((horiz || vert) && Math.random() < 0.08) grid[z][y][x] = 0;
      }
    }
  }
}
function randomFloor(grid) {
  for (let tries = 0; tries < 6000; tries++) {
    const x = (Math.random() * GRID_W) | 0,
      y = (Math.random() * GRID_H) | 0,
      z = (Math.random() * GRID_D) | 0;
    if (grid[z][y][x] === 0) return { x, y, z };
  }
  return { x: 1, y: 1, z: 0 };
}
function dist1(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z);
}
export function pathExists(grid, start, goal) {
  const q = [start];
  const seen = new Set([start.x + ',' + start.y + ',' + start.z]);
  const dirs = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  while (q.length) {
    const cur = q.shift();
    if (cur.x === goal.x && cur.y === goal.y && cur.z === goal.z) return true;
    for (let i = 0; i < dirs.length; i++) {
      const nx = cur.x + dirs[i][0],
        ny = cur.y + dirs[i][1],
        nz = cur.z + dirs[i][2];
      if (
        nx < 0 ||
        ny < 0 ||
        nz < 0 ||
        nx >= GRID_W ||
        ny >= GRID_H ||
        nz >= GRID_D
      )
        continue;
      if (grid[nz][ny][nx] === 1) continue;
      const key = nx + ',' + ny + ',' + nz;
      if (!seen.has(key)) {
        seen.add(key);
        q.push({ x: nx, y: ny, z: nz });
      }
    }
  }
  return false;
}
export function buildMap() {
  let grid,
    start,
    exit,
    attempts = 0;
  do {
    grid = generateMaze(GRID_W, GRID_H, GRID_D);
    start = {
      x: 0,
      y: (GRID_H / 2) | 0,
      z: Math.floor(GRID_D / 2),
    };
    exit = { x: GRID_W - 1, y: (GRID_H / 2) | 0, z: start.z };
    grid[start.z][start.y][start.x] = 0;
    if (start.x + 1 < GRID_W) grid[start.z][start.y][start.x + 1] = 0;
    carveGuidedPath(grid, start, exit);
    addRoomsAndConnectors(grid);
    attempts++;
    if (attempts > 50) break;
  } while (!pathExists(grid, start, exit));

  const nodes = [];
  const nodePositions = [
    {
      x: Math.floor(GRID_W * 0.3) - Math.floor(NODE_SIZE / 2),
      y: Math.floor(GRID_H * 0.3) - Math.floor(NODE_SIZE / 2),
    },
    {
      x: Math.floor(GRID_W * 0.6) - Math.floor(NODE_SIZE / 2),
      y: Math.floor(GRID_H * 0.7) - Math.floor(NODE_SIZE / 2),
    },
  ];
  for (const pos of nodePositions) {
    carveRect(
      grid,
      pos.x - NODE_BUFFER,
      pos.y - NODE_BUFFER,
      NODE_SIZE + NODE_BUFFER * 2,
      NODE_SIZE + NODE_BUFFER * 2,
    );
    nodes.push({
      x: pos.x,
      y: pos.y,
      z: start.z,
      size: NODE_SIZE,
      progress: 0,
      max: NODE_CAPTURE_TURNS,
      capturing: false,
      captured: false,
    });
  }

  const spawners = [];
  const edgeOptions = [];
  for (let z = 0; z < GRID_D; z++) {
    for (let y = 0; y < GRID_H; y++) {
      if (grid[z][y][0] === 0) edgeOptions.push({ x: 0, y, z });
      if (grid[z][y][GRID_W - 1] === 0)
        edgeOptions.push({ x: GRID_W - 1, y, z });
    }
    for (let x = 0; x < GRID_W; x++) {
      if (grid[z][0][x] === 0) edgeOptions.push({ x, y: 0, z });
      if (grid[z][GRID_H - 1][x] === 0)
        edgeOptions.push({ x, y: GRID_H - 1, z });
    }
  }
  edgeOptions.sort(() => Math.random() - 0.5);
  function inNodeArea(p) {
    return nodes.some(
      (n) =>
        p.z === n.z &&
        p.x >= n.x - NODE_BUFFER &&
        p.x < n.x + n.size + NODE_BUFFER &&
        p.y >= n.y - NODE_BUFFER &&
        p.y < n.y + n.size + NODE_BUFFER,
    );
  }
  for (const p of edgeOptions) {
    if (dist1(p, start) < SPAWN_MIN_RADIUS) continue;
    if (inNodeArea(p)) continue;
    if (
      !(
        (p.x === start.x && p.y === start.y && p.z === start.z) ||
        (p.x === exit.x && p.y === exit.y && p.z === exit.z)
      )
    )
      spawners.push(p);
    if (spawners.length >= 3) break;
  }
  while (spawners.length < 3) {
    const p = randomFloor(grid);
    if (dist1(p, start) < SPAWN_MIN_RADIUS) continue;
    if (
      (p.x === start.x && p.y === start.y && p.z === start.z) ||
      (p.x === exit.x && p.y === exit.y && p.z === exit.z)
    )
      continue;
    if (inNodeArea(p)) continue;
    spawners.push(p);
  }
  if (!spawners.some((s) => s.x >= Math.floor(GRID_W * 0.6))) {
    for (let tries = 0; tries < 200; tries++) {
      const x =
        Math.floor(GRID_W * 0.7) +
        ((Math.random() * Math.floor(GRID_W * 0.3)) | 0);
      const y = (Math.random() * GRID_H) | 0;
      const z = (Math.random() * GRID_D) | 0;
      const p = { x, y, z };
      if (
        x >= 0 &&
        x < GRID_W &&
        y >= 0 &&
        y < GRID_H &&
        z >= 0 &&
        z < GRID_D &&
        grid[z][y][x] === 0 &&
        dist1(p, start) >= SPAWN_MIN_RADIUS &&
        !inNodeArea(p)
      ) {
        spawners[0] = p;
        break;
      }
    }
  }
  const chests = [];
  for (let i = 0; i < CHESTS_PER_RUN; i++) {
    const p = randomFloor(grid);
    if (
      (p.x === start.x && p.y === start.y && p.z === start.z) ||
      (p.x === exit.x && p.y === exit.y && p.z === exit.z)
    ) {
      i--;
      continue;
    }
    if (spawners.some((s) => s.x === p.x && s.y === p.y && s.z === p.z)) {
      i--;
      continue;
    }
    if (inNodeArea(p)) {
      i--;
      continue;
    }
    chests.push({ x: p.x, y: p.y, z: p.z, opened: false });
  }
  return { grid, start, exit, spawners, chests, nodes };
}
