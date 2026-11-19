const MACRO = 12;
const WING = 3;
const TILE = 2.4;
const FILLET_MAX = 2.2;
const FILLET_MARGIN = 0.55;
const FILLET_JAMB = 0.4;

export const POOL_MACRO = MACRO;
export const POOL_PILLAR_R = 0.5;
export const POOL_WALL_T = 0.22;
export const POOL_ARC_SEGS = 14;
export const OCULUS_THETA = 0.115;

export function oculusRim(rad, domeY) {
  return {
    r: rad * Math.sin(OCULUS_THETA),
    y: domeY + rad * Math.cos(OCULUS_THETA),
  };
}

export function vaultMetrics(prof) {
  if (!prof?.vault) return null;
  const rad = Math.min(prof.X1 - prof.X0, prof.Z1 - prof.Z0) * 0.42;
  const domeY = prof.h - rad * 0.12;
  return { rad, domeY, rim: oculusRim(rad, domeY) };
}

export function spiralTopY(prof) {
  const v = vaultMetrics(prof);
  if (v) {
    const horiz = POOL_PILLAR_R + 0.62;
    const ceil = v.domeY + Math.sqrt(Math.max(0.04, v.rad * v.rad - horiz * horiz)) - 0.14;
    return Math.max(prof.h - 0.2, ceil - 1.72);
  }
  return prof.h - 0.45;
}

export function spiralLayout(prof) {
  if (!prof?.spiral) return null;
  const midX = (prof.X0 + prof.X1) * 0.5;
  const midZ = (prof.Z0 + prof.Z1) * 0.5;
  const top = spiralTopY(prof);
  const n = Math.max(28, Math.round(top / 0.19));
  const thick = 0.1;
  const rise = Math.max(0.16, (top - 0.12) / (n - 1));
  const rad = POOL_PILLAR_R + 0.62;
  const turns = Math.max(1.35, top / 3.15);
  const hw = 0.5;
  const hd = 0.4;
  const steps = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const ang = t * Math.PI * 2 * turns;
    const yMid = 0.05 + thick * 0.5 + i * rise;
    const last = i >= n - 2;
    steps.push({
      x: midX + Math.cos(ang) * rad,
      z: midZ + Math.sin(ang) * rad,
      y: yMid,
      top: yMid + thick * 0.5,
      ang,
      hw: last ? 0.62 : hw,
      hd: last ? 0.55 : hd,
      thick,
    });
  }
  const v = vaultMetrics(prof);
  const pillarH = v ? v.rim.y + 0.04 : top + 0.55;
  return { midX, midZ, rad, n, rise, turns, steps, pillarR: POOL_PILLAR_R, pillarH, top };
}

export function onSpiralStep(px, pz, step, pad = 0.05) {
  const dx = px - step.x;
  const dz = pz - step.z;
  const lx = dx * Math.cos(step.ang) + dz * Math.sin(step.ang);
  const lz = -dx * Math.sin(step.ang) + dz * Math.cos(step.ang);
  return Math.abs(lx) < step.hw + pad && Math.abs(lz) < step.hd + pad;
}

export function nearbyProfile(seed, extra, x, z) {
  const mx = Math.floor(x / (TILE * MACRO));
  const mz = Math.floor(z / (TILE * MACRO));
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const p = roomProfile(seed, extra, mx + dx, mz + dz);
      if (x >= p.X0 - 1 && x <= p.X1 + 1 && z >= p.Z0 - 1 && z <= p.Z1 + 1) return p;
    }
  }
  return roomProfile(seed, extra, mx, mz);
}

const BIOMES = {
  classic: { ceiling: 4.05, water: "organic", pad: 1, expand: false, light: "bright", pillars: "center", islands: true, ladders: true },
  drained: { ceiling: 4.4, water: "none", expand: false, light: "bright", pillars: "none" },
  service: { ceiling: 3.55, water: "organic", pad: 1, expand: false, light: "dark", pillars: "square" },
  gallery: { ceiling: 6.2, water: "organic", pad: 1, expand: true, light: "bright", pillars: "center", arches: true, ladders: true },
  channel: { ceiling: 3.7, water: "strip", pad: 0, expand: false, light: "bright", pillars: "square" },
  court: { ceiling: 4.9, water: "organic", pad: 1, expand: true, light: "bright", pillars: "grid", islands: true, arches: true },
  atrium: { ceiling: 7.4, water: "organic", pad: 1, expand: true, light: "bright", pillars: "center", arches: true, spiral: true, vault: true },
  leisure: { ceiling: 5.2, water: "spa", pad: 1, expand: true, light: "dark", pillars: "none", spa: true },
};

const BIOME_BANDS = [
  "service",
  "channel",
  "classic",
  "classic",
  "classic",
  "leisure",
  "drained",
  "court",
  "gallery",
  "atrium",
];

