const MAP = 5;
export const COLS = 64 * MAP;
export const ROWS = 64 * MAP;
export const TILE = 2;

const ISLAND = { c: 31.5 * MAP, r: 36 * MAP, rx: 18 * MAP, ry: 15.5 * MAP };
const ROCKS = [
  { c: 13.4 * MAP, r: 31.6 * MAP, rx: 2.4 * MAP, ry: 1.7 * MAP },
  { c: 37.6 * MAP, r: 51.2 * MAP, rx: 2.1 * MAP, ry: 1.35 * MAP },
  { c: 52.4 * MAP, r: 43.5 * MAP, rx: 1.9 * MAP, ry: 2.6 * MAP },
];

export const KEEP_TILES = [
  [30 * MAP, 39 * MAP],
  [30 * MAP + 1, 39 * MAP],
  [30 * MAP, 39 * MAP + 1],
  [30 * MAP + 1, 39 * MAP + 1],
];

function ellipse(x, z, ox, oz, rx, ry) {
  const dx = (x - ox) / rx;
  const dz = (z - oz) / ry;
  return dx * dx + dz * dz;
}

function coastScale(x, z) {
  const ang = Math.atan2(z - ISLAND.r * TILE, x - ISLAND.c * TILE);
  const lobes =
    Math.sin(ang * 2 + 0.7) * 0.1 +
    Math.sin(ang * 3 - 1.7) * 0.07 +
    Math.cos(ang * 5 + 0.4) * 0.04;
  const cove = Math.exp(-((ang - 2.35) * (ang - 2.35)) / 0.15) * 0.28;
  const shelf = Math.exp(-((ang - 1.15) * (ang - 1.15)) / 0.2) * 0.1;
  const bump = Math.exp(-(ang * ang) / 0.18) * 0.1;
  return Math.max(0.62, 1 + lobes - cove + shelf + bump);
}

function hash2(c, r) {
  let n = Math.imul(c | 0, 374761393) + Math.imul(r | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function sampleTerrain(x, z) {
  const scale = coastScale(x, z);
  const e = ellipse(x, z, ISLAND.c * TILE, ISLAND.r * TILE, ISLAND.rx * TILE, ISLAND.ry * TILE) / (scale * scale);
  let rock = 2;
  for (const blob of ROCKS) {
    rock = Math.min(rock, ellipse(x, z, blob.c * TILE, blob.r * TILE, blob.rx * TILE, blob.ry * TILE));
  }
  let kind = "sea";
  if (rock < 1 && e < 1.42) kind = "rock";
  else if (e <= 1) {
    const c = Math.floor(x / TILE);
    const r = Math.floor(z / TILE);
    const grove = hash2(Math.floor(c / (4 * MAP)), Math.floor(r / (4 * MAP)) + 3);
    const local = hash2(c + 11, r + 19);
    const nearKeep = KEEP_TILES.some(([kc, kr]) => Math.abs(kc - c) + Math.abs(kr - r) < 7 * MAP);
    kind = !nearKeep && e < 0.9 && grove > 0.78 && local > 0.42 ? "forest" : "grass";
  } else if (e <= 1.2) kind = "beach";
  else if (e <= 1.55) kind = "shallows";
  return { kind, e };
}

export function tileTerrain(c, r) {
  return sampleTerrain((c + 0.5) * TILE, (r + 0.5) * TILE).kind;
}

export function terrainHeight(x, z) {
  const info = sampleTerrain(x, z);
  const roll = Math.sin(x * 0.013) * Math.cos(z * 0.011) * 0.8;
  if (info.kind === "forest" || info.kind === "grass") return (0.55 + (1 - info.e) * 0.32) * MAP + roll * 0.35;
  if (info.kind === "rock") return 0.4 * MAP + roll * 0.12;
  if (info.kind === "beach") {
    const t = (info.e - 1) / 0.2;
    return (0.52 * (1 - t) + 0.1 * t) * MAP;
  }
  if (info.kind === "shallows") {
    const t = Math.min(1, (info.e - 1.2) / 0.35);
    return (0.1 * (1 - t) - 0.45 * t) * MAP;
  }
  return -0.28 * MAP;
}

function outerWater(angle) {
  let best = null;
  let bestE = -1;
  for (let dist = 8 * MAP; dist < 50 * MAP; dist += 1) {
    const c = Math.floor(ISLAND.c + Math.cos(angle) * dist);
    const r = Math.floor(ISLAND.r + Math.sin(angle) * dist);
    if (!inBounds(c, r)) break;
    const x = (c + 0.5) * TILE;
    const z = (r + 0.5) * TILE;
    const info = sampleTerrain(x, z);
    if (info.kind === "shallows" && info.e > bestE) {
      best = [c, r];
      bestE = info.e;
    } else if (info.kind === "sea" && best) break;
  }
  return best;
}

function shoreSpawns() {
  const spaced = [];
  let prev = null;
  for (let angle = -Math.PI + 0.04; angle < Math.PI; angle += 0.045) {
    const tile = outerWater(angle);
    if (!tile) continue;
    if (prev && Math.hypot(tile[0] - prev[0], tile[1] - prev[1]) < 18) continue;
    spaced.push(tile);
    prev = tile;
  }
  return spaced;
}

export const SPAWN_TILES = shoreSpawns();

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function inBounds(c, r) {
  return c >= 0 && r >= 0 && c < COLS && r < ROWS;
}

export function tileKey(c, r) {
  return r * COLS + c;
}

export function tileCenter(c, r) {
  return { x: (c + 0.5) * TILE, z: (r + 0.5) * TILE };
}

export function worldToTile(x, z) {
  return { c: Math.floor(x / TILE), r: Math.floor(z / TILE) };
}

export function fieldSize() {
  return { w: COLS * TILE, d: ROWS * TILE };
}

const KEEP_KEYS = new Set(KEEP_TILES.map(([c, r]) => tileKey(c, r)));

export function isKeepTile(c, r) {
  return KEEP_KEYS.has(tileKey(c, r));
}

let terrainWalk = null;
function getTerrainWalk() {
  if (!terrainWalk) {
    terrainWalk = new Uint8Array(COLS * ROWS);
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const ground = tileTerrain(c, r);
        if (ground === "grass" || ground === "beach" || ground === "shallows" || ground === "forest") {
          terrainWalk[tileKey(c, r)] = 1;
        }
      }
    }
  }
  return terrainWalk;
}

