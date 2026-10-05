import { createView3D } from "./view3d.js?v=25";
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
  keepCenter,
  WALL_HALF,
  WALL_MIN_LEN,
  GATE_LEN,
  clampWallEnd,
  wallPieces,
  wallChunkCount,
  wallYaw,
  tilesTouchedByWall,
  tilesTouchedByCircle,
  distToSegment,
} from "./world.js?v=7";

const START_GOLD = 360;
const PREP_GOLD_CAP = 540;
const KEEP_MAX_HP = 400;
const KEEP_HP = [400, 950, 1900, 3400];
const KEEP_RADIUS = [3.2, 5.0, 6.8, 8.8];
const KEEP_TITLES = ["Keep", "Fort", "Castle", "Citadel"];
const KEEP_UPGRADE_COST = [150, 280, 520];
const SELL_REFUND = 1;
const HOUSING_PER_BARRACKS = 20;
const MAX_FARMS = 6;
const WAVE_COUNT = 10;
const MAX_ENEMIES = 640;
const FORMATION_GAP = 0.48;

const UPGRADE_MAX = 3;
const BUILDINGS = {
  wall: { name: "Wooden Wall", cost: 10, hp: 70, tilesW: 1, tilesH: 1, draw: true },
  gate: { name: "Gate", cost: 12, hp: 90, tilesW: 1, tilesH: 1, draw: true },
  crossbow: { name: "Crossbow", cost: 40, hp: 60, range: 5.2, fireRate: 0.55, damage: 10, projectile: "bolt", speed: 18, tilesW: 1, tilesH: 1, radius: 0.85 },
  cannon: { name: "Cannon", cost: 70, hp: 70, range: 5.0, fireRate: 1.7, damage: 6, splash: 1.5, projectile: "ball", speed: 14, tilesW: 1, tilesH: 1, radius: 0.92 },
  mage: { name: "Mage tower", cost: 85, hp: 55, range: 4.6, fireRate: 1.2, damage: 5, splash: 1.05, slow: 2.2, projectile: "spark", speed: 16, tilesW: 1, tilesH: 1, radius: 0.5 },
  air: { name: "Air defense", cost: 90, hp: 55, range: 6.4, fireRate: 0.7, damage: 14, projectile: "flak", speed: 22, tilesW: 1, tilesH: 1, radius: 0.87 },
  spikes: { name: "Spike pit", cost: 22, hp: 32, damagePerSec: 8, tilesW: 1, tilesH: 1, radius: 0.4 },
  farm: { name: "Farm", cost: 50, hp: 25, goldPerSec: 1.5, tilesW: 1, tilesH: 1, radius: 0.7 },
  barracks: { name: "Barracks", cost: 80, hp: 80, tilesW: 1, tilesH: 1, radius: 0.74 },
  workshop: { name: "Workshop", cost: 65, hp: 50, repairPerSec: 10, repairRange: 4.2, tilesW: 1, tilesH: 1, radius: 0.68 },
  keep: { name: "Keep", cost: 0, hp: KEEP_HP[0], tilesW: 2, tilesH: 2, radius: KEEP_RADIUS[0] },
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
  bat: { hp: 6, damage: 1, speed: 5.1, gold: 2, range: 0.85, fly: true },
  climber: { hp: 14, damage: 2, speed: 2.55, gold: 2, range: 0.95, climb: true },
  ram: { hp: 58, damage: 2, speed: 1.22, gold: 6, range: 1.15, siege: true, wallDamage: 12, keepDamage: 9 },
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
      ring("bat", 10, 2.2, 5, 3);
      ring("goblin", 24, 8, 6, 1);
    },
    () => {
      ring("goblin", 28, 0.25, 8);
      ring("runner", 18, 0.6, 6, 1);
      ring("bat", 14, 1.4, 6, 4);
      ring("goblin", 24, 7, 7, 2);
      ring("runner", 16, 7.8, 5, 3);
    },
    () => {
      ring("goblin", 32, 0.2, 8);
      ring("brute", 8, 1.1, 4);
      ring("climber", 10, 1.4, 5, 3);
      ring("runner", 20, 1.6, 6, 2);
      ring("goblin", 28, 8.5, 8, 1);
    },
    () => {
      ring("goblin", 30, 0.2, 8);
      ring("archer", 8, 0.8, 4, 1);
      ring("brute", 8, 1.4, 4, 2);
      ring("climber", 12, 2, 6, 4);
      ring("goblin", 26, 8, 8, 3);
      ring("archer", 8, 8.6, 4);
    },
    () => {
      ring("goblin", 36, 0.2, 10);
      ring("runner", 18, 0.7, 6, 1);
      ring("brute", 10, 1.3, 5, 2);
      ring("ram", 2, 1.5, 2, 5);
      ring("archer", 8, 1.8, 4, 3);
      ring("bat", 12, 3, 6, 2);
      ring("goblin", 28, 9, 8, 4);
    },
    () => {
      ring("goblin", 40, 0.15, 10);
      ring("ogre", 1, 0.4, 2);
      ring("ram", 2, 0.8, 2, 4);
      ring("brute", 12, 1.2, 6, 1);
      ring("climber", 10, 2.4, 5, 3);
      ring("goblin", 32, 8.5, 8, 2);
      ring("runner", 20, 9, 6, 3);
    },
    () => {
      ring("goblin", 44, 0.12, 12);
      ring("ogre", 1, 0.5, 3);
      ring("ram", 3, 0.7, 3, 6);
      ring("brute", 12, 1.1, 6, 1);
      ring("archer", 10, 1.6, 5, 2);
      ring("runner", 22, 2, 7, 3);
      ring("bat", 16, 3.2, 8, 4);
      ring("climber", 12, 4, 6, 5);
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
      wallMode: "draw",
      picked: new Set(),
      marquee: null,
      buildings: [],
      troops: [],
      enemies: [],
      projectiles: [],
      spawnQueue: [],
      spawned: 0,
      spawnLane: 0,
      boats: [],
      upgrades: Object.fromEntries(TROOP_ORDER.map((k) => [k, 0])),
      world: createWorld(),
    };
  }

  const HOTBAR = ["wall", "crossbow", "cannon", "mage", "air", "spikes", "farm", "barracks", "workshop"];
  const BOAT_ARRIVE = 8.6;
  const BOAT_LEAVE = 7.2;
  const BOAT_OFFSHORE = 128;

  function isFence(kind) {
    return kind === "wall" || kind === "gate";
  }

  function troopLevel(kind) {
    return state.upgrades[kind] || 0;
  }

  function troopDef(kind) {
    const base = TROOPS[kind];
    if (!base) return null;
    const lv = troopLevel(kind);
    const hpMul = 1 + lv * 0.28;
    const dmgMul = 1 + lv * 0.32;
    return {
      ...base,
      hp: Math.round(base.hp * hpMul),
      damage: Math.max(1, Math.round(base.damage * dmgMul)),
      range: +(base.range * (1 + lv * 0.08)).toFixed(2),
      cooldown: +(base.cooldown * (1 - lv * 0.08)).toFixed(2),
    };
  }

  function buildingStats(kind, level = 0) {
    const base = BUILDINGS[kind];
    if (!base) return null;
    const lv = level || 0;
    const stats = {
      ...base,
      hp: Math.round(base.hp * (1 + lv * 0.38)),
    };
    if (base.damage) stats.damage = Math.max(1, Math.round(base.damage * (1 + lv * 0.3)));
    if (base.range) stats.range = +(base.range * (1 + lv * 0.1)).toFixed(2);
    if (base.fireRate) stats.fireRate = +(base.fireRate * (1 - lv * 0.1)).toFixed(2);
    if (base.splash) stats.splash = +(base.splash * (1 + lv * 0.12)).toFixed(2);
    if (base.slow) stats.slow = +(base.slow * (1 + lv * 0.18)).toFixed(2);
    if (base.speed) stats.speed = +(base.speed * (1 + lv * 0.06)).toFixed(2);
    if (base.damagePerSec) stats.damagePerSec = Math.round(base.damagePerSec * (1 + lv * 0.32));
    if (base.goldPerSec) stats.goldPerSec = +(base.goldPerSec * (1 + lv * 0.4)).toFixed(2);
    if (base.repairPerSec) stats.repairPerSec = Math.round(base.repairPerSec * (1 + lv * 0.35));
    if (base.repairRange) stats.repairRange = +(base.repairRange * (1 + lv * 0.12)).toFixed(2);
    if (kind === "barracks") stats.housing = HOUSING_PER_BARRACKS + lv * 6;
    if (kind === "keep") {
      stats.hp = KEEP_HP[lv] ?? KEEP_HP[KEEP_HP.length - 1];
      stats.radius = KEEP_RADIUS[lv] ?? KEEP_RADIUS[KEEP_RADIUS.length - 1];
    }
    return stats;
  }

  function wallGroupOf(b) {
    if (!b || !isFence(b.kind)) return b ? [b] : [];
    const gid = b.wallGroup ?? b.id;
    return state.buildings.filter((item) => isFence(item.kind) && (item.wallGroup ?? item.id) === gid);
  }

  function gateMode() {
    return state.tool === "wall" && state.wallMode === "gate";
  }

  function pieceUpgradeCost(kind, level) {
    if (level >= UPGRADE_MAX) return 0;
    if (kind === "wall") return Math.round(6 * (1.6 + level * 1.2));
    if (kind === "gate") return Math.round(5 * (1.6 + level * 1.2));
    if (kind === "keep") return KEEP_UPGRADE_COST[level] || 0;
    return Math.round(BUILDINGS[kind].cost * (2.2 + level * 1.8));
  }

  function buildingUpgradeCost(b) {
    const members = isFence(b.kind) ? wallGroupOf(b) : [b];
    return members.reduce((sum, item) => sum + pieceUpgradeCost(item.kind, item.level || 0), 0);
  }

  function buildingName(kind, level = 0) {
    const lv = level || 0;
    if (kind === "keep") return `${KEEP_TITLES[lv] || "Keep"} · Lv ${lv}`;
    const base = BUILDINGS[kind]?.name || kind;
    return lv ? `${base} · Lv ${lv}` : base;
  }

  function upgradeCost(kind) {
    const lv = troopLevel(kind);
    return Math.round(TROOPS[kind].cost * (3 + lv * 2.5));
  }

  function unitIgnoresWalls(unit) {
    const def = ENEMIES[unit.kind];
    return Boolean(def?.fly || def?.climb);
  }

  function playing() {
    return state.phase === "prep" || state.phase === "combat" || state.phase === "between";
  }

  function releaseLook() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function settingsOpen() {
    return Boolean(ui.settings && !ui.settings.hidden);
  }

  function openSettings() {
    if (!ui.settings) return;
    releaseLook();
    ui.settings.hidden = false;
    syncLookUi();
  }

  function closeSettings(resumeLook = true) {
    if (!ui.settings) return;
    ui.settings.hidden = true;
    syncLookUi();
    if (resumeLook && playing()) grabLook();
  }

  function grabLook() {
    if (settingsOpen()) return false;
    if (document.pointerLockElement === canvas) return true;
    try {
      const out = canvas.requestPointerLock({ unadjustedMovement: true });
      if (out && typeof out.catch === "function") out.catch(() => canvas.requestPointerLock());
    } catch {
      canvas.requestPointerLock();
    }
    return document.pointerLockElement === canvas;
  }

  let unlockGuard = 0;

  function syncLookUi() {
    const locked = document.pointerLockElement === canvas;
    const live = playing();
    if (!locked && document.documentElement.classList.contains("looking")) unlockGuard = performance.now();
    document.documentElement.classList.toggle("playing", live);
    document.documentElement.classList.toggle("looking", locked);
    if (ui.crosshair) ui.crosshair.hidden = !locked || settingsOpen();
    if (ui.lookPrompt) ui.lookPrompt.hidden = true;
  }

  function reset() {
    Object.assign(state, freshState());
    view.resetCamera();
    releaseLook();
    occupyKeep();
    ui.menu.hidden = false;
    if (ui.settings) ui.settings.hidden = true;
    ui.end.hidden = true;
    ui.btnStart.disabled = false;
    ui.btnStart.hidden = false;
    syncLookUi();
    syncHud();
    renderInspect();
  }

  function occupyKeep() {
    for (const [c, r] of KEEP_TILES) state.world.set(c, r, { kind: "keep", id: "keep" });
    if (state.buildings.some((b) => b.kind === "keep")) return;
    const p = keepCenter();
    const stats = buildingStats("keep", 0);
    state.buildings.push({
      id: "keep",
      kind: "keep",
      c: KEEP_TILES[0][0],
      r: KEEP_TILES[0][1],
      tilesW: 2,
      tilesH: 2,
      radius: stats.radius,
      x: p.x,
      z: p.z,
      level: 0,
      cost: 0,
      hp: stats.hp,
      maxHp: stats.hp,
      cooldown: 0,
      train: 0,
      rally: null,
    });
    state.keepHp = stats.hp;
  }

  function keepBuilding() {
    return state.buildings.find((b) => b.kind === "keep") || null;
  }

  function keepMaxHp() {
    return keepBuilding()?.maxHp || KEEP_HP[0];
  }

  function openKeepInspect() {
    const keep = keepBuilding();
    if (!keep || !playing()) return false;
    state.tool = null;
    state.wallDraft = null;
    state.marquee = null;
    state.selected = keep.id;
    renderInspect();
    syncHud();
    return true;
  }

  function aimPoint(e) {
    if (document.pointerLockElement === canvas) return view.lookGround();
    if (e) return view.groundAt(e.clientX, e.clientY);
    return view.lookGround();
  }

  function play() {
    occupyKeep();
    state.phase = "prep";
    ui.menu.hidden = true;
    audio.start();
    syncHud();
    syncLookUi();
  }

  function startWaves() {
    if (state.phase !== "prep") return;
    state.phase = "combat";
    state.wave = 1;
    state.waveTime = 0;
    state.spawnQueue = spawnQueueFor(0);
    state.spawned = 0;
    state.boats = [];
    primeBoats();
    ui.btnStart.hidden = true;
    audio.wave();
    setHint("Wave 1");
    syncHud();
  }

  function beginWave(n) {
    state.wave = n;
    state.phase = "combat";
    state.waveTime = 0;
    state.spawnQueue = spawnQueueFor(n - 1);
    state.spawned = 0;
    primeBoats();
    audio.wave();
    setHint(`Wave ${n}`);
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

  function wallPieceCost(index, kind = "wall") {
    if (kind === "gate") {
      if (index <= 0) return 8;
      if (index === 1) return 6;
      return 4;
    }
    if (index <= 0) return 10;
    if (index === 1) return 8;
    if (index === 2) return 6;
    if (index === 3) return 5;
    return 4;
  }

  function wallTotalCost(count, kind = "wall") {
    let sum = 0;
    for (let i = 0; i < count; i += 1) sum += wallPieceCost(i, kind);
    return sum;
  }

  function syncWalls() {
    state.world.setWalls(
      state.buildings
        .filter((b) => isFence(b.kind))
        .map((b) => ({
          id: b.id,
          ax: b.ax,
          az: b.az,
          bx: b.bx,
          bz: b.bz,
          half: WALL_HALF,
          pass: b.kind === "gate",
        }))
    );
  }

  function footprintBlocked(tiles) {
    return tiles.some(([c, r]) => state.world.wallTouchesTile(c, r));
  }

  function pickBuilding(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const b of state.buildings) {
      if (isFence(b.kind)) {
        const d = distToSegment(x, z, b.ax, b.az, b.bx, b.bz);
        if (d < WALL_HALF + 0.28 && d < bestD) {
          best = b;
          bestD = d;
        }
        continue;
      }
      const rad = (b.radius ?? stampRadius(b.kind)) + 0.2;
      const d = Math.hypot(x - b.x, z - b.z);
      if (d < rad && d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  function reachBuilding(from, b) {
    if (isFence(b.kind)) return distToSegment(from.x, from.z, b.ax, b.az, b.bx, b.bz);
    return dist(from, b);
  }

  function planWall(ax, az, hx, hz, kind = "wall") {
    const end = clampWallEnd(ax, az, hx, hz);
    const bx = end.x;
    const bz = end.z;
    const len = end.len;
    const n = wallChunkCount(len);
    const cost = wallTotalCost(n, kind);
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
      if (b.kind !== "wall" && b.kind !== "gate") continue;
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

  const GATE_PICK = WALL_HALF + 1.2;
  const GATE_STUB_MIN = 0.32;

  function nearestFence(x, z) {
    let best = null;
    let bestD = GATE_PICK;
    for (const b of state.buildings) {
      if (!isFence(b.kind)) continue;
      const d = distToSegment(x, z, b.ax, b.az, b.bx, b.bz);
      if (d < bestD) {
        best = b;
        bestD = d;
      }
    }
    return best;
  }

  function yawUndirected(ax, az, bx, bz) {
    let y = Math.atan2(-(bz - az), bx - ax);
    y %= Math.PI;
    if (y < 0) y += Math.PI;
    return y;
  }

  function collinearWith(a, b) {
    const ya = yawUndirected(a.ax, a.az, a.bx, a.bz);
    const yb = yawUndirected(b.ax, b.az, b.bx, b.bz);
    let d = Math.abs(ya - yb);
    if (d > Math.PI / 2) d = Math.PI - d;
    return d < 0.18;
  }

  function chainCollinear(start) {
    const group = wallGroupOf(start).filter((p) => collinearWith(start, p));
    const at = new Map();
    const add = (x, z, piece) => {
      const k = tipKey(x, z);
      let list = at.get(k);
      if (!list) {
        list = [];
        at.set(k, list);
      }
      list.push(piece);
    };
    for (const p of group) {
      add(p.ax, p.az, p);
      add(p.bx, p.bz, p);
    }
    const used = new Set([start.id]);
    const walk = (fromX, fromZ) => {
      const out = [];
      let x = fromX;
      let z = fromZ;
      for (let n = 0; n < 80; n += 1) {
        const list = at.get(tipKey(x, z)) || [];
        const next = list.find((p) => !used.has(p.id));
        if (!next) break;
        used.add(next.id);
        const startAtA = tipKey(next.ax, next.az) === tipKey(x, z);
        out.push({
          piece: next,
          ax: startAtA ? next.ax : next.bx,
          az: startAtA ? next.az : next.bz,
          bx: startAtA ? next.bx : next.ax,
          bz: startAtA ? next.bz : next.az,
        });
        x = startAtA ? next.bx : next.ax;
        z = startAtA ? next.bz : next.az;
      }
      return out;
    };
    const back = walk(start.ax, start.az);
    const forward = walk(start.bx, start.bz);
    const orientedBack = back
      .map((seg) => ({ piece: seg.piece, ax: seg.bx, az: seg.bz, bx: seg.ax, bz: seg.az }))
      .reverse();
    return [
      ...orientedBack,
      { piece: start, ax: start.ax, az: start.az, bx: start.bx, bz: start.bz },
      ...forward,
    ];
  }

  function runMetrics(chain) {
    const segs = [];
    let s = 0;
    for (const seg of chain) {
      const len = Math.hypot(seg.bx - seg.ax, seg.bz - seg.az);
      segs.push({ ...seg, s0: s, s1: s + len, len });
      s += len;
    }
    return { segs, total: s };
  }

  function pointAtS(metrics, s) {
    const t = Math.max(0, Math.min(metrics.total, s));
    const last = metrics.segs[metrics.segs.length - 1];
    for (const seg of metrics.segs) {
      if (t <= seg.s1 + 1e-6 || seg === last) {
        const u = seg.len < 1e-8 ? 0 : (t - seg.s0) / seg.len;
        return {
          x: seg.ax + (seg.bx - seg.ax) * u,
          z: seg.az + (seg.bz - seg.az) * u,
        };
      }
    }
    return { x: last.bx, z: last.bz };
  }

  function projectS(metrics, x, z) {
    let bestS = 0;
    let bestD = Infinity;
    for (const seg of metrics.segs) {
      const hit = closestOnSeg(x, z, seg.ax, seg.az, seg.bx, seg.bz);
      const d = Math.hypot(x - hit.x, z - hit.z);
      if (d < bestD) {
        bestD = d;
        const along = Math.hypot(hit.x - seg.ax, hit.z - seg.az);
        bestS = seg.s0 + along;
      }
    }
    return { s: bestS, dist: bestD };
  }

  function planGateAt(x, z) {
    const near = nearestFence(x, z);
    if (!near) return { ok: false, reason: "nowall" };
    const chain = chainCollinear(near);
    const metrics = runMetrics(chain);
    if (!metrics.segs.length) return { ok: false, reason: "nowall" };
    const proj = projectS(metrics, x, z);
    const tooShort = metrics.total < GATE_LEN - 0.02;
    const span = tooShort ? metrics.total : GATE_LEN;
    let startS = proj.s - span / 2;
    startS = Math.max(0, Math.min(Math.max(0, metrics.total - span), startS));
    if (startS < GATE_STUB_MIN) startS = 0;
    if (metrics.total - (startS + span) < GATE_STUB_MIN) startS = Math.max(0, metrics.total - span);
    const endS = startS + span;
    const a = pointAtS(metrics, startS);
    const b = pointAtS(metrics, endS);
    const yaw = wallYaw(a.x, a.z, b.x, b.z);
    const level = Math.min(...chain.map((seg) => seg.piece.level || 0));
    const cost = BUILDINGS.gate.cost;
    let reason = null;
    if (tooShort) reason = "short";
    else {
      for (const seg of metrics.segs) {
        if (seg.piece.kind !== "gate") continue;
        if (Math.min(endS, seg.s1) - Math.max(startS, seg.s0) > 0.12) {
          reason = "overlap";
          break;
        }
      }
    }
    if (!reason && !canAfford(cost)) reason = "gold";
    return {
      ok: !reason,
      reason,
      ax: a.x,
      az: a.z,
      bx: b.x,
      bz: b.z,
      yaw,
      cost,
      level,
      startS,
      endS,
      metrics,
      group: near.wallGroup ?? near.id,
    };
  }

  function makeFencePiece(kind, template, ax, az, bx, bz, cost, hp) {
    const length = Math.hypot(bx - ax, bz - az);
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    const tile = worldToTile(x, z);
    const def = buildingStats(kind, template.level || 0);
    const maxHp = def.hp;
    const ratio = template.maxHp ? template.hp / template.maxHp : 1;
    return {
      id: uid(),
      kind,
      wallGroup: template.wallGroup ?? template.id,
      c: tile.c,
      r: tile.r,
      tilesW: 1,
      tilesH: 1,
      ax,
      az,
      bx,
      bz,
      x,
      z,
      yaw: wallYaw(ax, az, bx, bz),
      length,
      cost: Math.max(0, Math.round(cost)),
      level: template.level || 0,
      hp: Math.max(1, Math.round(hp ?? maxHp * ratio)),
      maxHp,
      cooldown: 0,
      train: 0,
      rally: null,
    };
  }

  function placeGateAt(x, z) {
    const plan = planGateAt(x, z);
    if (!plan.ok) return false;
    const drop = new Set();
    const stubs = [];
    let restoredCost = 0;
    let template = null;
    for (const seg of plan.metrics.segs) {
      const overlap = Math.min(plan.endS, seg.s1) - Math.max(plan.startS, seg.s0);
      if (overlap <= 0.02) continue;
      const p = seg.piece;
      if (p.kind === "gate") continue;
      template = p;
      drop.add(p.id);
      const before = Math.max(0, plan.startS - seg.s0);
      const after = Math.max(0, seg.s1 - plan.endS);
      const pieceCost = p.cost ?? BUILDINGS[p.kind].cost;
      restoredCost += pieceCost * (overlap / Math.max(0.01, seg.len));
      if (before > GATE_STUB_MIN) {
        const a = pointAtS(plan.metrics, seg.s0);
        const b = pointAtS(plan.metrics, plan.startS);
        stubs.push(
          makeFencePiece("wall", p, a.x, a.z, b.x, b.z, pieceCost * (before / seg.len), p.hp * (before / seg.len))
        );
      }
      if (after > GATE_STUB_MIN) {
        const a = pointAtS(plan.metrics, plan.endS);
        const b = pointAtS(plan.metrics, seg.s1);
        stubs.push(
          makeFencePiece("wall", p, a.x, a.z, b.x, b.z, pieceCost * (after / seg.len), p.hp * (after / seg.len))
        );
      }
    }
    if (!template || !spend(plan.cost)) return false;
    state.buildings = state.buildings.filter((b) => !drop.has(b.id));
    const gate = makeFencePiece("gate", template, plan.ax, plan.az, plan.bx, plan.bz, plan.cost);
    gate.wallGroup = plan.group;
    gate.restoredCost = restoredCost;
    gate.length = GATE_LEN;
    const stats = buildingStats("gate", gate.level);
    gate.maxHp = stats.hp;
    gate.hp = stats.hp;
    state.buildings.push(...stubs, gate);
    syncWalls();
    state.selected = gate.id;
    audio.place();
    return true;
  }

  function restoreGateToWall(gate) {
    const wall = makeFencePiece(
      "wall",
      gate,
      gate.ax,
      gate.az,
      gate.bx,
      gate.bz,
      gate.restoredCost ?? BUILDINGS.wall.cost,
    );
    wall.wallGroup = gate.wallGroup ?? gate.id;
    const stats = buildingStats("wall", wall.level);
    wall.maxHp = stats.hp;
    wall.hp = stats.hp;
    state.buildings.push(wall);
    return wall;
  }

  function placeWall(ax, az, hx, hz, kind = "wall") {
    const plan = planWall(ax, az, hx, hz, kind);
    if (!plan.ok) return false;
    if (!spend(plan.cost)) return false;
    const group = uid();
    const pieces = wallPieces(plan.ax, plan.az, plan.bx, plan.bz);
    const def = BUILDINGS[kind] || BUILDINGS.wall;
    let last = null;
    for (let i = 0; i < pieces.length; i += 1) {
      const piece = pieces[i];
      const tile = worldToTile(piece.x, piece.z);
      const b = {
        id: uid(),
        kind,
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
        cost: wallPieceCost(i, kind),
        level: 0,
        hp: def.hp,
        maxHp: def.hp,
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

  function countKind(kind) {
    return state.buildings.filter((b) => b.kind === kind).length;
  }

  function canPlaceKind(kind) {
    if (kind === "farm" && countKind("farm") >= MAX_FARMS) return false;
    return true;
  }

  function stampRadius(kind) {
    return BUILDINGS[kind]?.radius ?? 0.9;
  }

  function buildingConflicts(x, z, radius, ignoreId = null) {
    const keep = keepCenter();
    const keepR = keepBuilding()?.radius ?? KEEP_RADIUS[0];
    if (Math.hypot(x - keep.x, z - keep.z) < radius + keepR) return true;
    for (const b of state.buildings) {
      if (b.id === ignoreId || b.kind === "keep") continue;
      if (isFence(b.kind)) {
        if (distToSegment(x, z, b.ax, b.az, b.bx, b.bz) < radius + WALL_HALF + 0.02) return true;
      } else {
        const r = b.radius ?? stampRadius(b.kind);
        if (Math.hypot(x - b.x, z - b.z) < radius + r + 0.04) return true;
      }
    }
    return false;
  }

  function canPlaceAt(kind, x, z) {
    const def = BUILDINGS[kind];
    if (!def || isFence(kind) || kind === "keep") return false;
    if (!canPlaceKind(kind) || !canAfford(def.cost)) return false;
    const radius = stampRadius(kind);
    const tiles = tilesTouchedByCircle(x, z, radius);
    if (!state.world.canPlantAll(tiles) || footprintBlocked(tiles)) return false;
    if (buildingConflicts(x, z, radius)) return false;
    return true;
  }

  function placeBuilding(kind, x, z) {
    if (isFence(kind) || kind === "keep") return false;
    const def = BUILDINGS[kind];
    if (!def) return false;
    if (!canPlaceKind(kind)) {
      if (kind === "farm") setHint(`Farm cap reached (${MAX_FARMS}). Sell one to build another.`);
      return false;
    }
    const radius = stampRadius(kind);
    const tiles = tilesTouchedByCircle(x, z, radius);
    if (!state.world.canPlantAll(tiles) || footprintBlocked(tiles) || buildingConflicts(x, z, radius)) {
      return false;
    }
    if (!spend(def.cost)) return false;
    const tile = worldToTile(x, z);
    const rally = kind === "barracks" ? { x, z: z + TILE * 1.15 } : null;
    if (rally) {
      const rt = worldToTile(rally.x, rally.z);
      rally.c = rt.c;
      rally.r = rt.r;
    }
    const b = {
      id: uid(),
      kind,
      c: tile.c,
      r: tile.r,
      tilesW: 1,
      tilesH: 1,
      radius,
      x,
      z,
      level: 0,
      cost: def.cost,
      hp: def.hp,
      maxHp: def.hp,
      cooldown: 0,
      train: 0,
      rally,
    };
    state.buildings.push(b);
    state.world.occupyFree(tiles, { kind: "building", id: b.id });
    state.selected = b.id;
    audio.place();
    return true;
  }

  function sellSelected() {
    const b = state.buildings.find((item) => item.id === state.selected);
    if (!b || b.kind === "keep") return;
    state.gold += Math.round((b.cost ?? BUILDINGS[b.kind].cost) * SELL_REFUND);
    if (!admin && state.phase === "prep") state.gold = Math.min(PREP_GOLD_CAP, state.gold);
    state.world.clearId(b.id);
    state.buildings = state.buildings.filter((item) => item.id !== b.id);
    if (b.kind === "gate") restoreGateToWall(b);
    if (isFence(b.kind)) syncWalls();
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
    let cap = 0;
    for (const hall of allBarracks()) cap += buildingStats("barracks", hall.level).housing;
    return cap;
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
    const def = troopDef(kind);
    if (!def) return false;
    if (!allBarracks().length) return false;
    if (armyHousing() + def.housing > armyCap()) {
      setHint("Army is full. Build another barracks.");
      return false;
    }
    if (!spend(TROOPS[kind].cost)) return false;
    const home = pickSpawnHall();
    if (!home) return false;
    spawnSquad(home, kind);
    refreshBarracksMenu();
    syncHud();
    return true;
  }

  function upgradeTroop(kind) {
    if (!countKind("workshop")) {
      setHint("Build a workshop to upgrade troops.");
      return false;
    }
    if (troopLevel(kind) >= UPGRADE_MAX) return false;
    if (!spend(upgradeCost(kind))) return false;
    const before = troopDef(kind);
    state.upgrades[kind] += 1;
    const after = troopDef(kind);
    for (const t of state.troops) {
      if (t.kind !== kind || t.hp <= 0) continue;
      const ratio = t.maxHp ? t.hp / t.maxHp : 1;
      t.maxHp = after.hp;
      t.hp = Math.max(1, Math.round(after.hp * ratio));
      t.level = troopLevel(kind);
    }
    setHint(`${TROOPS[kind].name} is now level ${troopLevel(kind)}.`);
    renderInspect();
    syncHud();
    return Boolean(before && after);
  }

  function upgradeBuilding() {
    const b = selectedBuilding();
    if (!b) return false;
    const members = isFence(b.kind) ? wallGroupOf(b) : [b];
    const lv = Math.min(...members.map((item) => item.level || 0));
    if (lv >= UPGRADE_MAX) return false;
    const cost = buildingUpgradeCost(b);
    if (!cost || !spend(cost)) return false;
    for (const item of members) {
      if ((item.level || 0) >= UPGRADE_MAX) continue;
      const next = (item.level || 0) + 1;
      const paid = pieceUpgradeCost(item.kind, item.level || 0);
      const after = buildingStats(item.kind, next);
      const ratio = item.maxHp ? item.hp / item.maxHp : 1;
      item.level = next;
      item.maxHp = after.hp;
      item.hp = Math.max(1, Math.round(after.hp * ratio));
      item.cost = (item.cost ?? BUILDINGS[item.kind].cost) + paid;
      if (after.radius) item.radius = after.radius;
    }
    if (b.kind === "keep") state.keepHp = b.hp;
    const label = b.kind === "keep" ? KEEP_TITLES[lv + 1] || "Keep" : isFence(b.kind) && members.length > 1 ? "Wall" : BUILDINGS[b.kind].name;
    setHint(`${label} is now level ${lv + 1}.`);
    renderInspect();
    syncHud();
    audio.place();
    return true;
  }

  function spawnSquad(barracks, kind) {
    const def = troopDef(kind);
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
        level: troopLevel(kind),
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

  function laneHeading(lane) {
    const origin = SPAWN_TILES[((lane % SPAWN_TILES.length) + SPAWN_TILES.length) % SPAWN_TILES.length];
    const pos = tileCenter(origin[0], origin[1]);
    const keep = keepCenter();
    let fx = keep.x - pos.x;
    let fz = keep.z - pos.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    return { x: pos.x, z: pos.z, fx, fz, rx: -fz, rz: fx, yaw: Math.atan2(fx, fz) };
  }

  function boatWorldPos(boat) {
    const h = laneHeading(boat.lane);
    let along = 0;
    if (boat.phase === "arrive") {
      const u = Math.min(1, boat.t / BOAT_ARRIVE);
      const ease = u * u * (3 - 2 * u);
      along = -BOAT_OFFSHORE * (1 - ease);
    } else if (boat.phase === "leave") {
      const u = Math.min(1, boat.leaveT / BOAT_LEAVE);
      along = -BOAT_OFFSHORE * (u * u);
    }
    return { x: h.x + h.fx * along, z: h.z + h.fz * along, yaw: h.yaw };
  }

  function ensureBoat(lane) {
    let boat = state.boats.find((b) => b.lane === lane && b.phase !== "leave");
    if (boat) return boat;
    boat = { id: uid(), lane, t: 0, leaveT: 0, phase: "arrive" };
    state.boats.push(boat);
    return boat;
  }

  function primeBoats() {
    const lanes = new Set();
    for (const q of state.spawnQueue) lanes.add(q.lane ?? 0);
    for (const lane of lanes) ensureBoat(lane);
  }

  function stepBoats(dt) {
    const pending = new Set();
    for (const q of state.spawnQueue) pending.add(q.lane ?? 0);
    for (const boat of state.boats) {
      if (boat.phase === "arrive") {
        boat.t += dt;
        if (boat.t >= BOAT_ARRIVE) boat.phase = "wait";
      } else if (boat.phase === "wait") {
        boat.t += dt;
        if (!pending.has(boat.lane)) {
          boat.phase = "leave";
          boat.leaveT = 0;
        }
      } else {
        boat.leaveT += dt;
      }
    }
    state.boats = state.boats.filter((b) => b.phase !== "leave" || b.leaveT < BOAT_LEAVE);
  }

  function boatViewList() {
    return state.boats.map((boat) => {
      const pos = boatWorldPos(boat);
      return { id: boat.id, x: pos.x, z: pos.z, yaw: pos.yaw };
    });
  }

  function spawnPack(type, count, lane) {
    const def = ENEMIES[type];
    if (!def || !SPAWN_TILES.length) return false;
    const n = Math.min(count, MAX_ENEMIES - state.enemies.length);
    if (n <= 0) return true;
    const boat = ensureBoat(lane);
    if (boat.phase === "arrive") return false;
    const h = laneHeading(lane);
    const pos = { x: h.x, z: h.z };
    const fx = h.fx;
    const fz = h.fz;
    const rx = h.rx;
    const rz = h.rz;
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
        slow: 0,
        fly: Boolean(def.fly),
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

  function closestOnSeg(px, pz, ax, az, bx, bz) {
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-8) return { x: ax, z: az };
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    return { x: ax + dx * t, z: az + dz * t };
  }

  function solidBuildingAt(x, z) {
    for (const b of state.buildings) {
      if (isFence(b.kind) || b.kind === "spikes") continue;
      const rad = b.radius ?? stampRadius(b.kind);
      if (Math.hypot(x - b.x, z - b.z) < rad) return b;
    }
    return null;
  }

  function unitBlockedAt(unit, x, z) {
    if (unitIgnoresWalls(unit)) return Boolean(solidBuildingAt(x, z));
    const passGates = unit.team === "ally";
    if (state.world.wallHitsPoint(x, z, 0.16, passGates)) return true;
    return Boolean(solidBuildingAt(x, z));
  }

  function steerToward(unit, dest, dt, speed) {
    const dx = dest.x - unit.x;
    const dz = dest.z - unit.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return;
    const mul = unit.slow > 0 ? 0.52 : 1;
    const step = speed * mul * TILE * dt;
    const nx = unit.x + (dx / len) * Math.min(step, len);
    const nz = unit.z + (dz / len) * Math.min(step, len);
    const blocked = unitBlockedAt(unit, nx, nz);
    if (blocked) {
      if (!unitBlockedAt(unit, nx, unit.z)) unit.x = nx;
      else if (!unitBlockedAt(unit, unit.x, nz)) unit.z = nz;
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
      if (unitIgnoresWalls(u) || !unitBlockedAt(u, nx, nz)) {
        u.x = nx;
        u.z = nz;
      }
    }
  }

  function nearestEnemy(from, radius, pred) {
    let best = null;
    let bestD = radius * radius;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (pred && !pred(e)) continue;
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

  function farmIncomePerSec() {
    let n = 0;
    let rate = 0;
    for (const b of state.buildings) {
      if (b.kind !== "farm" || b.hp <= 0) continue;
      rate += buildingStats("farm", b.level).goldPerSec * Math.pow(0.68, n);
      n += 1;
    }
    return rate;
  }

  function killBounty(kind) {
    const base = ENEMIES[kind]?.gold || 0;
    const w = state.wave || 1;
    const scale = w <= 2 ? 1 : w <= 4 ? 0.65 : w <= 6 ? 0.42 : w <= 8 ? 0.26 : 0.16;
    return base * scale;
  }

  function stepFarms(dt) {
    const income = farmIncomePerSec() * dt;
    if (income) addGold(income);
  }

  function faceToward(unit, target) {
    if (!target) return;
    unit.aimYaw = Math.atan2(target.x - unit.x, target.z - unit.z);
  }

  function towerCanTarget(kind, e) {
    const fly = Boolean(e.fly || ENEMIES[e.kind]?.fly);
    if (kind === "air") return fly;
    if (kind === "crossbow" || kind === "cannon") return !fly;
    return true;
  }

  function stepTowers(dt) {
    for (const b of state.buildings) {
      const def = buildingStats(b.kind, b.level);
      if (!def?.range) continue;
      const target = nearestEnemy(b, def.range * TILE, (e) => towerCanTarget(b.kind, e));
      if (target) faceToward(b, target);
      b.cooldown -= dt;
      if (b.cooldown > 0 || !target) continue;
      b.cooldown = def.fireRate;
      const yaw = b.aimYaw || 0;
      const muzzle = b.kind === "cannon" || b.kind === "air" ? 0.9 : b.kind === "mage" ? 0.45 : 0.7;
      const fly = Boolean(target.fly || ENEMIES[target.kind]?.fly);
      state.projectiles.push({
        id: uid(),
        x: b.x + Math.sin(yaw) * muzzle,
        z: b.z + Math.cos(yaw) * muzzle,
        tx: target.x,
        tz: target.z,
        target: target.id,
        damage: b.kind === "mage" && fly ? def.damage * 0.5 : def.damage,
        splash: def.splash || 0,
        slow: def.slow || 0,
        fx: def.projectile || "bolt",
        speed: def.speed,
        airOnly: b.kind === "air",
      });
      audio.shoot();
    }
  }

  function stepTraps(dt) {
    for (const b of state.buildings) {
      if (b.kind !== "spikes" || b.hp <= 0) continue;
      const r2 = TILE * 0.72 * TILE * 0.72;
      const dps = buildingStats("spikes", b.level).damagePerSec * dt;
      for (const e of state.enemies) {
        if (e.hp <= 0 || e.fly) continue;
        const dx = e.x - b.x;
        const dz = e.z - b.z;
        if (dx * dx + dz * dz <= r2) e.hp -= dps;
      }
    }
  }

  function stepWorkshop(dt) {
    for (const hall of state.buildings) {
      if (hall.kind !== "workshop" || hall.hp <= 0) continue;
      const def = buildingStats("workshop", hall.level);
      const reach = def.repairRange * TILE;
      const reach2 = reach * reach;
      const heal = def.repairPerSec * dt;
      for (const b of state.buildings) {
        if (b === hall || b.hp <= 0 || b.hp >= b.maxHp) continue;
        const dx = b.x - hall.x;
        const dz = b.z - hall.z;
        if (dx * dx + dz * dz <= reach2) {
          b.hp = Math.min(b.maxHp, b.hp + heal);
          if (b.kind === "keep") state.keepHp = b.hp;
        }
      }
    }
  }

  function stepStatus(dt) {
    for (const e of state.enemies) {
      if (e.slow > 0) e.slow -= dt;
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
            if (p.airOnly && !(e.fly || ENEMIES[e.kind]?.fly)) continue;
            e.hp -= p.damage;
            if (p.slow) e.slow = Math.max(e.slow || 0, p.slow);
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
      const def = troopDef(attacker.kind);
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
      const def = troopDef(t.kind);
      if (!def) continue;
      t.cooldown -= dt;
      const foe = nearestEnemy(t, def.aggro * TILE);
      if (foe) {
        faceToward(t, foe);
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
      t.aimYaw = null;
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
      const keepR = keepBuilding()?.radius ?? KEEP_RADIUS[0];
      const keepReach = def.range * TILE * 0.45 + keepR;
      if (kdx * kdx + kdz * kdz <= keepReach * keepReach) {
        faceToward(e, keep);
        if (e.cooldown <= 0) {
          const hit = def.keepDamage ?? def.damage;
          state.keepHp -= hit;
          const citadel = keepBuilding();
          if (citadel) citadel.hp = state.keepHp;
          e.cooldown = def.siege ? 1.05 : 0.9;
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
          faceToward(e, troop);
          attack(e, troop, def.damage);
          continue;
        }
      }

      const aerial = def.fly || def.climb;
      if (!aerial) {
        const hunt = def.siege ? TILE * 4.2 : TILE * 3.4;
        const wall = state.world.nearestWall(e.x, e.z, hunt);
        if (wall) {
          const blocker = buildings.get(wall.id);
          if (blocker && blocker.hp > 0) {
            const gap = distToSegment(e.x, e.z, wall.ax, wall.az, wall.bx, wall.bz) - WALL_HALF;
            const hit = closestOnSeg(e.x, e.z, wall.ax, wall.az, wall.bx, wall.bz);
            faceToward(e, hit);
            if (gap <= def.range * TILE + 0.28) {
              attack(e, blocker, def.wallDamage ?? def.damage);
              continue;
            }
            steerToward(e, hit, dt, def.speed);
            continue;
          }
        }
      }

      e.aimYaw = null;
      const flow = aerial ? null : state.world.flowAt(e.c, e.r);

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
        addGold(killBounty(e.kind));
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
        if (isFence(b.kind)) syncWalls();
      }
    }
  }

  function stepSpawns(dt) {
    if (state.phase !== "combat") return;
    state.waveTime += dt;
    while (state.spawnQueue.length) {
      if (state.enemies.length >= MAX_ENEMIES) break;
      const next = state.spawnQueue[0];
      const lane = next.lane ?? state.spawnLane;
      const boat = ensureBoat(lane);
      if (boat.phase === "arrive") break;
      const sinceLand = boat.t - BOAT_ARRIVE;
      if (next.t > sinceLand) break;
      if (spawnPack(next.type, next.count || 1, lane)) {
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
    setHint("Wave cleared");
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
    ui.endTitle.textContent = "The stronghold stands";
    ui.endBody.textContent = "Ten waves broke on the meadow.";
    audio.win();
    releaseLook();
    syncLookUi();
  }

  function lose() {
    state.phase = "lose";
    ui.end.hidden = false;
    ui.endKicker.textContent = "Defeat";
    ui.endTitle.textContent = "The stronghold fell";
    ui.endBody.textContent = "The next layout will be wiser.";
    audio.lose();
    releaseLook();
    syncLookUi();
  }

  let hintTimer = 0;
  function setHint(text) {
    if (!ui.hint) return;
    if (!text) {
      ui.hint.hidden = true;
      ui.hint.textContent = "";
      return;
    }
    ui.hint.hidden = false;
    ui.hint.textContent = text;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      ui.hint.hidden = true;
    }, 2200);
  }

  function selectedBuilding() {
    return state.buildings.find((b) => b.id === state.selected) || null;
  }

  function inspectMetaText(b) {
    const stats = buildingStats(b.kind, b.level);
    const lv = b.level || 0;
    let meta = `Lv ${lv} / ${UPGRADE_MAX} · HP ${Math.ceil(b.hp)} / ${b.maxHp}`;
    if (b.kind === "keep") meta += " · the island’s heart";
    if (isFence(b.kind)) {
      const n = wallGroupOf(b).length;
      if (b.kind === "gate") meta += " · on this wall";
      else meta += n > 1 ? ` · ${n} pieces` : " · wall piece";
    }
    if (stats.range) meta += ` · range ${stats.range}`;
    if (stats.damage) meta += ` · ${stats.damage} dmg`;
    if (b.kind === "air") meta += " · bats only";
    if (b.kind === "farm") {
      meta += ` · ${farmIncomePerSec().toFixed(1)}g/s from ${countKind("farm")}/${MAX_FARMS}`;
      meta += " · extra farms earn less";
    }
    if (b.kind === "mage") meta += ` · slows ${stats.slow.toFixed(1)}s`;
    if (b.kind === "spikes") meta += ` · ${stats.damagePerSec} dps underfoot`;
    if (b.kind === "workshop") meta += ` · repairs ${stats.repairPerSec}/s`;
    if (b.kind === "barracks") {
      meta += ` · Army ${Math.round(armyHousing())}/${armyCap()}`;
      const halls = allBarracks().length;
      if (halls > 1) meta += ` · ${halls} halls`;
      meta += ` · +${stats.housing} space`;
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
    for (const btn of ui.inspect.querySelectorAll("[data-upgrade]")) {
      const kind = btn.dataset.upgrade;
      const lv = troopLevel(kind);
      const cost = upgradeCost(kind);
      btn.disabled = lv >= UPGRADE_MAX || !canAfford(cost);
      btn.textContent = lv >= UPGRADE_MAX ? "Max" : `Upgrade ${cost}g`;
    }
    const b = selectedBuilding();
    if (b) ui.inspectMeta.textContent = inspectMetaText(b);
    const buildBtn = ui.inspect.querySelector("[data-upgrade-building]");
    if (buildBtn && b) {
      const lv = isFence(b.kind) ? Math.min(...wallGroupOf(b).map((item) => item.level || 0)) : b.level || 0;
      const cost = buildingUpgradeCost(b);
      buildBtn.disabled = lv >= UPGRADE_MAX || !canAfford(cost);
      if (lv >= UPGRADE_MAX) buildBtn.textContent = "Maxed";
      else if (b.kind === "keep") buildBtn.textContent = `Upgrade to ${KEEP_TITLES[lv + 1]} ${cost}g`;
      else if (isFence(b.kind)) {
        const n = wallGroupOf(b).length;
        buildBtn.textContent = n > 1 ? `Upgrade wall ${cost}g` : `Upgrade ${cost}g`;
      } else buildBtn.textContent = `Upgrade ${cost}g`;
    }
  }

  function troopPortrait(kind, level = 0) {
    return view.troopPortraits?.[`${kind}:${level}`] || view.troopPortraits?.[kind] || "";
  }

  function addBuildingUpgradeButton() {
    const b = selectedBuilding();
    if (!b) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "upgrade-building";
    btn.dataset.upgradeBuilding = "1";
    btn.addEventListener("click", () => upgradeBuilding());
    ui.inspectActions.appendChild(btn);
  }

  function renderInspect() {
    const b = selectedBuilding();
    ui.inspect.classList.toggle("barracks-menu", Boolean(b && (b.kind === "barracks" || b.kind === "workshop")));
    if (!b) {
      ui.inspect.hidden = true;
      return;
    }
    ui.inspect.hidden = false;
    ui.inspectTitle.textContent = buildingName(b.kind, b.level);
    ui.inspectMeta.textContent = inspectMetaText(b);
    ui.inspectActions.innerHTML = "";
    const hp = document.createElement("div");
    hp.className = "inspect-hp";
    hp.innerHTML = `<span>Health</span><div class="hp-track"><i style="width:${Math.max(0, (b.hp / b.maxHp) * 100)}%"></i></div>`;
    ui.inspectActions.appendChild(hp);
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
        icon.src = troopPortrait(kind, troopLevel(kind));
        const name = document.createElement("strong");
        name.textContent = def.name;
        const info = document.createElement("em");
        const lv = troopLevel(kind);
        info.textContent = `×${def.squad} · ${def.cost}g${lv ? ` · Lv ${lv}` : ""}`;
        card.append(icon, name, info);
        bindHoldTrain(card, kind);
        grid.appendChild(card);
      }
      ui.inspectActions.appendChild(grid);
      const rally = document.createElement("p");
      rally.textContent = "Click a troop to train it now. Hold to keep training. Build a workshop to upgrade them.";
      ui.inspectActions.appendChild(rally);
      refreshBarracksMenu();
    } else if (b.kind === "workshop") {
      const note = document.createElement("p");
      note.textContent = "Repairs nearby walls and towers. Upgrade a troop type for the whole army — they gain armor and better gear.";
      ui.inspectActions.appendChild(note);
      const grid = document.createElement("div");
      grid.className = "troop-grid";
      for (const kind of TROOP_ORDER) {
        const def = TROOPS[kind];
        const card = document.createElement("div");
        card.className = "troop-card upgrade-card";
        const icon = document.createElement("img");
        icon.className = "troop-icon";
        icon.alt = "";
        icon.draggable = false;
        icon.src = troopPortrait(kind, troopLevel(kind));
        const name = document.createElement("strong");
        name.textContent = def.name;
        const info = document.createElement("em");
        info.textContent = `Lv ${troopLevel(kind)} / ${UPGRADE_MAX}`;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.upgrade = kind;
        btn.textContent = "Upgrade";
        btn.addEventListener("click", () => upgradeTroop(kind));
        card.append(icon, name, info, btn);
        grid.appendChild(card);
      }
      ui.inspectActions.appendChild(grid);
      refreshBarracksMenu();
    }
    addBuildingUpgradeButton();
    if (b.kind !== "keep") {
      const sell = document.createElement("button");
      sell.textContent = `Sell (+${b.cost ?? BUILDINGS[b.kind].cost}g)`;
      sell.addEventListener("click", sellSelected);
      ui.inspectActions.appendChild(sell);
    }
    refreshBarracksMenu();
  }

  function syncHud() {
    ui.gold.textContent = admin ? "∞" : String(Math.floor(state.gold));
    ui.goldCap.textContent = admin ? "admin" : state.phase === "prep" ? `cap ${PREP_GOLD_CAP}` : "";
    ui.gold.closest(".meter")?.classList.toggle("admin", admin);
    ui.wave.textContent = state.phase === "prep" || state.phase === "menu" ? "—" : `${state.wave} / ${WAVE_COUNT}`;
    ui.keepHp.textContent = String(Math.max(0, Math.ceil(state.keepHp)));
    ui.keepFill.style.width = `${Math.max(0, (state.keepHp / keepMaxHp()) * 100)}%`;
    if (ui.army) ui.army.textContent = `${Math.round(armyHousing())}/${armyCap()}`;
    if (ui.armyFill) {
      const cap = Math.max(1, armyCap());
      ui.armyFill.style.width = `${Math.min(100, (armyHousing() / cap) * 100)}%`;
    }
    ui.btnMute.textContent = audio.isMuted() ? "Unmute" : "Mute";
    syncHotbar();
    syncAimTool();
    view.setAtmosphere?.({ wave: state.wave, phase: state.phase });
  }

  const HOTBAR_LABEL = {
    wall: "Wall",
    gate: "Gate",
    crossbow: "Crossbow",
    cannon: "Cannon",
    mage: "Mage",
    air: "Air",
    spikes: "Spikes",
    farm: "Farm",
    barracks: "Barracks",
    workshop: "Workshop",
  };

  function ensureHotbar() {
    if (!ui.hotbar || ui.hotbar.childElementCount) return;
    HOTBAR.forEach((kind, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.kind = kind;
      const key = document.createElement("kbd");
      key.textContent = String(i === 9 ? 0 : i + 1);
      const name = document.createElement("strong");
      name.textContent = HOTBAR_LABEL[kind] || BUILDINGS[kind].name;
      const cost = document.createElement("em");
      btn.append(key, name, cost);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTool(kind);
      });
      ui.hotbar.appendChild(btn);
    });
  }

  function syncHotbar() {
    ensureHotbar();
    if (!ui.hotbar) return;
    for (const btn of ui.hotbar.children) {
      const kind = btn.dataset.kind;
      const def = BUILDINGS[kind];
      const cost = btn.querySelector("em");
      if (kind === "farm") cost.textContent = `${def.cost}g · ${countKind("farm")}/${MAX_FARMS}`;
      else if (def.draw) cost.textContent = `${def.cost}g+`;
      else cost.textContent = `${def.cost}g`;
      btn.classList.toggle("on", state.tool === kind);
      btn.classList.toggle("bad", Boolean(def && !canAfford(def.cost)));
    }
  }
  function syncAimTool() {
    const el = ui.aimTool;
    if (!el) return;
    if (!state.tool) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const def = BUILDINGS[state.tool];
    const idx = HOTBAR.indexOf(state.tool);
    const slot = idx === 9 ? 0 : idx + 1;
    let cost = def.draw ? `${def.cost}g+` : `${def.cost}g`;
    if (state.tool === "farm") cost = `${def.cost}g · ${countKind("farm")}/${MAX_FARMS}`;
    if (gateMode()) {
      el.hidden = false;
      el.textContent = `${slot}  Gate  ·  ${BUILDINGS.gate.cost}g  ·  G`;
      el.classList.toggle("bad", !canAfford(BUILDINGS.gate.cost));
      return;
    }
    el.hidden = false;
    el.textContent = `${slot}  ${def.name}  ·  ${cost}${state.tool === "wall" ? "  ·  G gate" : ""}`;
    el.classList.toggle("bad", Boolean(def && !def.draw && !canAfford(def.cost) && state.tool !== "farm"));
  }

  function rangeInfo() {
    if (isFence(state.tool)) return null;
    const ghost = state.tool && BUILDINGS[state.tool]?.range && state.pointer;
    if (ghost) {
      return { x: state.pointer.x, z: state.pointer.z, radius: BUILDINGS[state.tool].range * TILE };
    }
    const b = selectedBuilding();
    if (b && BUILDINGS[b.kind]?.range) {
      const stats = buildingStats(b.kind, b.level);
      return { x: b.x, z: b.z, radius: stats.range * TILE };
    }
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
      showGrid: false,
      hoverTile: null,
      ghost: playing() ? ghostPreview() : null,
      range: playing() ? rangeInfo() : null,
      boats: boatViewList(),
      atmosphere: { wave: state.wave, phase: state.phase },
      keepHp: state.keepHp,
      keepMax: keepMaxHp(),
    };
  }

  function ghostPreview() {
    if (gateMode()) {
      const p = state.pointer;
      if (!p) return null;
      const plan = planGateAt(p.x, p.z);
      if (plan.reason === "nowall") return null;
      return {
        kind: "gate",
        mode: "insert",
        ax: plan.ax,
        az: plan.az,
        bx: plan.bx,
        bz: plan.bz,
        yaw: plan.yaw,
        ok: plan.ok,
        cost: plan.cost,
        level: plan.level || 0,
      };
    }
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
      const plan = planWall(state.wallDraft.x, state.wallDraft.z, end.x, end.z, "wall");
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
    if (!state.tool || !state.pointer) return null;
    return {
      kind: state.tool,
      tilesW: 1,
      tilesH: 1,
      center: { x: state.pointer.x, z: state.pointer.z },
      ok: canPlaceAt(state.tool, state.pointer.x, state.pointer.z),
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
    if (isKeepTile(tile.c, tile.r)) {
      openKeepInspect();
      return;
    }
    const b = pickBuilding(box.ax, box.az);
    if (b) {
      state.selected = b.id;
      renderInspect();
      return;
    }
    const selected = selectedBuilding();
    if (selected?.kind === "barracks" && !isKeepTile(tile.c, tile.r) && !isSpawnTile(tile.c, tile.r)) {
      selected.rally = { c: tile.c, r: tile.r, x: box.ax, z: box.az };
      setHint("Rally set.");
      return;
    }
    state.selected = null;
    renderInspect();
  }

  function onPointerMove() {
    if (document.pointerLockElement === canvas) return;
  }

  function onPointerDown(e) {
    if (state.phase === "menu" || state.phase === "win" || state.phase === "lose" || settingsOpen()) return;
    if (e.button === 2) {
      if (state.wallDraft) {
        state.wallDraft = null;
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
    const g = aimPoint(e);
    if (g && !state.tool && !gateMode()) {
      const tile = worldToTile(g.x, g.z);
      const hit = pickBuilding(g.x, g.z);
      if (hit?.kind === "keep" || isKeepTile(tile.c, tile.r)) {
        openKeepInspect();
        grabLook();
        return;
      }
    }
    if (!grabLook()) return;
    const spot = view.lookGround() || g;
    if (!spot) return;
    const tile = worldToTile(spot.x, spot.z);
    if (!inBounds(tile.c, tile.r)) return;

    if (gateMode()) {
      if (!placeGateAt(spot.x, spot.z)) {
        const plan = planGateAt(spot.x, spot.z);
        if (plan.reason === "short") setHint("Wall too short for a gate.");
        else if (plan.reason === "overlap") setHint("That stretch already has a gate.");
        else if (plan.reason === "gold") setHint(`Need ${plan.cost}g for a gate.`);
        else setHint("Aim at a wall to place a gate.");
      }
      renderInspect();
      syncHud();
      return;
    }

    if (state.tool === "wall") {
      if (!state.wallDraft) {
        const start = snapToWallTip(spot.x, spot.z);
        if (!start.snapped && !canWallPoint(start.x, start.z)) {
          setHint("Need open grass, or snap to a wall end.");
          return;
        }
        state.wallDraft = { x: start.x, z: start.z, snapped: start.snapped };
        return;
      }
      const end = snapToWallTip(spot.x, spot.z, state.wallDraft);
      const placed = placeWall(state.wallDraft.x, state.wallDraft.z, end.x, end.z, "wall");
      if (placed) {
        state.wallDraft = null;
      } else {
        const plan = planWall(state.wallDraft.x, state.wallDraft.z, end.x, end.z, "wall");
        setHint(plan.reason === "gold" ? `Need ${plan.cost}g.` : "That stretch is blocked.");
      }
      renderInspect();
      syncHud();
      return;
    }

    if (state.tool) {
      if (!placeBuilding(state.tool, spot.x, spot.z)) {
        const def = BUILDINGS[state.tool];
        if (state.tool === "farm" && countKind("farm") >= MAX_FARMS) {
          /* toasted in placeBuilding */
        } else if (def && !canAfford(def.cost)) setHint(`Need ${def.cost}g.`);
        else setHint("Needs open grass.");
      }
      renderInspect();
      syncHud();
      return;
    }

        state.marquee = { ax: spot.x, az: spot.z, bx: spot.x, bz: spot.z, add: e.ctrlKey || e.metaKey };
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
    renderInspect();
    syncHud();
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("keydown", (e) => {
    if (settingsOpen()) {
      if (e.code === "Escape") closeSettings();
      return;
    }
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
    if (playing() && e.code === "KeyG") {
      e.preventDefault();
      if (state.tool !== "wall") {
        setTool("wall", false);
        state.wallMode = "gate";
      } else {
        state.wallMode = state.wallMode === "gate" ? "draw" : "gate";
      }
      state.wallDraft = null;
      syncHud();
      return;
    }
    if (playing() && e.code === "KeyQ") {
      if (state.tool) {
        setTool(null, false);
        return;
      }
      state.picked.clear();
      state.marquee = null;
      return;
    }
    if (playing() && (/^Digit[0-9]$/.test(e.code))) {
      e.preventDefault();
      const n = Number(e.code.slice(5));
      const slot = n === 0 ? 9 : n - 1;
      if (HOTBAR[slot]) setTool(HOTBAR[slot], false);
      return;
    }
    if (e.code === "Escape") {
      if (document.pointerLockElement === canvas) {
        releaseLook();
        return;
      }
      if (performance.now() - unlockGuard < 250) return;
      if (state.wallDraft) {
        state.wallDraft = null;
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
    grabLook();
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
  ui.btnSettings?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (settingsOpen()) closeSettings();
    else openSettings();
  });
  ui.btnSettingsClose?.addEventListener("click", () => closeSettings());
  ui.settings?.addEventListener("click", (e) => {
    if (e.target === ui.settings) closeSettings();
  });
  ui.keepMeter?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openKeepInspect();
  });

  let last = performance.now();
  let hudAge = 0;
  let shotFreeze = false;
  function frame(now) {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const blocked = state.phase === "menu" || state.phase === "win" || state.phase === "lose";
    if (!blocked && !shotFreeze) {
      if (state.phase === "prep" || state.phase === "combat" || state.phase === "between") {
        stepFarms(dt);
        stepTowers(dt);
        stepTraps(dt);
        stepWorkshop(dt);
        stepStatus(dt);
        stepProjectiles(dt);
        stepTroops(dt);
        stepEnemies(dt);
        sweepDead();
        stepBoats(dt);
        if (state.keepHp <= 0 && state.phase !== "lose") lose();
        else if (state.phase === "combat") stepSpawns(dt);
        else if (state.phase === "between") stepBetween(dt);
      }
    }
    view.updateCamera(dt, blocked || shotFreeze);
    if (!blocked && playing()) {
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
        refreshBarracksMenu();
      }
    }
    requestAnimationFrame(frame);
  }

  occupyKeep();
  syncHud();
  requestAnimationFrame(frame);
  setupShot();

  return { reset };

  function setupShot() {
    const shot = new URLSearchParams(window.location.search).get("shot");
    if (!shot) return;
    admin = true;
    play();
    if (ui.lookPrompt) ui.lookPrompt.hidden = true;
    const kc = KEEP_TILES[0][0];
    const kr = KEEP_TILES[0][1];
    const tryPlace = (kind, c, r) => {
      const p = tileCenter(c, r);
      return placeBuilding(kind, p.x, p.z);
    };
    let hall = null;
    if (shot !== "island") {
      tryPlace("farm", kc + 4, kr);
      tryPlace("farm", kc + 5, kr + 1);
      tryPlace("barracks", kc - 4, kr);
      tryPlace("workshop", kc + 4, kr + 4);
      tryPlace("crossbow", kc - 1, kr - 4);
      tryPlace("cannon", kc + 3, kr - 4);
      tryPlace("mage", kc - 4, kr - 3);
      tryPlace("air", kc + 5, kr - 3);
      tryPlace("spikes", kc + 1, kr - 5);
      const wallLine = (c0, r0, c1, r1) => {
        const a = tileCenter(c0, r0);
        const b = tileCenter(c1, r1);
        placeWall(a.x, a.z, b.x, b.z);
      };
      wallLine(kc - 3, kr + 6, kc + 6, kr + 6);
      wallLine(kc - 5, kr - 2, kc - 5, kr + 4);
      const mid = tileCenter(kc + 1, kr + 6);
      placeGateAt(mid.x, mid.z);
      hall = state.buildings.find((b) => b.kind === "barracks");
      if (hall) {
        trainTroop("spearman");
        trainTroop("knight");
        trainTroop("slinger");
        trainTroop("raider");
      }
    }
    const keep = keepCenter();
    const look = (dist, height, pitch, fov = 48) => {
      view.setCamera({ x: keep.x, y: height, z: keep.z + dist, yaw: Math.PI, pitch, fov });
    };
    document.documentElement.dataset.shot = shot;
    shotFreeze = true;
    if (shot === "island") {
      state.selected = null;
      renderInspect();
      look(12, 360, 1.4, 58);
    } else if (shot === "build") {
      state.selected = null;
      renderInspect();
      look(13, 12, 0.62, 48);
    } else if (shot === "army") {
      if (hall) {
        state.selected = hall.id;
        renderInspect();
      }
      look(12, 11, 0.58, 48);
    } else if (shot === "combat") {
      state.selected = null;
      renderInspect();
      const kinds = ["goblin", "goblin", "runner", "brute", "archer", "bat", "climber", "ram"];
      for (let i = 0; i < 40; i += 1) {
        const type = kinds[i % kinds.length];
        const def = ENEMIES[type];
        const x = keep.x - 4.4 + (i % 8) * 1.1;
        const z = keep.z + 5.6 + Math.floor(i / 8) * 1.05;
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
          slow: 0,
          fly: Boolean(def.fly),
          ox: 0,
          oz: 0,
        });
      }
      look(14, 12.5, 0.65, 48);
    } else if (shot === "wave" || shot === "storm") {
      state.selected = null;
      renderInspect();
      startWaves();
      if (shot === "storm") beginWave(9);
      shotFreeze = false;
      const origin = SPAWN_TILES[0];
      const shore = tileCenter(origin[0], origin[1]);
      const home = keepCenter();
      let fx = home.x - shore.x;
      let fz = home.z - shore.z;
      const fl = Math.hypot(fx, fz) || 1;
      fx /= fl;
      fz /= fl;
      const rx = -fz;
      const rz = fx;
      if (shot === "storm") {
        look(24, 32, 0.88, 52);
      } else {
        view.setCamera({
          x: shore.x + fx * 16,
          y: 7,
          z: shore.z + fz * 16,
          yaw: Math.atan2(fx, -fz),
          pitch: 0.18,
          fov: 52,
        });
      }
    } else {
      state.selected = null;
      renderInspect();
      look(14, 14, 0.78, 50);
    }
    syncHud();
  }
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
  keepMeter: document.getElementById("keep-meter"),
  army: document.getElementById("army"),
  armyFill: document.getElementById("army-fill"),
  btnPlay: document.getElementById("btn-play"),
  btnStart: document.getElementById("btn-start"),
  btnRestart: document.getElementById("btn-restart"),
  btnMute: document.getElementById("btn-mute"),
  btnSettings: document.getElementById("btn-settings"),
  btnSettingsClose: document.getElementById("btn-settings-close"),
  settings: document.getElementById("settings"),
  inspect: document.getElementById("inspect"),
  inspectTitle: document.getElementById("inspect-title"),
  inspectMeta: document.getElementById("inspect-meta"),
  inspectActions: document.getElementById("inspect-actions"),
  endKicker: document.getElementById("end-kicker"),
  endTitle: document.getElementById("end-title"),
  endBody: document.getElementById("end-body"),
  crosshair: document.getElementById("crosshair"),
  aimTool: document.getElementById("aim-tool"),
  lookPrompt: document.getElementById("look-prompt"),
  hotbar: document.getElementById("hotbar"),
});

document.documentElement.dataset.gk = "ready";
void game;