function hashU32(seed, x, z) {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ Math.imul(z | 0, 1274126177), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

function rand01(seed, x, z) {
  return hashU32(seed, x, z) / 4294967296;
}

function parentWest(seed, x, z) {
  return (hashU32(seed, x + 19, z - 7) & 1) === 0;
}

function mazeOpenEast(seed, x, z, extra) {
  return parentWest(seed, x + 1, z) || rand01(seed, x * 3 + 11, z * 5) < extra;
}

function mazeOpenNorth(seed, x, z, extra) {
  return !parentWest(seed, x, z + 1) || rand01(seed, x * 7 - 3, z * 2 + 17) < extra;
}

function floorDiv(n, d) {
  return Math.floor(n / d);
}

function posMod(n, d) {
  return ((n % d) + d) % d;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(seed, x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const v00 = rand01(seed, x0, z0);
  const v10 = rand01(seed, x0 + 1, z0);
  const v01 = rand01(seed, x0, z0 + 1);
  const v11 = rand01(seed, x0 + 1, z0 + 1);
  const sx = fade(fx);
  const sz = fade(fz);
  return v00 * (1 - sx) * (1 - sz) + v10 * sx * (1 - sz) + v01 * (1 - sx) * sz + v11 * sx * sz;
}

function biomeId(seed, mx, mz) {
  const r = valueNoise(seed + 77, mx / WING, mz / WING);
  const idx = Math.round(r * (BIOME_BANDS.length - 1));
  return BIOME_BANDS[idx];
}

function opening(seed, extra, mx, mz, axis) {
  let open =
    axis === "e"
      ? mazeOpenEast(seed + 3, mx, mz, extra + 0.28)
      : mazeOpenNorth(seed + 3, mx, mz, extra + 0.28);
  const a = biomeId(seed, mx, mz);
  const b = axis === "e" ? biomeId(seed, mx + 1, mz) : biomeId(seed, mx, mz + 1);
  const hall = (a === "gallery" || a === "court") && a === b;
  if (hall && a === "gallery") open = true;
  if (!open) return null;
  if (hall) {
    const h = axis === "e" ? hashU32(seed + 19, 901, mz) : hashU32(seed + 23, mx, 901);
    const width = 2;
    const minStart = 2;
    const maxStart = MACRO - 1 - width;
    const start = minStart + ((h >>> 8) % Math.max(1, maxStart - minStart + 1));
    return { start, end: start + width };
  }
  const h = hashU32(seed + (axis === "e" ? 19 : 23), mx, mz);
  const width = 1 + (h % 3);
  const minStart = 1;
  const maxStart = MACRO - 1 - width;
  const start = minStart + ((h >>> 8) % Math.max(1, maxStart - minStart + 1));
  return { start, end: start + width };
}

const roomCache = new Map();
const ROOM_CACHE_MAX = 512;
const profileCache = new Map();
const PROFILE_CACHE_MAX = 512;

function roomAt(seed, extra, mx, mz) {
  const key = `${seed}:${extra}:${mx}:${mz}`;
  const hit = roomCache.get(key);
  if (hit) return hit;

  const biome = biomeId(seed, mx, mz);
  const spec = BIOMES[biome];
  const e = opening(seed, extra, mx, mz, "e");
  const w = opening(seed, extra, mx - 1, mz, "e");
  const n = opening(seed, extra, mx, mz, "n");
  const s = opening(seed, extra, mx, mz - 1, "n");

  const h = hashU32(seed + 5, mx, mz);
  let x0 = 1 + (h % 3);
  let z0 = 1 + ((h >>> 3) % 3);
  let x1 = MACRO - (1 + ((h >>> 6) % 3));
  let z1 = MACRO - (1 + ((h >>> 9) % 3));
  if (spec.expand) {
    x0 = 1;
    z0 = 1;
    x1 = MACRO - 1;
    z1 = MACRO - 1;
  }

  const coverZ = (band) => {
    if (!band) return;
    z0 = Math.min(z0, band.start);
    z1 = Math.max(z1, band.end);
  };
  const coverX = (band) => {
    if (!band) return;
    x0 = Math.min(x0, band.start);
    x1 = Math.max(x1, band.end);
  };
  coverZ(e);
  coverZ(w);
  coverX(n);
  coverX(s);

  x0 = Math.max(1, x0);
  z0 = Math.max(1, z0);
  x1 = Math.min(MACRO - 1, x1);
  z1 = Math.min(MACRO - 1, z1);
  if (x1 < x0 + 4) x1 = Math.min(MACRO - 1, x0 + 4);
  if (z1 < z0 + 4) z1 = Math.min(MACRO - 1, z0 + 4);

  let pad = spec.pad != null ? spec.pad : 1 + ((h >>> 12) % 2);
  let wx0 = x0 + pad;
  let wz0 = z0 + pad;
  let wx1 = x1 - pad;
  let wz1 = z1 - pad;
  let hasWater = spec.water !== "none" && wx1 - wx0 >= 2 && wz1 - wz0 >= 2;
  let spaR = 0;

  if (hasWater && spec.water === "strip") {
    const alongX = ((h >>> 14) & 1) === 0;
    if (alongX) {
      const mid = (z0 + z1) >> 1;
      wz0 = Math.max(z0, mid - 1);
      wz1 = Math.min(z1, mid + 2);
      wx0 = x0;
      wx1 = x1;
    } else {
      const mid = (x0 + x1) >> 1;
      wx0 = Math.max(x0, mid - 1);
      wx1 = Math.min(x1, mid + 2);
      wz0 = z0;
      wz1 = z1;
    }
    hasWater = wx1 - wx0 >= 2 && wz1 - wz0 >= 2;
  }

  if (hasWater && spec.water === "spa") {
    const cx = (x0 + x1) >> 1;
    const cz = (z0 + z1) >> 1;
    spaR = Math.max(2, Math.min(cx - x0, x1 - cx, cz - z0, z1 - cz) - 1);
    wx0 = cx - spaR;
    wx1 = cx + spaR;
    wz0 = cz - spaR;
    wz1 = cz + spaR;
    hasWater = spaR >= 2;
  }

  if (!hasWater) {
    wx0 = wx1 = wz0 = wz1 = 0;
    spaR = 0;
  }

  let island = null;
  if (hasWater && spec.islands && wx1 - wx0 >= 5 && wz1 - wz0 >= 5 && rand01(seed, mx + 21, mz - 8) < 0.75) {
    const iw = 2 + ((h >>> 16) & 1);
    const ih = 2 + ((h >>> 18) & 1);
    const ix0 = wx0 + 1 + ((h >>> 8) % Math.max(1, wx1 - wx0 - iw - 2));
    const iz0 = wz0 + 1 + ((h >>> 12) % Math.max(1, wz1 - wz0 - ih - 2));
    island = { x0: ix0, z0: iz0, x1: ix0 + iw, z1: iz0 + ih };
  }

  const onOpening = (lx, lz) =>
    (e && lx === x1 - 1 && lz >= e.start && lz < e.end) ||
    (w && lx === x0 && lz >= w.start && lz < w.end) ||
    (n && lz === z1 - 1 && lx >= n.start && lx < n.end) ||
    (s && lz === z0 && lx >= s.start && lx < s.end);

  const accent = rand01(seed, mx + 9, mz - 4);
  let stairs = null;
  let chute = null;
  let spiral = false;
  let oculus = false;
  if (spec.spiral && accent < 0.72) {
    spiral = true;
    oculus = true;
  } else if (accent < 0.2 && biome !== "channel" && biome !== "leisure") {
    const faces = [
      { face: "n", lx: (x0 + x1) >> 1, lz: z1 - 1 },
      { face: "s", lx: (x0 + x1) >> 1, lz: z0 },
      { face: "e", lx: x1 - 1, lz: (z0 + z1) >> 1 },
      { face: "w", lx: x0, lz: (z0 + z1) >> 1 },
    ];
    const pick = faces[h % 4];
    const onWater =
      hasWater && pick.lx >= wx0 && pick.lx < wx1 && pick.lz >= wz0 && pick.lz < wz1;
    if (!onWater && !onOpening(pick.lx, pick.lz)) {
      if (biome === "drained" || accent > 0.12) chute = pick;
      else stairs = pick;
    }
  }

  const alcoves = [];
  if (biome !== "channel" && biome !== "service" && rand01(seed, mx + 11, mz - 3) < 0.52) {
    const cands = [];
    const push = (face, lx, lz, along, end0, end1, openAlong) => {
      if (lx < 0 || lz < 0 || lx >= MACRO || lz >= MACRO) return;
      if (along <= end0 + 1 || along >= end1 - 2) return;
      if (openAlong) return;
      cands.push({ face, lx, lz });
    };
    for (let lx = x0 + 2; lx < x1 - 2; lx++) {
      push("s", lx, z0 - 1, lx, x0, x1, onOpening(lx, z0));
      push("n", lx, z1, lx, x0, x1, onOpening(lx, z1 - 1));
    }
    for (let lz = z0 + 2; lz < z1 - 2; lz++) {
      push("e", x1, lz, lz, z0, z1, onOpening(x1 - 1, lz));
      push("w", x0 - 1, lz, lz, z0, z1, onOpening(x0, lz));
    }
    const nWant = rand01(seed, mx - 8, mz + 5) < 0.28 ? 2 : 1;
    for (let i = 0; i < cands.length && alcoves.length < nWant; i++) {
      const pick = cands[(h + i * 17) % cands.length];
      if (alcoves.some((a) => a.face === pick.face && Math.abs((a.lx === pick.lx ? a.lz : a.lx) - (pick.face === "s" || pick.face === "n" ? pick.lx : pick.lz)) < 2))
        continue;
      alcoves.push(pick);
    }
  }

  let tube = null;
  if (biome === "channel") {
    const opts = [];
    if (e) opts.push({ dir: "e", axis: "x", span: e.end - e.start });
    if (w) opts.push({ dir: "w", axis: "x", span: w.end - w.start });
    if (n) opts.push({ dir: "n", axis: "z", span: n.end - n.start });
    if (s) opts.push({ dir: "s", axis: "z", span: s.end - s.start });
    if (opts.length) {
      opts.sort((a, b) => b.span - a.span);
      tube = opts[0];
    }
  }

  const room = {
    biome,
    spec,
    x0,
    z0,
    x1,
    z1,
    e,
    w,
    n,
    s,
    hasWater,
    wx0,
    wz0,
    wx1,
    wz1,
    h,
    stairs,
    chute,
    tube,
    island,
    spaR,
    spiral,
    oculus,
    arches: !!spec.arches,
    vault: !!spec.vault,
    ladders: !!spec.ladders,
    alcoves,
    wet: null,
  };
  room.wet = buildWaterMask(seed, mx, mz, room);
  roomCache.set(key, room);
  if (roomCache.size > ROOM_CACHE_MAX) {
    roomCache.delete(roomCache.keys().next().value);
  }
  return room;
}

function inAlcove(lx, lz, room) {
  const list = room.alcoves;
  if (!list) return false;
  for (const a of list) {
    if (a.lx === lx && a.lz === lz) return true;
  }
  return false;
}

function inRoom(lx, lz, room) {
  return (lx >= room.x0 && lx < room.x1 && lz >= room.z0 && lz < room.z1) || inAlcove(lx, lz, room);
}

function inCorr(lx, lz, room) {
  if (room.e && lx >= room.x1 && lz >= Math.max(room.e.start, room.z0) && lz < Math.min(room.e.end, room.z1)) return true;
  if (room.w && lx < room.x0 && lz >= Math.max(room.w.start, room.z0) && lz < Math.min(room.w.end, room.z1)) return true;
  if (room.n && lz >= room.z1 && lx >= Math.max(room.n.start, room.x0) && lx < Math.min(room.n.end, room.x1)) return true;
  if (room.s && lz < room.z0 && lx >= Math.max(room.s.start, room.x0) && lx < Math.min(room.s.end, room.x1)) return true;
  return false;
}

function onRoomOpening(room, lx, lz) {
  return (
    (room.e && lx === room.x1 - 1 && lz >= room.e.start && lz < room.e.end) ||
    (room.w && lx === room.x0 && lz >= room.w.start && lz < room.w.end) ||
    (room.n && lz === room.z1 - 1 && lx >= room.n.start && lx < room.n.end) ||
    (room.s && lz === room.z0 && lx >= room.s.start && lx < room.s.end)
  );
}

function inIsland(lx, lz, room) {
  const i = room.island;
  return !!(i && lx >= i.x0 && lx < i.x1 && lz >= i.z0 && lz < i.z1);
}

function buildWaterMask(seed, mx, mz, room) {
  const wet = new Set();
  if (!room.hasWater) return wet;
  const key = (lx, lz) => `${lx},${lz}`;
  const add = (lx, lz) => wet.add(key(lx, lz));
  const has = (lx, lz) => wet.has(key(lx, lz));
  const inner = (lx, lz) =>
    lx >= room.wx0 && lx < room.wx1 && lz >= room.wz0 && lz < room.wz1 && !inIsland(lx, lz, room) && !onRoomOpening(room, lx, lz);
  const inBounds = (lx, lz) =>
    lx >= room.x0 && lx < room.x1 && lz >= room.z0 && lz < room.z1 && !onRoomOpening(room, lx, lz) && !inAlcove(lx, lz, room);

  if (room.spaR) {
    const cx = (room.wx0 + room.wx1) * 0.5;
    const cz = (room.wz0 + room.wz1) * 0.5;
    for (let lx = room.x0; lx < room.x1; lx++) {
      for (let lz = room.z0; lz < room.z1; lz++) {
        if (!inBounds(lx, lz)) continue;
        if (Math.hypot(lx + 0.5 - cx, lz + 0.5 - cz) < room.spaR) add(lx, lz);
      }
    }
    return wet;
  }

  const carve = room.spec.water === "strip" ? 0.9 : 0.76;
  const bleed = room.spec.water === "strip" ? 0.08 : 0.2;
  for (let lx = room.x0; lx < room.x1; lx++) {
    for (let lz = room.z0; lz < room.z1; lz++) {
      if (!inBounds(lx, lz) || inIsland(lx, lz, room)) continue;
      const n = valueNoise(seed + 91, (mx * MACRO + lx) * 0.33, (mz * MACRO + lz) * 0.33);
      if (inner(lx, lz) && n < carve) add(lx, lz);
      else if (!inner(lx, lz) && n < bleed) add(lx, lz);
    }
  }

  for (let pass = 0; pass < 2; pass++) {
    const next = new Set(wet);
    for (let lx = room.x0; lx < room.x1; lx++) {
      for (let lz = room.z0; lz < room.z1; lz++) {
        if (!inBounds(lx, lz) || inIsland(lx, lz, room)) continue;
        let n = 0;
        if (has(lx + 1, lz)) n++;
        if (has(lx - 1, lz)) n++;
        if (has(lx, lz + 1)) n++;
        if (has(lx, lz - 1)) n++;
        const on = has(lx, lz);
        if (on && n === 0) next.delete(key(lx, lz));
        if (!on && n >= 3 && inner(lx, lz)) next.add(key(lx, lz));
      }
    }
    wet.clear();
    for (const k of next) wet.add(k);
  }

  for (const k of [...wet]) {
    const [lx, lz] = k.split(",").map(Number);
    if (onRoomOpening(room, lx, lz) || inIsland(lx, lz, room)) wet.delete(k);
  }

  let best = [];
  const seen = new Set();
  for (const start of wet) {
    if (seen.has(start)) continue;
    const stack = [start];
    const comp = [];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop();
      comp.push(cur);
      const [cx, cz] = cur.split(",").map(Number);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nk = key(cx + dx, cz + dz);
        if (!wet.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        stack.push(nk);
      }
    }
    if (comp.length > best.length) best = comp;
  }
  wet.clear();
  for (const k of best) wet.add(k);
  if (wet.size < 4) {
    for (let lx = room.wx0; lx < room.wx1; lx++) {
      for (let lz = room.wz0; lz < room.wz1; lz++) {
        if (inner(lx, lz)) add(lx, lz);
      }
    }
  }
  return wet;
}

function inWater(lx, lz, room) {
  if (!room.hasWater) return false;
  if (room.wet) return room.wet.has(`${lx},${lz}`);
  if (lx < room.wx0 || lx >= room.wx1 || lz < room.wz0 || lz >= room.wz1) return false;
  if (inIsland(lx, lz, room)) return false;
  if (room.spaR) {
    const cx = (room.wx0 + room.wx1) * 0.5;
    const cz = (room.wz0 + room.wz1) * 0.5;
    return Math.hypot(lx + 0.5 - cx, lz + 0.5 - cz) < room.spaR;
  }
  return true;
}

function inTube(lx, lz, room) {
  if (!room.tube) return false;
  const t = room.tube;
  if (t.dir === "e") return room.e && lx >= room.x1 && lz === room.e.start;
  if (t.dir === "w") return room.w && lx < room.x0 && lz === room.w.start;
  if (t.dir === "n") return room.n && lz >= room.z1 && lx === room.n.start;
  if (t.dir === "s") return room.s && lz < room.z0 && lx === room.s.start;
  return false;
}

function corridorCeiling(seed, extra, mx, mz, room, lx, lz) {
  let h = room.spec.ceiling;
  if (room.e && lx >= room.x1 && lz >= room.e.start && lz < room.e.end) {
    h = Math.min(h, roomAt(seed, extra, mx + 1, mz).spec.ceiling);
  }
  if (room.w && lx < room.x0 && lz >= room.w.start && lz < room.w.end) {
    h = Math.min(h, roomAt(seed, extra, mx - 1, mz).spec.ceiling);
  }
  if (room.n && lz >= room.z1 && lx >= room.n.start && lx < room.n.end) {
    h = Math.min(h, roomAt(seed, extra, mx, mz + 1).spec.ceiling);
  }
  if (room.s && lz < room.z0 && lx >= room.s.start && lx < room.s.end) {
    h = Math.min(h, roomAt(seed, extra, mx, mz - 1).spec.ceiling);
  }
  return h;
}

function walkAt(seed, extra, tx, tz) {
  const mx = floorDiv(tx, MACRO);
  const mz = floorDiv(tz, MACRO);
  const lx = posMod(tx, MACRO);
  const lz = posMod(tz, MACRO);
  const room = roomAt(seed, extra, mx, mz);
  return inRoom(lx, lz, room) || inCorr(lx, lz, room);
}

function pillarAt(seed, extra, tx, tz, room, lx, lz) {
  if (room.spiral) return false;
  if (room.spec.pillars === "none") return false;
  if (onRoomOpening(room, lx, lz) || inCorr(lx, lz, room)) return false;
  if (room.island) {
    const i = room.island;
    return lx === ((i.x0 + i.x1) >> 1) && lz === ((i.z0 + i.z1) >> 1);
  }
  if (room.spec.pillars === "square") {
    if (!inRoom(lx, lz, room) || inWater(lx, lz, room)) return false;
    return lx % 3 === 1 && lz % 3 === 1 && rand01(seed, tx + 4, tz - 2) > 0.35;
  }
  if (!room.hasWater) return false;
  const pw = room.wx1 - room.wx0;
  const ph = room.wz1 - room.wz0;
  if (pw < 3 || ph < 3) return false;
  if (room.spec.pillars === "grid") {
    const gx = lx - room.wx0;
    const gz = lz - room.wz0;
    return gx > 0 && gz > 0 && gx < pw - 1 && gz < ph - 1 && gx % 3 === 1 && gz % 3 === 1;
  }
  const mx = floorDiv(tx, MACRO);
  const mz = floorDiv(tz, MACRO);
  if (rand01(seed, mx + 40, mz - 11) > 0.42) return false;
  return lx === room.wx0 + (pw >> 1) && lz === room.wz0 + (ph >> 1);
}

export function poolCell(seed, extra, tx, tz) {
  const mx = floorDiv(tx, MACRO);
  const mz = floorDiv(tz, MACRO);
  const lx = posMod(tx, MACRO);
  const lz = posMod(tz, MACRO);
  const room = roomAt(seed, extra, mx, mz);
  const corridor = inCorr(lx, lz, room);
  const walk = inRoom(lx, lz, room) || corridor;
  const water = walk && inWater(lx, lz, room);
  const ceiling = corridor ? corridorCeiling(seed, extra, mx, mz, room, lx, lz) : room.spec.ceiling;
  const solid = !walk;
  const pillar = walk && pillarAt(seed, extra, tx, tz, room, lx, lz);
  const exposed =
    solid &&
    (walkAt(seed, extra, tx + 1, tz) ||
      walkAt(seed, extra, tx - 1, tz) ||
      walkAt(seed, extra, tx, tz + 1) ||
      walkAt(seed, extra, tx, tz - 1));

  const lip =
    room.biome === "gallery" &&
    walk &&
    inRoom(lx, lz, room) &&
    !water &&
    !onRoomOpening(room, lx, lz) &&
    (inWater(lx + 1, lz, room) ||
      inWater(lx - 1, lz, room) ||
      inWater(lx, lz + 1, room) ||
      inWater(lx, lz - 1, room));
  const galleryCol = lip && (lx + lz) % 2 === 0;
  const gallery = room.biome === "gallery" && walk && inRoom(lx, lz, room) && !water;

  let feature = null;
  let featureFace = null;
  let featureAxis = null;
  if (room.stairs && lx === room.stairs.lx && lz === room.stairs.lz) {
    feature = "stairs";
    featureFace = room.stairs.face;
  } else if (room.chute && lx === room.chute.lx && lz === room.chute.lz) {
    feature = "chute";
    featureFace = room.chute.face;
  } else if (inTube(lx, lz, room)) {
    feature = "tube";
    featureAxis = room.tube.axis;
  } else if (
    room.ladders &&
    walk &&
    !water &&
    !pillar &&
    inRoom(lx, lz, room) &&
    !onRoomOpening(room, lx, lz) &&
    (inWater(lx + 1, lz, room) || inWater(lx - 1, lz, room) || inWater(lx, lz + 1, room) || inWater(lx, lz - 1, room)) &&
    rand01(seed, tx + 71, tz - 19) < 0.16
  ) {
    feature = "ladder";
    if (inWater(lx, lz + 1, room)) featureFace = "n";
    else if (inWater(lx, lz - 1, room)) featureFace = "s";
    else if (inWater(lx + 1, lz, room)) featureFace = "e";
    else featureFace = "w";
  }

  const onOpen =
    (room.e && lx === room.x1 - 1 && lz >= room.e.start && lz < room.e.end) ||
    (room.w && lx === room.x0 && lz >= room.w.start && lz < room.w.end) ||
    (room.n && lz === room.z1 - 1 && lx >= room.n.start && lx < room.n.end) ||
    (room.s && lz === room.z0 && lx >= room.s.start && lx < room.s.end);

  let prop = null;
  if (room.biome === "service" && walk && !water && !feature && inRoom(lx, lz, room) && !onOpen) {
    const wallish = lx === room.x0 || lx === room.x1 - 1 || lz === room.z0 || lz === room.z1 - 1;
    if (wallish && rand01(seed, tx + 40, tz - 11) < 0.22) prop = "pipe";
  }

  const light =
    room.spec.light === "dark" ? (rand01(seed, tx + 301, tz - 88) < 0.4 ? "dead" : "dim") : "bright";

  return {
    solid,
    water,
    pillar,
    exposed,
    walk,
    floor: water ? "water" : room.biome === "leisure" ? "checker" : "tile",
    biome: room.biome,
    ceiling,
    gallery,
    galleryCol,
    feature,
    featureFace,
    featureAxis,
    prop,
    blockR: galleryCol ? 0.14 : feature === "ladder" ? 0.12 : 0,
    light,
    corridor,
    spiral: !!room.spiral,
  };
}

export function roundedRectSDF(px, pz, x0, z0, x1, z1, r) {
  const hx = (x1 - x0) * 0.5;
  const hz = (z1 - z0) * 0.5;
  const pdx = px - (x0 + x1) * 0.5;
  const pdz = pz - (z0 + z1) * 0.5;
  let ne;
  let se;
  let nw;
  let sw;
  if (typeof r === "number") {
    ne = se = nw = sw = r;
  } else {
    ne = r.ne;
    se = r.se;
    nw = r.nw;
    sw = r.sw;
  }
  const pairN = pdx > 0 ? ne : nw;
  const pairS = pdx > 0 ? se : sw;
  const rr = Math.max(pdz > 0 ? pairN : pairS, 0.0001);
  const qx = Math.abs(pdx) - hx + rr;
  const qz = Math.abs(pdz) - hz + rr;
  return Math.min(Math.max(qx, qz), 0) + Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) - rr;
}