export function isSpawnTile(c, r) {
  return SPAWN_TILES.some(([sc, sr]) => sc === c && sr === r);
}

export function footprintOrigin(c, r, tilesW, tilesH) {
  return {
    c: c - Math.floor((tilesW - 1) / 2),
    r: r - Math.floor((tilesH - 1) / 2),
  };
}

export function footprintTiles(originC, originR, tilesW, tilesH) {
  const tiles = [];
  for (let dr = 0; dr < tilesH; dr += 1) {
    for (let dc = 0; dc < tilesW; dc += 1) {
      tiles.push([originC + dc, originR + dr]);
    }
  }
  return tiles;
}

export function footprintCenter(originC, originR, tilesW, tilesH) {
  const a = tileCenter(originC, originR);
  const b = tileCenter(originC + tilesW - 1, originR + tilesH - 1);
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

export function keepCenter() {
  return footprintCenter(KEEP_TILES[0][0], KEEP_TILES[0][1], 2, 2);
}

export function keepGoalTiles() {
  const goals = [];
  const seen = new Set();
  for (const [c, r] of KEEP_TILES) {
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inBounds(nc, nr) || isKeepTile(nc, nr)) continue;
      const k = tileKey(nc, nr);
      if (seen.has(k)) continue;
      seen.add(k);
      goals.push([nc, nr]);
    }
  }
  return goals;
}

export const WALL_HALF = 0.32;
export const WALL_MIN_LEN = TILE * 0.7;
export const WALL_MAX_LEN = TILE * 14;
export const WALL_MESH_LEN = 1.92;

export function distToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const apx = px - ax;
  const apz = pz - az;
  const ab2 = abx * abx + abz * abz;
  const t = ab2 < 1e-8 ? 0 : Math.max(0, Math.min(1, (apx * abx + apz * abz) / ab2));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

export function clampWallEnd(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  if (len <= WALL_MAX_LEN || len < 1e-8) return { x: bx, z: bz, len };
  const s = WALL_MAX_LEN / len;
  return { x: ax + dx * s, z: az + dz * s, len: WALL_MAX_LEN };
}

