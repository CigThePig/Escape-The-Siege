import {
  GRID_W,
  GRID_H,
  GRID_D,
  VIEW_W,
  PASSIVE_MANA,
  START_MANA,
  START_HP,
  CHEST_MANA,
  COSTS,
  TRAP_RANGE,
  TRAP_DMG,
  RUNE_RADIUS,
  FIRE_DMG,
  FIRE_RADIUS,
  SAB_EXP_DMG,
  SAB_EXP_RADIUS,
  SPIKE_DMG,
  PLACE_RADIUS,
  PLACE_ZOOM,
  ARROW_AMMO,
  FIRE_AMMO,
  RUNE_TURNS,
  BURN_TURNS,
  BURN_DMG,
  RUNE_SLOW_TURNS,
  DASH_CD,
  DASH_COST,
  DASH_DIST,
  DENSITY_TILE_WEIGHT,
  DENSITY_NEIGHBOR_WEIGHT,
  PATIENCE_PROB,
  PATROL_RADIUS,
  ENEMY,
  baseSpawnCooldown,
  baseSpawnCount,
  ENEMY_CAP,
  CHESTS_PER_RUN,
  SPAWN_MIN_RADIUS,
  NODE_ENEMY_CAP_INCR,
  POTION_HEAL,
  COLORS,
} from './constants.js';
import './ui.js';
import { buildMap } from './map.js';
import './enemies.js';
import * as THREE from './lib/three.module.js';