function encroaches(gap, corner, towardPos, R) {
  if (!gap || R <= 0.05) return false;
  const zoneLo = towardPos ? corner : corner - R - FILLET_JAMB;
  const zoneHi = towardPos ? corner + R + FILLET_JAMB : corner;
  return gap.b > zoneLo + 1e-4 && gap.a < zoneHi - 1e-4;
}

function hypot2(ax, az, bx, bz) {
  return Math.hypot(bx - ax, bz - az);
}

function splitSpan(lo, hi, gap) {
  if (hi - lo < 0.05) return [];
  if (!gap || gap.b <= lo + 0.02 || gap.a >= hi - 0.02) return [{ kind: "wall", a: lo, b: hi }];
  const oa = Math.max(lo, gap.a);
  const ob = Math.min(hi, gap.b);
  const out = [];
  if (oa > lo + 0.02) out.push({ kind: "wall", a: lo, b: oa });
  if (ob > oa + 0.02) out.push({ kind: "opening", a: oa, b: ob });
  if (hi > ob + 0.02) out.push({ kind: "wall", a: ob, b: hi });
  return out.length ? out : [{ kind: "wall", a: lo, b: hi }];
}

function emitXFace(segments, z, xA, xB, gap, reverse) {
  const lo = Math.min(xA, xB);
  const hi = Math.max(xA, xB);
  let parts = splitSpan(lo, hi, gap);
  if (reverse) parts = parts.slice().reverse();
  for (const p of parts) {
    const x0 = reverse ? p.b : p.a;
    const x1 = reverse ? p.a : p.b;
    segments.push({
      type: p.kind === "opening" ? "opening" : "line",
      p0: { x: x0, z },
      p1: { x: x1, z },
      face: reverse ? "n" : "s",
    });
  }
}