export function wallYaw(ax, az, bx, bz) {
  return Math.atan2(-(bz - az), bx - ax);
}

export function wallChunkCount(len) {
  return Math.max(1, Math.round(len / TILE));
}

export function wallPieces(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const n = wallChunkCount(len);
  const yaw = wallYaw(ax, az, bx, bz);
  const pieces = [];
  for (let i = 0; i < n; i += 1) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const pax = ax + dx * t0;
    const paz = az + dz * t0;
    const pbx = ax + dx * t1;
    const pbz = az + dz * t1;
    pieces.push({
      ax: pax,
      az: paz,
      bx: pbx,
      bz: pbz,
      x: (pax + pbx) / 2,
      z: (paz + pbz) / 2,
      length: len / n,
      yaw,
    });
  }
  return pieces;
}

function segmentHitsAabb(ax, az, bx, bz, minX, minZ, maxX, maxZ) {
  const dx = bx - ax;
  const dz = bz - az;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (Math.abs(p) < 1e-9) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, ax - minX) && clip(dx, maxX - ax) && clip(-dz, az - minZ) && clip(dz, maxZ - az);
}

export function tilesTouchedByCircle(x, z, radius) {
  const minC = Math.max(0, Math.floor((x - radius) / TILE));
  const maxC = Math.min(COLS - 1, Math.floor((x + radius) / TILE));
  const minR = Math.max(0, Math.floor((z - radius) / TILE));
  const maxR = Math.min(ROWS - 1, Math.floor((z + radius) / TILE));
  const r2 = radius * radius;
  const tiles = [];
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      const nx = Math.max(c * TILE, Math.min(x, (c + 1) * TILE));
      const nz = Math.max(r * TILE, Math.min(z, (r + 1) * TILE));
      const dx = x - nx;
      const dz = z - nz;
      if (dx * dx + dz * dz <= r2) tiles.push([c, r]);
    }
  }
  return tiles;
}

export function tilesTouchedByWall(ax, az, bx, bz, half = WALL_HALF) {
  const minC = Math.max(0, Math.floor((Math.min(ax, bx) - half) / TILE));
  const maxC = Math.min(COLS - 1, Math.floor((Math.max(ax, bx) + half) / TILE));
  const minR = Math.max(0, Math.floor((Math.min(az, bz) - half) / TILE));
  const maxR = Math.min(ROWS - 1, Math.floor((Math.max(az, bz) + half) / TILE));
  const tiles = [];
  for (let r = minR; r <= maxR; r += 1) {
    for (let c = minC; c <= maxC; c += 1) {
      if (segmentHitsAabb(ax, az, bx, bz, c * TILE - half, r * TILE - half, (c + 1) * TILE + half, (r + 1) * TILE + half)) {
        tiles.push([c, r]);
      }
    }
  }
  return tiles;
}

