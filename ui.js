import {
  COSTS,
  PLACE_RADIUS,
  PLACE_ZOOM,
  DASH_COST,
  COLORS,
} from './constants.js';
import * as THREE from './lib/three.module.js';

export function initUI(
  canvas,
  state,
  {
    projectToScreen,
    playerMove,
    tryPlace,
    isValidPlacement,
    resetState,
    getTileSize,
    camera,
  },
) {
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

  function renderTrapbar(st) {
    trapbar.innerHTML = '';
    trapEls = {};
    TRAP_DEFS.forEach((d) => {
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
    const { sx, sy } = projectToScreen(
      tileX,
      tileY,
      state.map.height[tileY][tileX],
    );
    const size = getTileSize() * radius;
    placementPreview.style.display = 'block';
    placementPreview.style.left = pad + (sx - size / 2) + 'px';
    placementPreview.style.top = pad + (sy - size / 2) + 'px';
    placementPreview.style.width = size + 'px';
    placementPreview.style.height = size + 'px';
    placementPreview.className = shape === 'circle' ? 'circle' : '';
  }

  function renderLegend() {
    const cont = document.getElementById('legend-items');
    if (!cont) return;
    cont.innerHTML = '';
    LEGEND_DATA.forEach(([label, color]) => {
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

  function logMsg(m) {
    const p = document.createElement('p');
    p.textContent = m;
    hud.log.appendChild(p);
    hud.log.scrollTop = hud.log.scrollHeight;
  }

  function clearLog() {
    hud.log.innerHTML = '';
  }

  function flashHP() {
    hud.hpCard.classList.add('flash');
    setTimeout(() => hud.hpCard.classList.remove('flash'), 250);
  }

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
      const { sx: psx, sy: psy } = projectToScreen(
        state.player.x,
        state.player.y,
        state.player.z,
      );
      x = (x - rect.width / 2) / PLACE_ZOOM + psx;
      y = (y - rect.height / 2) / PLACE_ZOOM + psy;
    }
    const nx = (Math.max(0, Math.min(rect.width - 1, x)) / rect.width) * 2 - 1;
    const ny = -(
      (Math.max(0, Math.min(rect.height - 1, y)) / rect.height) * 2 -
      1
    );
    const v = new THREE.Vector3(nx, ny, 0).unproject(camera);
    return { x: Math.floor(v.x), y: Math.floor(v.y) };
  }

  const DIR_MAP = {
    up: [0, 1],
    down: [0, -1],
    left: [-1, 0],
    right: [1, 0],
    'up-left': [-1, 1],
    'up-right': [1, 1],
    'down-left': [-1, -1],
    'down-right': [1, -1],
  };

  function onMove(dir) {
    const d = DIR_MAP[dir];
    if (!d) return;
    playerMove(d[0], d[1]);
  }

  document.addEventListener('keydown', (e) => {
    if (state.won || state.lost || state.placeMode) return;
    const key = e.key.toLowerCase();
    if (['arrowup', 'w'].includes(key)) playerMove(0, 1, e.shiftKey);
    else if (['arrowdown', 's'].includes(key)) playerMove(0, -1, e.shiftKey);
    else if (['arrowleft', 'a'].includes(key)) playerMove(-1, 0, e.shiftKey);
    else if (['arrowright', 'd'].includes(key)) playerMove(1, 0, e.shiftKey);
    else if (key === 'q') toggleDashArm();
    else if (['1', '2', '3', '4'].includes(e.key))
      setActiveTrap(TRAP_DEFS[Number(e.key) - 1].id);
  });

  btnDash.addEventListener('click', () => {
    if (!btnDash.disabled) toggleDashArm();
  });

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
      btn.addEventListener('click', () => onMove(btn.dataset.dir)),
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
        onMove(
          dy > 0
            ? dx > 0
              ? 'down-right'
              : 'down-left'
            : dx > 0
              ? 'up-right'
              : 'up-left',
        );
      else if (ax > ay && ax > 24) onMove(dx > 0 ? 'right' : 'left');
      else if (ay > 24) onMove(dy > 0 ? 'down' : 'up');
      swipeStart = null;
    },
    { passive: true },
  );

  btnNew.addEventListener('click', resetState);

  btnHelp.addEventListener('click', () => {
    alert(
      'v2.9.7 update:\n• Trap icons\n• Ammo meters\n• Fire totem AoE indicator',
    );
  });

  return {
    hud,
    renderTrapbar,
    setActiveTrap,
    updateMana,
    setCooldown,
    setDashArmed,
    updateHUD,
    logMsg,
    clearLog,
    flashHP,
    renderLegend,
    trapDefs: TRAP_DEFS,
  };
}
