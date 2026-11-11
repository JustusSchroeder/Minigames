import { getRecipe, pickExit } from "./levels.js";

export const TILE = 2.4;
export const CHUNK = 8;
export const STREAM = 2;
export const RADIUS = 0.16;
export const WALL_HALF = 0.1;

export function hashU32(seed, x, z) {
  let h = (seed | 0) ^ Math.imul(x | 0, 374761393);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ Math.imul(z | 0, 1274126177), 3266489909);
  h ^= h >>> 16;
  return h >>> 0;
}

export function rand01(seed, x, z) {
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

const REGION = 6;

export function regionKind(seed, tx, tz) {
  const rx = floorDiv(tx, REGION);
  const rz = floorDiv(tz, REGION);
  const r = rand01(seed, rx + 200, rz - 40);
  if (r < 0.2) return "plaza";
  if (r < 0.48) return "room";
  if (r < 0.78) return "halls";
  if (r < 0.9) return "dark";
  return "harsh";
}

function regionGate(seed, rx, rz, extra) {
  return {
    e: mazeOpenEast(seed + 1, rx, rz, extra + 0.38),
    n: mazeOpenNorth(seed + 1, rx, rz, extra + 0.38),
    w: mazeOpenEast(seed + 1, rx - 1, rz, extra + 0.38),
    s: mazeOpenNorth(seed + 1, rx, rz - 1, extra + 0.38),
  };
}

function poolEdgeEast(seed, x, z, extra) {
  const size = 5;
  if (posMod(x, size) !== size - 1) return false;
  const open = mazeOpenEast(seed + 3, floorDiv(x, size), floorDiv(z, size), extra + 0.2);
  return !(posMod(z, size) === 2 && open);
}

function poolEdgeNorth(seed, x, z, extra) {
  const size = 5;
  if (posMod(z, size) !== size - 1) return false;
  const open = mazeOpenNorth(seed + 3, floorDiv(x, size), floorDiv(z, size), extra + 0.2);
  return !(posMod(x, size) === 2 && open);
}

function warehouseEdgeEast(seed, x, z, extra) {
  const size = 8;
  if (posMod(x, size) !== size - 1) return false;
  const open = mazeOpenEast(seed + 9, floorDiv(x, size), floorDiv(z, size), extra + 0.45);
  const lz = posMod(z, size);
  return !(lz >= 2 && lz <= 5 && open);
}

function warehouseEdgeNorth(seed, x, z, extra) {
  const size = 8;
  if (posMod(z, size) !== size - 1) return false;
  const open = mazeOpenNorth(seed + 9, floorDiv(x, size), floorDiv(z, size), extra + 0.45);
  const lx = posMod(x, size);
  return !(lx >= 2 && lx <= 5 && open);
}

function mixedEdgeEast(seed, tx, tz, extra) {
  const rx = floorDiv(tx, REGION);
  const nx = floorDiv(tx + 1, REGION);
  const rz = floorDiv(tz, REGION);
  if (rx !== nx) {
    const gate = regionGate(seed, rx, rz, extra);
    const wide = regionKind(seed, tx, tz) === "plaza" || regionKind(seed, tx + 1, tz) === "plaza" ? 2 : 1;
    return !(Math.abs(posMod(tz, REGION) - 2.5) <= wide && gate.e);
  }
  const kind = regionKind(seed, tx, tz);
  if (kind === "plaza" || kind === "room") return false;
  return !mazeOpenEast(seed, tx, tz, extra);
}

function mixedEdgeNorth(seed, tx, tz, extra) {
  const rz = floorDiv(tz, REGION);
  const nz = floorDiv(tz + 1, REGION);
  const rx = floorDiv(tx, REGION);
  if (rz !== nz) {
    const gate = regionGate(seed, rx, rz, extra);
    const wide = regionKind(seed, tx, tz) === "plaza" || regionKind(seed, tx, tz + 1) === "plaza" ? 2 : 1;
    return !(Math.abs(posMod(tx, REGION) - 2.5) <= wide && gate.n);
  }
  const kind = regionKind(seed, tx, tz);
  if (kind === "plaza" || kind === "room") return false;
  return !mazeOpenNorth(seed, tx, tz, extra);
}

function caveSolid(seed, x, z) {
  const nx = floorDiv(x, 2);
  const nz = floorDiv(z, 2);
  const lx = posMod(x, 2);
  const lz = posMod(z, 2);
  if (lx === 0 && lz === 0) return false;
  if (lx === 1 && lz === 0 && mazeOpenEast(seed + 4, nx, nz, 0.28)) return false;
  if (lx === 0 && lz === 1 && mazeOpenNorth(seed + 4, nx, nz, 0.28)) return false;
  return rand01(seed, x + 70, z - 13) > 0.1;
}

function edgeEastClosed(recipe, seed, tx, tz) {
  const extra = recipe.extra;
  const layout = recipe.layout;
  if (layout === "caves") return caveSolid(seed, tx, tz) || caveSolid(seed, tx + 1, tz);
  if (layout === "pools") return poolEdgeEast(seed, tx, tz, extra);
  if (layout === "warehouse") return warehouseEdgeEast(seed, tx, tz, extra);
  if (layout === "pipes" || layout === "hotel") return !mazeOpenEast(seed, tx, tz, extra);
  return mixedEdgeEast(seed, tx, tz, extra);
}

function edgeNorthClosed(recipe, seed, tx, tz) {
  const extra = recipe.extra;
  const layout = recipe.layout;
  if (layout === "caves") return caveSolid(seed, tx, tz) || caveSolid(seed, tx, tz + 1);
  if (layout === "pools") return poolEdgeNorth(seed, tx, tz, extra);
  if (layout === "warehouse") return warehouseEdgeNorth(seed, tx, tz, extra);
  if (layout === "pipes" || layout === "hotel") return !mazeOpenNorth(seed, tx, tz, extra);
  return mixedEdgeNorth(seed, tx, tz, extra);
}

function wallsAt(recipe, seed, tx, tz) {
  return {
    e: edgeEastClosed(recipe, seed, tx, tz),
    n: edgeNorthClosed(recipe, seed, tx, tz),
    w: edgeEastClosed(recipe, seed, tx - 1, tz),
    s: edgeNorthClosed(recipe, seed, tx, tz - 1),
  };
}

function lightMode(seed, tx, tz, kind, layout) {
  const rk = rand01(seed, floorDiv(tx, REGION) + 301, floorDiv(tz, REGION) - 88);
  const tube = rand01(seed, tx + 301, tz - 88);
  if (layout === "pipes") return tube < 0.2 ? "dead" : "dim";
  if (layout === "caves") return tube < 0.7 ? "dead" : "dim";
  if (kind === "dark") return tube < 0.88 ? "dead" : "dim";
  if (kind === "harsh") return rk < 0.15 ? "dead" : "harsh";
  if (rk < 0.1) return "dead";
  if (rk < 0.2) return tube < 0.35 ? "dead" : "dim";
  if (tube < 0.045) return "dead";
  if (rk > 0.93) return "harsh";
  return "normal";
}

function exitFace(walls) {
  if (walls.n) return "n";
  if (walls.s) return "s";
  if (walls.e) return "e";
  if (walls.w) return "w";
  return null;
}

const WALL_EXITS = ["door", "fireexit", "elevator", "stair", "boiler", "garage", "cave", "manila"];
const WAREHOUSE = 8;
const WAREHOUSE_EXIT_SLOTS = [
  [7, 6],
  [0, 1],
  [6, 7],
  [1, 0],
];

function warehouseExitHere(seed, tx, tz) {
  const wx = floorDiv(tx, WAREHOUSE);
  const wz = floorDiv(tz, WAREHOUSE);
  if (rand01(seed + 7, wx, wz) > 0.72) return false;
  const slot = WAREHOUSE_EXIT_SLOTS[hashU32(seed + 91, wx, wz) % WAREHOUSE_EXIT_SLOTS.length];
  return posMod(tx, WAREHOUSE) === slot[0] && posMod(tz, WAREHOUSE) === slot[1];
}

function placeExit(recipeId, seed, tx, tz, ctx) {
  if (ctx.solid || ctx.pillar) return null;
  const face = exitFace(ctx.walls);

  if (ctx.layout === "maze" && ctx.manila && posMod(tx, REGION) === 2 && posMod(tz, REGION) === 2) {
    return { ...pickExit(recipeId, seed, tx, tz, "manila"), face: face || "n" };
  }

  if (ctx.layout === "warehouse" && face && !ctx.water && warehouseExitHere(seed, tx, tz)) {
    return { ...pickExit(recipeId, seed, tx, tz, WALL_EXITS), face };
  }

  if (ctx.layout === "office" && !ctx.water && ctx.kind === "room" && rand01(seed + 91, tx, tz) < 0.007) {
    return { ...pickExit(recipeId, seed, tx, tz, "dry"), face: null };
  }

  if (ctx.layout === "pools" && !ctx.water && ctx.opens >= 2 && face && rand01(seed + 91, tx, tz) < 0.02) {
    return { ...pickExit(recipeId, seed, tx, tz, "dry"), face };
  }

  if (ctx.water || !face) return null;
  const roll = rand01(seed + 91, tx, tz);
  if (ctx.opens === 1 && roll < 0.14) {
    return { ...pickExit(recipeId, seed, tx, tz, WALL_EXITS), face };
  }
  if (ctx.opens === 2 && roll < 0.016) {
    return { ...pickExit(recipeId, seed, tx, tz, WALL_EXITS), face };
  }
  return null;
}

function propAt(seed, tx, tz, info, layout) {
  if (info.water || info.pillar || info.door || info.solid) return null;
  const hasWall = info.walls.n || info.walls.e || info.walls.s || info.walls.w;
  const opens = info.opens;
  const r = rand01(seed, tx + 40, tz - 11);
  const kind = info.kind;

  if (layout === "maze") {
    if (info.manila && posMod(tx, REGION) === 2 && posMod(tz, REGION) === 2) return "table";
    if (hasWall && r < 0.04) return "outlet";
    if (opens <= 1 && r < 0.018) return "chair";
    return null;
  }

  if (layout === "warehouse") {
    const lx = posMod(tx, 8);
    const lz = posMod(tz, 8);
    const sector = rand01(seed, floorDiv(tx, 8) + 40, floorDiv(tz, 8) - 11);
    if (sector > 0.58) return null;
    const corner = (lx <= 1 || lx >= 6) && (lz <= 1 || lz >= 6);
    if (!corner) return null;
    if (r < 0.42) return "crate";
    if (r < 0.58) return "box";
    return null;
  }

  if (layout === "pipes") {
    if (hasWall && r < 0.7) return "pipe";
    if (opens <= 1 && r < 0.12) return "box";
    return null;
  }

  if (layout === "hotel") {
    if (opens > 1) return null;
    if (r < 0.34) return "lamp";
    if (r < 0.5) return "chair";
    return null;
  }

  if (layout === "office") {
    if (kind !== "room" && kind !== "plaza") return null;
    if (r < 0.09) return "chair";
    if (r < 0.13) return "cooler";
    return null;
  }

  if (layout === "caves") {
    const pack = rand01(seed, floorDiv(tx, 4) + 12, floorDiv(tz, 4) - 8);
    if (pack > 0.4) return null;
    if (r < 0.28) return "stalag";
    return null;
  }

  return null;
}

export function cellInfo(recipeId, seed, tx, tz) {
  const recipe = getRecipe(recipeId);
  const layout = recipe.layout;
  const kind = regionKind(seed, tx, tz);
  const solid = layout === "caves" && caveSolid(seed, tx, tz);
  const walls = solid ? { n: true, e: true, s: true, w: true } : wallsAt(recipe, seed, tx, tz);

  let floor = "carpet";
  let pillar = false;
  let water = false;

  if (layout === "pools") {
    const lx = posMod(tx, 5);
    const lz = posMod(tz, 5);
    water = lx > 0 && lx < 4 && lz > 0 && lz < 4;
    floor = water ? "water" : "tile";
    pillar = water && lx === 2 && lz === 2 && rand01(seed, tx, tz) < 0.45;
  } else if (layout === "warehouse") {
    floor = "concrete";
    const lx = posMod(tx, 3);
    const lz = posMod(tz, 3);
    pillar = lx === 1 && lz === 1 && rand01(seed, tx + 4, tz - 2) > 0.35;
    water = rand01(seed, tx - 3, tz + 8) < 0.02;
  } else if (layout === "pipes") {
    floor = "concrete";
  } else if (layout === "office") {
    floor = "tile";
  } else if (layout === "hotel") {
    floor = "carpet";
  } else if (layout === "caves") {
    floor = "rock";
  } else {
    floor = "carpet";
  }

  const opens = !walls.n + !walls.e + !walls.s + !walls.w;
  const manila =
    layout === "maze" && kind === "room" && rand01(seed, floorDiv(tx, REGION), floorDiv(tz, REGION) + 3) < 0.1;

  const placed = placeExit(recipeId, seed, tx, tz, { solid, water, pillar, manila, opens, walls, kind, layout });
  const exit = placed;
  const door = !!placed;

  if (manila && layout === "maze") floor = "wood";

  const light = lightMode(seed, tx, tz, kind, layout);
  const hole = !water && !solid && light !== "harsh" && rand01(seed, tx - 17, tz + 55) < (layout === "maze" ? 0.008 : 0.014);
  const info = { floor, water, pillar, door, exit, walls, light, hole, kind, solid, manila, opens, curved: !!recipe.curved };
  info.prop = propAt(seed, tx, tz, info, layout);
  return info;
}

export function worldToTile(x, z) {
  return { tx: Math.floor(x / TILE), tz: Math.floor(z / TILE) };
}

export function tileCenter(tx, tz) {
  return { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE };
}

function blockingProp(prop) {
  return prop === "crate" || prop === "box" || prop === "cooler" || prop === "table" || prop === "stalag";
}

function spawnable(recipeId, seed, tx, tz) {
  const info = cellInfo(recipeId, seed, tx, tz);
  if (info.solid || info.water || info.pillar || info.door || info.exit) return null;
  if (info.opens < 2) return null;
  if (blockingProp(info.prop)) return null;
  const p = tileCenter(tx, tz);
  if (blocked(recipeId, seed, p.x, p.z, RADIUS + 0.1)) return null;
  return { info, p };
}

export function spawnPoint(recipeId, seed) {
  let best = null;
  for (let r = 0; r < 22; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const hit = spawnable(recipeId, seed, dx, dz);
        if (!hit) continue;
        const score = hit.info.opens + (hit.info.kind === "plaza" || hit.info.kind === "halls" ? 2 : 0) - r * 0.05;
        if (!best || score > best.score) best = { ...hit, score };
      }
    }
    if (best && r >= 3) break;
  }
  if (!best) return { ...tileCenter(1, 1), yaw: 0 };
  return { ...best.p, yaw: facingYaw(best.info) };
}