function emitZFace(segments, x, zA, zB, gap, reverse) {
  const lo = Math.min(zA, zB);
  const hi = Math.max(zA, zB);
  let parts = splitSpan(lo, hi, gap);
  if (reverse) parts = parts.slice().reverse();
  for (const p of parts) {
    const z0 = reverse ? p.b : p.a;
    const z1 = reverse ? p.a : p.b;
    segments.push({
      type: p.kind === "opening" ? "opening" : "line",
      p0: { x, z: z0 },
      p1: { x, z: z1 },
      face: reverse ? "w" : "e",
    });
  }
}

function emitArc(segments, cx, cz, r, a0, a1, corner) {
  if (r < 0.05) {
    const p = { x: cx + r * Math.cos(a0), z: cz + r * Math.sin(a0) };
    const p1 = { x: cx + r * Math.cos(a1), z: cz + r * Math.sin(a1) };
    segments.push({ type: "corner", p0: p, p1, corner });
    return;
  }
  segments.push({
    type: "arc",
    c: { x: cx, z: cz },
    r,
    a0,
    a1,
    p0: { x: cx + r * Math.cos(a0), z: cz + r * Math.sin(a0) },
    p1: { x: cx + r * Math.cos(a1), z: cz + r * Math.sin(a1) },
    corner,
  });
}