function segmentsCross(ax, az, bx, bz, cx, cz, dx, dz) {
  const abx = bx - ax;
  const abz = bz - az;
  const cdx = dx - cx;
  const cdz = dz - cz;
  const den = abx * cdz - abz * cdx;
  if (Math.abs(den) < 1e-8) return false;
  const t = ((cx - ax) * cdz - (cz - az) * cdx) / den;
  const u = ((cx - ax) * abz - (cz - az) * abx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function distBetweenSegments(ax, az, bx, bz, cx, cz, dx, dz) {
  if (segmentsCross(ax, az, bx, bz, cx, cz, dx, dz)) return 0;
  return Math.min(
    distToSegment(ax, az, cx, cz, dx, dz),
    distToSegment(bx, bz, cx, cz, dx, dz),
    distToSegment(cx, cz, ax, az, bx, bz),
    distToSegment(dx, dz, ax, az, bx, bz)
  );
}

export function createWorld() {
  const occ = new Array(COLS * ROWS).fill(null);
  const atId = new Map();
  let version = 1;
  let walls = [];
  const wallIndex = new Map();
  const walk = getTerrainWalk();
  const flowDir = new Int8Array(COLS * ROWS);
  const flowHas = new Uint8Array(COLS * ROWS);
  let flowAtVersion = -1;

  function get(c, r) {
    if (!inBounds(c, r)) return { kind: "oob" };
    return occ[tileKey(c, r)];
  }

  function unindex(id, k) {
    const list = atId.get(id);
    if (!list) return;
    const i = list.indexOf(k);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) atId.delete(id);
  }

  function set(c, r, value) {
    if (!inBounds(c, r)) return;
    const k = tileKey(c, r);
    const prev = occ[k];
    if (prev?.id) unindex(prev.id, k);
    occ[k] = value;
    if (value?.id) {
      let list = atId.get(value.id);
      if (!list) {
        list = [];
        atId.set(value.id, list);
      }
      list.push(k);
    }
    version += 1;
  }

  function clearId(id) {
    const list = atId.get(id);
    if (!list) return;
    for (const k of list) occ[k] = null;
    atId.delete(id);
    version += 1;
  }

  function wallsAt(c, r) {
    return wallIndex.get(tileKey(c, r)) || [];
  }

  function setWalls(list) {
    walls = list.map((w) => ({
      id: w.id,
      ax: w.ax,
      az: w.az,
      bx: w.bx,
      bz: w.bz,
      half: w.half ?? WALL_HALF,
    }));
    wallIndex.clear();
    for (const wall of walls) {
      for (const [c, r] of tilesTouchedByWall(wall.ax, wall.az, wall.bx, wall.bz, wall.half + 0.05)) {
        const k = tileKey(c, r);
        let bucket = wallIndex.get(k);
        if (!bucket) {
          bucket = [];
          wallIndex.set(k, bucket);
        }
        bucket.push(wall);
      }
    }
    version += 1;
  }

  function nearbyWalls(c, r) {
    const seen = new Set();
    const out = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        for (const wall of wallsAt(c + dc, r + dr)) {
          if (seen.has(wall.id)) continue;
          seen.add(wall.id);
          out.push(wall);
        }
      }
    }
    return out;
  }

  function wallHitsPoint(x, z, extra = 0) {
    const { c, r } = worldToTile(x, z);
    for (const wall of nearbyWalls(c, r)) {
      if (distToSegment(x, z, wall.ax, wall.az, wall.bx, wall.bz) <= wall.half + extra) return wall;
    }
    return null;
  }

  function nearestWall(x, z, radius) {
    const { c, r } = worldToTile(x, z);
    const rad = Math.max(1, Math.ceil(radius / TILE) + 1);
    const seen = new Set();
    let best = null;
    let bestD = radius;
    for (let dr = -rad; dr <= rad; dr += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        for (const wall of wallsAt(c + dc, r + dr)) {
          if (seen.has(wall.id)) continue;
          seen.add(wall.id);
          const d = distToSegment(x, z, wall.ax, wall.az, wall.bx, wall.bz) - wall.half;
          if (d < bestD) {
            best = wall;
            bestD = d;
          }
        }
      }
    }
    return best;
  }

  function wallBlocksSegment(ax, az, bx, bz, extra = 0) {
    const seen = new Set();
    const hits = [];
    const spots = [
      worldToTile(ax, az),
      worldToTile(bx, bz),
      worldToTile((ax + bx) / 2, (az + bz) / 2),
    ];
    for (const spot of spots) {
      for (const wall of nearbyWalls(spot.c, spot.r)) hits.push(wall);
    }
    for (const wall of hits) {
      if (seen.has(wall.id)) continue;
      seen.add(wall.id);
      if (distBetweenSegments(ax, az, bx, bz, wall.ax, wall.az, wall.bx, wall.bz) <= wall.half + extra) return wall;
    }
    return null;
  }

  function wallTouchesTile(c, r) {
    return wallsAt(c, r).length > 0;
  }

  function wallConflicts(ax, az, bx, bz) {
    if (!walls.length) return false;
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) return true;
    const skip = Math.min(WALL_HALF * 1.7, len * 0.22);
    const steps = Math.max(3, Math.ceil(len / 0.28));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const dist = t * len;
      if (dist < skip || len - dist < skip) continue;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      if (wallHitsPoint(x, z, WALL_HALF * 0.15)) return true;
    }
    return false;
  }

  function walkable(c, r, ignoreId = null) {
    if (!inBounds(c, r) || KEEP_KEYS.has(tileKey(c, r))) return false;
    if (!walk[tileKey(c, r)]) return false;
    const p = tileCenter(c, r);
    if (wallHitsPoint(p.x, p.z)) return false;
    const cell = get(c, r);
    if (!cell || cell.kind === "troop" || cell.kind === "enemy") return true;
    return ignoreId != null && cell.id === ignoreId;
  }

  function canStand(c, r) {
    if (!inBounds(c, r) || KEEP_KEYS.has(tileKey(c, r)) || !walk[tileKey(c, r)]) return false;
    const p = tileCenter(c, r);
    if (wallHitsPoint(p.x, p.z)) return false;
    const cell = get(c, r);
    return !cell || cell.kind === "troop" || cell.kind === "enemy";
  }

  function rebuildFlow() {
    flowDir.fill(-1);
    flowHas.fill(0);
    const q = [];
    let head = 0;
    for (const [c, r] of keepGoalTiles()) {
      if (!canStand(c, r)) continue;
      const k = tileKey(c, r);
      if (flowHas[k]) continue;
      flowHas[k] = 1;
      flowDir[k] = -1;
      q.push(k);
    }
    while (head < q.length) {
      const k = q[head++];
      const c = k % COLS;
      const r = (k - c) / COLS;
      for (let d = 0; d < 4; d += 1) {
        const nc = c + DIRS[d][0];
        const nr = r + DIRS[d][1];
        if (!inBounds(nc, nr)) continue;
        const nk = tileKey(nc, nr);
        if (flowHas[nk] || !canStand(nc, nr)) continue;
        const a = tileCenter(c, r);
        const b = tileCenter(nc, nr);
        if (wallBlocksSegment(a.x, a.z, b.x, b.z)) continue;
        flowHas[nk] = 1;
        flowDir[nk] = d ^ 1;
        q.push(nk);
      }
    }
  }

  function ensureFlow() {
    if (flowAtVersion === version) return;
    flowAtVersion = version;
    rebuildFlow();
  }

  function flowAt(c, r) {
    if (!inBounds(c, r)) return null;
    const k = tileKey(c, r);
    if (!flowHas[k]) return null;
    const d = flowDir[k];
    if (d < 0) return { arrived: true, dx: 0, dz: 0, nc: c, nr: r };
    return {
      arrived: false,
      dx: DIRS[d][0],
      dz: DIRS[d][1],
      nc: c + DIRS[d][0],
      nr: r + DIRS[d][1],
    };
  }

  function canStep(c, r, nc, nr, ignoreId = null) {
    if (!walkable(nc, nr, ignoreId)) return false;
    const a = tileCenter(c, r);
    const b = tileCenter(nc, nr);
    return !wallBlocksSegment(a.x, a.z, b.x, b.z);
  }

  function neighbors(c, r, ignoreId) {
    const out = [];
    for (const [dc, dr] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (canStep(c, r, nc, nr, ignoreId)) out.push([nc, nr]);
    }
    return out;
  }

  function astar(startC, startR, goals, ignoreId = null) {
    const goalSet = new Set(goals.map(([c, r]) => tileKey(c, r)));
    if (goalSet.has(tileKey(startC, startR))) return [];

    const open = [];
    heapPush(open, [0, startC, startR]);
    const came = new Map();
    const gScore = new Map([[tileKey(startC, startR), 0]]);

    const heuristic = (c, r) => {
      let best = Infinity;
      for (const [gc, gr] of goals) {
        const d = Math.abs(gc - c) + Math.abs(gr - r);
        if (d < best) best = d;
      }
      return best;
    };

    while (open.length) {
      const [, c, r] = heapPop(open);
      const k = tileKey(c, r);
      if (goalSet.has(k)) {
        const path = [[c, r]];
        let cur = k;
        while (came.has(cur)) {
          cur = came.get(cur);
          const cc = cur % COLS;
          const rr = (cur - cc) / COLS;
          path.push([cc, rr]);
        }
        path.reverse();
        path.shift();
        return path;
      }

      for (const [nc, nr] of neighbors(c, r, ignoreId)) {
        const nk = tileKey(nc, nr);
        const next = (gScore.get(k) ?? Infinity) + 1;
        if (next < (gScore.get(nk) ?? Infinity)) {
          came.set(nk, k);
          gScore.set(nk, next);
          heapPush(open, [next + heuristic(nc, nr), nc, nr]);
        }
      }
    }
    return null;
  }

  function floodFrom(tiles) {
    const seen = new Set();
    const q = [];
    for (const [c, r] of tiles) {
      if (!inBounds(c, r)) continue;
      const k = tileKey(c, r);
      if (seen.has(k)) continue;
      if (get(c, r) && !isSpawnTile(c, r)) continue;
      seen.add(k);
      q.push([c, r]);
    }
    while (q.length) {
      const [c, r] = q.shift();
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        if (!canStep(c, r, nc, nr)) continue;
        const k = tileKey(nc, nr);
        if (seen.has(k)) continue;
        seen.add(k);
        q.push([nc, nr]);
      }
    }
    return seen;
  }

  function blockersBeside(reachable, entities) {
    const hits = [];
    const seen = new Set();
    for (const [c, r] of cellsFromSet(reachable)) {
      for (const [dc, dr] of DIRS) {
        const nc = c + dc;
        const nr = r + dr;
        const cell = get(nc, nr);
        if (!cell || seen.has(cell.id)) continue;
        const ent = entities.get(cell.id);
        if (!ent || ent.hp <= 0) continue;
        seen.add(cell.id);
        hits.push(ent);
      }
    }
    return hits;
  }

  function cellsFromSet(set) {
    const tiles = [];
    for (const k of set) {
      const c = k % COLS;
      const r = (k - c) / COLS;
      tiles.push([c, r]);
    }
    return tiles;
  }

  function findSmashTarget(entities) {
    const reachable = floodFrom(SPAWN_TILES);
    const keepAdj = keepGoalTiles();
    if (keepAdj.some(([c, r]) => reachable.has(tileKey(c, r)))) return null;
    const blockers = blockersBeside(reachable, entities);
    const seen = new Set(blockers.map((b) => b.id));
    for (const [c, r] of cellsFromSet(reachable)) {
      for (const wall of nearbyWalls(c, r)) {
        if (seen.has(wall.id)) continue;
        const ent = entities.get(wall.id);
        if (!ent || ent.hp <= 0) continue;
        const p = tileCenter(c, r);
        if (distToSegment(p.x, p.z, wall.ax, wall.az, wall.bx, wall.bz) > TILE * 0.85 + wall.half) continue;
        seen.add(wall.id);
        blockers.push(ent);
      }
    }
    if (!blockers.length) return null;
    blockers.sort((a, b) => a.hp - b.hp || a.id - b.id);
    return blockers[0];
  }

  function nearestFreeAround(c, r, ignoreId = null) {
    if (walkable(c, r, ignoreId)) return [c, r];
    for (let rad = 1; rad < 8; rad += 1) {
      for (let dc = -rad; dc <= rad; dc += 1) {
        for (let dr = -rad; dr <= rad; dr += 1) {
          if (Math.abs(dc) !== rad && Math.abs(dr) !== rad) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (walkable(nc, nr, ignoreId)) return [nc, nr];
        }
      }
    }
    return null;
  }

  function canBuild(c, r) {
    return inBounds(c, r) && tileTerrain(c, r) === "grass" && !isKeepTile(c, r) && !get(c, r);
  }

  function canBuildAll(tiles) {
    return tiles.every(([c, r]) => canBuild(c, r));
  }

  function occupy(tiles, value) {
    for (const [c, r] of tiles) set(c, r, value);
  }

  return {
    get,
    set,
    occupy,
    clearId,
    walkable,
    astar,
    findSmashTarget,
    nearestFreeAround,
    canBuild,
    canBuildAll,
    setWalls,
    wallHitsPoint,
    wallTouchesTile,
    wallConflicts,
    nearestWall,
    ensureFlow,
    flowAt,
    version: () => version,
  };
}

function heapPush(heap, node) {
  heap.push(node);
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heap[p][0] <= heap[i][0]) break;
    [heap[p], heap[i]] = [heap[i], heap[p]];
    i = p;
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (!heap.length) return top;
  heap[0] = last;
  let i = 0;
  while (true) {
    const l = i * 2 + 1;
    const r = l + 1;
    let s = i;
    if (l < heap.length && heap[l][0] < heap[s][0]) s = l;
    if (r < heap.length && heap[r][0] < heap[s][0]) s = r;
    if (s === i) break;
    [heap[s], heap[i]] = [heap[i], heap[s]];
    i = s;
  }
  return top;
}