export function nearExit(x, z, info) {
  if (!info.exit && !info.door) return false;
  if (!info.exit?.face) return !!(info.exit || info.door);
  const { tx, tz } = worldToTile(x, z);
  const lx = x - tx * TILE;
  const lz = z - tz * TILE;
  const lim = 0.95;
  if (info.exit.face === "n") return lz > TILE - lim;
  if (info.exit.face === "s") return lz < lim;
  if (info.exit.face === "e") return lx > TILE - lim;
  if (info.exit.face === "w") return lx < lim;
  return true;
}

export function facingYaw(info) {
  if (!info.walls.n) return Math.PI;
  if (!info.walls.s) return 0;
  if (!info.walls.e) return -Math.PI / 2;
  if (!info.walls.w) return Math.PI / 2;
  return 0;
}

function distPointSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + dx * t;
  const z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

function blocked(recipeId, seed, px, pz, radius) {
  const pad = radius + WALL_HALF;
  const minTx = Math.floor((px - pad) / TILE) - 1;
  const maxTx = Math.floor((px + pad) / TILE) + 1;
  const minTz = Math.floor((pz - pad) / TILE) - 1;
  const maxTz = Math.floor((pz + pad) / TILE) + 1;
  for (let tx = minTx; tx <= maxTx; tx++) {
    for (let tz = minTz; tz <= maxTz; tz++) {
      const info = cellInfo(recipeId, seed, tx, tz);
      if (info.solid) {
        const c = tileCenter(tx, tz);
        if (Math.abs(px - c.x) < TILE / 2 - 0.02 && Math.abs(pz - c.z) < TILE / 2 - 0.02) return true;
      }
      const x0 = tx * TILE;
      const z0 = tz * TILE;
      const x1 = x0 + TILE;
      const z1 = z0 + TILE;
      if (info.walls.w && distPointSeg(px, pz, x0, z0, x0, z1) < pad) return true;
      if (info.walls.e && distPointSeg(px, pz, x1, z0, x1, z1) < pad) return true;
      if (info.walls.s && distPointSeg(px, pz, x0, z0, x1, z0) < pad) return true;
      if (info.walls.n && distPointSeg(px, pz, x0, z1, x1, z1) < pad) return true;
      if (info.pillar) {
        const c = tileCenter(tx, tz);
        if (Math.hypot(px - c.x, pz - c.z) < radius + 0.2) return true;
      }
      if (info.prop === "crate" || info.prop === "box" || info.prop === "cooler" || info.prop === "table") {
        const c = tileCenter(tx, tz);
        if (Math.hypot(px - c.x, pz - c.z) < radius + 0.22) return true;
      }
      if (info.prop === "stalag") {
        const c = tileCenter(tx, tz);
        if (Math.hypot(px - c.x, pz - c.z) < radius + 0.12) return true;
      }
    }
  }
  return false;
}