const ALCOVE_R = 0.42;

function emitAlcoveSouth(segments, xL, xR, z0, depth, r) {
  const zb = z0 - depth;
  emitArc(segments, xL - r, z0 - r, r, Math.PI / 2, 0, "alcove");
  segments.push({ type: "line", p0: { x: xL, z: z0 - r }, p1: { x: xL, z: zb + r }, face: "w" });
  emitArc(segments, xL + r, zb + r, r, Math.PI, Math.PI * 1.5, "alcove");
  segments.push({ type: "line", p0: { x: xL + r, z: zb }, p1: { x: xR - r, z: zb }, face: "s" });
  emitArc(segments, xR - r, zb + r, r, -Math.PI / 2, 0, "alcove");
  segments.push({ type: "line", p0: { x: xR, z: zb + r }, p1: { x: xR, z: z0 - r }, face: "e" });
  emitArc(segments, xR + r, z0 - r, r, Math.PI, Math.PI / 2, "alcove");
}

function emitAlcoveNorth(segments, xL, xR, z1, depth, r) {
  const zb = z1 + depth;
  emitArc(segments, xR + r, z1 + r, r, -Math.PI / 2, -Math.PI, "alcove");
  segments.push({ type: "line", p0: { x: xR, z: z1 + r }, p1: { x: xR, z: zb - r }, face: "e" });
  emitArc(segments, xR - r, zb - r, r, 0, Math.PI / 2, "alcove");
  segments.push({ type: "line", p0: { x: xR - r, z: zb }, p1: { x: xL + r, z: zb }, face: "n" });
  emitArc(segments, xL + r, zb - r, r, Math.PI / 2, Math.PI, "alcove");
  segments.push({ type: "line", p0: { x: xL, z: zb - r }, p1: { x: xL, z: z1 + r }, face: "w" });
  emitArc(segments, xL - r, z1 + r, r, 0, -Math.PI / 2, "alcove");
}

function emitAlcoveEast(segments, zL, zR, x1, depth, r) {
  const xb = x1 + depth;
  emitArc(segments, x1 + r, zL - r, r, Math.PI, Math.PI / 2, "alcove");
  segments.push({ type: "line", p0: { x: x1 + r, z: zL }, p1: { x: xb - r, z: zL }, face: "s" });
  emitArc(segments, xb - r, zL + r, r, -Math.PI / 2, 0, "alcove");
  segments.push({ type: "line", p0: { x: xb, z: zL + r }, p1: { x: xb, z: zR - r }, face: "e" });
  emitArc(segments, xb - r, zR - r, r, 0, Math.PI / 2, "alcove");
  segments.push({ type: "line", p0: { x: xb - r, z: zR }, p1: { x: x1 + r, z: zR }, face: "n" });
  emitArc(segments, x1 + r, zR + r, r, -Math.PI / 2, -Math.PI, "alcove");
}

function emitAlcoveWest(segments, zL, zR, x0, depth, r) {
  const xb = x0 - depth;
  emitArc(segments, x0 - r, zR + r, r, 0, -Math.PI / 2, "alcove");
  segments.push({ type: "line", p0: { x: x0 - r, z: zR }, p1: { x: xb + r, z: zR }, face: "n" });
  emitArc(segments, xb + r, zR - r, r, Math.PI / 2, Math.PI, "alcove");
  segments.push({ type: "line", p0: { x: xb, z: zR - r }, p1: { x: xb, z: zL + r }, face: "w" });
  emitArc(segments, xb + r, zL + r, r, Math.PI, Math.PI * 1.5, "alcove");
  segments.push({ type: "line", p0: { x: xb + r, z: zL }, p1: { x: x0 - r, z: zL }, face: "s" });
  emitArc(segments, x0 - r, zL - r, r, Math.PI / 2, 0, "alcove");
}

function emitFaceWithAlcoves(segments, lo, hi, gap, alcoves, emitWall, emitAlcoveAt, reverse) {
  const cuts = [];
  if (gap) cuts.push({ a: gap.a, b: gap.b, kind: "opening" });
  for (const a of alcoves || []) cuts.push({ a: a.lo - ALCOVE_R, b: a.hi + ALCOVE_R, kind: "alcove", alcove: a });
  cuts.sort((p, q) => p.a - q.a);
  const parts = [];
  let x = lo;
  for (const c of cuts) {
    const a = Math.max(lo, c.a);
    const b = Math.min(hi, c.b);
    if (b <= a + 0.02) continue;
    if (a > x + 0.02) parts.push({ kind: "wall", a: x, b: a });
    parts.push({ kind: c.kind, a, b, alcove: c.alcove });
    x = Math.max(x, b);
  }
  if (hi > x + 0.02) parts.push({ kind: "wall", a: x, b: hi });
  const ordered = reverse ? parts.slice().reverse() : parts;
  for (const p of ordered) {
    if (p.kind === "alcove") emitAlcoveAt(p.alcove);
    else emitWall(p.kind, reverse ? p.b : p.a, reverse ? p.a : p.b);
  }
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.z - q.x * p.z;
  }
  return a * 0.5;
}

function traceWaterLoops(wet, mx, mz) {
  const has = (lx, lz) => wet.has(`${lx},${lz}`);
  const edges = new Map();
  const addEdge = (x0, z0, x1, z1) => {
    const k = `${x0},${z0}`;
    if (!edges.has(k)) edges.set(k, []);
    edges.get(k).push({ x: x1, z: z1 });
  };
  for (const k of wet) {
    const [lx, lz] = k.split(",").map(Number);
    if (!has(lx, lz - 1)) addEdge(lx, lz, lx + 1, lz);
    if (!has(lx + 1, lz)) addEdge(lx + 1, lz, lx + 1, lz + 1);
    if (!has(lx, lz + 1)) addEdge(lx + 1, lz + 1, lx, lz + 1);
    if (!has(lx - 1, lz)) addEdge(lx, lz + 1, lx, lz);
  }
  const used = new Set();
  const loops = [];
  const originX = mx * MACRO * TILE;
  const originZ = mz * MACRO * TILE;
  for (const [start, outs] of edges) {
    for (const first of outs) {
      const uk = `${start}->${first.x},${first.z}`;
      if (used.has(uk)) continue;
      const [sx, sz] = start.split(",").map(Number);
      const pts = [{ x: originX + sx * TILE, z: originZ + sz * TILE }];
      let cx = sx;
      let cz = sz;
      let nx = first.x;
      let nz = first.z;
      used.add(uk);
      let guard = 0;
      while (guard++ < 800) {
        pts.push({ x: originX + nx * TILE, z: originZ + nz * TILE });
        if (nx === sx && nz === sz) break;
        const opts = edges.get(`${nx},${nz}`) || [];
        let next = null;
        for (const o of opts) {
          if (!used.has(`${nx},${nz}->${o.x},${o.z}`)) {
            next = o;
            break;
          }
        }
        if (!next) break;
        used.add(`${nx},${nz}->${next.x},${next.z}`);
        cx = nx;
        cz = nz;
        nx = next.x;
        nz = next.z;
      }
      if (pts.length > 4) {
        pts.pop();
        loops.push(pts);
      }
    }
  }
  return loops;
}

