import { createView3D } from "./view3d.js";
import {
  createWorld,
  tileCenter,
  worldToTile,
  KEEP_TILES,
  SPAWN_TILES,
  inBounds,
  isKeepTile,
  isSpawnTile,
  TILE,
  ROWS,
  footprintOrigin,
  footprintTiles,
  footprintCenter,
  keepCenter,
  WALL_HALF,
  WALL_MIN_LEN,
  clampWallEnd,
  wallPieces,
  wallChunkCount,
  tilesTouchedByWall,
  distToSegment,
} from "./world.js";

const START_GOLD = 180;
const PREP_GOLD_CAP = 400;
const KEEP_MAX_HP = 100;
const SELL_REFUND = 1;
const HOUSING_PER_BARRACKS = 20;
const MAX_FARMS = 6;
const WAVE_COUNT = 10;
const MAX_ENEMIES = 640;
const FORMATION_GAP = 0.48;

const BUILDINGS = {
  wall: { name: "Wooden Wall", cost: 10, hp: 70, tilesW: 1, tilesH: 1, draw: true },
  crossbow: { name: "Crossbow", cost: 40, hp: 60, range: 5.2, fireRate: 0.55, damage: 10, projectile: "bolt", speed: 18, tilesW: 1, tilesH: 1 },
  cannon: { name: "Cannon", cost: 70, hp: 70, range: 5.0, fireRate: 1.7, damage: 6, splash: 1.5, projectile: "ball", speed: 14, tilesW: 1, tilesH: 1 },
  farm: { name: "Farm", cost: 50, hp: 25, goldPerSec: 2, tilesW: 1, tilesH: 1 },
  barracks: { name: "Barracks", cost: 80, hp: 80, tilesW: 1, tilesH: 1 },
};

const TROOP_ORDER = ["spearman", "slinger", "raider", "knight", "warden"];
const TROOPS = {
  spearman: { name: "Spearman", cost: 5, housing: 1, squad: 8, hp: 10, damage: 2, speed: 3.4, aggro: 3.2, range: 1.05, cooldown: 0.4, color: "#3a62c8" },
  slinger: { name: "Slinger", cost: 8, housing: 1, squad: 6, hp: 7, damage: 2, speed: 3.05, aggro: 4.2, range: 2.7, cooldown: 0.68, color: "#5a8a3a" },
  raider: { name: "Raider", cost: 6, housing: 1, squad: 8, hp: 8, damage: 3, speed: 4.6, aggro: 3.0, range: 1.0, cooldown: 0.36, color: "#c45a28" },
  knight: { name: "Knight", cost: 28, housing: 5, squad: 3, hp: 62, damage: 6, speed: 1.9, aggro: 3.6, range: 1.15, cooldown: 0.82, color: "#6a6e78" },
  warden: { name: "Warden", cost: 32, housing: 4, squad: 5, hp: 18, damage: 8, speed: 2.5, aggro: 4.8, range: 3.3, cooldown: 1.05, splash: 0.85, color: "#6b4a9b" },
};

const ENEMIES = {
  goblin: { hp: 8, damage: 1, speed: 3.15, gold: 1, range: 0.9 },
  brute: { hp: 36, damage: 3, speed: 1.7, gold: 3, range: 1.0 },
  runner: { hp: 5, damage: 1, speed: 4.7, gold: 1, range: 0.9 },
  archer: { hp: 12, damage: 2, speed: 2.4, gold: 2, range: 2.4 },
  ogre: { hp: 90, damage: 8, speed: 1.2, gold: 10, range: 1.15 },
};

function spawnQueueFor(waveIndex) {
  const q = [];
  const add = (type, count, t, lane) => q.push({ type, count, t, lane });
  const shores = SPAWN_TILES.length || 1;
  const ring = (type, count, t, columns, offset = 0) => {
    const stride = Math.max(1, Math.round(shores / columns));
    for (let i = 0; i < columns; i += 1) add(type, count, t, (offset + i * stride) % shores);
  };
  const waves = [
    () => ring("goblin", 20, 0.35, 4),
    () => {
      ring("goblin", 24, 0.3, 6);
      ring("goblin", 18, 6.5, 5, 2);
    },
    () => {
      ring("goblin", 28, 0.3, 6);
      ring("brute", 6, 1.2, 3, 1);
      ring("goblin", 22, 7.5, 6, 3);
    },
    () => {
      ring("goblin", 32, 0.25, 8);
      ring("brute", 8, 1.4, 4, 2);
      ring("goblin", 24, 8, 6, 1);
    },
    () => {
      ring("goblin", 28, 0.25, 8);
      ring("runner", 18, 0.6, 6, 1);
      ring("goblin", 24, 7, 7, 2);
      ring("runner", 16, 7.8, 5, 3);
    },
    () => {
      ring("goblin", 32, 0.2, 8);
      ring("brute", 8, 1.1, 4);
      ring("runner", 20, 1.6, 6, 2);
      ring("goblin", 28, 8.5, 8, 1);
    },
    () => {
      ring("goblin", 30, 0.2, 8);
      ring("archer", 8, 0.8, 4, 1);
      ring("brute", 8, 1.4, 4, 2);
      ring("goblin", 26, 8, 8, 3);
      ring("archer", 8, 8.6, 4);
    },
    () => {
      ring("goblin", 36, 0.2, 10);
      ring("runner", 18, 0.7, 6, 1);
      ring("brute", 10, 1.3, 5, 2);
      ring("archer", 8, 1.8, 4, 3);
      ring("goblin", 28, 9, 8, 4);
    },
    () => {
      ring("goblin", 40, 0.15, 10);
      ring("ogre", 1, 0.4, 2);
      ring("brute", 12, 1.2, 6, 1);
      ring("goblin", 32, 8.5, 8, 2);
      ring("runner", 20, 9, 6, 3);
    },
    () => {
      ring("goblin", 44, 0.12, 12);
      ring("ogre", 1, 0.5, 3);
      ring("brute", 12, 1.1, 6, 1);
      ring("archer", 10, 1.6, 5, 2);
      ring("runner", 22, 2, 7, 3);
      ring("goblin", 36, 10, 10, 4);
      ring("ogre", 1, 10.4, 2, 5);
    },
  ];
  waves[waveIndex]?.();
  return q;
}