(() => {
  let tileSize = 1,
    tilePad = 0,
    animT = 0;
  let terrainValid = false;
  let state;

  const canvas = document.getElementById('game');
  const renderer = new THREE.WebGLRenderer({ canvas });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.style.position = 'absolute';
  overlayCanvas.style.top = '0';
  overlayCanvas.style.left = '0';
  overlayCanvas.style.pointerEvents = 'none';
  overlayCanvas.style.width = '100%';
  overlayCanvas.style.height = '100%';
  canvas.parentElement.appendChild(overlayCanvas);
  const overlayCtx = overlayCanvas.getContext('2d');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, VIEW_W, VIEW_W, 0, 0.1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(VIEW_W / 2, VIEW_W / 2, 10);
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(0, 0, 10);
  scene.add(dirLight);
  const terrainGroup = new THREE.Group();
  scene.add(terrainGroup);
  let playerMesh = null;
  const enemyMeshes = new Map();

  const hud = {
    hp: document.getElementById('hud-hp'),
    mana: document.getElementById('hud-mana'),
    turn: document.getElementById('hud-turn'),
    enemy: document.getElementById('hud-enemies'),
    spawn: document.getElementById('hud-spawn'),
    dash: document.getElementById('hud-dash'),
    log: document.getElementById('log'),
    hpCard: document.getElementById('hud-hp').parentElement,
  };
  const btnNew = document.getElementById('btn-new'),
    btnHelp = document.getElementById('btn-help'),
    btnPlace = document.getElementById('btn-place'),
    btnDash = document.getElementById('btn-dash');
  const trapbar = document.getElementById('trapbar');
  let trapEls = {};
  const placementPreview = document.getElementById('placementPreview');
  const mapWrap = document.querySelector('.map-wrap');

  const TRAP_DEFS = [
    { id: 'arrow', name: 'Arrow Trap', cost: COSTS.arrow, hotkey: '1' },
    { id: 'rune', name: 'Magic Rune', cost: COSTS.rune, hotkey: '2' },
    { id: 'fire', name: 'Fire Totem', cost: COSTS.fire, hotkey: '3' },
    { id: 'spike', name: 'Spike Floor', cost: COSTS.spike, hotkey: '4' },
  ];
  function renderTrapbar(defs, st) {
    trapbar.innerHTML = '';
    trapEls = {};
    defs.forEach((d) => {
      const btn = document.createElement('button');
      btn.className = 'trap';
      btn.dataset.id = d.id;
      btn.innerHTML = `<div class="name">${d.name}<span class="hk">[${d.hotkey}]</span></div><div class="meta"><span class="cost">${d.cost} mana</span><span class="stock"></span></div><div class="cool"></div>`;
      trapbar.appendChild(btn);
      trapEls[d.id] = {
        btn,
        costEl: btn.querySelector('.cost'),
        stockEl: btn.querySelector('.stock'),
        coolEl: btn.querySelector('.cool'),
      };
      btn.addEventListener('click', () => setActiveTrap(d.id));
    });
    updateMana(st.mana);
  }
  function setActiveTrap(id) {
    state.selectedTool = id;
    for (const k in trapEls)
      trapEls[k].btn.classList.toggle('active', k === id);
    updateMana(state.mana);
    drawPlacementPreview();
  }
  function updateMana(mana) {
    hud.mana.textContent = mana;
    for (const k in trapEls) {
      const def = TRAP_DEFS.find((t) => t.id === k);
      const ammo = state.ammo[k];
      const el = trapEls[k];
      el.stockEl.textContent = ammo === Infinity ? '∞' : `x${ammo}`;
      const affordable = mana >= def.cost && ammo !== 0;
      el.btn.disabled = !affordable;
      el.btn.classList.toggle('insuf', !affordable);
    }
    const sel = state.selectedTool;
    const def = TRAP_DEFS.find((t) => t.id === sel);
    const can = def && mana >= def.cost && state.ammo[sel] !== 0;
    btnPlace.disabled = !can;
  }
  function setCooldown(id, current, total) {
    const el = trapEls[id]?.coolEl;
    if (!el) return;
    const ratio = total > 0 ? current / total : 0;
    el.style.width = Math.min(1, ratio) * 100 + '%';
    if (current > 0) el.setAttribute('aria-label', total - current + ' turns');
    else el.removeAttribute('aria-label');
  }
  function drawPlacementPreview(tileX, tileY, shape = 'square', radius = 1) {
    if (!state.placeMode || tileX == null || tileY == null) {
      placementPreview.style.display = 'none';
      return;
    }
    const dist = Math.max(
      Math.abs(state.player.x - tileX),
      Math.abs(state.player.y - tileY),
    );
    if (dist > PLACE_RADIUS) {
      placementPreview.style.display = 'none';
      return;
    }
    const pad = parseFloat(getComputedStyle(mapWrap).paddingLeft) || 0;
    const { sx, sy } = tileToScreen(
      tileX,
      tileY,
      state.map.height[tileY][tileX],
    );
    const size = tileSize * radius;
    placementPreview.style.display = 'block';
    placementPreview.style.left = pad + sx + 'px';
    placementPreview.style.top = pad + sy + 'px';
    placementPreview.style.width = size + 'px';
    placementPreview.style.height = size + 'px';
    placementPreview.className = shape === 'circle' ? 'circle' : '';
  }
  function renderLegend(pairs) {
    const cont = document.getElementById('legend-items');
    if (!cont) return;
    cont.innerHTML = '';
    pairs.forEach(([label, color]) => {
      const div = document.createElement('div');
      div.className = 'legend-item';
      div.innerHTML = `<span class="swatch" style="background:${color}"></span><span>${label}</span>`;
      cont.appendChild(div);
    });
  }
  function setDashArmed(armed, cd) {
    btnDash.disabled = cd > 0;
    btnDash.textContent = armed
      ? cd > 0
        ? `Dash (cd: ${cd})`
        : 'Dash (ready)'
      : 'Arm Dash';
  }
  function updateHUD(st = state) {
    hud.hp.textContent = st.hp | 0;
    hud.turn.textContent = st.turn | 0;
    hud.enemy.textContent = st.enemies.length | 0;
    hud.spawn.textContent = st.nextSpawn | 0;
    hud.dash.textContent = st.dashCD > 0 ? st.dashCD : 'Ready';
    setDashArmed(st.dashArmed, st.dashCD);
    setActiveTrap(st.selectedTool);
    updateMana(st.mana);
  }

  function updateCamera() {
    state.cameraX = Math.max(
      0,
      Math.min(state.player.x - Math.floor(VIEW_W / 2), GRID_W - VIEW_W),
    );
    state.cameraY = Math.max(
      0,
      Math.min(state.player.y - Math.floor(VIEW_W / 2), GRID_H - VIEW_W),
    );
  }

  const LEGEND_DATA = [
    ['Wall', COLORS.wall],
    ['Floor', COLORS.floor],
    ['Entrance', COLORS.start],
    ['Exit', COLORS.exit],
    ['Node', COLORS.nodeIdle],
    ['Spawner', COLORS.spawner],
    ['Chest', COLORS.chest],
    ['Goblin', COLORS.enemyGoblin],
    ['Archer', COLORS.enemyArcher],
    ['Wraith', COLORS.enemyWraith],
    ['Brute', COLORS.enemyBrute],
    ['Saboteur', COLORS.enemySaboteur],
    ['Hunter', COLORS.enemyHunter],
  ];

  function inBounds(x, y, z) {
    if (x < 0 || x >= GRID_W || y < 0 || y >= GRID_H) return false;
    if (z == null) return true;
    if (z < 0 || z >= GRID_D) return false;
    const h = state.map.height[y][x];
    return Math.abs(z - h) <= 1;
  }
  function samePos(a, b) {
    return a.x === b.x && a.y === b.y && a.z === b.z;
  }
  function tileToScreen(x, y, z = 0) {
    const v = new THREE.Vector3(x, y, z);
    v.project(camera);
    const sx = ((v.x + 1) / 2) * overlayCanvas.width;
    const sy = ((1 - v.y) / 2) * overlayCanvas.height;
    return { sx, sy };
  }
  function isWall(x, y, z) {
    return state.map.grid[z][y][x] === 1;
  }
  function isSpawner(x, y, z) {
    return state.map.spawners.some((s) => s.x === x && s.y === y && s.z === z);
  }
  function isChest(x, y, z) {
    return state.map.chests.some(
      (c) => !c.opened && c.x === x && c.y === y && c.z === z,
    );
  }
  function isStart(x, y) {
    return state.map.start.x === x && state.map.start.y === y;
  }
  function isExit(x, y) {
    return state.map.exit.x === x && state.map.exit.y === y;
  }
  function inNode(node, x, y) {
    return (
      x >= node.x &&
      x < node.x + node.size &&
      y >= node.y &&
      y < node.y + node.size
    );
  }
  function logMsg(m) {
    const p = document.createElement('p');
    p.textContent = m;
    hud.log.appendChild(p);
    hud.log.scrollTop = hud.log.scrollHeight;
  }
  function clearLog() {
    hud.log.innerHTML = '';
  }
  function rndShuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function lineOfSight8(a, b) {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      adx = Math.abs(dx),
      ady = Math.abs(dy);
    if (!(a.x === b.x || a.y === b.y || adx === ady)) return false;
    const sx = Math.sign(dx),
      sy = Math.sign(dy);
    let x = a.x + sx,
      y = a.y + sy;
    while (x !== b.x || y !== b.y) {
      const z = state.map.height[y][x];
      if (isWall(x, y, z)) return false;
      if (
        sx &&
        sy &&
        isWall(x - sx, y, state.map.height[y][x - sx]) &&
        isWall(x, y - sy, state.map.height[y - sy][x])
      )
        return false;
      x += sx;
      y += sy;
    }
    return true;
  }
  function clearShotToPlayer(from, ignore = null) {
    const fz = from.z ?? state.map.height[from.y][from.x];
    if (Math.abs(fz - state.player.z) > 1) return false;
    if (!lineOfSight8(from, state.player)) return false;
    const dx = Math.sign(state.player.x - from.x),
      dy = Math.sign(state.player.y - from.y);
    let x = from.x + dx,
      y = from.y + dy;
    while (x !== state.player.x || y !== state.player.y) {
      if (
        state.enemies.some(
          (e) =>
            e !== ignore && e.x === x && e.y === y && Math.abs(e.z - fz) <= 1,
        )
      )
        return false;
      x += dx;
      y += dy;
    }
    return true;
  }
  function ensureOffscreen() {}
  function drawWallTileTo() {}
  function drawTerrainAll() {
    // dispose existing terrain meshes before clearing the group
    terrainGroup.children.forEach((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
    terrainGroup.clear();

    // shared geometry and materials for floors and walls
    const floorGeo = new THREE.PlaneGeometry(1, 1);
    const floorMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.floor),
    });
    const wallGeo = new THREE.BoxGeometry(1, 1, 1);
    const wallMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.wall),
    });

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const z = state.map.height[y][x];
        let mesh;
        if (isWall(x, y, z)) {
          mesh = new THREE.Mesh(wallGeo, wallMat);
          mesh.scale.z = z + 1;
          mesh.position.set(x + 0.5, y + 0.5, (z + 1) / 2);
        } else {
          mesh = new THREE.Mesh(floorGeo, floorMat);
          mesh.position.set(x + 0.5, y + 0.5, z);
        }
        terrainGroup.add(mesh);
      }
    }
    terrainValid = true;
  }
  function drawOutlineRectTo(tctx, x, y, color, alpha = 0.28) {
    const { sx, sy } = tileToScreen(x, y, 0);
    tctx.save();
    tctx.globalAlpha = alpha;
    tctx.strokeStyle = color;
    tctx.setLineDash([4, 3]);
    tctx.lineWidth = Math.max(1, tileSize * 0.06);
    tctx.strokeRect(
      sx + tilePad,
      sy + tilePad,
      tileSize - tilePad * 2,
      tileSize - tilePad * 2,
    );
    tctx.restore();
  }
  function drawOutlineRect(x, y, c, a) {
    drawOutlineRectTo(overlayCtx, x, y, c, a);
  }
  function drawHPBar(x, y, z, ratio) {
    const { sx, sy } = tileToScreen(x, y, z);
    const w = tileSize - tilePad * 2,
      h = Math.max(3, tileSize * 0.09);
    const bx = sx + tilePad,
      by = sy + tilePad * 0.7;
    overlayCtx.fillStyle = 'rgba(0,0,0,.5)';
    overlayCtx.fillRect(bx, by, w, h);
    overlayCtx.fillStyle =
      ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
    overlayCtx.fillRect(bx, by, w * ratio, h);
  }
  function drawTrapMeter(t) {
    const { sx, sy } = tileToScreen(t.x, t.y, t.z);
    let max = 1;
    switch (t.type) {
      case 'arrow':
        max = ARROW_AMMO;
        break;
      case 'fire':
        max = FIRE_AMMO;
        break;
      case 'rune':
        max = RUNE_TURNS;
        break;
    }
    const ratio = t.ammo === undefined ? 1 : t.ammo / max;
    const w = tileSize - tilePad * 2,
      h = Math.max(3, tileSize * 0.1);
    const bx = sx + tilePad,
      by = sy + tileSize - h - tilePad;
    overlayCtx.fillStyle = 'rgba(0,0,0,.5)';
    overlayCtx.fillRect(bx, by, w, h);
    overlayCtx.fillStyle =
      ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#f59e0b' : '#ef4444';
    overlayCtx.fillRect(bx, by, w * ratio, h);
  }
  function drawTrapIcon(t) {
    const { sx, sy } = tileToScreen(t.x, t.y, t.z);
    const cx = sx + tileSize / 2,
      cy = sy + tileSize / 2;
    const size = tileSize - tilePad * 2;
    overlayCtx.save();
    if (t.type === 'arrow') {
      overlayCtx.fillStyle = COLORS.arrow;
      overlayCtx.beginPath();
      overlayCtx.moveTo(cx - size * 0.35, cy - size * 0.2);
      overlayCtx.lineTo(cx + size * 0.35, cy);
      overlayCtx.lineTo(cx - size * 0.35, cy + size * 0.2);
      overlayCtx.closePath();
      overlayCtx.fill();
    } else if (t.type === 'rune') {
      overlayCtx.strokeStyle = COLORS.rune;
      overlayCtx.lineWidth = Math.max(2, tileSize * 0.1);
      overlayCtx.beginPath();
      overlayCtx.moveTo(cx, cy - size * 0.3);
      overlayCtx.lineTo(cx + size * 0.3, cy);
      overlayCtx.lineTo(cx, cy + size * 0.3);
      overlayCtx.lineTo(cx - size * 0.3, cy);
      overlayCtx.closePath();
      overlayCtx.stroke();
    } else if (t.type === 'fire') {
      overlayCtx.fillStyle = COLORS.fire;
      overlayCtx.beginPath();
      overlayCtx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
      overlayCtx.fill();
      overlayCtx.fillStyle = '#fff';
      overlayCtx.beginPath();
      overlayCtx.moveTo(cx, cy - size * 0.2);
      overlayCtx.lineTo(cx + size * 0.1, cy);
      overlayCtx.lineTo(cx - size * 0.1, cy);
      overlayCtx.closePath();
      overlayCtx.fill();
    } else if (t.type === 'spike') {
      overlayCtx.fillStyle = COLORS.spike;
      overlayCtx.beginPath();
      overlayCtx.moveTo(cx, cy - size * 0.35);
      overlayCtx.lineTo(cx + size * 0.35, cy + size * 0.35);
      overlayCtx.lineTo(cx - size * 0.35, cy + size * 0.35);
      overlayCtx.closePath();
      overlayCtx.fill();
    }
    overlayCtx.restore();
  }
  function drawDrops() {
    for (const d of state.drops) {
      const { sx, sy } = tileToScreen(d.x, d.y, d.z);
      const cx = sx + tileSize / 2,
        cy = sy + tileSize / 2;
      const r = tileSize / 4;
      overlayCtx.save();
      if (d.kind === 'mana') {
        overlayCtx.fillStyle = COLORS.mana;
        overlayCtx.beginPath();
        overlayCtx.arc(cx, cy, r, 0, Math.PI * 2);
        overlayCtx.fill();
      } else if (d.kind === 'potion') {
        overlayCtx.fillStyle = COLORS.potion;
        overlayCtx.beginPath();
        overlayCtx.arc(cx, cy, r, 0, Math.PI * 2);
        overlayCtx.fill();
        overlayCtx.strokeStyle = '#fff';
        overlayCtx.lineWidth = Math.max(2, tileSize * 0.08);
        overlayCtx.beginPath();
        overlayCtx.moveTo(cx, cy - r * 0.5);
        overlayCtx.lineTo(cx, cy + r * 0.5);
        overlayCtx.moveTo(cx - r * 0.5, cy);
        overlayCtx.lineTo(cx + r * 0.5, cy);
        overlayCtx.stroke();
      }
      overlayCtx.restore();
    }
  }
  function outlineRangeTiles(cx, cy, r, color) {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!inBounds(x, y)) continue;
        if (Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= r)
          drawOutlineRect(x, y, color, 0.18);
      }
    }
  }
  function highlightPlacementArea() {
    for (
      let y = state.player.y - PLACE_RADIUS;
      y <= state.player.y + PLACE_RADIUS;
      y++
    ) {
      for (
        let x = state.player.x - PLACE_RADIUS;
        x <= state.player.x + PLACE_RADIUS;
        x++
      ) {
        if (!inBounds(x, y)) continue;
        const check = isValidPlacement(x, y);
        if (check.ok) drawOutlineRect(x, y, COLORS.player, 0.25);
      }
    }
  }
  function updateDrops() {
    const next = [];
    for (const d of state.drops) {
      const dist = Math.max(
        Math.abs(d.x - state.player.x),
        Math.abs(d.y - state.player.y),
        Math.abs(d.z - state.player.z),
      );
      if (dist <= 5 && dist > 0) {
        const dx = state.player.x > d.x ? 1 : state.player.x < d.x ? -1 : 0;
        const dy = state.player.y > d.y ? 1 : state.player.y < d.y ? -1 : 0;
        const dz = state.player.z > d.z ? 1 : state.player.z < d.z ? -1 : 0;
        d.x += dx;
        d.y += dy;
        d.z += dz;
      }
      if (
        d.x === state.player.x &&
        d.y === state.player.y &&
        d.z === state.player.z
      ) {
        if (d.kind === 'mana') {
          state.mana += d.amount;
          logMsg(`Collected ${d.amount} mana.`);
        } else if (d.kind === 'potion') {
          const heal = Math.min(d.amount, START_HP - state.hp);
          if (heal > 0) {
            state.hp += heal;
            logMsg(`Healed ${heal} HP.`);
          }
        }
        updateHUD();
      } else next.push(d);
    }
    state.drops = next;
  }
  function addFX(kind, x, y, z = 0, life = 18) {
    state.fx.push({ kind, x, y, z, life, max: life });
  }
  function addProjectileFX(kind, sx, sy, sz, tx, ty, tz, color, life = 12) {
    state.fx.push({ kind, sx, sy, sz, tx, ty, tz, color, life, max: life });
  }
  function dropLoot(x, y, z, amount) {
    addFX('explosion', x, y, z, 12);
    if (amount > 0) state.drops.push({ x, y, z, kind: 'mana', amount });
    if (Math.random() < 0.05)
      state.drops.push({ x, y, z, kind: 'potion', amount: POTION_HEAL });
  }
  function drawEffects() {
    const next = [];
    for (let i = 0; i < state.fx.length; i++) {
      const fx = state.fx[i];
      fx.life--;
      if (fx.life <= 0) continue;
      const { sx, sy } = tileToScreen(fx.x, fx.y, fx.z);
      overlayCtx.save();
      if (fx.kind === 'hit') {
        overlayCtx.globalAlpha = fx.life / fx.max;
        overlayCtx.strokeStyle = '#e8ecff';
        overlayCtx.lineWidth = Math.max(1, tileSize * 0.06);
        overlayCtx.beginPath();
        overlayCtx.arc(
          sx + tileSize / 2,
          sy + tileSize / 2,
          tileSize * 0.3 * (1 + (fx.max - fx.life) / fx.max),
          0,
          Math.PI * 2,
        );
        overlayCtx.stroke();
      } else if (fx.kind === 'slow') {
        overlayCtx.globalAlpha = 0.5 * (fx.life / fx.max);
        overlayCtx.strokeStyle = '#06b6d4';
        overlayCtx.lineWidth = 2;
        overlayCtx.strokeRect(
          sx + tilePad,
          sy + tilePad,
          tileSize - tilePad * 2,
          tileSize - tilePad * 2,
        );
      } else if (fx.kind === 'fire') {
        overlayCtx.globalAlpha = 0.5 * (fx.life / fx.max);
        overlayCtx.fillStyle = 'rgba(239,68,68,.25)';
        overlayCtx.beginPath();
        overlayCtx.arc(
          sx + tileSize / 2,
          sy + tileSize / 2,
          tileSize * 0.45,
          0,
          Math.PI * 2,
        );
        overlayCtx.fill();
      } else if (fx.kind === 'explosion') {
        overlayCtx.globalAlpha = 0.6 * (fx.life / fx.max);
        overlayCtx.fillStyle = COLORS.explosion;
        overlayCtx.beginPath();
        overlayCtx.arc(
          sx + tileSize / 2,
          sy + tileSize / 2,
          tileSize * 0.5 * (1 + (fx.max - fx.life) / fx.max),
          0,
          Math.PI * 2,
        );
        overlayCtx.fill();
      } else if (fx.kind === 'fireRange') {
        const a = 0.3 * (fx.life / fx.max);
        for (let y = fx.y - fx.r; y <= fx.y + fx.r; y++) {
          for (let x = fx.x - fx.r; x <= fx.x + fx.r; x++) {
            if (!inBounds(x, y)) continue;
            if (Math.abs(fx.x - x) + Math.abs(fx.y - y) <= fx.r)
              drawOutlineRect(x, y, COLORS.fire, a);
          }
        }
      } else if (fx.kind === 'saboteurExplosion') {
        overlayCtx.globalAlpha = 0.5 * (fx.life / fx.max);
        overlayCtx.fillStyle = 'rgba(168,85,247,.25)';
        overlayCtx.beginPath();
        overlayCtx.arc(
          sx + tileSize / 2,
          sy + tileSize / 2,
          tileSize * 0.45,
          0,
          Math.PI * 2,
        );
        overlayCtx.fill();
      } else if (fx.kind === 'saboteurRange') {
        const a = 0.3 * (fx.life / fx.max);
        for (let y = fx.y - fx.r; y <= fx.y + fx.r; y++) {
          for (let x = fx.x - fx.r; x <= fx.x + fx.r; x++) {
            if (!inBounds(x, y)) continue;
            if (Math.abs(fx.x - x) + Math.abs(fx.y - y) <= fx.r)
              drawOutlineRect(x, y, COLORS.saboteurExplosion, a);
          }
        }
      } else if (fx.kind === 'projectile') {
        const p = 1 - fx.life / fx.max;
        const { sx: asx, sy: asy } = tileToScreen(fx.sx, fx.sy);
        const { sx: bsx, sy: bsy } = tileToScreen(fx.tx, fx.ty);
        const x = asx + (bsx - asx) * p;
        const y = asy + (bsy - asy) * p;
        overlayCtx.globalAlpha = 1;
        overlayCtx.strokeStyle = fx.color || '#fff';
        overlayCtx.lineWidth = Math.max(2, tileSize * 0.15);
        overlayCtx.beginPath();
        overlayCtx.moveTo(x + tileSize / 2, y + tileSize / 2);
        overlayCtx.lineTo(
          x + tileSize / 2 - (bsx - asx) * 0.2,
          y + tileSize / 2 - (bsy - asy) * 0.2,
        );
        overlayCtx.stroke();
      } else if (fx.kind === 'slash') {
        overlayCtx.globalAlpha = fx.life / fx.max;
        overlayCtx.strokeStyle = '#e8ecff';
        overlayCtx.lineWidth = Math.max(2, tileSize * 0.1);
        overlayCtx.beginPath();
        overlayCtx.moveTo(sx + tilePad, sy + tilePad);
        overlayCtx.lineTo(sx + tileSize - tilePad, sy + tileSize - tilePad);
        overlayCtx.moveTo(sx + tilePad, sy + tileSize - tilePad);
        overlayCtx.lineTo(sx + tileSize - tilePad, sy + tilePad);
        overlayCtx.stroke();
      }
      overlayCtx.restore();
      next.push(fx);
    }
    state.fx = next;
  }

  function drawPlayer() {
    const bob = Math.sin(animT / 200) * 0.1;
    if (!playerMesh) {
      const geo = new THREE.CircleGeometry(0.45, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(COLORS.player),
      });
      playerMesh = new THREE.Mesh(geo, mat);
      scene.add(playerMesh);
    }
    playerMesh.position.set(
      state.player.x + 0.5,
      state.player.y + 0.5,
      state.player.z + bob + 0.2,
    );
  }
  function drawEnemy(e) {
    const bob = Math.sin(animT / 200 + (e.x + e.y)) * 0.1;
    let mesh = enemyMeshes.get(e);
    if (!mesh) {
      let col;
      switch (e.kind) {
        case 'goblin':
          col = COLORS.enemyGoblin;
          break;
        case 'archer':
          col = COLORS.enemyArcher;
          break;
        case 'wraith':
          col = COLORS.enemyWraith;
          break;
        case 'brute':
          col = COLORS.enemyBrute;
          break;
        case 'saboteur':
          col = COLORS.enemySaboteur;
          break;
        case 'hunter':
          col = COLORS.enemyHunter;
          break;
        default:
          col = COLORS.enemyWraith;
      }
      const geo = new THREE.CircleGeometry(0.45, 16);
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(col),
      });
      mesh = new THREE.Mesh(geo, mat);
      enemyMeshes.set(e, mesh);
      scene.add(mesh);
    }
    mesh.position.set(e.x + 0.5, e.y + 0.5, e.z + bob + 0.2);
  }
  function draw() {
    const rect = canvas.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height, false);
    overlayCanvas.width = rect.width;
    overlayCanvas.height = rect.height;
    overlayCtx.clearRect(0, 0, rect.width, rect.height);
    tileSize = rect.width / VIEW_W;
    updateCamera();
    camera.position.set(
      state.cameraX + VIEW_W / 2,
      state.cameraY + VIEW_W / 2,
      10,
    );
    camera.lookAt(state.cameraX + VIEW_W / 2, state.cameraY + VIEW_W / 2, 0);
    if (!terrainValid) drawTerrainAll();
    drawPlayer();
    const active = new Set();
    for (const e of state.enemies) {
      drawEnemy(e);
      active.add(e);
      drawHPBar(e.x, e.y, e.z, e.hp / e.maxhp);
    }
    for (const [e, mesh] of enemyMeshes) {
      if (!active.has(e)) {
        scene.remove(mesh);
        enemyMeshes.delete(e);
      }
    }
    for (const t of state.towers) {
      drawTrapIcon(t);
      drawTrapMeter(t);
    }
    drawDrops();
    drawEffects();
    if (state.placeMode) highlightPlacementArea();
    renderer.render(scene, camera);
  }
  window.addEventListener('resize', () => {
    terrainValid = false;
  });
  document.addEventListener('keydown', (e) => {
    if (state.won || state.lost || state.placeMode) return;
    const key = e.key.toLowerCase();
    if (['arrowup', 'w'].includes(key)) playerMove(0, -1, e.shiftKey);
    else if (['arrowdown', 's'].includes(key)) playerMove(0, 1, e.shiftKey);
    else if (['arrowleft', 'a'].includes(key)) playerMove(-1, 0, e.shiftKey);
    else if (['arrowright', 'd'].includes(key)) playerMove(1, 0, e.shiftKey);
    else if (key === 'q') toggleDashArm();
    else if (['1', '2', '3', '4'].includes(e.key))
      setActiveTrap(TRAP_DEFS[Number(e.key) - 1].id);
  });
  btnDash.addEventListener('click', () => {
    if (!btnDash.disabled) toggleDashArm();
  });
  function toggleDashArm() {
    if (state.dashCD > 0 || state.mana < DASH_COST) {
      logMsg(
        state.dashCD > 0
          ? `Dash on cooldown (${state.dashCD}).`
          : `Need ${DASH_COST} mana to dash.`,
      );
      return;
    }
    state.dashArmed = !state.dashArmed;
    setDashArmed(state.dashArmed, state.dashCD);
  }
  function canvasPosToTile(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    let x = clientX - rect.left,
      y = clientY - rect.top;
    if (state.placeMode) {
      const { sx: psx, sy: psy } = tileToScreen(
        state.player.x,
        state.player.y,
        state.player.z,
      );
      x = (x - rect.width / 2) / PLACE_ZOOM + psx + tileSize / 2;
      y = (y - rect.height / 2) / PLACE_ZOOM + psy + tileSize / 2;
    }
    x =
      Math.floor(Math.max(0, Math.min(rect.width - 1, x)) / tileSize) +
      state.cameraX;
    y =
      Math.floor(Math.max(0, Math.min(rect.height - 1, y)) / tileSize) +
      state.cameraY;
    return { x, y };
  }
  btnPlace.addEventListener('click', () => {
    if (btnPlace.disabled) return;
    state.placeMode = !state.placeMode;
    if (!state.placeMode) state.hover = null;
    drawPlacementPreview();
  });
  canvas.addEventListener(
    'click',
    (e) => {
      if (!state.placeMode || state.won || state.lost) return;
      const { x, y } = canvasPosToTile(e.clientX, e.clientY);
      const check = isValidPlacement(x, y);
      if (!check.ok) {
        logMsg(`Can't place: ${check.reason}`);
        return;
      }
      tryPlace(x, y);
    },
    { passive: true },
  );
  canvas.addEventListener(
    'mousemove',
    (e) => {
      if (!state.placeMode) {
        drawPlacementPreview();
        return;
      }
      const { x, y } = canvasPosToTile(e.clientX, e.clientY);
      drawPlacementPreview(x, y);
    },
    { passive: true },
  );
  canvas.addEventListener('mouseleave', () => {
    drawPlacementPreview();
  });
  document
    .querySelectorAll('#dpad button')
    .forEach((btn) =>
      btn.addEventListener('click', () => window.onMove(btn.dataset.dir)),
    );
  let swipeStart = null;
  canvas.addEventListener(
    'touchstart',
    (e) => {
      const t = e.changedTouches[0];
      swipeStart = { x: t.clientX, y: t.clientY };
    },
    { passive: true },
  );
  canvas.addEventListener(
    'touchend',
    (e) => {
      if (!swipeStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - swipeStart.x,
        dy = t.clientY - swipeStart.y;
      const ax = Math.abs(dx),
        ay = Math.abs(dy);
      if (ax > 24 && ay > 24)
        window.onMove(
          dy > 0
            ? dx > 0
              ? 'down-right'
              : 'down-left'
            : dx > 0
              ? 'up-right'
              : 'up-left',
        );
      else if (ax > ay && ax > 24) window.onMove(dx > 0 ? 'right' : 'left');
      else if (ay > 24) window.onMove(dy > 0 ? 'down' : 'up');
      swipeStart = null;
    },
    { passive: true },
  );
  const DIR_MAP = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
    'up-left': [-1, -1],
    'up-right': [1, -1],
    'down-left': [-1, 1],
    'down-right': [1, 1],
  };

  function rebuildFlow() {
    const INF = 1e9;
    const dist = Array.from({ length: GRID_H }, () => Array(GRID_W).fill(INF));
    const q = [];
    const start = { x: state.player.x, y: state.player.y };
    dist[start.y][start.x] = 0;
    q.push(start);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    while (q.length) {
      const cur = q.shift();
      const curZ = state.map.height[cur.y][cur.x];
      const d = dist[cur.y][cur.x] + 1;
      for (let i = 0; i < dirs.length; i++) {
        const dx = dirs[i][0],
          dy = dirs[i][1],
          nx = cur.x + dx,
          ny = cur.y + dy;
        if (!inBounds(nx, ny)) continue;
        const nz = state.map.height[ny][nx];
        if (!inBounds(nx, ny, nz)) continue;
        if (Math.abs(nz - curZ) > 1) continue;
        if (isWall(nx, ny, nz)) continue;
        if (
          dx &&
          dy &&
          isWall(cur.x + dx, cur.y, state.map.height[cur.y][cur.x + dx]) &&
          isWall(cur.x, cur.y + dy, state.map.height[cur.y + dy][cur.x])
        )
          continue;
        if (d < dist[ny][nx]) {
          dist[ny][nx] = d;
          q.push({ x: nx, y: ny });
        }
      }
    }
    state.flowDist = dist;
    state.flowDirty = false;
  }

  function playerMove(dx, dy, useDashKey = false) {
    if (state.won || state.lost) return;
    const px = state.player.x,
      py = state.player.y,
      pz = state.player.z;
    let didDash = false;
    if (
      (state.dashArmed || useDashKey) &&
      state.dashCD === 0 &&
      state.mana >= DASH_COST
    ) {
      let nx = state.player.x,
        ny = state.player.y,
        nz = state.player.z;
      for (let step = 0; step < DASH_DIST; step++) {
        const tx = nx + dx,
          ty = ny + dy;
        if (!inBounds(tx, ty)) break;
        const tz = state.map.height[ty][tx];
        if (!inBounds(tx, ty, tz) || isWall(tx, ty, tz)) break;
        if (Math.abs(tz - nz) > 1) break;
        if (
          dx &&
          dy &&
          isWall(nx + dx, ny, state.map.height[ny][nx + dx]) &&
          isWall(nx, ny + dy, state.map.height[ny + dy][nx])
        )
          break;
        nx = tx;
        ny = ty;
        nz = tz;
      }
      if (
        nx !== state.player.x ||
        ny !== state.player.y ||
        nz !== state.player.z
      ) {
        state.player.x = nx;
        state.player.y = ny;
        state.player.z = nz;
        state.mana -= DASH_COST;
        state.dashCD = DASH_CD;
        state.dashArmed = false;
        didDash = true;
        logMsg('Dashed!');
      }
    }
    if (!didDash) {
      const nx = state.player.x + dx,
        ny = state.player.y + dy;
      if (!inBounds(nx, ny)) return;
      const nz = state.map.height[ny][nx];
      if (!inBounds(nx, ny, nz) || isWall(nx, ny, nz)) return;
      if (Math.abs(nz - state.player.z) > 1) return;
      if (
        dx &&
        dy &&
        isWall(
          state.player.x + dx,
          state.player.y,
          state.map.height[state.player.y][state.player.x + dx],
        ) &&
        isWall(
          state.player.x,
          state.player.y + dy,
          state.map.height[state.player.y + dy][state.player.x],
        )
      )
        return;
      state.player.x = nx;
      state.player.y = ny;
      state.player.z = nz;
    }
    const mdx = state.player.x - px,
      mdy = state.player.y - py;
    if (mdx || mdy) state.lastMove = { dx: mdx, dy: mdy };
    for (const c of state.map.chests) {
      if (!c.opened && samePos(c, state.player)) {
        c.opened = true;
        state.mana += CHEST_MANA;
        terrainValid = false;
        logMsg(`Opened chest: +${CHEST_MANA} mana.`);
      }
    }
    updateCamera();
    if (
      state.player.x === state.map.exit.x &&
      state.player.y === state.map.exit.y &&
      state.player.z === state.map.height[state.map.exit.y][state.map.exit.x] &&
      state.map.nodes.every((n) => n.captured)
    ) {
      state.won = true;
      updateHUD();
      return;
    }
    state.flowDirty = true;
    advanceTurn();
  }
  window.onMove = (dir) => {
    const d = DIR_MAP[dir];
    if (!d) return;
    playerMove(d[0], d[1]);
  };
  function tryPlace(x, y) {
    const t = state.selectedTool,
      cost = COSTS[t];
    state.mana -= cost;
    const z = state.map.height[y][x];
    if (t === 'arrow')
      state.towers.push({ x, y, z, type: t, ammo: ARROW_AMMO });
    else if (t === 'fire')
      state.towers.push({ x, y, z, type: t, ammo: FIRE_AMMO });
    else if (t === 'rune')
      state.towers.push({ x, y, z, type: t, ammo: RUNE_TURNS });
    else state.towers.push({ x, y, z, type: t });
    state.placeMode = false;
    state.hover = null;
    logMsg(`Placed ${t} at (${x},${y}).`);
    updateMana(state.mana);
    if (t === 'spike') {
      state.spikePlaced = true;
    } else advanceTurn();
  }
  function isValidPlacement(x, y) {
    const z = state.map.height[y][x];
    if (!inBounds(x, y, z)) return { ok: false, reason: 'out of bounds' };
    if (isWall(x, y, z)) return { ok: false, reason: 'wall tile' };
    if (isStart(x, y) || isExit(x, y))
      return { ok: false, reason: 'reserved tile' };
    if (isSpawner(x, y, z)) return { ok: false, reason: 'spawner tile' };
    if (isChest(x, y, z)) return { ok: false, reason: 'chest tile' };
    if (state.player.x === x && state.player.y === y && state.player.z === z)
      return { ok: false, reason: 'on player' };
    const dist = Math.max(
      Math.abs(state.player.x - x),
      Math.abs(state.player.y - y),
    );
    if (dist > PLACE_RADIUS)
      return {
        ok: false,
        reason: `must place within ${PLACE_RADIUS} tiles of player`,
      };
    if (state.towers.some((t) => t.x === x && t.y === y && t.z === z))
      return { ok: false, reason: 'occupied by a trap' };
    if (state.selectedTool === 'spike' && state.spikePlaced)
      return { ok: false, reason: 'only one spike per turn' };
    const cost = COSTS[state.selectedTool];
    if (state.mana < cost) return { ok: false, reason: `need ${cost} mana` };
    return { ok: true };
  }
  function flashHP() {
    hud.hpCard.classList.add('flash');
    setTimeout(() => hud.hpCard.classList.remove('flash'), 250);
  }
  function isPlayerShielded() {
    return state.towers.some(
      (t) =>
        t.type === 'rune' &&
        Math.abs(t.x - state.player.x) + Math.abs(t.y - state.player.y) <=
          RUNE_RADIUS &&
        Math.abs(t.z - state.player.z) <= RUNE_RADIUS,
    );
  }
  function playerTakeDamage(amount) {
    const dmg = isPlayerShielded() ? amount / 2 : amount;
    state.hp -= dmg;
    flashHP();
    return dmg;
  }
  function advanceTurn() {
    if (state.won || state.lost) return;
    state.turn += 1;
    state.spikePlaced = false;
    state.mana += PASSIVE_MANA;
    if (state.dashCD > 0) state.dashCD -= 1;
    towersAct();
    enemiesPreEffects();
    try {
      enemiesAct();
    } catch (err) {
      logMsg(`AI error: ${err.message}`);
    }
    handleSpawns();
    updateDrops();
    updateNodes();
    checkWinLose();
    updateHUD();
  }
  function rewardFor(k) {
    return ENEMY[k]?.reward || 0;
  }
  function towersAct() {
    if (!state.towers.length) return;
    const survivors = [];
    for (const t of state.towers) {
      if (t.type === 'arrow') {
        let best = null,
          bestD = 1e9;
        for (const e of state.enemies) {
          if (e.kind === 'saboteur') continue;
          const d = Math.max(Math.abs(t.x - e.x), Math.abs(t.y - e.y));
          if (d <= TRAP_RANGE && lineOfSight8(t, e)) {
            if (d < bestD) {
              best = e;
              bestD = d;
            }
          }
        }
        let ammo = t.ammo === undefined ? ARROW_AMMO : t.ammo;
        if (best && ammo > 0) {
          best.hp -= TRAP_DMG;
          addProjectileFX(
            'projectile',
            t.x,
            t.y,
            t.z,
            best.x,
            best.y,
            best.z,
            COLORS.arrow,
            10,
          );
          addFX('hit', best.x, best.y, best.z);
          ammo -= 1;
        }
        if (ammo > 0) {
          t.ammo = ammo;
          survivors.push(t);
        } else terrainValid = false;
      } else if (t.type === 'rune') {
        let ammo = t.ammo === undefined ? RUNE_TURNS : t.ammo;
        const targets = state.enemies.filter(
          (e) => Math.abs(t.x - e.x) + Math.abs(t.y - e.y) <= RUNE_RADIUS,
        );
        if (targets.some((e) => e.kind !== 'saboteur')) {
          for (const e of targets) {
            e.slowTurns = Math.max(e.slowTurns || 0, RUNE_SLOW_TURNS);
          }
          addFX('slow', t.x, t.y, t.z, 14);
        }
        ammo -= 1;
        if (ammo > 0) {
          t.ammo = ammo;
          survivors.push(t);
        } else terrainValid = false;
      } else if (t.type === 'fire') {
        let ammo = t.ammo === undefined ? FIRE_AMMO : t.ammo;
        const targets = state.enemies.filter(
          (e) => Math.abs(t.x - e.x) + Math.abs(t.y - e.y) <= FIRE_RADIUS,
        );
        if (targets.some((e) => e.kind !== 'saboteur')) {
          for (const e of targets) {
            e.hp -= FIRE_DMG;
            e.burn = Math.max(e.burn || 0, BURN_TURNS);
            addFX('fire', e.x, e.y, e.z, 12);
          }
          state.fx.push({
            kind: 'fireRange',
            x: t.x,
            y: t.y,
            z: t.z,
            r: FIRE_RADIUS,
            life: 12,
            max: 12,
          });
          ammo -= 1;
        }
        if (ammo > 0) {
          t.ammo = ammo;
          survivors.push(t);
        } else terrainValid = false;
      } else if (t.type === 'spike') {
        survivors.push(t);
      }
    }
    const alive = [];
    for (const e of state.enemies) {
      if (e.hp <= 0) dropLoot(e.x, e.y, e.z, rewardFor(e.kind));
      else alive.push(e);
    }
    state.enemies = alive;
    state.towers = survivors;
  }
  function enemiesPreEffects() {
    const alive = [];
    for (const e of state.enemies) {
      if (e.burn && e.burn > 0) {
        e.hp -= BURN_DMG;
        e.burn--;
        addFX('fire', e.x, e.y, e.z, 10);
      }
      if (e.hp <= 0) dropLoot(e.x, e.y, e.z, rewardFor(e.kind));
      else alive.push(e);
    }
    state.enemies = alive;
  }
  function bfsPath(
    start,
    goal,
    allowPhase,
    occupied,
    traps,
    avoidTraps = true,
  ) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    const q = [start];
    const prev = {};
    const seen = new Set([start.x + ',' + start.y]);
    const goalKey = goal.x + ',' + goal.y;
    while (q.length) {
      const cur = q.shift();
      const key = cur.x + ',' + cur.y;
      if (key === goalKey) break;
      const curZ = state.map.height[cur.y][cur.x];
      for (const d of dirs) {
        const dx = d[0],
          dy = d[1],
          nx = cur.x + dx,
          ny = cur.y + dy;
        if (!inBounds(nx, ny)) continue;
        const nz = state.map.height[ny][nx];
        if (!inBounds(nx, ny, nz)) continue;
        if (Math.abs(nz - curZ) > 1) continue;
        if (!allowPhase && isWall(nx, ny, nz)) continue;
        if (
          dx &&
          dy &&
          !allowPhase &&
          isWall(cur.x + dx, cur.y, state.map.height[cur.y][cur.x + dx]) &&
          isWall(cur.x, cur.y + dy, state.map.height[cur.y + dy][cur.x])
        )
          continue;
        const nk = nx + ',' + ny;
        if (seen.has(nk)) continue;
        if (occupied.has(nk) && nk !== goalKey) continue;
        if (avoidTraps && traps.has(nk)) continue;
        seen.add(nk);
        prev[nk] = cur;
        q.push({ x: nx, y: ny });
      }
    }
    if (!seen.has(goalKey)) return null;
    const path = [];
    let cur = goal;
    while (cur) {
      path.unshift(cur);
      const k = cur.x + ',' + cur.y;
      cur = prev[k];
    }
    return path;
  }
  function adjacentTargets(base, occupied) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    const goals = [];
    for (const d of dirs) {
      const dx = d[0],
        dy = d[1],
        tx = base.x + dx,
        ty = base.y + dy;
      if (!inBounds(tx, ty)) continue;
      const tz = state.map.height[ty][tx];
      const bz = state.map.height[base.y][base.x];
      if (!inBounds(tx, ty, tz) || Math.abs(tz - bz) > 1) continue;
      if (isWall(tx, ty, tz)) continue;
      if (
        dx &&
        dy &&
        isWall(base.x + dx, base.y, state.map.height[base.y][base.x + dx]) &&
        isWall(base.x, base.y + dy, state.map.height[base.y + dy][base.x])
      )
        continue;
      const key = tx + ',' + ty;
      if (!occupied.has(key)) goals.push({ x: tx, y: ty, z: tz });
    }
    if (!goals.length)
      goals.push({
        x: base.x,
        y: base.y,
        z: state.map.height[base.y][base.x],
      });
    return goals;
  }
  function enemyAttack(e) {
    if (e.kind === 'archer') {
      if (e.cooldown > 0) {
        e.cooldown--;
        return false;
      }
      const d = Math.max(
        Math.abs(e.x - state.player.x),
        Math.abs(e.y - state.player.y),
        Math.abs(e.z - state.player.z),
      );
      if (d <= ENEMY.archer.range && clearShotToPlayer(e, e)) {
        addProjectileFX(
          'projectile',
          e.x,
          e.y,
          e.z,
          state.player.x,
          state.player.y,
          state.player.z,
          COLORS.enemyArcher,
          12,
        );
        const dealt = playerTakeDamage(ENEMY.archer.dmg);
        logMsg(`Skeleton archer hits you for ${dealt}.`);
        e.cooldown = ENEMY.archer.cd;
        return true;
      }
      return false;
    } else {
      const d = Math.max(
        Math.abs(e.x - state.player.x),
        Math.abs(e.y - state.player.y),
        Math.abs(e.z - state.player.z),
      );
      const dmg = ENEMY[e.kind]?.touch || 0;
      if (d === 1 && dmg > 0) {
        const dealt = playerTakeDamage(dmg);
        addFX('slash', state.player.x, state.player.y, state.player.z, 12);
        logMsg(`Enemy hit you for ${dealt} damage.`);
        return true;
      }
      return false;
    }
  }
  function moveArcher(e, occupied) {
    const key = e.x + ',' + e.y;
    occupied.delete(key);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    let best = null;
    for (const d of dirs) {
      const nx = e.x + d[0],
        ny = e.y + d[1];
      if (!inBounds(nx, ny)) continue;
      const nz = state.map.height[ny][nx];
      if (!inBounds(nx, ny, nz) || isWall(nx, ny, nz)) continue;
      if (Math.abs(nz - e.z) > 1) continue;
      const nk = nx + ',' + ny;
      if (occupied.has(nk)) continue;
      if (state.towers.some((t) => t.x === nx && t.y === ny && t.z === nz))
        continue;
      const dist = Math.max(
        Math.abs(nx - state.player.x),
        Math.abs(ny - state.player.y),
        Math.abs(nz - state.player.z),
      );
      const shot =
        dist <= ENEMY.archer.range &&
        clearShotToPlayer({ x: nx, y: ny, z: nz }, e);
      const score = Math.abs(dist - ENEMY.archer.range) + (shot ? 0 : 1);
      if (!best || score < best.score) best = { nx, ny, nz, score };
    }
    if (best) {
      e.x = best.nx;
      e.y = best.ny;
      e.z = best.nz;
      occupied.add(best.nx + ',' + best.ny);
    } else occupied.add(key);
  }
  function moveEnemy(e, occupied) {
    const key = e.x + ',' + e.y;
    occupied.delete(key);
    const traps = new Set(state.towers.map((t) => t.x + ',' + t.y));
    let base = {
      x: state.player.x,
      y: state.player.y,
      z: state.player.z,
    };
    if (
      state.lastMove &&
      Math.max(Math.abs(e.x - state.player.x), Math.abs(e.y - state.player.y)) >
        4
    ) {
      const px = state.player.x + state.lastMove.dx,
        py = state.player.y + state.lastMove.dy;
      if (!inBounds(px, py));
      else {
        const pz = state.map.height[py][px];
        if (inBounds(px, py, pz) && !isWall(px, py, pz))
          base = { x: px, y: py, z: pz };
      }
    }
    const goals = adjacentTargets(base, occupied);
    let best = null,
      bestLen = 1e9;
    for (const g of goals) {
      let p = bfsPath(
        { x: e.x, y: e.y, z: e.z },
        g,
        e.kind === 'wraith',
        occupied,
        traps,
        true,
      );
      if (!p)
        p = bfsPath(
          { x: e.x, y: e.y, z: e.z },
          g,
          e.kind === 'wraith',
          occupied,
          traps,
          false,
        );
      if (p && p.length < bestLen) {
        best = p;
        bestLen = p.length;
      }
    }
    if (best && best.length > 1) {
      const step = best[1];
      const nk = step.x + ',' + step.y;
      if (!occupied.has(nk)) {
        e.x = step.x;
        e.y = step.y;
        e.z = state.map.height[step.y][step.x];
        occupied.add(nk);
      } else occupied.add(key);
    } else occupied.add(key);
  }
  function moveSaboteur(e, occupied) {
    const key = e.x + ',' + e.y;
    const traps = state.towers;
    if (!traps.length) {
      moveEnemy(e, occupied);
      return;
    }
    occupied.delete(key);
    let best = null,
      bestLen = 1e9;
    for (const t of traps) {
      const p = bfsPath(
        { x: e.x, y: e.y, z: e.z },
        { x: t.x, y: t.y, z: t.z },
        false,
        occupied,
        new Set(),
        false,
      );
      if (p && p.length < bestLen) {
        best = p;
        bestLen = p.length;
      }
    }
    if (best && best.length > 1) {
      const step = best[1];
      const nk = step.x + ',' + step.y;
      e.x = step.x;
      e.y = step.y;
      e.z = state.map.height[step.y][step.x];
      occupied.add(nk);
    } else {
      occupied.add(key);
    }
  }
  function saboteurExplode(s) {
    for (const other of state.enemies) {
      if (other === s) continue;
      const d = Math.max(Math.abs(other.x - s.x), Math.abs(other.y - s.y));
      if (d <= SAB_EXP_RADIUS) {
        other.hp -= SAB_EXP_DMG;
        addFX('hit', other.x, other.y, other.z);
      }
    }
    if (
      Math.max(
        Math.abs(state.player.x - s.x),
        Math.abs(state.player.y - s.y),
      ) <= SAB_EXP_RADIUS
    ) {
      const dealt = playerTakeDamage(SAB_EXP_DMG);
      addFX('hit', state.player.x, state.player.y, state.player.z);
      logMsg(`Saboteur explosion hits you for ${dealt}.`);
    }
    addFX('saboteurExplosion', s.x, s.y, s.z, 12);
    state.fx.push({
      kind: 'saboteurRange',
      x: s.x,
      y: s.y,
      z: s.z,
      r: SAB_EXP_RADIUS,
      life: 12,
      max: 12,
    });
  }
  function enemiesAct() {
    const occupied = new Set([state.player.x + ',' + state.player.y]);
    for (const en of state.enemies) occupied.add(en.x + ',' + en.y);
    const survivors = [];
    for (const e of state.enemies) {
      if (e.hp <= 0) {
        dropLoot(e.x, e.y, e.z, rewardFor(e.kind));
        continue;
      }
      if (e.slowTurns && e.slowTurns > 0 && state.turn % 2 === 1) {
        e.slowTurns--;
        survivors.push(e);
        continue;
      }
      let acted = false;
      if (e.kind === 'archer') {
        acted = enemyAttack(e);
        if (!acted) {
          moveArcher(e, occupied);
          acted = enemyAttack(e);
        }
      } else if (e.kind === 'brute') {
        if (e.bruteRest) {
          acted = enemyAttack(e);
          e.bruteRest = false;
          occupied.add(e.x + ',' + e.y);
        } else {
          moveEnemy(e, occupied);
          acted = enemyAttack(e);
          e.bruteRest = true;
        }
      } else if (e.kind === 'saboteur') {
        moveSaboteur(e, occupied);
        const tidx = state.towers.findIndex(
          (t) => t.x === e.x && t.y === e.y && t.z === e.z,
        );
        if (tidx !== -1) {
          state.towers.splice(tidx, 1);
          terrainValid = false;
          logMsg('Saboteur detonated after destroying a trap!');
          saboteurExplode(e);
          occupied.delete(e.x + ',' + e.y);
          dropLoot(e.x, e.y, e.z, rewardFor(e.kind));
          continue;
        }
        acted = enemyAttack(e);
      } else if (e.kind === 'hunter') {
        for (let s = 0; s < 2; s++) {
          moveEnemy(e, occupied);
          if (enemyAttack(e)) {
            acted = true;
            break;
          }
        }
        if (!acted) acted = enemyAttack(e);
      } else {
        moveEnemy(e, occupied);
        acted = enemyAttack(e);
      }
      const idx = state.towers.findIndex(
        (t) => t.type === 'spike' && t.x === e.x && t.y === e.y && t.z === e.z,
      );
      if (idx !== -1) {
        e.hp -= SPIKE_DMG;
        state.towers.splice(idx, 1);
        logMsg(`Spike hits for ${SPIKE_DMG}.`);
        addFX('hit', e.x, e.y, e.z);
      }
      if (e.hp > 0) {
        survivors.push(e);
        if (e.slowTurns && e.slowTurns > 0 && state.turn % 2 === 0)
          e.slowTurns--;
      } else dropLoot(e.x, e.y, e.z, rewardFor(e.kind));
      if (state.hp <= 0) break;
    }
    state.enemies = survivors;
  }
  function spawnCooldown(t) {
    return baseSpawnCooldown(t);
  }
  function spawnCount(t, progress) {
    return 1 + Math.floor(t / 15) + (progress > 0.5 ? 1 : 0);
  }
  function pickSpawnPos() {
    const minR = SPAWN_MIN_RADIUS;
    const ring = state.map.spawners.filter((s) => {
      const d = Math.max(
        Math.abs(s.x - state.player.x),
        Math.abs(s.y - state.player.y),
      );
      return d >= Math.max(8, minR) && d <= 18;
    });
    const behindRing = ring.filter((s) => s.x <= state.player.x - 2);
    const pool1 = behindRing.length
      ? behindRing
      : ring.length
        ? ring
        : state.map.spawners;
    const candidates = pool1.filter((p) => {
      const d = Math.max(
        Math.abs(p.x - state.player.x),
        Math.abs(p.y - state.player.y),
      );
      const pz = state.map.height[p.y][p.x];
      return (
        d >= minR &&
        !(
          p.x === state.player.x &&
          p.y === state.player.y &&
          pz === state.player.z
        ) &&
        !state.enemies.some((e) => e.x === p.x && e.y === p.y && e.z === pz)
      );
    });
    if (candidates.length)
      return candidates[(Math.random() * candidates.length) | 0];
    let best = null,
      bestD = -1;
    for (const p of state.map.spawners) {
      const d = Math.max(
        Math.abs(p.x - state.player.x),
        Math.abs(p.y - state.player.y),
      );
      if (d >= minR && d > bestD) {
        best = p;
        bestD = d;
      }
    }
    return best;
  }
  function spawnBoss() {
    const pos = pickSpawnPos();
    if (!pos) return;
    const roll = Math.random();
    let kind = 'brute';
    if (roll < 1 / 3) kind = 'brute';
    else if (roll < 2 / 3) kind = 'saboteur';
    else kind = 'hunter';
    const base = ENEMY[kind];
    state.enemies.push({
      x: pos.x,
      y: pos.y,
      z: state.map.height[pos.y][pos.x],
      hp: base.hp,
      maxhp: base.hp,
      kind,
      bruteRest: false,
    });
    logMsg(`A ${kind} boss has appeared!`);
  }
  function handleSpawns() {
    const nearCount = state.enemies.reduce(
      (n, e) =>
        n +
        (Math.max(
          Math.abs(e.x - state.player.x),
          Math.abs(e.y - state.player.y),
        ) <= 4
          ? 1
          : 0),
      0,
    );
    if (nearCount >= 5) {
      state.nextSpawn = Math.max(state.nextSpawn, 2);
      return;
    }
    state.nextSpawn -= 1;
    if (state.nextSpawn <= 0) {
      const free = state.enemyCap - state.enemies.length;
      if (free > 0) {
        const progress = state.player.x / (GRID_W - 1);
        const desired = Math.min(spawnCount(state.turn, progress), free);
        let count = 0;
        for (let i = 0; i < desired; i++) {
          const pos = pickSpawnPos();
          if (!pos) break;
          const roll = Math.random();
          let kind = 'goblin';
          if (roll > 0.8) kind = 'wraith';
          else if (roll > 0.55) kind = 'archer';
          const base = ENEMY[kind];
          state.enemies.push({
            x: pos.x,
            y: pos.y,
            z: state.map.height[pos.y][pos.x],
            hp: base.hp,
            maxhp: base.hp,
            kind,
            cooldown: ENEMY.archer.cd,
            idle: nearCount >= 5 ? 1 : 0,
          });
          count++;
        }
        if (count > 0)
          logMsg(
            count === 1
              ? 'An enemy emerged from a portal!'
              : `${count} enemies emerged from portals!`,
          );
      }
      state.nextSpawn = spawnCooldown(state.turn);
    }
    if (state.turn > 0 && state.turn % 20 === 0) spawnBoss();
  }
  function updateNodes() {
    let changed = false;
    for (const n of state.map.nodes) {
      const playerOn = inNode(n, state.player.x, state.player.y);
      const enemyOn = state.enemies.some((e) => inNode(n, e.x, e.y));
      const capturing = playerOn && !enemyOn && !n.captured;
      if (capturing) {
        const before = n.progress;
        n.progress = Math.min(n.max, n.progress + 1);
        if (n.progress !== before) changed = true;
        if (n.progress === n.max && !n.captured) {
          n.captured = true;
          state.enemyCap += NODE_ENEMY_CAP_INCR;
          logMsg('Node secured! Enemy capacity increased by 10.');
          changed = true;
        }
      }
      if (n.capturing !== capturing) {
        n.capturing = capturing;
        changed = true;
      }
    }
    if (changed) terrainValid = false;
  }
  function checkWinLose() {
    if (
      state.player.x === state.map.exit.x &&
      state.player.y === state.map.exit.y
    ) {
      if (state.map.nodes.every((n) => n.captured)) {
        state.won = true;
        logMsg('You reached the exit. Victory!');
      } else if (!state.exitWarned) {
        logMsg('Capture all nodes to unlock the exit.');
        state.exitWarned = true;
      }
    } else state.exitWarned = false;
    if (state.hp <= 0) {
      state.lost = true;
      logMsg('You have fallen...');
    }
  }
  function resetState() {
    const map = buildMap();
    state = {
      map,
      turn: 0,
      hp: START_HP,
      mana: START_MANA,
      nextSpawn: 1,
      player: {
        x: map.start.x,
        y: map.start.y,
        z: map.start.z ?? map.height[map.start.y][map.start.x],
      },
      enemies: [],
      towers: [],
      drops: [],
      visited: Array.from({ length: GRID_H }, () => Array(GRID_W).fill(false)),
      placeMode: false,
      selectedTool: 'arrow',
      won: false,
      lost: false,
      fx: [],
      hover: null,
      flowDist: null,
      flowDirty: true,
      dashCD: 0,
      dashArmed: false,
      lastMove: { dx: 0, dy: 0 },
      ammo: {
        arrow: ARROW_AMMO,
        rune: RUNE_TURNS,
        fire: FIRE_AMMO,
        spike: Infinity,
      },
      cameraX: 0,
      cameraY: 0,
      spikePlaced: false,
      enemyCap: ENEMY_CAP,
      exitWarned: false,
    };
    state.visited[state.player.y][state.player.x] = true;
    clearLog();
    logMsg('v2.9.7: trap icons, ammo meters, and fire totem AoE indicator.');
    terrainValid = false;
    updateCamera();
    renderTrapbar(TRAP_DEFS, state);
    TRAP_DEFS.forEach((t) => setCooldown(t.id, 0, 1));
    updateHUD();
  }

  btnNew.addEventListener('click', resetState);

  btnHelp.addEventListener('click', () => {
    alert(
      'v2.9.7 update:\n• Trap icons\n• Ammo meters\n• Fire totem AoE indicator',
    );
  });

  function loop(ts) {
    animT = ts;
    draw();
    requestAnimationFrame(loop);
  }
  renderLegend(LEGEND_DATA);
  resetState();
  requestAnimationFrame(loop);
})();