function roundPoly(pts, rWant = 0.45) {
  if (pts.length < 4) return { segments: [] };
  const segs = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const inx = cur.x - prev.x;
    const inz = cur.z - prev.z;
    const outx = next.x - cur.x;
    const outz = next.z - cur.z;
    const inLen = Math.hypot(inx, inz) || 1;
    const outLen = Math.hypot(outx, outz) || 1;
    const r = Math.min(rWant, inLen * 0.45, outLen * 0.45);
    const p0 = { x: cur.x - (inx / inLen) * r, z: cur.z - (inz / inLen) * r };
    const p1 = { x: cur.x + (outx / outLen) * r, z: cur.z + (outz / outLen) * r };
    if (i === 0) segs.push({ type: "line", p0: { x: p0.x, z: p0.z }, p1: p0, face: "s" });
    const last = segs[segs.length - 1];
    last.p1 = p0;
    const cross = inx * outz - inz * outx;
    if (r > 0.08 && Math.abs(cross) > 1e-6) {
      const nx0 = -inz / inLen;
      const nz0 = inx / inLen;
      const sign = cross > 0 ? 1 : -1;
      const cx = cur.x - (inx / inLen) * r + sign * nx0 * r;
      const cz = cur.z - (inz / inLen) * r + sign * nz0 * r;
      const a0 = Math.atan2(p0.z - cz, p0.x - cx);
      let a1 = Math.atan2(p1.z - cz, p1.x - cx);
      if (sign > 0 && a1 < a0) a1 += Math.PI * 2;
      if (sign < 0 && a1 > a0) a1 -= Math.PI * 2;
      segs.push({
        type: "arc",
        c: { x: cx, z: cz },
        r,
        a0,
        a1,
        p0,
        p1,
        corner: "water",
      });
    }
    segs.push({ type: "line", p0: p1, p1: { x: next.x, z: next.z }, face: "s" });
  }
  if (segs.length) {
    const first = segs.find((s) => s.type === "line");
    const last = segs[segs.length - 1];
    if (first && last.type === "line") last.p1 = first.p0;
  }
  return { segments: segs.filter((s) => s.type === "arc" || hypot2(s.p0.x, s.p0.z, s.p1.x, s.p1.z) > 0.02) };
}

function weldSegments(segments) {
  if (!segments.length) return { invalid: [] };
  const invalid = [];
  for (let i = 0; i < segments.length; i++) {
    const prev = segments[(i + segments.length - 1) % segments.length];
    const cur = segments[i];
    const d = hypot2(prev.p1.x, prev.p1.z, cur.p0.x, cur.p0.z);
    if (d > 1e-4 && d < 0.04) {
      cur.p0 = { x: prev.p1.x, z: prev.p1.z };
    } else if (d >= 0.04) {
      invalid.push({
        i,
        d,
        a: { x: prev.p1.x, z: prev.p1.z },
        b: { x: cur.p0.x, z: cur.p0.z },
        prev: prev.type,
        cur: cur.type,
      });
    }
  }
  return { invalid };
}

export function buildRoomOutline(prof) {
  const { X0, X1, Z0, Z1, rSW, rSE, rNE, rNW } = prof;
  const alcoves = prof.alcoves || [];
  const south = alcoves.filter((a) => a.face === "s");
  const north = alcoves.filter((a) => a.face === "n");
  const east = alcoves.filter((a) => a.face === "e");
  const west = alcoves.filter((a) => a.face === "w");
  const segments = [];
  const emitLineX = (kind, x0, x1, z, face) => {
    segments.push({ type: kind === "opening" ? "opening" : "line", p0: { x: x0, z }, p1: { x: x1, z }, face });
  };
  const emitLineZ = (kind, z0, z1, x, face) => {
    segments.push({ type: kind === "opening" ? "opening" : "line", p0: { x, z: z0 }, p1: { x, z: z1 }, face });
  };
  emitFaceWithAlcoves(
    segments,
    X0 + rSW,
    X1 - rSE,
    prof.s,
    south,
    (kind, a, b) => emitLineX(kind, a, b, Z0, "s"),
    (a) => emitAlcoveSouth(segments, a.lo, a.hi, Z0, a.depth, ALCOVE_R),
    false
  );
  emitArc(segments, X1 - rSE, Z0 + rSE, rSE, -Math.PI / 2, 0, "SE");
  emitFaceWithAlcoves(
    segments,
    Z0 + rSE,
    Z1 - rNE,
    prof.e,
    east,
    (kind, a, b) => emitLineZ(kind, a, b, X1, "e"),
    (a) => emitAlcoveEast(segments, a.lo, a.hi, X1, a.depth, ALCOVE_R),
    false
  );
  emitArc(segments, X1 - rNE, Z1 - rNE, rNE, 0, Math.PI / 2, "NE");
  emitFaceWithAlcoves(
    segments,
    X0 + rNW,
    X1 - rNE,
    prof.n,
    north,
    (kind, a, b) => emitLineX(kind, a, b, Z1, "n"),
    (a) => emitAlcoveNorth(segments, a.lo, a.hi, Z1, a.depth, ALCOVE_R),
    true
  );
  emitArc(segments, X0 + rNW, Z1 - rNW, rNW, Math.PI / 2, Math.PI, "NW");
  emitFaceWithAlcoves(
    segments,
    Z0 + rSW,
    Z1 - rNW,
    prof.w,
    west,
    (kind, a, b) => emitLineZ(kind, a, b, X0, "w"),
    (a) => emitAlcoveWest(segments, a.lo, a.hi, X0, a.depth, ALCOVE_R),
    true
  );
  emitArc(segments, X0 + rSW, Z0 + rSW, rSW, Math.PI, Math.PI * 1.5, "SW");
  const { invalid } = weldSegments(segments);
  return { segments, invalid, R: prof.R, radii: prof.radii };
}

export function roundedRectOutline(x0, z0, x1, z1, r) {
  const rr = typeof r === "number" ? { ne: r, se: r, nw: r, sw: r } : r;
  return buildRoomOutline({
    X0: x0,
    X1: x1,
    Z0: z0,
    Z1: z1,
    R: Math.max(rr.ne, rr.se, rr.nw, rr.sw),
    rSW: rr.sw,
    rSE: rr.se,
    rNE: rr.ne,
    rNW: rr.nw,
    radii: rr,
    e: null,
    w: null,
    n: null,
    s: null,
  });
}

export function outlineWallRuns(outline) {
  const segs = outline.segments;
  const n = segs.length;
  if (!n) return [];
  const isOpen = (s) => s.type === "opening";
  if (!segs.some(isOpen)) return [segs];
  const runs = [];
  let i = 0;
  while (i < n) {
    while (i < n && isOpen(segs[i])) i++;
    if (i >= n) break;
    const run = [];
    while (i < n && !isOpen(segs[i])) {
      run.push(segs[i]);
      i++;
    }
    if (run.length) runs.push(run);
  }
  if (!isOpen(segs[0]) && !isOpen(segs[n - 1]) && runs.length >= 2) {
    const first = runs.shift();
    runs[runs.length - 1] = runs[runs.length - 1].concat(first);
  }
  return runs.filter((run) => run.some((s) => s.type === "line" || s.type === "arc"));
}

export function sampleOutline(outline, arcSegs = POOL_ARC_SEGS, opts = {}) {
  const includeOpenings = opts.includeOpenings !== false;
  const pts = [];
  let s = 0;
  for (const seg of outline.segments) {
    if (seg.type === "opening" && !includeOpenings) continue;
    if (seg.type === "arc") {
      const n = Math.max(4, arcSegs);
      const span = Math.abs(seg.a1 - seg.a0);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const a = seg.a0 + (seg.a1 - seg.a0) * t;
        pts.push({
          x: seg.c.x + seg.r * Math.cos(a),
          z: seg.c.z + seg.r * Math.sin(a),
          s: s + t * seg.r * span,
          kind: "arc",
          corner: seg.corner,
        });
      }
      s += seg.r * span;
    } else if (seg.type === "corner") {
      pts.push({ x: seg.p0.x, z: seg.p0.z, s, kind: "corner", corner: seg.corner });
    } else {
      pts.push({ x: seg.p0.x, z: seg.p0.z, s, kind: seg.type, face: seg.face });
      s += hypot2(seg.p0.x, seg.p0.z, seg.p1.x, seg.p1.z);
    }
  }
  return pts;
}