function createAudio() {
  let ctx = null;
  let muted = false;
  let musicTimer = null;
  let step = 0;
  const ensure = () => {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  };
  let lastHit = 0;
  let lastHurt = 0;
  const beep = (freq, dur, type = "square", gain = 0.05) => {
    if (muted) return;
    const ac = ensure();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur);
  };
  const stopMusic = () => {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  };
  return {
    place: () => beep(420, 0.08, "square", 0.04),
    shoot: () => beep(720, 0.05, "square", 0.03),
    hit: () => {
      const now = performance.now();
      if (now - lastHit < 70) return;
      lastHit = now;
      beep(180, 0.07, "sawtooth", 0.04);
    },
    keepHurt: () => {
      const now = performance.now();
      if (now - lastHurt < 140) return;
      lastHurt = now;
      beep(110, 0.16, "sawtooth", 0.06);
    },
    wave: () => beep(520, 0.2, "triangle", 0.05),
    win: () => {
      beep(523, 0.15, "triangle", 0.05);
      setTimeout(() => beep(659, 0.15, "triangle", 0.05), 120);
      setTimeout(() => beep(784, 0.25, "triangle", 0.05), 240);
    },
    lose: () => beep(90, 0.4, "sawtooth", 0.06),
    start: () => {
      ensure();
      stopMusic();
      const notes = [262, 330, 392, 523, 392, 330];
      musicTimer = setInterval(() => {
        if (muted || !ctx) return;
        beep(notes[step % notes.length], 0.18, "triangle", 0.03);
        step += 1;
      }, 280);
    },
    setMuted(value) {
      muted = value;
      if (!muted) ensure();
    },
    isMuted: () => muted,
    stop: stopMusic,
  };
}

let nextId = 1;
function uid() {
  nextId += 1;
  return nextId;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.hypot(dx, dz);
}