export function moveBody(recipeId, seed, x, z, dx, dz, radius = RADIUS) {
  let nx = x + dx;
  let nz = z;
  if (blocked(recipeId, seed, nx, nz, radius)) nx = x;
  nz = z + dz;
  if (blocked(recipeId, seed, nx, nz, radius)) nz = z;
  return { x: nx, z: nz };
}

export function unstuck(recipeId, seed, x, z, radius = RADIUS) {
  if (!blocked(recipeId, seed, x, z, radius)) return { x, z };
  const p = spawnPoint(recipeId, seed);
  return { x: p.x, z: p.z };
}

export function losClear(recipeId, seed, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz) || 1;
  const steps = Math.ceil(dist / (TILE * 0.35));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = ax + dx * t;
    const z = az + dz * t;
    const { tx, tz } = worldToTile(x, z);
    const info = cellInfo(recipeId, seed, tx, tz);
    if (info.pillar || info.solid) return false;
    const lx = x - tx * TILE;
    const lz = z - tz * TILE;
    const edge = 0.08;
    if (info.walls.w && lx < edge) return false;
    if (info.walls.e && lx > TILE - edge) return false;
    if (info.walls.s && lz < edge) return false;
    if (info.walls.n && lz > TILE - edge) return false;
  }
  return true;
}

export function chunkKey(cx, cz) {
  return `${cx},${cz}`;
}

export function worldToChunk(x, z) {
  return {
    cx: Math.floor(x / (TILE * CHUNK)),
    cz: Math.floor(z / (TILE * CHUNK)),
  };
}

export function newSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