export function outerForSegment(seg, thick, prof) {
  if (seg.type === "arc") {
    const cw = seg.a1 < seg.a0;
    const rOut = cw ? Math.max(0.03, seg.r - thick) : seg.r + thick;
    const n = Math.max(4, POOL_ARC_SEGS);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = seg.a0 + t * (seg.a1 - seg.a0);
      pts.push({ x: seg.c.x + rOut * Math.cos(a), z: seg.c.z + rOut * Math.sin(a) });
    }
    return pts;
  }
  const dx = seg.p1.x - seg.p0.x;
  const dz = seg.p1.z - seg.p0.z;
  const len = Math.hypot(dx, dz) || 1;
  const ox = (dz / len) * thick;
  const oz = (-dx / len) * thick;
  return [
    { x: seg.p0.x + ox, z: seg.p0.z + oz },
    { x: seg.p1.x + ox, z: seg.p1.z + oz },
  ];
}

export function sdfClosed(px, pz, outline) {
  if (!outline?.segments?.length) return 1;
  let best = Infinity;
  let winding = 0;
  const accDist = (x0, z0, x1, z1) => {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((px - x0) * dx + (pz - z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t));
    if (d < best) best = d;
    const y0 = z0 - pz;
    const y1 = z1 - pz;
    if (y0 <= 0 !== y1 <= 0) {
      const xh = x0 + (dx * -y0) / (y1 - y0 || 1e-6);
      if (xh > px) winding += y0 <= 0 ? 1 : -1;
    }
  };
  for (const seg of outline.segments) {
    if (seg.type === "arc") {
      const n = 8;
      let ax = seg.p0.x;
      let az = seg.p0.z;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const a = seg.a0 + t * (seg.a1 - seg.a0);
        const bx = seg.c.x + seg.r * Math.cos(a);
        const bz = seg.c.z + seg.r * Math.sin(a);
        accDist(ax, az, bx, bz);
        ax = bx;
        az = bz;
      }
    } else {
      accDist(seg.p0.x, seg.p0.z, seg.p1.x, seg.p1.z);
    }
  }
  const inside = winding !== 0;
  return inside ? -best : best;
}

export function sdfWater(px, pz, water) {
  if (!water) return 1;
  if (water.outline) {
    let d = sdfClosed(px, pz, water.outline);
    for (const hole of water.holes || []) d = Math.max(d, -sdfClosed(px, pz, hole));
    for (const isl of water.islands || []) {
      d = Math.max(d, -roundedRectSDF(px, pz, isl.X0, isl.Z0, isl.X1, isl.Z1, isl.R));
    }
    return d;
  }
  let d = roundedRectSDF(px, pz, water.X0, water.Z0, water.X1, water.Z1, water.R);
  for (const isl of water.islands || []) d = Math.max(d, -roundedRectSDF(px, pz, isl.X0, isl.Z0, isl.X1, isl.Z1, isl.R));
  return d;
}

export function outlineSAt(outline, x, z) {
  let bestS = 0;
  let bestD = Infinity;
  let acc = 0;
  for (const seg of outline.segments) {
    if (seg.type === "arc") {
      const span = Math.abs(seg.a1 - seg.a0);
      const len = seg.r * span;
      const ang = Math.atan2(z - seg.c.z, x - seg.c.x);
      let a = ang;
      while (a < seg.a0) a += Math.PI * 2;
      while (a > seg.a1 + 1e-6) a -= Math.PI * 2;
      const t = Math.max(0, Math.min(1, (a - seg.a0) / (span || 1)));
      const px = seg.c.x + seg.r * Math.cos(seg.a0 + t * (seg.a1 - seg.a0));
      const pz = seg.c.z + seg.r * Math.sin(seg.a0 + t * (seg.a1 - seg.a0));
      const d = hypot2(x, z, px, pz);
      if (d < bestD) {
        bestD = d;
        bestS = acc + t * len;
      }
      acc += len;
    } else {
      const dx = seg.p1.x - seg.p0.x;
      const dz = seg.p1.z - seg.p0.z;
      const len = Math.hypot(dx, dz) || 1e-6;
      let t = ((x - seg.p0.x) * dx + (z - seg.p0.z) * dz) / (len * len);
      t = Math.max(0, Math.min(1, t));
      const d = hypot2(x, z, seg.p0.x + dx * t, seg.p0.z + dz * t);
      if (d < bestD) {
        bestD = d;
        bestS = acc + t * len;
      }
      acc += len;
    }
  }
  return bestS;
}

function makeHall(axis, x0, z0, x1, z1, h, biome, h0 = h, h1 = h) {
  let e = null;
  let w = null;
  let n = null;
  let s = null;
  if (axis === "x") {
    w = { a: z0, b: z1 };
    e = { a: z0, b: z1 };
  } else {
    s = { a: x0, b: x1 };
    n = { a: x0, b: x1 };
  }
  const rSW = 0;
  const rSE = 0;
  const rNE = 0;
  const rNW = 0;
  const hall = {
    X0: x0,
    X1: x1,
    Z0: z0,
    Z1: z1,
    R: 0,
    rSW,
    rSE,
    rNE,
    rNW,
    radii: { ne: rNE, se: rSE, nw: rNW, sw: rSW },
    e,
    w,
    n,
    s,
    h,
    h0,
    h1,
    biome,
    axis,
  };
  hall.outline = buildRoomOutline(hall);
  return hall;
}