export function createGame(canvas, ui) {
  let view;
  try {
    view = createView3D(canvas);
  } catch (err) {
    ui.hint.textContent = "3D view failed to start. Try another browser.";
    throw err;
  }
  const audio = createAudio();
  const state = freshState();
  let admin = new URLSearchParams(window.location.search).has("admin");

  function freshState() {
    nextId = 1;
    return {
      phase: "menu",
      gold: START_GOLD,
      goldFrac: 0,
      keepHp: KEEP_MAX_HP,
      wave: 0,
      waveTime: 0,
      between: 0,
      tool: null,
      selected: null,
      hover: null,
      pointer: null,
      wallDraft: null,
      picked: new Set(),
      marquee: null,
      buildings: [],
      troops: [],
      enemies: [],
      projectiles: [],
      spawnQueue: [],
      spawned: 0,
      spawnLane: 0,
      world: createWorld(),
    };
  }

  const HOTBAR = ["wall", "crossbow", "cannon", "farm", "barracks"];

  function playing() {
    return state.phase === "prep" || state.phase === "combat" || state.phase === "between";
  }

  function releaseLook() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function syncLookUi() {
    const locked = document.pointerLockElement === canvas;
    if (ui.crosshair) ui.crosshair.hidden = !locked;
    if (ui.lookPrompt) ui.lookPrompt.hidden = !playing() || locked;
  }

  function reset() {
    Object.assign(state, freshState());
    view.resetCamera();
    releaseLook();
    ui.menu.hidden = false;
    ui.end.hidden = true;
    ui.btnStart.disabled = false;
    ui.btnStart.hidden = false;
    syncLookUi();
    syncHud();
    renderInspect();
  }

  function occupyKeep() {
    for (const [c, r] of KEEP_TILES) state.world.set(c, r, { kind: "keep", id: "keep" });
  }

  function play() {
    occupyKeep();
    state.phase = "prep";
    ui.menu.hidden = true;
    audio.start();
    syncHud();
    syncLookUi();
    setHint("Click to look. Drag a box to select troops, then click the ground to send them.");
  }

  function startWaves() {
    if (state.phase !== "prep") return;
    state.phase = "combat";
    state.wave = 1;
    state.waveTime = 0;
    state.spawnQueue = spawnQueueFor(0);
    state.spawned = 0;
    ui.btnStart.hidden = true;
    audio.wave();
    setHint("Wave 1 — swarms land from every shore.");
    syncHud();
  }

  function beginWave(n) {
    state.wave = n;
    state.phase = "combat";
    state.waveTime = 0;
    state.spawnQueue = spawnQueueFor(n - 1);
    state.spawned = 0;
    audio.wave();
    setHint(`Wave ${n} of ${WAVE_COUNT}`);
    syncHud();
  }

  function addGold(amount) {
    state.goldFrac += amount;
    const whole = Math.floor(state.goldFrac);
    if (whole) {
      state.gold += whole;
      state.goldFrac -= whole;
    }
    if (!admin && state.phase === "prep") state.gold = Math.min(PREP_GOLD_CAP, state.gold);
  }

  function canAfford(amount) {
    return admin || state.gold >= amount;
  }

  function spend(amount) {
    if (!canAfford(amount)) return false;
    if (!admin) state.gold -= amount;
    return true;
  }

  function buildingAt(c, r) {
    const cell = state.world.get(c, r);
    if (!cell || cell.kind !== "building") return null;
    return state.buildings.find((b) => b.id === cell.id) || null;
  }

  function wallPieceCost(index) {
    if (index <= 0) return 10;
    if (index === 1) return 8;
    if (index === 2) return 6;
    if (index === 3) return 5;
    return 4;
  }

  function wallTotalCost(count) {
    let sum = 0;
    for (let i = 0; i < count; i += 1) sum += wallPieceCost(i);
    return sum;
  }

  function syncWalls() {
    state.world.setWalls(
      state.buildings
        .filter((b) => b.kind === "wall")
        .map((b) => ({ id: b.id, ax: b.ax, az: b.az, bx: b.bx, bz: b.bz, half: WALL_HALF }))
    );
  }

  function footprintBlocked(tiles) {
    return tiles.some(([c, r]) => state.world.wallTouchesTile(c, r));
  }

  function pickBuilding(x, z) {
    let best = null;
    let bestD = WALL_HALF + 0.28;
    for (const b of state.buildings) {
      if (b.kind !== "wall") continue;
      const d = distToSegment(x, z, b.ax, b.az, b.bx, b.bz);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    if (best) return best;
    const tile = worldToTile(x, z);
    return buildingAt(tile.c, tile.r);
  }

  function reachBuilding(from, b) {
    if (b.kind === "wall") return distToSegment(from.x, from.z, b.ax, b.az, b.bx, b.bz);
    return dist(from, b);
  }

  function planWall(ax, az, hx, hz) {
    const end = clampWallEnd(ax, az, hx, hz);
    const bx = end.x;
    const bz = end.z;
    const len = end.len;
    const n = wallChunkCount(len);
    const cost = wallTotalCost(n);
    if (len < WALL_MIN_LEN) return { ok: false, ax, az, bx, bz, len, n, cost, reason: "too short" };
    const tiles = tilesTouchedByWall(ax, az, bx, bz);
    if (!tiles.length || !state.world.canBuildAll(tiles)) {
      return { ok: false, ax, az, bx, bz, len, n, cost, reason: "blocked" };
    }
    if (state.world.wallConflicts(ax, az, bx, bz)) {
      return { ok: false, ax, az, bx, bz, len, n, cost, reason: "overlap" };
    }
    if (!canAfford(cost)) return { ok: false, ax, az, bx, bz, len, n, cost, reason: "gold" };
    return { ok: true, ax, az, bx, bz, len, n, cost };
  }

  function canWallPoint(x, z) {
    const tile = worldToTile(x, z);
    return state.world.canBuild(tile.c, tile.r);
  }

  const WALL_SNAP = TILE * 0.7;

  function tipKey(x, z) {
    return `${Math.round(x * 50)},${Math.round(z * 50)}`;
  }

  function wallRunTips() {
    const groups = new Map();
    for (const b of state.buildings) {
      if (b.kind !== "wall") continue;
      const id = b.wallGroup ?? b.id;
      let list = groups.get(id);
      if (!list) {
        list = [];
        groups.set(id, list);
      }
      list.push(b);
    }
    const tips = [];
    const seen = new Set();
    for (const pieces of groups.values()) {
      const counts = new Map();
      const points = new Map();
      const add = (x, z) => {
        const k = tipKey(x, z);
        counts.set(k, (counts.get(k) || 0) + 1);
        if (!points.has(k)) points.set(k, { x, z });
      };
      for (const piece of pieces) {
        add(piece.ax, piece.az);
        add(piece.bx, piece.bz);
      }
      for (const [k, n] of counts) {
        if (n !== 1) continue;
        const pt = points.get(k);
        if (seen.has(k)) continue;
        seen.add(k);
        tips.push(pt);
      }
    }
    return tips;
  }

  function snapToWallTip(x, z, exclude = null) {
    let best = null;
    let bestD = WALL_SNAP;
    for (const tip of wallRunTips()) {
      if (exclude && Math.hypot(tip.x - exclude.x, tip.z - exclude.z) < 0.08) continue;
      const d = Math.hypot(tip.x - x, tip.z - z);
      if (d < bestD) {
        best = tip;
        bestD = d;
      }
    }
    return best ? { x: best.x, z: best.z, snapped: true } : { x, z, snapped: false };
  }

  function placeWall(ax, az, hx, hz) {
    const plan = planWall(ax, az, hx, hz);
    if (!plan.ok) return false;
    if (!spend(plan.cost)) return false;
    const group = uid();
    const pieces = wallPieces(plan.ax, plan.az, plan.bx, plan.bz);
    let last = null;
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      const tile = worldToTile(piece.x, piece.z);
      const b = {
        id: uid(),
        kind: "wall",
        wallGroup: group,
        c: tile.c,
        r: tile.r,
        tilesW: 1,
        tilesH: 1,
        ax: piece.ax,
        az: piece.az,
        bx: piece.bx,
        bz: piece.bz,
        x: piece.x,
        z: piece.z,
        yaw: piece.yaw,
        length: piece.length,
        cost: wallPieceCost(i),
        hp: BUILDINGS.wall.hp,
        maxHp: BUILDINGS.wall.hp,
        cooldown: 0,
        train: 0,
        rally: null,
      };
      state.buildings.push(b);
      last = b;
    }
    syncWalls();
    state.selected = last?.id ?? null;
    audio.place();
    return true;
  }

  function tilesFor(kind, hoverC, hoverR) {
    const def = BUILDINGS[kind];
    const origin = footprintOrigin(hoverC, hoverR, def.tilesW, def.tilesH);
    return {
      origin,
      tiles: footprintTiles(origin.c, origin.r, def.tilesW, def.tilesH),
      center: footprintCenter(origin.c, origin.r, def.tilesW, def.tilesH),
      tilesW: def.tilesW,
      tilesH: def.tilesH,
    };
  }

  function unitAt(c, r) {
    return (
      state.troops.find((t) => t.c === c && t.r === r) ||
      state.enemies.find((e) => e.c === c && e.r === r)
    );
  }

  function countKind(kind) {
    return state.buildings.filter((b) => b.kind === kind).length;
  }

  function canPlaceKind(kind) {
    if (kind === "farm" && countKind("farm") >= MAX_FARMS) return false;
    return true;
  }

  function placeBuilding(kind, c, r) {
    if (kind === "wall") return false;
    const def = BUILDINGS[kind];
    if (!def) return false;
    if (!canPlaceKind(kind)) {
      if (kind === "farm") setHint(`Farm cap reached (${MAX_FARMS}). Sell one to build another.`);
      return false;
    }
    const print = tilesFor(kind, c, r);
    if (!state.world.canBuildAll(print.tiles) || footprintBlocked(print.tiles)) return false;
    if (!spend(def.cost)) return false;
    const rallyR = Math.min(print.origin.r + print.tilesH + 1, ROWS - 2);
    const b = {
      id: uid(),
      kind,
      c: print.origin.c,
      r: print.origin.r,
      tilesW: print.tilesW,
      tilesH: print.tilesH,
      x: print.center.x,
      z: print.center.z,
      hp: def.hp,
      maxHp: def.hp,
      cooldown: 0,
      train: 0,
      rally: kind === "barracks" ? { c: print.origin.c + 1, r: rallyR } : null,
    };
    if (b.rally) {
      const p = tileCenter(b.rally.c, b.rally.r);
      b.rally.x = p.x;
      b.rally.z = p.z;
    }
    state.buildings.push(b);
    state.world.occupy(print.tiles, { kind: "building", id: b.id });
    state.selected = b.id;
    audio.place();
    return true;
  }

  function sellSelected() {
    const b = state.buildings.find((item) => item.id === state.selected);
    if (!b) return;
    state.gold += Math.round((b.cost ?? BUILDINGS[b.kind].cost) * SELL_REFUND);
    if (!admin && state.phase === "prep") state.gold = Math.min(PREP_GOLD_CAP, state.gold);
    state.world.clearId(b.id);
    state.buildings = state.buildings.filter((item) => item.id !== b.id);
    if (b.kind === "wall") syncWalls();
    for (const t of state.troops) {
      if (t.home === b.id) t.home = null;
    }
    state.selected = null;
    audio.place();
    renderInspect();
    syncHud();
  }

  function allBarracks() {
    return state.buildings.filter((b) => b.kind === "barracks");
  }

  function armyHousing() {
    let n = 0;
    for (const t of state.troops) {
      if (t.hp <= 0) continue;
      n += t.housing ?? 1;
    }
    return n;
  }

  function armyCap() {
    return allBarracks().length * HOUSING_PER_BARRACKS;
  }

  function armyMixText() {
    const counts = {};
    for (const t of state.troops) {
      if (t.hp <= 0) continue;
      counts[t.kind] = (counts[t.kind] || 0) + 1;
    }
    const parts = TROOP_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${TROOPS[k].name}`);
    return parts.length ? parts.join(" · ") : "Empty camp";
  }

  function pickSpawnHall() {
    const halls = allBarracks();
    if (!halls.length) return null;
    return halls.find((h) => h.id === state.selected) || halls[0];
  }

  function trainTroop(kind) {
    const def = TROOPS[kind];
    if (!def) return false;
    if (!allBarracks().length) return false;
    if (armyHousing() + def.housing > armyCap()) {
      setHint("Army is full. Build another barracks.");
      return false;
    }
    if (!spend(def.cost)) return false;
    const home = pickSpawnHall();
    if (!home) return false;
    spawnSquad(home, kind);
    refreshBarracksMenu();
    syncHud();
    return true;
  }

  function spawnSquad(barracks, kind) {
    const def = TROOPS[kind];
    if (!def) return;
    const squad = def.squad || 1;
    const share = def.housing / squad;
    const batch = state.troops.filter((t) => t.home === barracks.id).length;
    const ring = 0.55 + (Math.floor(batch / squad) % 6) * 0.18;
    const facing = (batch / squad) * 1.7;
    const cx = barracks.x + Math.cos(facing) * ring;
    const cz = barracks.z + Math.sin(facing) * ring;
    for (let i = 0; i < squad; i += 1) {
      const a = facing + (i / squad) * Math.PI * 2;
      const rad = squad === 1 ? 0 : 0.22 + squad * 0.03;
      const x = cx + Math.cos(a) * rad;
      const z = cz + Math.sin(a) * rad;
      const tile = worldToTile(x, z);
      state.troops.push({
        id: uid(),
        team: "ally",
        kind,
        home: barracks.id,
        housing: share,
        c: tile.c,
        r: tile.r,
        x,
        z,
        hp: def.hp,
        maxHp: def.hp,
        cooldown: 0,
        path: [],
        pathAge: 0,
      });
    }
  }

  function spawnPack(type, count, lane) {
    const def = ENEMIES[type];
    if (!def || !SPAWN_TILES.length) return false;
    const n = Math.min(count, MAX_ENEMIES - state.enemies.length);
    if (n <= 0) return true;
    const origin = SPAWN_TILES[((lane % SPAWN_TILES.length) + SPAWN_TILES.length) % SPAWN_TILES.length];
    const pos = tileCenter(origin[0], origin[1]);
    const keep = keepCenter();
    let fx = keep.x - pos.x;
    let fz = keep.z - pos.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    const rx = -fz;
    const rz = fx;
    const cols = Math.max(8, Math.min(12, Math.ceil(Math.sqrt(n * 1.8))));
    for (let i = 0; i < n; i += 1) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const lat = (col - (cols - 1) / 2) * FORMATION_GAP;
      const along = (row + 0.4) * FORMATION_GAP;
      const x = pos.x + fx * along + rx * lat;
      const z = pos.z + fz * along + rz * lat;
      const tile = worldToTile(x, z);
      state.enemies.push({
        id: uid(),
        team: "enemy",
        kind: type,
        c: tile.c,
        r: tile.r,
        x,
        z,
        hp: def.hp,
        maxHp: def.hp,
        cooldown: 0,
        ox: rx * lat * 0.12,
        oz: rz * lat * 0.12,
      });
    }
    return true;
  }

  function removeUnit(list, unit) {
    const i = list.indexOf(unit);
    if (i >= 0) list.splice(i, 1);
  }

  function steerToward(unit, dest, dt, speed) {
    const dx = dest.x - unit.x;
    const dz = dest.z - unit.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return;
    const step = speed * TILE * dt;
    const nx = unit.x + (dx / len) * Math.min(step, len);
    const nz = unit.z + (dz / len) * Math.min(step, len);
    const blocked = unit.team !== "ally" && state.world.wallHitsPoint(nx, nz, 0.16);
    if (blocked) {
      if (!state.world.wallHitsPoint(nx, unit.z, 0.16)) unit.x = nx;
      else if (!state.world.wallHitsPoint(unit.x, nz, 0.16)) unit.z = nz;
    } else {
      unit.x = nx;
      unit.z = nz;
    }
    const tile = worldToTile(unit.x, unit.z);
    unit.c = tile.c;
    unit.r = tile.r;
  }

  function separateUnits(list, dt, radius) {
    if (list.length < 2) return;
    const cell = radius * 2.4;
    const buckets = new Map();
    for (let i = 0; i < list.length; i += 1) {
      const u = list[i];
      const k = `${Math.floor(u.x / cell)},${Math.floor(u.z / cell)}`;
      let bucket = buckets.get(k);
      if (!bucket) {
        bucket = [];
        buckets.set(k, bucket);
      }
      bucket.push(i);
    }
    const min = radius * 2;
    const min2 = min * min;
    for (const u of list) {
      const cx = Math.floor(u.x / cell);
      const cz = Math.floor(u.z / cell);
      let ox = 0;
      let oz = 0;
      for (let dz = -1; dz <= 1; dz += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const bucket = buckets.get(`${cx + dx},${cz + dz}`);
          if (!bucket) continue;
          for (const i of bucket) {
            const o = list[i];
            if (o === u) continue;
            const ddx = u.x - o.x;
            const ddz = u.z - o.z;
            const d2 = ddx * ddx + ddz * ddz;
            if (d2 < 1e-6 || d2 >= min2) continue;
            const d = Math.sqrt(d2);
            const push = (min - d) / d;
            ox += ddx * push;
            oz += ddz * push;
          }
        }
      }
      if (!ox && !oz) continue;
      const n = Math.hypot(ox, oz);
      const step = Math.min(n, 2.2 * dt);
      const nx = u.x + (ox / n) * step;
      const nz = u.z + (oz / n) * step;
      if (u.team === "ally" || !state.world.wallHitsPoint(nx, nz, 0.14)) {
        u.x = nx;
        u.z = nz;
      }
    }
  }

  function nearestEnemy(from, radius) {
    let best = null;
    let bestD = radius * radius;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const dx = from.x - e.x;
      const dz = from.z - e.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) {
        best = e;
        bestD = d2;
      }
    }
    return best;
  }

  function stepFarms(dt) {
    let income = 0;
    for (const b of state.buildings) {
      if (b.kind === "farm") income += BUILDINGS.farm.goldPerSec * dt;
    }
    if (income) addGold(income);
  }

  function stepTowers(dt) {
    for (const b of state.buildings) {
      const def = BUILDINGS[b.kind];
      if (!def?.range) continue;
      b.cooldown -= dt;
      if (b.cooldown > 0) continue;
      const target = nearestEnemy(b, def.range * TILE);
      if (!target) continue;
      b.cooldown = def.fireRate;
      state.projectiles.push({
        id: uid(),
        x: b.x,
        z: b.z,
        tx: target.x,
        tz: target.z,
        target: target.id,
        damage: def.damage,
        splash: def.splash || 0,
        speed: def.speed,
      });
      audio.shoot();
    }
  }

  function stepProjectiles(dt) {
    const left = [];
    for (const p of state.projectiles) {
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const len = Math.hypot(dx, dz);
      const step = p.speed * dt;
      if (len <= step) {
        let impactX = p.tx;
        let impactZ = p.tz;
        for (const e of state.enemies) {
          if (e.id === p.target) {
            impactX = e.x;
            impactZ = e.z;
            break;
          }
        }
        const reach = p.splash ? p.splash * TILE : 0.35;
        const reach2 = reach * reach;
        let hit = false;
        for (const e of state.enemies) {
          const ex = e.x - impactX;
          const ez = e.z - impactZ;
          if (ex * ex + ez * ez <= reach2) {
            e.hp -= p.damage;
            hit = true;
          }
        }
        if (hit) audio.hit();
      } else {
        p.x += (dx / len) * step;
        p.z += (dz / len) * step;
        if (p.target) {
          for (const e of state.enemies) {
            if (e.id === p.target) {
              p.tx = e.x;
              p.tz = e.z;
              break;
            }
          }
        }
        left.push(p);
      }
    }
    state.projectiles = left;
  }

  function attack(attacker, victim, dmg) {
    if (attacker.cooldown > 0) return;
    victim.hp -= dmg;
    if (attacker.team === "ally") {
      const def = TROOPS[attacker.kind];
      if (def?.splash) {
        const r2 = def.splash * TILE * (def.splash * TILE);
        for (const e of state.enemies) {
          if (e === victim || e.hp <= 0) continue;
          const dx = e.x - victim.x;
          const dz = e.z - victim.z;
          if (dx * dx + dz * dz <= r2) e.hp -= dmg * 0.45;
        }
      }
      attacker.cooldown = def?.cooldown ?? 0.45;
    } else {
      attacker.cooldown = 0.72;
    }
    audio.hit();
  }

  function stepTroops(dt) {
    for (const t of state.troops) {
      const def = TROOPS[t.kind];
      if (!def) continue;
      t.cooldown -= dt;
      const foe = nearestEnemy(t, def.aggro * TILE);
      if (foe) {
        const dx = t.x - foe.x;
        const dz = t.z - foe.z;
        const d2 = dx * dx + dz * dz;
        const reach = def.range * TILE;
        if (d2 <= reach * reach) {
          attack(t, foe, def.damage);
          continue;
        }
        steerToward(t, foe, dt, def.speed);
        continue;
      }
      const dest = t.order || rallyPoint(t);
      if (!dest) continue;
      steerToward(t, dest, dt, def.speed);
    }
    separateUnits(state.troops, dt, 0.22);
  }

  function rallyPoint(t) {
    const home = state.buildings.find((b) => b.id === t.home);
    if (!home?.rally) return null;
    const mates = state.troops.filter((x) => x.home === t.home && x.hp > 0);
    const i = Math.max(0, mates.indexOf(t));
    const cols = 5;
    return {
      x: home.rally.x + (i % cols - (cols - 1) / 2) * 0.52,
      z: home.rally.z + Math.floor(i / cols) * 0.52,
    };
  }

  function stepEnemies(dt) {
    state.world.ensureFlow();
    const keep = keepCenter();
    const buildings = new Map();
    for (const b of state.buildings) buildings.set(b.id, b);

    for (const e of state.enemies) {
      const def = ENEMIES[e.kind];
      e.cooldown -= dt;

      const kdx = keep.x - e.x;
      const kdz = keep.z - e.z;
      const keepReach = def.range * TILE + 1.45;
      if (kdx * kdx + kdz * kdz <= keepReach * keepReach) {
        if (e.cooldown <= 0) {
          state.keepHp -= def.damage;
          e.cooldown = 0.9;
          audio.keepHurt();
        }
        continue;
      }

      if (state.troops.length) {
        let troop = null;
        let troopD = def.range * TILE;
        troopD *= troopD;
        for (const t of state.troops) {
          const dx = e.x - t.x;
          const dz = e.z - t.z;
          const d2 = dx * dx + dz * dz;
          if (d2 <= troopD) {
            troop = t;
            troopD = d2;
          }
        }
        if (troop) {
          attack(e, troop, def.damage);
          continue;
        }
      }

      const flow = state.world.flowAt(e.c, e.r);
      if (!flow) {
        const wall = state.world.nearestWall(e.x, e.z, def.range * TILE + 0.35);
        if (wall) {
          const blocker = buildings.get(wall.id);
          if (blocker && blocker.hp > 0) {
            attack(e, blocker, def.damage);
            continue;
          }
        }
      }

      let tx = keep.x;
      let tz = keep.z;
      if (flow && !flow.arrived) {
        const next = tileCenter(flow.nc, flow.nr);
        tx = next.x + (e.ox || 0);
        tz = next.z + (e.oz || 0);
      }
      steerToward(e, { x: tx, z: tz }, dt, def.speed);
    }
    separateUnits(state.enemies, dt, 0.3);
  }

  function sweepDead() {
    for (const e of [...state.enemies]) {
      if (e.hp <= 0) {
        addGold(ENEMIES[e.kind].gold);
        removeUnit(state.enemies, e);
      }
    }
    for (const t of [...state.troops]) {
      if (t.hp <= 0) {
        state.picked.delete(t.id);
        removeUnit(state.troops, t);
      }
    }
    for (const b of [...state.buildings]) {
      if (b.hp <= 0) {
        state.world.clearId(b.id);
        state.buildings = state.buildings.filter((item) => item.id !== b.id);
        if (state.selected === b.id) state.selected = null;
        if (b.kind === "wall") syncWalls();
      }
    }
  }

  function stepSpawns(dt) {
    if (state.phase !== "combat") return;
    state.waveTime += dt;
    while (state.spawnQueue.length && state.spawnQueue[0].t <= state.waveTime) {
      if (state.enemies.length >= MAX_ENEMIES) break;
      const next = state.spawnQueue[0];
      if (spawnPack(next.type, next.count || 1, next.lane ?? state.spawnLane)) {
        state.spawnQueue.shift();
        state.spawned += next.count || 1;
        state.spawnLane += 1;
      } else break;
    }
    if (!state.spawnQueue.length && !state.enemies.length) {
      if (state.wave >= WAVE_COUNT) {
        win();
        return;
      }
      state.phase = "between";
      state.between = 2;
      setHint("Wave cleared. Next incoming…");
    }
  }

  function stepBetween(dt) {
    state.between -= dt;
    if (state.between <= 0) beginWave(state.wave + 1);
  }

  function win() {
    state.phase = "win";
    ui.end.hidden = false;
    ui.endKicker.textContent = "Victory";
    ui.endTitle.textContent = "The keep stands";
    ui.endBody.textContent = "Ten waves broke on the meadow.";
    audio.win();
    releaseLook();
    syncLookUi();
  }

  function lose() {
    state.phase = "lose";
    ui.end.hidden = false;
    ui.endKicker.textContent = "Defeat";
    ui.endTitle.textContent = "The keep fell";
    ui.endBody.textContent = "The next layout will be wiser.";
    audio.lose();
    releaseLook();
    syncLookUi();
  }

  function setHint(text) {
    ui.hint.textContent = text;
  }

  function selectedBuilding() {
    return state.buildings.find((b) => b.id === state.selected) || null;
  }

  function inspectMetaText(b) {
    let meta =
      b.kind === "wall"
        ? `HP ${Math.ceil(b.hp)} / ${b.maxHp} · wall piece`
        : `HP ${Math.ceil(b.hp)} / ${b.maxHp} · ${b.tilesW}×${b.tilesH} tiles`;
    if (b.kind === "farm") meta += ` · Farms ${countKind("farm")}/${MAX_FARMS}`;
    if (b.kind === "barracks") {
      meta += ` · Army ${Math.round(armyHousing())}/${armyCap()}`;
      const halls = allBarracks().length;
      if (halls > 1) meta += ` · ${halls} halls`;
    }
    return meta;
  }

  function bindHoldTrain(btn, kind) {
    let hold = 0;
    const stop = () => {
      if (hold) window.clearInterval(hold);
      hold = 0;
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      trainTroop(kind);
      hold = window.setInterval(() => trainTroop(kind), 85);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    });
  }

  function refreshBarracksMenu() {
    const mix = ui.inspect.querySelector("[data-army-mix]");
    if (mix) mix.textContent = armyMixText();
    const fill = ui.inspect.querySelector("[data-army-fill]");
    if (fill) {
      const cap = Math.max(1, armyCap());
      fill.style.width = `${Math.min(100, (armyHousing() / cap) * 100)}%`;
    }
    for (const btn of ui.inspect.querySelectorAll("[data-troop]")) {
      const def = TROOPS[btn.dataset.troop];
      if (!def) continue;
      const full = armyHousing() + def.housing > armyCap();
      btn.disabled = full || !canAfford(def.cost);
    }
    const b = selectedBuilding();
    if (b) ui.inspectMeta.textContent = inspectMetaText(b);
  }

  function renderInspect() {
    const b = selectedBuilding();
    ui.inspect.classList.toggle("barracks-menu", Boolean(b && b.kind === "barracks"));
    if (!b) {
      ui.inspect.hidden = true;
      return;
    }
    ui.inspect.hidden = false;
    ui.inspectTitle.textContent = BUILDINGS[b.kind].name;
    ui.inspectMeta.textContent = inspectMetaText(b);
    ui.inspectActions.innerHTML = "";
    if (b.kind === "barracks") {
      const track = document.createElement("div");
      track.className = "army-track";
      const fill = document.createElement("i");
      fill.dataset.armyFill = "1";
      track.appendChild(fill);
      ui.inspectActions.appendChild(track);
      const mix = document.createElement("p");
      mix.className = "army-mix";
      mix.dataset.armyMix = "1";
      mix.textContent = armyMixText();
      ui.inspectActions.appendChild(mix);
      const grid = document.createElement("div");
      grid.className = "troop-grid";
      for (const kind of TROOP_ORDER) {
        const def = TROOPS[kind];
        const card = document.createElement("button");
        card.type = "button";
        card.className = "troop-card";
        card.dataset.troop = kind;
        const icon = document.createElement("img");
        icon.className = "troop-icon";
        icon.alt = "";
        icon.draggable = false;
        icon.src = view.troopPortraits?.[kind] || "";
        const name = document.createElement("strong");
        name.textContent = def.name;
        const info = document.createElement("em");
        info.textContent = `×${def.squad} · ${def.cost}g · ${def.housing} space`;
        card.append(icon, name, info);
        bindHoldTrain(card, kind);
        grid.appendChild(card);
      }
      ui.inspectActions.appendChild(grid);
      const rally = document.createElement("p");
      rally.textContent = "Click a troop to train it now. Hold to keep training. Drag a box to select soldiers, then click the ground to send them.";
      ui.inspectActions.appendChild(rally);
      refreshBarracksMenu();
    }
    const sell = document.createElement("button");
    sell.textContent = `Sell (+${b.cost ?? BUILDINGS[b.kind].cost}g)`;
    sell.addEventListener("click", sellSelected);
    ui.inspectActions.appendChild(sell);
  }

  function syncHud() {
    ui.gold.textContent = admin ? "∞" : String(Math.floor(state.gold));
    ui.goldCap.textContent = admin ? "admin" : state.phase === "prep" ? `cap ${PREP_GOLD_CAP}` : "";
    ui.gold.closest(".meter")?.classList.toggle("admin", admin);
    ui.wave.textContent = state.phase === "prep" || state.phase === "menu" ? "—" : `${state.wave} / ${WAVE_COUNT}`;
    ui.keepHp.textContent = String(Math.max(0, Math.ceil(state.keepHp)));
    ui.keepFill.style.width = `${Math.max(0, (state.keepHp / KEEP_MAX_HP) * 100)}%`;
    ui.btnMute.textContent = audio.isMuted() ? "Unmute" : "Mute";
    for (const btn of ui.buildBar.querySelectorAll("[data-build]")) {
      btn.classList.toggle("active", btn.dataset.build === state.tool);
      if (btn.dataset.build === "farm") {
        const n = countKind("farm");
        const em = btn.querySelector("em");
        if (em) em.textContent = `50g · ${n}/${MAX_FARMS}`;
        btn.classList.toggle("capped", n >= MAX_FARMS);
      }
    }
  }

  function rangeInfo() {
    if (state.tool === "wall") return null;
    const ghost = state.tool && BUILDINGS[state.tool]?.range && state.hover;
    if (ghost) {
      const print = tilesFor(state.tool, state.hover.c, state.hover.r);
      return { x: print.center.x, z: print.center.z, radius: BUILDINGS[state.tool].range * TILE };
    }
    const b = selectedBuilding();
    if (b && BUILDINGS[b.kind]?.range) return { x: b.x, z: b.z, radius: BUILDINGS[b.kind].range * TILE };
    return null;
  }

  function viewState() {
    return {
      buildings: state.buildings,
      troops: state.troops,
      enemies: state.enemies,
      projectiles: state.projectiles,
      rallies: state.buildings.filter((b) => b.rally).map((b) => ({ id: b.id, x: b.rally.x, z: b.rally.z })),
      picked: [...state.picked],
      marquee: state.marquee
        ? { ax: state.marquee.ax, az: state.marquee.az, bx: state.marquee.bx, bz: state.marquee.bz }
        : null,
      showGrid: Boolean(state.tool && state.tool !== "wall"),
      hoverTile: state.hover,
      ghost: ghostPreview(),
      range: rangeInfo(),
      keepHp: state.keepHp,
      keepMax: KEEP_MAX_HP,
    };
  }

  function ghostPreview() {
    if (state.tool === "wall") {
      const p = state.pointer;
      if (!p) return null;
      if (!state.wallDraft) {
        const aim = snapToWallTip(p.x, p.z);
        return {
          kind: "wall",
          mode: "start",
          ax: aim.x,
          az: aim.z,
          bx: aim.x,
          bz: aim.z,
          ok: aim.snapped || canWallPoint(aim.x, aim.z),
          cost: BUILDINGS.wall.cost,
          snappedStart: aim.snapped,
          snappedEnd: false,
        };
      }
      const end = snapToWallTip(p.x, p.z, state.wallDraft);
      const plan = planWall(state.wallDraft.x, state.wallDraft.z, end.x, end.z);
      return {
        kind: "wall",
        mode: "stretch",
        ax: plan.ax,
        az: plan.az,
        bx: plan.bx,
        bz: plan.bz,
        ok: plan.ok,
        cost: plan.cost,
        pieces: plan.n,
        snappedStart: Boolean(state.wallDraft.snapped),
        snappedEnd: end.snapped,
      };
    }
    if (!state.tool || !state.hover) return null;
    const print = tilesFor(state.tool, state.hover.c, state.hover.r);
    return {
      kind: state.tool,
      tile: print.origin,
      tilesW: print.tilesW,
      tilesH: print.tilesH,
      center: print.center,
      ok:
        canPlaceKind(state.tool) &&
        state.world.canBuildAll(print.tiles) &&
        !footprintBlocked(print.tiles) &&
        canAfford(BUILDINGS[state.tool].cost),
    };
  }

  function setHoverFromWorld(g) {
    if (!g) {
      state.hover = null;
      state.pointer = null;
      return;
    }
    state.pointer = { x: g.x, z: g.z };
    const tile = worldToTile(g.x, g.z);
    state.hover = inBounds(tile.c, tile.r) ? tile : null;
    if (state.tool === "wall" && state.wallDraft && state.pointer) {
      const end = snapToWallTip(state.pointer.x, state.pointer.z, state.wallDraft);
      const plan = planWall(state.wallDraft.x, state.wallDraft.z, end.x, end.z);
      const snapNote = end.snapped ? " Snapped to a wall end." : "";
      if (!plan.ok) setHint((plan.reason === "gold" ? `Need ${plan.cost}g for this wall.` : "Wall must stay on open grass.") + snapNote);
      else setHint(`Wall · ${plan.cost}g · ${plan.n} piece${plan.n === 1 ? "" : "s"} — click to place.${snapNote}`);
    } else if (state.tool === "farm" && countKind("farm") >= MAX_FARMS) {
      setHint(`Farm cap reached (${MAX_FARMS}). Sell one to build another.`);
    }
  }

  function troopsInBox(ax, az, bx, bz) {
    const minX = Math.min(ax, bx);
    const maxX = Math.max(ax, bx);
    const minZ = Math.min(az, bz);
    const maxZ = Math.max(az, bz);
    const pad = 0.35;
    return state.troops.filter(
      (t) => t.hp > 0 && t.x >= minX - pad && t.x <= maxX + pad && t.z >= minZ - pad && t.z <= maxZ + pad
    );
  }

  function troopsNear(x, z, radius) {
    const r2 = radius * radius;
    return state.troops.filter((t) => {
      if (t.hp <= 0) return false;
      const dx = t.x - x;
      const dz = t.z - z;
      return dx * dx + dz * dz <= r2;
    });
  }

  function setPicked(units, add) {
    if (!add) state.picked.clear();
    for (const t of units) state.picked.add(t.id);
    const n = state.picked.size;
    if (n) setHint(`${n} selected. Click the ground to send them. Q clears, E selects all.`);
    else setHint("Drag a box around troops to select them.");
  }

  function commandMove(x, z) {
    const units = state.troops.filter((t) => state.picked.has(t.id) && t.hp > 0);
    if (!units.length) return false;
    const cols = Math.max(1, Math.ceil(Math.sqrt(units.length)));
    const rows = Math.ceil(units.length / cols);
    units.forEach((t, i) => {
      const ox = (i % cols - (cols - 1) / 2) * 0.5;
      const oz = (Math.floor(i / cols) - (rows - 1) / 2) * 0.5;
      t.order = { x: x + ox, z: z + oz };
    });
    setHint(`Sent ${units.length}. Drag another box to select a new group.`);
    return true;
  }

  function finishMarquee(x, z, add) {
    const box = state.marquee;
    state.marquee = null;
    if (!box) return;
    const drag = Math.hypot(x - box.ax, z - box.az);
    if (drag > 0.95) {
      setPicked(troopsInBox(box.ax, box.az, x, z), add);
      return;
    }
    const near = troopsNear(box.ax, box.az, 1.4);
    if (near.length) {
      setPicked(near, add);
      return;
    }
    if (state.picked.size) {
      commandMove(box.ax, box.az);
      return;
    }
    const tile = worldToTile(box.ax, box.az);
    const b = pickBuilding(box.ax, box.az);
    if (b) {
      state.selected = b.id;
      renderInspect();
      return;
    }
    const selected = selectedBuilding();
    if (selected?.kind === "barracks" && !isKeepTile(tile.c, tile.r) && !isSpawnTile(tile.c, tile.r)) {
      const p = tileCenter(tile.c, tile.r);
      selected.rally = { c: tile.c, r: tile.r, x: p.x, z: p.z };
      setHint("Rally set.");
      return;
    }
    state.selected = null;
    renderInspect();
  }

  function onPointerMove(e) {
    if (document.pointerLockElement === canvas) return;
    setHoverFromWorld(view.groundAt(e.clientX, e.clientY));
  }

  function onPointerDown(e) {
    if (state.phase === "menu" || state.phase === "win" || state.phase === "lose") return;
    if (e.button === 2) {
      if (state.wallDraft) {
        state.wallDraft = null;
        setHint("Click a starting point for the wall.");
        return;
      }
      if (state.tool) {
        setTool(null, false);
        return;
      }
      if (state.picked.size && document.pointerLockElement === canvas) {
        const g = view.lookGround();
        if (g) commandMove(g.x, g.z);
      }
      return;
    }
    if (e.button !== 0) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock();
      return;
    }
    const g = view.lookGround();
    if (!g) return;
    const tile = worldToTile(g.x, g.z);
    if (!inBounds(tile.c, tile.r)) return;

    if (state.tool === "wall") {
      if (!state.wallDraft) {
        const aim = snapToWallTip(g.x, g.z);
        if (!aim.snapped && !canWallPoint(aim.x, aim.z)) {
          setHint("Start the wall on open grass, or snap to a wall end.");
          return;
        }
        state.wallDraft = { x: aim.x, z: aim.z, snapped: aim.snapped };
        setHint(aim.snapped ? "Snapped. Click the other end of the wall." : "Click the other end of the wall.");
        return;
      }
      const end = snapToWallTip(g.x, g.z, state.wallDraft);
      const placed = placeWall(state.wallDraft.x, state.wallDraft.z, end.x, end.z);
      if (placed) {
        state.wallDraft = null;
        setHint("Wall raised. Click another start, or pick a different building.");
      } else {
        setHint("That stretch is not valid. Click a different end, or right-click to cancel.");
      }
      renderInspect();
      syncHud();
      return;
    }

    if (state.tool) {
      placeBuilding(state.tool, tile.c, tile.r);
      renderInspect();
      syncHud();
      return;
    }

    state.marquee = { ax: g.x, az: g.z, bx: g.x, bz: g.z, add: e.ctrlKey || e.metaKey };
  }

  function onPointerUp(e) {
    if (e.button !== 0) return;
    if (!state.marquee) return;
    const g = document.pointerLockElement === canvas ? view.lookGround() : view.groundAt(e.clientX, e.clientY);
    finishMarquee(g ? g.x : state.marquee.bx, g ? g.z : state.marquee.bz, e.ctrlKey || e.metaKey || state.marquee.add);
  }

  function setTool(kind, toggle = true) {
    state.tool = toggle && state.tool === kind ? null : kind;
    state.wallDraft = null;
    if (state.tool) state.selected = null;
    if (state.tool === "wall") setHint("Click a start, or aim near a wall tip to snap.");
    renderInspect();
    syncHud();
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", (e) => {
    if (e.code === "F2") {
      admin = !admin;
      setHint(admin ? "Admin on — unlimited gold." : "Admin off.");
      renderInspect();
      syncHud();
      return;
    }
    if (playing() && e.code === "KeyE") {
      const alive = state.troops.filter((t) => t.hp > 0);
      setPicked(alive, false);
      return;
    }
    if (playing() && e.code === "KeyQ") {
      if (state.tool) {
        setTool(null, false);
        setHint("Drag a box to select troops, then click the ground to send them.");
        return;
      }
      state.picked.clear();
      state.marquee = null;
      setHint("Selection cleared.");
      return;
    }
    if (playing() && /^Digit[1-5]$/.test(e.code)) {
      setTool(HOTBAR[Number(e.code.slice(5)) - 1], false);
      return;
    }
    if (e.code === "Escape") {
      if (document.pointerLockElement) return;
      if (state.wallDraft) {
        state.wallDraft = null;
        setHint("Click a starting point for the wall.");
        return;
      }
      state.tool = null;
      state.selected = null;
      state.picked.clear();
      state.marquee = null;
      renderInspect();
      syncHud();
    }
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!playing()) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      let i = HOTBAR.indexOf(state.tool);
      if (i < 0) i = dir > 0 ? -1 : 0;
      setTool(HOTBAR[(i + dir + HOTBAR.length) % HOTBAR.length], false);
    },
    { passive: false }
  );
  document.addEventListener("pointerlockchange", syncLookUi);

  ui.btnPlay.addEventListener("click", () => {
    play();
    canvas.requestPointerLock();
  });
  ui.btnStart.addEventListener("click", startWaves);
  ui.btnRestart.addEventListener("click", () => {
    audio.stop();
    reset();
  });
  ui.btnMute.addEventListener("click", () => {
    audio.setMuted(!audio.isMuted());
    syncHud();
  });
  ui.buildBar.querySelectorAll("[data-build]").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.build));
  });

  let last = performance.now();
  let hudAge = 0;
  function frame(now) {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const blocked = state.phase === "menu" || state.phase === "win" || state.phase === "lose";
    if (!blocked) {
      if (state.phase === "prep" || state.phase === "combat" || state.phase === "between") {
        stepFarms(dt);
        stepTowers(dt);
        stepProjectiles(dt);
        stepTroops(dt);
        stepEnemies(dt);
        sweepDead();
        if (state.keepHp <= 0 && state.phase !== "lose") lose();
        else if (state.phase === "combat") stepSpawns(dt);
        else if (state.phase === "between") stepBetween(dt);
      }
    }
    view.updateCamera(dt, blocked);
    if (!blocked && document.pointerLockElement === canvas) {
      setHoverFromWorld(view.lookGround());
      if (state.marquee && state.pointer) {
        state.marquee.bx = state.pointer.x;
        state.marquee.bz = state.pointer.z;
      }
    }
    view.sync(viewState());
    view.render();
    hudAge += dt;
    if (!blocked && hudAge >= 0.12) {
      hudAge = 0;
      syncHud();
      const b = selectedBuilding();
      if (b && !ui.inspect.hidden) {
        ui.inspectMeta.textContent = inspectMetaText(b);
        if (b.kind === "barracks") refreshBarracksMenu();
      }
    }
    requestAnimationFrame(frame);
  }

  occupyKeep();
  syncHud();
  requestAnimationFrame(frame);

  return { reset };
}

const game = createGame(document.getElementById("view"), {
  menu: document.getElementById("menu"),
  end: document.getElementById("end"),
  hint: document.getElementById("hint"),
  gold: document.getElementById("gold"),
  goldCap: document.getElementById("gold-cap"),
  wave: document.getElementById("wave"),
  keepHp: document.getElementById("keep-hp"),
  keepFill: document.getElementById("keep-fill"),
  btnPlay: document.getElementById("btn-play"),
  btnStart: document.getElementById("btn-start"),
  btnRestart: document.getElementById("btn-restart"),
  btnMute: document.getElementById("btn-mute"),
  buildBar: document.getElementById("build-bar"),
  inspect: document.getElementById("inspect"),
  inspectTitle: document.getElementById("inspect-title"),
  inspectMeta: document.getElementById("inspect-meta"),
  inspectActions: document.getElementById("inspect-actions"),
  endKicker: document.getElementById("end-kicker"),
  endTitle: document.getElementById("end-title"),
  endBody: document.getElementById("end-body"),
  crosshair: document.getElementById("crosshair"),
  lookPrompt: document.getElementById("look-prompt"),
});

for (const btn of document.querySelectorAll("[data-build]")) {
  const def = BUILDINGS[btn.dataset.build];
  if (def) {
    const em = btn.querySelector("em");
    if (!em) continue;
    if (btn.dataset.build === "farm") em.textContent = `${def.cost}g · 0/${MAX_FARMS}`;
    else em.textContent = def.draw ? `${def.cost}g+ · draw` : `${def.cost}g · ${def.tilesW}×${def.tilesH}`;
  }
}

document.documentElement.dataset.gk = "ready";
void game;