export function roomProfile(seed, extra, mx, mz) {
  const key = `${seed}:${extra}:${mx}:${mz}`;
  const hit = profileCache.get(key);
  if (hit) return hit;
  const room = roomAt(seed, extra, mx, mz);
  const X0 = (mx * MACRO + room.x0) * TILE;
  const X1 = (mx * MACRO + room.x1) * TILE;
  const Z0 = (mz * MACRO + room.z0) * TILE;
  const Z1 = (mz * MACRO + room.z1) * TILE;
  const clipOpening = (gap, lo, hi) => {
    if (!gap) return null;
    const inset = Math.min(0.45, Math.max(0.2, (hi - lo) * 0.08));
    const a = Math.max(gap.a, lo + inset);
    const b = Math.min(gap.b, hi - inset);
    return b - a >= 0.9 ? { a, b } : null;
  };
  const eRaw = room.e
    ? { a: (mz * MACRO + room.e.start) * TILE, b: (mz * MACRO + room.e.end) * TILE }
    : null;
  const wRaw = room.w
    ? { a: (mz * MACRO + room.w.start) * TILE, b: (mz * MACRO + room.w.end) * TILE }
    : null;
  const nRaw = room.n
    ? { a: (mx * MACRO + room.n.start) * TILE, b: (mx * MACRO + room.n.end) * TILE }
    : null;
  const sRaw = room.s
    ? { a: (mx * MACRO + room.s.start) * TILE, b: (mx * MACRO + room.s.end) * TILE }
    : null;
  const R = Math.max(
    0,
    Math.min(FILLET_MAX, (X1 - X0) * 0.5 - FILLET_MARGIN, (Z1 - Z0) * 0.5 - FILLET_MARGIN)
  );
  const rSW = !encroaches(sRaw, X0, true, R) && !encroaches(wRaw, Z0, true, R) ? R : 0;
  const rSE = !encroaches(sRaw, X1, false, R) && !encroaches(eRaw, Z0, true, R) ? R : 0;
  const rNE = !encroaches(nRaw, X1, false, R) && !encroaches(eRaw, Z1, false, R) ? R : 0;
  const rNW = !encroaches(nRaw, X0, true, R) && !encroaches(wRaw, Z1, false, R) ? R : 0;
  const e = clipOpening(eRaw, Z0 + rSE, Z1 - rNE);
  const w = clipOpening(wRaw, Z0 + rSW, Z1 - rNW);
  const n = clipOpening(nRaw, X0 + rNW, X1 - rNE);
  const s = clipOpening(sRaw, X0 + rSW, X1 - rSE);

  const alcoves = (room.alcoves || [])
    .map((a) => {
      const along = a.face === "s" || a.face === "n" ? (mx * MACRO + a.lx) * TILE : (mz * MACRO + a.lz) * TILE;
      const box =
        a.face === "s"
          ? { X0: along, X1: along + TILE, Z0: Z0 - TILE, Z1: Z0 + 0.08 }
          : a.face === "n"
            ? { X0: along, X1: along + TILE, Z0: Z1 - 0.08, Z1: Z1 + TILE }
            : a.face === "e"
              ? { X0: X1 - 0.08, X1: X1 + TILE, Z0: along, Z1: along + TILE }
              : { X0: X0 - TILE, X1: X0 + 0.08, Z0: along, Z1: along + TILE };
      return { face: a.face, lo: along, hi: along + TILE, depth: TILE, r: ALCOVE_R, ...box, radii: ALCOVE_R };
    })
    .filter((a) => {
      const pad = ALCOVE_R + 0.08;
      const gap = a.face === "s" ? s : a.face === "n" ? n : a.face === "e" ? e : w;
      if (gap && a.hi + pad > gap.a && a.lo - pad < gap.b) return false;
      if (a.face === "s") return a.lo - pad >= X0 + rSW && a.hi + pad <= X1 - rSE;
      if (a.face === "n") return a.lo - pad >= X0 + rNW && a.hi + pad <= X1 - rNE;
      if (a.face === "e") return a.lo - pad >= Z0 + rSE && a.hi + pad <= Z1 - rNE;
      return a.lo - pad >= Z0 + rSW && a.hi + pad <= Z1 - rNW;
    });

  let water = null;
  if (room.hasWater) {
    const WX0 = (mx * MACRO + room.wx0) * TILE;
    const WX1 = (mx * MACRO + room.wx1) * TILE;
    const WZ0 = (mz * MACRO + room.wz0) * TILE;
    const WZ1 = (mz * MACRO + room.wz1) * TILE;
    const wR = room.spaR
      ? Math.min((WX1 - WX0) * 0.5 - 0.05, (WZ1 - WZ0) * 0.5 - 0.05)
      : Math.min(1.8, (WX1 - WX0) * 0.5 - 0.35, (WZ1 - WZ0) * 0.5 - 0.35);
    const islands = [];
    if (room.island) {
      const i = room.island;
      const ix0 = (mx * MACRO + i.x0) * TILE;
      const ix1 = (mx * MACRO + i.x1) * TILE;
      const iz0 = (mz * MACRO + i.z0) * TILE;
      const iz1 = (mz * MACRO + i.z1) * TILE;
      islands.push({
        X0: ix0,
        X1: ix1,
        Z0: iz0,
        Z1: iz1,
        R: Math.min(0.9, (ix1 - ix0) * 0.5 - 0.15, (iz1 - iz0) * 0.5 - 0.15),
      });
    }
    const pits = [];
    if (room.biome === "channel" && rand01(seed, mx + 33, mz - 14) < 0.55) {
      pits.push({
        x: (WX0 + WX1) * 0.5 + (rand01(seed, mx, mz + 9) - 0.5) * (WX1 - WX0) * 0.3,
        z: (WZ0 + WZ1) * 0.5 + (rand01(seed, mx + 4, mz) - 0.5) * (WZ1 - WZ0) * 0.3,
        r: 0.7 + rand01(seed, mx - 2, mz + 5) * 0.5,
      });
    }
    const loops = room.wet && room.wet.size ? traceWaterLoops(room.wet, mx, mz).map((pts) => roundPoly(pts, 0.48)) : [];
    const loopArea = (ol) => polyArea(ol.segments.map((s) => s.p0));
    const outers = loops.filter((ol) => ol.segments.length > 3 && loopArea(ol) > 0.5);
    const holes = loops.filter((ol) => ol.segments.length > 3 && loopArea(ol) < -0.5);
    outers.sort((a, b) => loopArea(b) - loopArea(a));
    const outline = outers[0] || roundedRectOutline(WX0, WZ0, WX1, WZ1, Math.max(0.35, wR));
    const extras = outers.slice(1);
    water = {
      X0: WX0,
      X1: WX1,
      Z0: WZ0,
      Z1: WZ1,
      R: Math.max(0.35, wR),
      islands,
      pits,
      spa: !!room.spaR,
      outline,
      extras,
      holes,
    };
  }

  const prof = {
    mx,
    mz,
    X0,
    X1,
    Z0,
    Z1,
    R,
    rSW,
    rSE,
    rNE,
    rNW,
    radii: { ne: rNE, se: rSE, nw: rNW, sw: rSW },
    e,
    w,
    n,
    s,
    h: room.spec.ceiling,
    biome: room.biome,
    water,
    arches: room.arches,
    vault: room.vault,
    spiral: room.spiral,
    oculus: room.oculus,
    alcoves,
    play: room.biome === "leisure" && rand01(seed, mx + 15, mz - 6) < 0.4,
    halls: [],
  };
  if (e) {
    const nb = roomAt(seed, extra, mx + 1, mz);
    const xEnd = ((mx + 1) * MACRO + nb.x0) * TILE;
    const len = xEnd - X1;
    const wid = e.b - e.a;
    if (len > 0.25 && wid > 0.5) {
      prof.halls.push(
        makeHall("x", X1, e.a, xEnd, e.b, Math.min(room.spec.ceiling, nb.spec.ceiling), room.biome, room.spec.ceiling, nb.spec.ceiling)
      );
    }
  }
  if (n) {
    const nb = roomAt(seed, extra, mx, mz + 1);
    const zEnd = ((mz + 1) * MACRO + nb.z0) * TILE;
    const len = zEnd - Z1;
    const wid = n.b - n.a;
    if (len > 0.25 && wid > 0.5) {
      prof.halls.push(
        makeHall("z", n.a, Z1, n.b, zEnd, Math.min(room.spec.ceiling, nb.spec.ceiling), room.biome, room.spec.ceiling, nb.spec.ceiling)
      );
    }
  }
  prof.outline = buildRoomOutline(prof);
  profileCache.set(key, prof);
  if (profileCache.size > PROFILE_CACHE_MAX) {
    profileCache.delete(profileCache.keys().next().value);
  }
  return prof;
}

export function pointInOpening(px, pz, prof, pad) {
  const { X0, X1, Z0, Z1 } = prof;
  const slack = pad + 0.02;
  const jamb = 0.1;
  const out = POOL_WALL_T + slack + 0.12;
  if (prof.e && pz >= prof.e.a + jamb && pz <= prof.e.b - jamb && px > X1 - slack && px < X1 + out) return true;
  if (prof.w && pz >= prof.w.a + jamb && pz <= prof.w.b - jamb && px < X0 + slack && px > X0 - out) return true;
  if (prof.n && px >= prof.n.a + jamb && px <= prof.n.b - jamb && pz > Z1 - slack && pz < Z1 + out) return true;
  if (prof.s && px >= prof.s.a + jamb && px <= prof.s.b - jamb && pz < Z0 + slack && pz > Z0 - out) return true;
  return false;
}

export function roomWallBlocked(px, pz, radius, prof) {
  let sdf = prof.outline ? sdfClosed(px, pz, prof.outline) : roundedRectSDF(px, pz, prof.X0, prof.Z0, prof.X1, prof.Z1, prof.radii);
  if (!prof.outline) {
    for (const a of prof.alcoves || []) {
      sdf = Math.min(sdf, roundedRectSDF(px, pz, a.X0, a.Z0, a.X1, a.Z1, a.r));
    }
  }
  let x0 = prof.X0;
  let x1 = prof.X1;
  let z0 = prof.Z0;
  let z1 = prof.Z1;
  for (const a of prof.alcoves || []) {
    x0 = Math.min(x0, a.X0);
    x1 = Math.max(x1, a.X1);
    z0 = Math.min(z0, a.Z0);
    z1 = Math.max(z1, a.Z1);
  }
  if (sdf < -radius) return false;
  const t = POOL_WALL_T + radius;
  if (px < x0 - t || px > x1 + t || pz < z0 - t || pz > z1 + t) return false;
  if (sdf > t) return false;
  if (pointInOpening(px, pz, prof, radius)) return false;
  return true;
}

export function poolEdgeEast(seed, tx, tz, extra) {
  return walkAt(seed, extra, tx, tz) !== walkAt(seed, extra, tx + 1, tz);
}

export function poolEdgeNorth(seed, tx, tz, extra) {
  return walkAt(seed, extra, tx, tz) !== walkAt(seed, extra, tx, tz + 1);
}
