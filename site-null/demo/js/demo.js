import * as THREE from "three";
import { createAudio } from "../../js/audio.js";
import { createShowcase } from "../../js/entities.js";
import { getRecipe } from "../../js/levels.js";
import { nearbyProfile, sdfWater, spiralLayout } from "../../js/poolrooms.js";
import { createView3D } from "../../js/view3d.js";
import {
  RADIUS,
  TILE,
  cellInfo,
  findSpiral,
  losClear,
  moveOnFoot,
  sampleCeiling,
  sampleFloor,
  groundAt,
  spawnPoint,
  unstuck,
  worldToTile,
} from "../../js/world.js";
import { createSkyWorld } from "./skyworld.js";

function rewriteAsset(url) {
  if (typeof url === "string" && url.startsWith("assets/")) return `../${url}`;
  return url;
}

const _fetch = window.fetch.bind(window);
window.fetch = (input, init) => _fetch(rewriteAsset(input), init);
THREE.DefaultLoadingManager.setURLModifier(rewriteAsset);

const EYE = 1.65;
const HEAD = 1.72;
const SPRINT = 4.6;
const STEP_UP = 0.52;
const GRAVITY = 22;
const JUMP_VEL = 7.4;
const FOV = 74;
const FOV_RUN = 80;
const DIRS = [
  { k: "n", dx: 0, dz: 1 },
  { k: "e", dx: 1, dz: 0 },
  { k: "s", dx: 0, dz: -1 },
  { k: "w", dx: -1, dz: 0 },
];

const POOL_TOUR = {
  seed: 12004,
  spawn: { x: -82.2, z: -16.5, yaw: 0.35 },
  path: [
    { x: -82.2, z: -16.5 },
    { x: -82.2, z: -10.2 },
    { x: -80.0, z: -8.8, hop: true },
    { x: -77.2, z: -8.6 },
    { x: -74.6, z: -7.5, hop: true },
    { x: -73.0, z: -5.7 },
  ],
  atrium: {
    spawn: { x: -72.0, z: -61.8, yaw: 0 },
    path: [
      { x: -72.0, z: -61.8 },
      { x: -71.6, z: -66.8 },
      { x: -70.9, z: -70.2 },
      { x: -70.3, z: -72.0, hop: true },
    ],
  },
};

const BEATS = [
  { id: "lobby", recipeId: "lobby", seed: 24011, kind: "wander", want: 22, intro: true },
  { id: "habitable", recipeId: "habitable", seed: 9103, kind: "wander", want: 12, cut: "blink" },
  { id: "pipes", recipeId: "pipes", seed: 77221, kind: "wander", want: 11, cut: "flicker", hopIn: true },
  { id: "office", recipeId: "office", seed: 44102, kind: "wander", want: 10, cut: "blink", huntEnd: true },
  { id: "hotel", recipeId: "hotel", seed: 5508, kind: "wander", want: 11, cut: "blink" },
  { id: "caves", recipeId: "caves", seed: 88041, kind: "wander", want: 10, cut: "flicker", hopIn: true },
  { id: "pools", recipeId: "poolrooms", seed: 12004, kind: "wander", want: 28, cut: "fall", lookUp: true },
  { id: "sky", kind: "skydive", cut: "none" },
  { id: "leave", kind: "end", cut: "blink" },
];

const ui = {
  canvas: document.getElementById("view"),
  menu: document.getElementById("menu"),
  end: document.getElementById("end"),
  place: document.getElementById("place"),
  ticks: document.getElementById("ticks"),
  lidTop: document.querySelector(".lid.top"),
  lidBot: document.querySelector(".lid.bot"),
  lidFade: document.querySelector(".lid.fade"),
  btnEnter: document.getElementById("btn-enter"),
  btnAgain: document.getElementById("btn-again"),
  grain: document.querySelector(".grain"),
  static: document.getElementById("static"),
  whiteout: document.getElementById("whiteout"),
  lookHint: document.getElementById("look-hint"),
};

const view = createView3D(ui.canvas);
const audio = createAudio();

const cam = {
  recipeId: "lobby",
  seed: BEATS[0].seed,
  x: 0,
  y: EYE,
  z: 0,
  yaw: 0,
  pitch: -0.04,
  feet: 0,
};

const blink = {
  phase: "open",
  t: 0,
  hold: 0.1,
  amount: 0,
  flickerLeft: 0,
  onShut: null,
  landed: false,
  fallFrom: 0,
};
let fovNow = FOV;
let cutRoll = 0;

const bob = { phase: 0, mix: 0, sign: 0 };
const hop = { vy: 0, coyote: 0, grounded: true, pending: false, clip: Object.create(null) };
const glow = { amount: 0 };
const look = { yaw: 0, pitch: 0, moved: 0, unlockAt: 0 };
const glance = { yaw: 0 };
const lookKeys = new Set();
let ents = [];
let playing = false;
let beatIndex = 0;
let beat = null;
let last = performance.now();
let stuckT = 0;
let lookYaw = 0;
let wantPitch = 0.14;
let cutTo = -1;
const LOOK_ANG = -0.52;
let skyWorld = null;
const skyFall = {
  active: false,
  stage: "fall",
  t: 0,
  vy: -22,
  baseYaw: 0.08,
  fade: 1,
  roll: 0,
  gust: { x: 0, z: 0, tx: 0, tz: 0, t: 0 },
  windLook: { yaw: 0, pitch: 0 },
};

ui.ticks.innerHTML = BEATS.map(() => "<i></i>").join("");

function ease(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function yawTo(from, to) {
  return Math.atan2(from.x - to.x, from.z - to.z);
}

function applyLids(amount) {
  blink.amount = amount;
  const e = ease(amount);
  if (ui.lidTop) ui.lidTop.style.transform = `translateY(${(-102 + e * 102).toFixed(2)}%)`;
  if (ui.lidBot) ui.lidBot.style.transform = `translateY(${(102 - e * 102).toFixed(2)}%)`;
  if (ui.lidFade) ui.lidFade.style.opacity = String(e * 0.4);
  view.setBlinkDim(e);
}

function setStatic(on) {
  ui.grain?.classList.toggle("hard", !!on);
  ui.static?.classList.toggle("on", !!on);
}

function setWhite(amount) {
  if (ui.whiteout) ui.whiteout.style.opacity = String(Math.max(0, Math.min(1, amount)));
}

function closeLids(hold, onShut) {
  blink.phase = "closing";
  blink.t = 0;
  blink.hold = hold ?? 0.22;
  blink.onShut = onShut || null;
  audio.blink();
}

function flickerThen(onShut) {
  blink.phase = "flicker";
  blink.t = 0;
  blink.flickerLeft = 11;
  blink.onShut = onShut || null;
  setStatic(true);
}

function fallThen(onShut) {
  blink.phase = "fall";
  blink.t = 0;
  blink.landed = false;
  blink.onShut = onShut || null;
  audio.scrape();
}

function tileCenterWorld(tx, tz) {
  return { x: (tx + 0.5) * TILE, z: (tz + 0.5) * TILE };
}

function centerFree(recipeId, seed, tx, tz) {
  const c = tileCenterWorld(tx, tz);
  return losClear(recipeId, seed, c.x, c.z, c.x, c.z);
}

function passable(recipeId, seed, tx, tz) {
  const info = cellInfo(recipeId, seed, tx, tz);
  if (info.solid || info.pillar || info.blockR) return false;
  if (info.feature === "chute" || info.feature === "stairs") return false;
  if (info.water) return false;
  if (info.prop === "crate" || info.prop === "box" || info.prop === "cooler" || info.prop === "table") return false;
  if (recipeId === "poolrooms" && !centerFree(recipeId, seed, tx, tz)) return false;
  return true;
}

function linked(recipeId, seed, tx, tz, dir) {
  const nx = tx + dir.dx;
  const nz = tz + dir.dz;
  if (!passable(recipeId, seed, nx, nz)) return false;
  if (recipeId === "poolrooms") {
    const a = tileCenterWorld(tx, tz);
    const b = tileCenterWorld(nx, nz);
    return losClear(recipeId, seed, a.x, a.z, b.x, b.z);
  }
  const a = cellInfo(recipeId, seed, tx, tz);
  const b = cellInfo(recipeId, seed, nx, nz);
  if (dir.k === "n" && (a.walls.n || b.walls.s)) return false;
  if (dir.k === "s" && (a.walls.s || b.walls.n)) return false;
  if (dir.k === "e" && (a.walls.e || b.walls.w)) return false;
  if (dir.k === "w" && (a.walls.w || b.walls.e)) return false;
  return true;
}

function neighbors(recipeId, seed, tx, tz) {
  const out = [];
  for (const d of DIRS) {
    if (linked(recipeId, seed, tx, tz, d)) out.push({ tx: tx + d.dx, tz: tz + d.dz, dir: d.k });
  }
  return out;
}

function bfsPath(recipeId, seed, start, goal, limit = 90) {
  const key = (t) => `${t.tx},${t.tz}`;
  const q = [start];
  const came = new Map([[key(start), null]]);
  while (q.length) {
    const cur = q.shift();
    if (cur.tx === goal.tx && cur.tz === goal.tz) {
      const path = [cur];
      let k = key(cur);
      while (came.get(k)) {
        const prev = came.get(k);
        path.push(prev);
        k = key(prev);
      }
      path.reverse();
      return path;
    }
    if (came.size > limit) break;
    for (const n of neighbors(recipeId, seed, cur.tx, cur.tz)) {
      const k = key(n);
      if (came.has(k)) continue;
      came.set(k, cur);
      q.push(n);
    }
  }
  return null;
}

function findExitNear(recipeId, seed, tx, tz, maxR = 26) {
  for (let r = 3; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const info = cellInfo(recipeId, seed, tx + dx, tz + dz);
        if (!info.exit && !info.door) continue;
        if (!passable(recipeId, seed, tx + dx, tz + dz) && !info.door) continue;
        return { tx: tx + dx, tz: tz + dz };
      }
    }
  }
  return null;
}

function hallRun(recipeId, seed, tx, tz, dir, max = 22) {
  const path = [{ tx, tz, dir: dir.k }];
  let cx = tx;
  let cz = tz;
  for (let i = 0; i < max; i++) {
    if (!linked(recipeId, seed, cx, cz, dir)) break;
    cx += dir.dx;
    cz += dir.dz;
    path.push({ tx: cx, tz: cz, dir: dir.k });
  }
  return path;
}

function hallSideDoors(recipeId, seed, run) {
  let n = 0;
  for (const p of run) {
    const info = cellInfo(recipeId, seed, p.tx, p.tz);
    if (info.opens >= 3) n += 1;
  }
  return n;
}

function longestHallNear(recipeId, seed, start, radius = 10) {
  let best = null;
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const tx = start.tx + dx;
      const tz = start.tz + dz;
      if (!passable(recipeId, seed, tx, tz)) continue;
      for (const d of DIRS) {
        const run = hallRun(recipeId, seed, tx, tz, d);
        if (run.length < 4) continue;
        const dist = Math.abs(dx) + Math.abs(dz);
        const doors = hallSideDoors(recipeId, seed, run);
        const score = run.length * 1.6 + doors * 4.5 - dist * 0.12;
        if (!best || score > best.score) best = { path: run, score };
      }
    }
  }
  return best?.path || null;
}

function greedyPath(recipeId, seed, start, want) {
  const path = [{ tx: start.tx, tz: start.tz }];
  const used = new Set([`${start.tx},${start.tz}`]);
  let dir = null;
  for (let i = 0; i < want; i++) {
    const cur = path[path.length - 1];
    const choices = [];
    for (const n of neighbors(recipeId, seed, cur.tx, cur.tz)) {
      const k = `${n.tx},${n.tz}`;
      if (used.has(k)) continue;
      const info = cellInfo(recipeId, seed, n.tx, n.tz);
      const straight = dir && n.dir === dir ? 0.8 : dir ? -0.2 : 0.1;
      const hall = info.opens === 2 ? 0.55 : info.opens >= 3 ? 0.08 : -0.25;
      const door = info.door || info.exit ? 0.2 : 0;
      const tall = recipeId === "poolrooms" && (info.ceiling || 0) > 5 ? 0.4 : 0;
      choices.push({ n, score: straight + hall + door + tall });
    }
    if (!choices.length) break;
    choices.sort((a, b) => b.score - a.score);
    const pick = choices[0].n;
    dir = pick.dir;
    path.push(pick);
    used.add(`${pick.tx},${pick.tz}`);
  }
  return path;
}

function poolStartTile(seed, x, z) {
  const start = worldToTile(x, z);
  if (passable("poolrooms", seed, start.tx, start.tz)) return start;
  for (let r = 1; r <= 4; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (passable("poolrooms", seed, start.tx + dx, start.tz + dz)) {
          return { tx: start.tx + dx, tz: start.tz + dz };
        }
      }
    }
  }
  return start;
}

function nodesFrom(points) {
  return points.map((p) => {
    const t = worldToTile(p.x, p.z);
    return { x: p.x, z: p.z, tx: t.tx, tz: t.tz, hop: !!p.hop, spiral: !!p.spiral };
  });
}

function spiralNodes() {
  const rec = getRecipe("poolrooms");
  const hit = findSpiral(POOL_TOUR.seed, rec.extra);
  const prof = nearbyProfile(POOL_TOUR.seed, rec.extra, hit?.midX ?? -72, hit?.midZ ?? -72);
  const sp = spiralLayout(prof);
  if (!sp) return [];
  return sp.steps.map((s) => {
    const t = worldToTile(s.x, s.z);
    return { x: s.x, z: s.z, tx: t.tx, tz: t.tz, spiral: true };
  });
}

function poolTourPath() {
  if (beat?.atrium && POOL_TOUR.atrium) return nodesFrom(POOL_TOUR.atrium.path).concat(spiralNodes());
  return nodesFrom(POOL_TOUR.path);
}

function poolWaterSdf(x, z) {
  const rec = getRecipe("poolrooms");
  const prof = nearbyProfile(cam.seed, rec.extra, x, z);
  return sdfWater(x, z, prof?.water);
}

function poolIgnoreWallPush() {
  if (cam.recipeId !== "poolrooms") return true;
  if (!hop.grounded || hop.pending) return true;
  if (beat?.stage === "glow" || beat?.stage === "toAtrium") return true;
  const node = beat?.path?.[beat.i];
  if (node?.hop || node?.spiral) return true;
  return poolWaterSdf(cam.x, cam.z) < -0.05;
}

function keepOffPoolWalls(x, z) {
  if (poolIgnoreWallPush()) return { x, z };
  let nx = x;
  let nz = z;
  for (let i = 0; i < 5; i++) {
    let ox = 0;
    let oz = 0;
    let hits = 0;
    const probe = 0.48;
    for (const d of DIRS) {
      const px = nx + d.dx * probe;
      const pz = nz + d.dz * probe;
      if (poolWaterSdf(px, pz) < 0.2) continue;
      if (!losClear("poolrooms", cam.seed, nx, nz, px, pz)) {
        ox -= d.dx;
        oz -= d.dz;
        hits += 1;
      }
    }
    if (!hits) break;
    const len = Math.hypot(ox, oz) || 1;
    nx += (ox / len) * 0.18;
    nz += (oz / len) * 0.18;
  }
  return { x: nx, z: nz };
}

function scenicPath(recipeId, seed, x, z, want) {
  if (recipeId === "poolrooms") {
    if (seed === POOL_TOUR.seed) return poolTourPath();
    const path = greedyPath(recipeId, seed, poolStartTile(seed, x, z), want);
    return path.length > want + 1 ? path.slice(0, want + 1) : path;
  }
  const start = worldToTile(x, z);
  let path = null;
  const hall = longestHallNear(recipeId, seed, start);
  if (hall && hall.length >= 5) {
    const extra = greedyPath(recipeId, seed, hall[hall.length - 1], Math.max(0, want - hall.length));
    path = extra.length > 1 ? hall.concat(extra.slice(1)) : hall;
  } else {
    const exit = findExitNear(recipeId, seed, start.tx, start.tz);
    if (exit) {
      const toExit = bfsPath(recipeId, seed, start, exit);
      if (toExit && toExit.length >= 6) path = toExit;
    }
  }
  if (!path) path = greedyPath(recipeId, seed, start, want);
  if (path.length > want + 1) path = path.slice(0, want + 1);
  return path;
}

function aimAhead(path, index, from) {
  const here = path[Math.min(index, path.length - 1)];
  if (here?.spiral) return path[Math.min(index + 3, path.length - 1)];
  let travelled = 0;
  let prev = from;
  let last = here;
  for (let k = index; k < path.length; k++) {
    const node = path[k];
    travelled += Math.hypot(node.x - prev.x, node.z - prev.z);
    last = node;
    prev = node;
    if (travelled >= 7.5) return node;
  }
  return last;
}

function centers(tiles) {
  return tiles.map((t) => ({
    x: (t.tx + 0.5) * TILE,
    z: (t.tz + 0.5) * TILE,
    tx: t.tx,
    tz: t.tz,
  }));
}

function setPlace(recipeId) {
  if (!recipeId || !playing) {
    ui.place.hidden = true;
    ui.place.classList.remove("on");
    return;
  }
  ui.place.hidden = false;
  ui.place.textContent = getRecipe(recipeId).name;
  ui.place.classList.remove("on");
  void ui.place.offsetWidth;
  ui.place.classList.add("on");
}

function setTicks(index) {
  ui.ticks.hidden = !playing;
  const dots = ui.ticks.querySelectorAll("i");
  dots.forEach((dot, i) => dot.classList.toggle("on", i === index));
}

function goFullscreen() {
  const root = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) return;
  const req = root.requestFullscreen?.({ navigationUI: "hide" }) || root.webkitRequestFullscreen?.();
  if (req && typeof req.catch === "function") req.catch(() => {});
}

function looking() {
  return document.pointerLockElement === ui.canvas;
}

function setLookHint(on) {
  if (!ui.lookHint) return;
  ui.lookHint.hidden = !on;
}

function grab() {
  const out = ui.canvas.requestPointerLock({ unadjustedMovement: true });
  if (out && typeof out.catch === "function") out.catch(() => ui.canvas.requestPointerLock());
}

function stepLook(dt, now) {
  const cutting =
    blink.phase === "fall" || blink.phase === "flicker" || blink.phase === "closing" || blink.phase === "shut";
  if (cutting) {
    look.yaw += (0 - look.yaw) * Math.min(1, dt * 6);
    look.pitch += (0 - look.pitch) * Math.min(1, dt * 6);
    return;
  }
  const keyYaw = (lookKeys.has("KeyD") ? 1 : 0) - (lookKeys.has("KeyA") ? 1 : 0);
  if (keyYaw) {
    look.yaw = Math.max(-1.4, Math.min(1.4, look.yaw + keyYaw * dt * 1.9));
    look.moved = now;
  }
  if (now - look.moved > 1300) {
    look.yaw += (0 - look.yaw) * Math.min(1, dt * 1.55);
    look.pitch += (0 - look.pitch) * Math.min(1, dt * 1.55);
  }
}

function putCamera(moving, dt, now) {
  const on = moving && hop.grounded;
  bob.mix += ((on ? 1 : 0) - bob.mix) * Math.min(1, dt * (on ? 8 : 9));
  if (on) bob.phase += dt * 12.4;
  const amp = bob.mix * 0.78;
  const lift = Math.sin(bob.phase * 2);
  const sway = Math.sin(bob.phase);
  const idle = Math.sin(now * 0.008) * 0.008 * (1 - bob.mix * 0.85);
  const cutting = blink.phase === "fall" || blink.phase === "flicker" || blink.phase === "closing" || blink.phase === "shut";
  if (!cutting) {
    const wantFov = on ? FOV_RUN : FOV;
    fovNow += (wantFov - fovNow) * Math.min(1, dt * 7);
    view.setFov(fovNow);
    cutRoll += (0 - cutRoll) * Math.min(1, dt * 8);
  }
  let y = cam.y + idle + lift * 0.028 * amp;
  if (cam.recipeId === "poolrooms") {
    const ceilY = sampleCeiling(cam.recipeId, cam.seed, cam.x, cam.z, cam.feet);
    if (ceilY > cam.feet + HEAD + 0.08) y = Math.min(y, ceilY - 0.16);
  }
  view.setCamera(
    cam.x,
    y,
    cam.z,
    cam.yaw + look.yaw + glance.yaw,
    cam.pitch + look.pitch + Math.cos(bob.phase * 2) * 0.008 * amp,
    sway * 0.018 * amp + cutRoll,
  );
  if (on && bob.mix > 0.22) {
    const sign = lift >= 0 ? 1 : -1;
    if (bob.sign > 0 && sign < 0) {
      const tile = worldToTile(cam.x, cam.z);
      audio.foot(cellInfo(cam.recipeId, cam.seed, tile.tx, tile.tz).floor);
    }
    bob.sign = sign;
  } else {
    bob.sign = 0;
  }
}

function loadLevel(recipeId, seed, at) {
  cam.recipeId = recipeId;
  cam.seed = seed;
  let pos = at;
  if (!pos) {
    if (recipeId === "poolrooms") {
      if (seed === POOL_TOUR.seed) pos = { x: POOL_TOUR.spawn.x, z: POOL_TOUR.spawn.z, yaw: POOL_TOUR.spawn.yaw };
      else {
        const hit = findSpiral(seed, getRecipe("poolrooms").extra);
        if (hit) pos = { x: hit.x, z: hit.z, yaw: hit.yaw };
      }
    }
    if (!pos) pos = spawnPoint(recipeId, seed);
  }
  let free = unstuck(recipeId, seed, pos.x, pos.z);
  if (recipeId === "poolrooms") free = keepOffPoolWalls(free.x, free.z);
  cam.x = free.x;
  cam.z = free.z;
  cam.feet = sampleFloor(recipeId, seed, cam.x, cam.z);
  cam.y = EYE + cam.feet;
  cam.yaw = pos.yaw ?? 0;
  cam.pitch = -0.04;
  wantPitch = -0.04;
  lookYaw = cam.yaw;
  const tiles = scenicPath(recipeId, seed, cam.x, cam.z, 16);
  if (recipeId === "poolrooms") {
    const pts = tiles[0]?.x != null ? tiles : centers(tiles);
    if (pts.length >= 2) {
      lookYaw = yawTo(cam, aimAhead(pts, Math.min(2, pts.length - 1), cam));
      cam.yaw = lookYaw;
    }
  } else if (tiles.length >= 4) {
    const start = tiles[0];
    const freeHall = unstuck(recipeId, seed, (start.tx + 0.5) * TILE, (start.tz + 0.5) * TILE);
    cam.x = freeHall.x;
    cam.z = freeHall.z;
    cam.feet = sampleFloor(recipeId, seed, cam.x, cam.z);
    cam.y = EYE + cam.feet;
    const pts = centers(tiles);
    lookYaw = yawTo(cam, aimAhead(pts, Math.min(3, pts.length - 1), cam));
    cam.yaw = lookYaw;
  }
  ents = [];
  bob.phase = 0;
  bob.mix = 0;
  glance.yaw = 0;
  stuckT = 0;
  hop.vy = 0;
  hop.coyote = 0.12;
  hop.grounded = true;
  glow.amount = 0;
  view.applyRecipe(recipeId, seed);
  view.syncChunks(cam.x, cam.z);
  view.setFlash(recipeId !== "poolrooms", blink.amount);
  view.setFov(FOV);
  audio.setRecipe(recipeId);
  setPlace(recipeId);
}

function ensureSky() {
  if (!skyWorld) skyWorld = createSkyWorld();
  return skyWorld;
}

function enterSky() {
  const sky = ensureSky();
  sky.activate(view.camera.parent, view.camera);
  view.setFlash(false);
  view.setBlinkDim(0);
  const drop = sky.dropPoint;
  cam.x = drop.x;
  cam.z = drop.z;
  cam.y = drop.y ?? 1020;
  cam.yaw = drop.yaw;
  cam.pitch = LOOK_ANG;
  cam.vy = -22;
  look.yaw = 0;
  look.pitch = 0;
  glance.yaw = 0;
  skyFall.active = true;
  skyFall.stage = "fall";
  skyFall.t = 0;
  skyFall.vy = -22;
  skyFall.baseYaw = drop.yaw;
  skyFall.fade = 1;
  skyFall.roll = 0;
  skyFall.gust.x = 0;
  skyFall.gust.z = 0;
  skyFall.gust.tx = 0;
  skyFall.gust.tz = 0;
  skyFall.gust.t = 0.4;
  skyFall.windLook.yaw = 0;
  skyFall.windLook.pitch = 0;
  ents = [];
  ui.place.hidden = true;
  setLookHint(true);
  applyLids(0);
  setWhite(1);
  setStatic(false);
  glow.amount = 0;
  blink.phase = "open";
  blink.t = 0;
  view.setFov(72);
  fovNow = 72;
}

function leaveSky() {
  if (!skyFall.active && !skyWorld) return;
  skyFall.active = false;
  if (skyWorld) skyWorld.deactivate(view.camera.parent, view.camera);
  view.setFov(FOV);
  fovNow = FOV;
  view.setBlinkDim(0);
}

function triggerSkyImpact() {
  if (skyFall.stage !== "fall") return;
  skyFall.stage = "impact";
  skyFall.t = 0;
  skyFall.vy = 0;
  applyLids(1);
  setWhite(0);
  setLookHint(false);
  audio.scrape();
  skyFall.roll = 0.2;
  view.setFov(120);
  fovNow = 120;
}

function stepSkyDive(dt, now) {
  const sky = skyWorld;
  if (!sky) return;
  const falling = skyFall.stage === "fall";
  sky.update(dt, { x: cam.x, y: cam.y, z: cam.z, vy: skyFall.vy, falling });
  skyFall.t += dt;
  if (skyFall.fade > 0) {
    skyFall.fade = Math.max(0, skyFall.fade - dt * 1.15);
    setWhite(skyFall.fade);
  }

  if (skyFall.stage === "dead") {
    applyLids(1);
    setWhite(0);
    view.setCamera(cam.x, cam.y, cam.z, cam.yaw + look.yaw, cam.pitch + look.pitch, skyFall.roll);
    if (skyFall.t > 0.45) beginBeat(BEATS.length - 1);
    return;
  }

  if (skyFall.stage === "impact") {
    applyLids(1);
    setWhite(0);
    skyFall.roll *= Math.max(0, 1 - dt * 8);
    skyFall.windLook.pitch *= Math.max(0, 1 - dt * 6);
    cam.pitch = lerp(cam.pitch, 0.55, Math.min(1, dt * 6));
    view.setFov(120);
    view.setCamera(
      cam.x,
      cam.y,
      cam.z,
      cam.yaw + look.yaw + skyFall.windLook.yaw,
      cam.pitch + look.pitch + skyFall.windLook.pitch,
      skyFall.roll,
    );
    if (skyFall.t > 2.1) {
      skyFall.stage = "dead";
      skyFall.t = 0;
    }
    return;
  }

  const gust = skyFall.gust;
  gust.t -= dt;
  if (gust.t <= 0) {
    gust.tx = (Math.random() - 0.5) * 28;
    gust.tz = (Math.random() - 0.5) * 18;
    gust.t = 0.35 + Math.random() * 0.7;
  }
  gust.x = lerp(gust.x, gust.tx, Math.min(1, dt * 2.4));
  gust.z = lerp(gust.z, gust.tz, Math.min(1, dt * 2.1));

  skyFall.vy -= 7 * dt;
  if (skyFall.vy < -48) skyFall.vy = -48;
  cam.y += skyFall.vy * dt;
  cam.z -= (16 + Math.sin(skyFall.t * 0.33) * 8 + gust.z * 0.7) * dt;
  cam.x += (Math.sin(skyFall.t * 0.48) * 11 + Math.sin(skyFall.t * 1.15) * 6 + gust.x * 0.95) * dt;

  cam.yaw = skyFall.baseYaw + Math.sin(skyFall.t * 0.31) * 0.14 + Math.sin(skyFall.t * 0.87) * 0.06;
  cam.pitch = LOOK_ANG + Math.sin(skyFall.t * 0.72) * 0.08 + Math.sin(skyFall.t * 1.4) * 0.04;
  skyFall.windLook.yaw = lerp(skyFall.windLook.yaw, gust.x * 0.014, Math.min(1, dt * 3.2));
  skyFall.windLook.pitch = lerp(skyFall.windLook.pitch, -gust.z * 0.01 + Math.sin(skyFall.t * 2.1) * 0.04, Math.min(1, dt * 3.4));
  skyFall.roll = Math.sin(skyFall.t * 1.25) * 0.14 + Math.sin(skyFall.t * 0.42) * 0.09 + gust.x * 0.018;
  fovNow = lerp(fovNow, 84 + Math.abs(gust.x) * 0.22, Math.min(1, dt * 0.7));
  view.setFov(fovNow);

  const ground = sky.sampleHeight(cam.x, cam.z);
  const alt = cam.y - ground;
  if (alt < 22) applyLids(ease(1 - alt / 22) * 0.55);
  if (alt < 5) applyLids(0.9);
  if (cam.y <= ground + 1.25) {
    cam.y = ground + 0.35;
    triggerSkyImpact();
  }
  view.setCamera(
    cam.x,
    cam.y,
    cam.z,
    cam.yaw + look.yaw + skyFall.windLook.yaw,
    cam.pitch + look.pitch + skyFall.windLook.pitch,
    skyFall.roll,
  );
}

function beginBeat(index, keepPos) {
  beatIndex = Math.max(0, Math.min(BEATS.length - 1, index));
  const spec = BEATS[beatIndex];
  setTicks(beatIndex);
  if (spec.kind !== "skydive") leaveSky();
  if (spec.kind === "end") {
    playing = false;
    ui.end.hidden = false;
    ui.place.hidden = true;
    ui.ticks.hidden = true;
    setLookHint(false);
    if (looking()) document.exitPointerLock?.();
    beat = { spec, stage: "end" };
    return;
  }
  if (spec.kind === "skydive") {
    beat = { spec, stage: "fall", t: 0 };
    enterSky();
    return;
  }
  const same = keepPos && spec.recipeId === cam.recipeId && spec.seed === cam.seed;
  if (!same) loadLevel(spec.recipeId, spec.seed);
  const raw = scenicPath(spec.recipeId, spec.seed, cam.x, cam.z, spec.want || 12);
  const path = raw[0]?.x != null ? raw : centers(raw);
  const aim = path.length ? aimAhead(path, Math.min(2, path.length - 1), { x: cam.x, z: cam.z }) : null;
  lookYaw = aim ? yawTo({ x: cam.x, z: cam.z }, aim) : cam.yaw;
  cam.yaw = lookYaw;
  beat = {
    spec,
    path,
    i: path.length > 1 ? 1 : 0,
    stage: spec.intro ? "hold" : "walk",
    t: 0,
    hunt: null,
  };
  ents = placeNiches(path, spec);
  hop.pending = !!spec.hopIn;
}

const NICHE_KIND = {
  lobby: "lurker",
  habitable: "guest",
  pipes: "mannequin",
  office: "mannequin",
  hotel: "guest",
  caves: "lurker",
  poolrooms: "guest",
};

function sideDirs(along) {
  if (along === "n" || along === "s") return DIRS.filter((d) => d.k === "e" || d.k === "w");
  return DIRS.filter((d) => d.k === "n" || d.k === "s");
}

function nicheCell(recipeId, seed, from, dir) {
  if (!linked(recipeId, seed, from.tx, from.tz, dir)) return null;
  const tx = from.tx + dir.dx;
  const tz = from.tz + dir.dz;
  if (!passable(recipeId, seed, tx, tz)) return null;
  const info = cellInfo(recipeId, seed, tx, tz);
  if (info.opens >= 4) return null;
  let deep = info.opens === 1;
  if (linked(recipeId, seed, tx, tz, dir)) {
    const bx = tx + dir.dx;
    const bz = tz + dir.dz;
    if (passable(recipeId, seed, bx, bz)) {
      const inner = cellInfo(recipeId, seed, bx, bz);
      if (inner.opens <= 3) deep = true;
    }
  }
  if (info.opens <= 3) return { tx, tz, deep };
  return null;
}

function findNiches(path, recipeId, seed) {
  const onPath = new Set(path.map((p) => `${p.tx},${p.tz}`));
  const hits = [];
  for (let i = 2; i < path.length - 1; i++) {
    const a = path[i];
    const next = path[i + 1];
    const prev = path[i - 1];
    for (const side of DIRS) {
      const cell = nicheCell(recipeId, seed, a, side);
      if (!cell || onPath.has(`${cell.tx},${cell.tz}`)) continue;
      if (next && cell.tx === next.tx && cell.tz === next.tz) continue;
      if (prev && cell.tx === prev.tx && cell.tz === prev.tz) continue;
      hits.push({ i, hall: a, cell, side });
    }
  }
  return hits;
}

function makeNicheEnt(recipeId, seed, hall, cell, kind) {
  const hx = hall.x ?? (hall.tx + 0.5) * TILE;
  const hz = hall.z ?? (hall.tz + 0.5) * TILE;
  const cx = (cell.tx + 0.5) * TILE;
  const cz = (cell.tz + 0.5) * TILE;
  const t = cell.deep ? 0.7 : 0.58;
  const free = unstuck(recipeId, seed, hx + (cx - hx) * t, hz + (cz - hz) * t);
  const ent = createShowcase(kind, free.x, free.z);
  if (!ent) return null;
  ent.yaw = yawTo(ent, { x: hx, z: hz });
  ent.niche = true;
  return ent;
}

function placeNiches(path, spec) {
  if (!spec || spec.kind === "end") return [];
  if (spec.id === "habitable" || spec.id === "pools") return [];
  const hits = findNiches(path, spec.recipeId, spec.seed);
  if (!hits.length) return [];
  const pick =
    hits.find((h) => h.cell.deep && h.i >= 4 && h.i <= 11) ||
    hits.find((h) => h.i >= 4 && h.i <= 10) ||
    hits.find((h) => h.cell.deep) ||
    hits[0];
  const kind = NICHE_KIND[spec.recipeId] || "lurker";
  const ent = makeNicheEnt(spec.recipeId, spec.seed, pick.hall, pick.cell, kind);
  return ent ? [ent] : [];
}

function sideOfPath(path, index) {
  const a = path[Math.min(Math.max(index, 0), path.length - 1)];
  const b = path[Math.min(index + 1, path.length - 1)] || a;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return {
    door: a,
    x: a.x + (-dz / len) * 1.55,
    z: a.z + (dx / len) * 1.55,
  };
}

function setupHunt(b) {
  const hits = findNiches(b.path, cam.recipeId, cam.seed);
  const pick =
    hits.find((h) => h.i >= 2 && h.i <= 6) ||
    hits.find((h) => h.i >= 1 && h.i <= 8) ||
    hits[0];
  let ent = null;
  let door = null;
  if (pick) {
    ent = makeNicheEnt(cam.recipeId, cam.seed, pick.hall, pick.cell, "mannequin");
    door = { x: pick.hall.x, z: pick.hall.z };
  }
  if (!ent && b.path.length) {
    const side = sideOfPath(b.path, Math.min(4, Math.max(0, b.path.length - 1)));
    const free = unstuck(cam.recipeId, cam.seed, side.x, side.z);
    ent = createShowcase("mannequin", free.x, free.z);
    if (ent) ent.niche = true;
    door = side.door;
  }
  if (!ent) {
    const free = unstuck(cam.recipeId, cam.seed, cam.x - Math.sin(lookYaw) * 4.4, cam.z - Math.cos(lookYaw) * 4.4);
    ent = createShowcase("mannequin", free.x, free.z);
    if (ent) ent.niche = true;
    door = { x: cam.x, z: cam.z };
  }
  ent.yaw = yawTo(ent, cam);
  ents = [ent];
  b.hunt = { mannequin: ent, blinks: 0, door };
  b.stage = "approach";
  b.t = 0;
}

function startCut(nextIndex) {
  const spec = BEATS[nextIndex];
  if (!spec) return;
  if (skyFall.active) {
    cutTo = -1;
    beginBeat(nextIndex);
    return;
  }
  const cut = spec.cut || "blink";
  const go = () => {
    cutTo = -1;
    beginBeat(nextIndex, cut === "none");
  };
  cutTo = nextIndex;
  if (cut === "none") {
    go();
    return;
  }
  const busy =
    blink.phase === "closing" || blink.phase === "shut" || blink.phase === "flicker" || blink.phase === "fall";
  if (busy) {
    blink.onShut = go;
    return;
  }
  if (cut === "flicker") flickerThen(go);
  else if (cut === "fall") fallThen(go);
  else closeLids(0.24, go);
}

function nextBeat() {
  if (cutTo >= 0) return;
  if (beat?.hunt && beat.stage !== "linger") return;
  if (beat?.spec.id === "pools") {
    const skyIndex = BEATS.findIndex((b) => b.kind === "skydive");
    if (skyIndex >= 0) {
      cutTo = -1;
      beginBeat(skyIndex);
      return;
    }
  }
  if (beatIndex >= BEATS.length - 1) {
    startCut(BEATS.length - 1);
    return;
  }
  startCut(beatIndex + 1);
}

function prevBeat() {
  if (beatIndex <= 0) {
    beginBeat(0);
    return;
  }
  closeLids(0.12, () => beginBeat(beatIndex - 1));
}

function beginAtriumLeg() {
  const a = POOL_TOUR.atrium;
  if (!a || !beat) return;
  let free = unstuck("poolrooms", cam.seed, a.spawn.x, a.spawn.z);
  free = keepOffPoolWalls(free.x, free.z);
  cam.x = free.x;
  cam.z = free.z;
  cam.feet = sampleFloor("poolrooms", cam.seed, cam.x, cam.z);
  cam.y = EYE + cam.feet;
  lookYaw = a.spawn.yaw ?? 0;
  cam.yaw = lookYaw;
  cam.pitch = -0.28;
  wantPitch = -0.28;
  beat.atrium = true;
  beat.path = nodesFrom(a.path).concat(spiralNodes());
  beat.i = Math.min(1, Math.max(0, beat.path.length - 1));
  beat.stage = "walk";
  beat.t = 0;
  beat.best = null;
  beat.hold = 0;
  hop.vy = 0;
  hop.pending = false;
  hop.grounded = true;
  hop.coyote = 0.12;
  stuckT = 0;
  view.syncChunks(cam.x, cam.z);
}

function finishPoolPath(moving) {
  if (!beat.atrium && POOL_TOUR.atrium) {
    beat.stage = "toAtrium";
    beat.t = 0;
    closeLids(0.2, () => beginAtriumLeg());
    return { moving: false };
  }
  beat.stage = "glow";
  beat.t = 0;
  if (!skyWorld) ensureSky();
  return { moving: !!moving };
}

function vaultPitch() {
  if (!beat?.spec.lookUp || cam.recipeId !== "poolrooms") return -0.04;
  if (beat.stage === "glow" || cam.feet > 12.5) return -0.72;
  if (cam.feet > 8) return lerp(-0.1, -0.62, Math.min(1, (cam.feet - 8) / 5.5));
  const rec = getRecipe("poolrooms");
  const prof = nearbyProfile(cam.seed, rec.extra, cam.x, cam.z);
  if (prof?.vault || prof?.oculus) return -0.32;
  if (prof?.h > 5) return -0.12;
  if (prof?.h > 3.8) return -0.04;
  return -0.02;
}

function stepBlink(dt) {
  const close = 0.12;
  const open = 0.22;
  if (blink.phase === "flicker") {
    blink.t += dt;
    const pulse = Math.floor(blink.t / 0.045) % 2 === 0;
    applyLids(pulse ? 0.92 : 0.05);
    setWhite(pulse ? 0.28 : 0);
    fovNow = pulse ? 92 : 70;
    view.setFov(fovNow);
    cutRoll = (Math.random() - 0.5) * 0.04;
    if (blink.t > 0.045) {
      blink.t = 0;
      blink.flickerLeft -= 1;
      if (blink.flickerLeft <= 0) {
        setStatic(false);
        setWhite(0);
        blink.phase = "closing";
        blink.hold = 0.14;
        audio.blink();
      }
    }
    return;
  }
  if (blink.phase === "fall") {
    blink.t += dt;
    const drop = 0.42;
    const land = 0.62;
    if (blink.t < drop) {
      const u = ease(blink.t / drop);
      cam.pitch = lerp(-0.04, 1.28, u);
      cam.y = EYE + cam.feet - u * 2.6;
      fovNow = lerp(FOV_RUN, 102, u);
      view.setFov(fovNow);
      applyLids(u * 0.35);
      cutRoll = u * 0.1;
      setWhite(u * 0.08);
    } else {
      if (!blink.landed) {
        blink.landed = true;
        applyLids(1);
        setWhite(0);
        const fn = blink.onShut;
        blink.onShut = null;
        if (fn) fn();
        const landY = EYE + cam.feet;
        const ceilY = sampleCeiling(cam.recipeId, cam.seed, cam.x, cam.z, cam.feet);
        cam.y = Math.min(landY + 2.15, Math.max(landY + 0.35, ceilY - 0.4));
        cam.pitch = 0.62;
        blink.fallFrom = cam.y;
        audio.blink();
      }
      const u = ease(Math.min(1, (blink.t - drop) / land));
      cam.y = lerp(blink.fallFrom, EYE + cam.feet, u);
        cam.pitch = lerp(0.62, -0.04, u);
      fovNow = lerp(96, FOV, u);
      view.setFov(fovNow);
      applyLids(1 - u);
      cutRoll = (1 - u) * 0.08;
      if (u >= 1) {
        blink.phase = "open";
        blink.t = 0;
        applyLids(0);
        cutRoll = 0;
      }
    }
    return;
  }
  if (blink.phase === "closing") {
    blink.t += dt;
    const u = Math.min(1, blink.t / close);
    applyLids(u);
    fovNow = lerp(fovNow, 90, u);
    view.setFov(fovNow);
    cutRoll = u * 0.05;
    if (blink.t >= close) {
      blink.phase = "shut";
      blink.t = 0;
      applyLids(1);
      const fn = blink.onShut;
      blink.onShut = null;
      if (fn) fn();
    }
  } else if (blink.phase === "shut") {
    blink.t += dt;
    applyLids(1);
    if (blink.t >= blink.hold) {
      blink.phase = "opening";
      blink.t = 0;
    }
  } else if (blink.phase === "opening") {
    blink.t += dt;
    const u = Math.min(1, blink.t / open);
    applyLids(1 - u);
    fovNow = lerp(88, FOV, u);
    view.setFov(fovNow);
    cutRoll = (1 - u) * 0.04;
    if (blink.t >= open) {
      blink.phase = "open";
      blink.t = 0;
      applyLids(0);
      setStatic(false);
      setWhite(0);
      cutRoll = 0;
    }
  } else {
    if (skyFall.active) return;
    applyLids(Math.max(0, blink.amount - dt * 2));
    if (glow.amount < 0.04) setWhite(0);
  }
}

function spikeAhead() {
  if (cam.recipeId !== "caves" || !beat?.path) return false;
  const here = worldToTile(cam.x, cam.z);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const info = cellInfo(cam.recipeId, cam.seed, here.tx + dx, here.tz + dz);
      if (info.prop !== "stalag") continue;
      const c = { x: (here.tx + dx + 0.5) * TILE, z: (here.tz + dz + 0.5) * TILE };
      if (Math.hypot(c.x - cam.x, c.z - cam.z) < 1.85) return true;
    }
  }
  for (let k = beat.i; k <= Math.min(beat.i + 2, beat.path.length - 1); k++) {
    const p = beat.path[k];
    if (!p || Math.hypot(p.x - cam.x, p.z - cam.z) > 2.1) continue;
    const info = cellInfo(cam.recipeId, cam.seed, p.tx, p.tz);
    if (info.prop === "stalag") return true;
  }
  return false;
}

function poolLipAhead() {
  if (cam.recipeId !== "poolrooms" || !beat?.path) return false;
  const node = beat.path[beat.i];
  if (node?.hop) return true;
  const sdf = poolWaterSdf(cam.x, cam.z);
  return sdf > -0.35 && sdf < 0.45;
}

function maybePoolHop() {
  if (cam.recipeId !== "poolrooms" || !beat?.path) return;
  const node = beat.path[beat.i];
  if (!node?.hop || node.spiral) return;
  const dist = Math.hypot(node.x - cam.x, node.z - cam.z);
  if (dist < 2.4 && hop.grounded) hop.pending = true;
}

function jumpSpeed() {
  const ceilY = sampleCeiling(cam.recipeId, cam.seed, cam.x, cam.z, cam.feet);
  const headroom = ceilY - HEAD - cam.feet - 0.12;
  if (headroom < 0.16) return 0;
  const maxV = Math.sqrt(Math.max(0, 2 * GRAVITY * headroom));
  const area = hop.clip[cam.recipeId] ?? 1;
  const want =
    cam.recipeId === "caves" ? JUMP_VEL * 0.88 : cam.recipeId === "poolrooms" ? JUMP_VEL : JUMP_VEL * 0.7;
  return Math.min(want * area, maxV);
}

function wantHop(moving) {
  if (!moving && !hop.pending) return false;
  if (blink.phase !== "open" && blink.phase !== "opening") return false;
  if (!beat || beat.spec.kind === "end") return false;
  if (beat.stage && beat.stage !== "walk" && beat.stage !== "approach") return false;
  if (beat.path?.[beat.i]?.spiral) return false;
  if (hop.pending) return true;
  if (cam.recipeId === "caves" && (spikeAhead() || stuckT > 0.22)) return true;
  return false;
}

function stepHop(dt, moving) {
  const wasAir = !hop.grounded;
  const support = sampleFloor(cam.recipeId, cam.seed, cam.x, cam.z, cam.feet, STEP_UP);
  const ceilY = sampleCeiling(cam.recipeId, cam.seed, cam.x, cam.z, cam.feet);
  const onGround = hop.vy <= 0.12 && cam.feet <= support + 0.08 && support >= cam.feet - 0.08;
  if (onGround) hop.coyote = 0.12;
  else hop.coyote = Math.max(0, hop.coyote - dt);
  const speed = jumpSpeed();
  const hopNow = wantHop(moving) && hop.coyote > 0 && speed > 0.8;
  if (hopNow) {
    hop.vy = speed;
    hop.coyote = 0;
    hop.pending = false;
    stuckT = 0;
  }
  if (onGround && hop.vy <= 0 && !hopNow) {
    cam.feet = support;
    hop.vy = 0;
  } else {
    hop.vy -= GRAVITY * dt;
    cam.feet += hop.vy * dt;
    const land = sampleFloor(cam.recipeId, cam.seed, cam.x, cam.z, cam.feet, 0.08);
    if (hop.vy <= 0 && cam.feet <= land) {
      cam.feet = land;
      hop.vy = 0;
      hop.coyote = 0.12;
    }
  }
  if (cam.feet + HEAD > ceilY) {
    if (hop.vy > 0) {
      hop.vy = 0;
      hop.clip[cam.recipeId] = Math.min(hop.clip[cam.recipeId] ?? 1, 0.68);
    }
    const squeezed = ceilY - HEAD;
    if (squeezed >= support - 0.02) cam.feet = squeezed;
  }
  hop.grounded = hop.vy <= 0.05 && cam.feet <= support + 0.1;
  cam.y = cam.feet + EYE;
  if (wasAir && hop.grounded) {
    const tile = worldToTile(cam.x, cam.z);
    audio.foot(cellInfo(cam.recipeId, cam.seed, tile.tx, tile.tz).floor);
  }
}

function walkToward(tx, tz, dt) {
  const dx = tx - cam.x;
  const dz = tz - cam.z;
  const dist = Math.hypot(dx, dz);
  const node = beat?.path?.[beat.i];
  const close = node?.spiral ? 0.26 : 0.55;
  if (dist < close) return { arrived: true, moving: false, dist };
  const aim = beat?.path ? aimAhead(beat.path, beat.i, cam) : { x: tx, z: tz };
  lookYaw = yawTo(cam, aim);
  cam.yaw = lerpAngle(cam.yaw, lookYaw, Math.min(1, dt * (node?.spiral ? 4.2 : 2.4)));
  const speed = (cam.recipeId === "poolrooms" ? (node?.spiral ? 2.35 : 3.4) : SPRINT) * dt;
  const step = Math.min(speed, dist);
  const ux = dx / dist;
  const uz = dz / dist;
  const next = moveOnFoot(cam.recipeId, cam.seed, cam.x, cam.z, cam.feet, ux * step, uz * step, RADIUS, STEP_UP);
  let moved = Math.hypot(next.x - cam.x, next.z - cam.z);
  cam.x = next.x;
  cam.z = next.z;
  if (cam.recipeId === "poolrooms") {
    const pushed = keepOffPoolWalls(cam.x, cam.z);
    cam.x = pushed.x;
    cam.z = pushed.z;
  }
  if (moved < 0.002 && !hop.grounded && cam.feet > 0.48 && (spikeAhead() || poolLipAhead())) {
    cam.x += ux * step;
    cam.z += uz * step;
    moved = step;
  }
  if (moved < 0.002 && node?.spiral) {
    cam.x = node.x;
    cam.z = node.z;
    moved = Math.max(step, 0.01);
  }
  if (moved < 0.002) stuckT += dt;
  else stuckT = 0;
  return { arrived: false, moving: moved > 0.002 || !hop.grounded, dist, stuck: stuckT > 1.2 };
}

function stepIntro(dt) {
  beat.t += dt;
  const aim = aimAhead(beat.path, beat.i, cam);
  lookYaw = yawTo(cam, aim);
  cam.yaw = lerpAngle(cam.yaw, lookYaw, Math.min(1, dt * 2.2));
  if (beat.t >= 1.35) {
    beat.stage = "walk";
    beat.t = 0;
  }
  return { moving: false };
}

function startOfficeHunt() {
  if (!beat) return;
  let man = ents.find((e) => Math.hypot(e.x - cam.x, e.z - cam.z) < 9);
  if (!man) {
    const node = beat.path[beat.path.length - 1];
    const prev = beat.path[Math.max(0, beat.path.length - 2)] || node || { x: cam.x, z: cam.z };
    const dx = (node?.x ?? cam.x) - prev.x;
    const dz = (node?.z ?? cam.z) - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = unstuck(
      cam.recipeId,
      cam.seed,
      cam.x + (dx / len) * 3.1 + (-dz / len) * 1.35,
      cam.z + (dz / len) * 3.1 + (dx / len) * 1.35,
    );
    man = createShowcase("mannequin", side.x, side.z);
    if (man) {
      man.niche = true;
      ents = [man];
    }
  }
  if (!man) return;
  man.yaw = yawTo(man, cam);
  beat.hunt = { mannequin: man, blinks: 0, door: man };
  beat.stage = "stare";
  beat.t = 0;
  lookYaw = yawTo(cam, man);
}

function stepWander(dt) {
  if (beat.stage === "leaving") return { moving: false };
  if (beat.spec.intro && beat.stage === "hold") return stepIntro(dt);
  if (beat.hunt || beat.stage === "stare" || beat.stage === "shut" || beat.stage === "linger") {
    return stepHunt(dt);
  }
  beat.t += dt;
  if (beat.stage === "toAtrium") return { moving: false };
  if (beat.stage === "glow") {
    lookYaw = cam.yaw;
    if (glow.amount > 0.78 && beat.t > 1.05) {
      const skyIndex = BEATS.findIndex((b) => b.kind === "skydive");
      if (skyIndex >= 0) {
        cutTo = -1;
        beginBeat(skyIndex);
      } else nextBeat();
    }
    return { moving: false };
  }
  const node = beat.path[beat.i];
  if (!node) {
    if (beat.spec.huntEnd) startOfficeHunt();
    else if (beat.spec.id === "pools") return finishPoolPath(false);
    else if (beat.t < 2.6) return { moving: false };
    else nextBeat();
    return { moving: false };
  }
  maybePoolHop();
  const distNow = Math.hypot(node.x - cam.x, node.z - cam.z);
  if (beat.best == null || distNow < beat.best - 0.05) {
    beat.best = distNow;
    beat.hold = 0;
  } else {
    beat.hold = (beat.hold || 0) + dt;
  }
  const step = walkToward(node.x, node.z, dt);
  const stall = beat.hold > 2.1 && hop.grounded && !hop.pending && !node.spiral;
  if (step.arrived || stall || (step.stuck && !hop.pending && !node.spiral && hop.grounded)) {
    beat.i += 1;
    beat.best = null;
    beat.hold = 0;
    stuckT = 0;
    if (beat.i >= beat.path.length) {
      if (beat.spec.huntEnd) startOfficeHunt();
      else if (beat.spec.id === "pools") return finishPoolPath(step.moving);
      else if (beat.t < 2.6) return { moving: step.moving };
      else nextBeat();
    }
  }
  return { moving: step.moving };
}

function nudgeCloser(ent, amount) {
  const dx = cam.x - ent.x;
  const dz = cam.z - ent.z;
  const d = Math.hypot(dx, dz) || 1;
  const free = unstuck(cam.recipeId, cam.seed, ent.x + (dx / d) * amount, ent.z + (dz / d) * amount);
  ent.x = free.x;
  ent.z = free.z;
  ent.yaw = yawTo(ent, cam);
}

function stepGlance(dt) {
  const cutting =
    blink.phase === "fall" || blink.phase === "flicker" || blink.phase === "closing" || blink.phase === "shut";
  if (cutting || (look.moved && performance.now() - look.moved < 500)) {
    glance.yaw += (0 - glance.yaw) * Math.min(1, dt * 5);
    return;
  }
  let want = 0;
  for (const ent of ents) {
    const dist = Math.hypot(ent.x - cam.x, ent.z - cam.z);
    if (dist < 2.4 || dist > 12) continue;
    const yaw = yawTo(cam, ent);
    let d = yaw - lookYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.14 || Math.abs(d) > 1.4) continue;
    want = Math.max(-0.72, Math.min(0.72, d));
    break;
  }
  glance.yaw += (want - glance.yaw) * Math.min(1, dt * (want ? 2.5 : 1.7));
}

function stepHunt(dt) {
  const h = beat.hunt;
  if (!h?.mannequin) {
    setupHunt(beat);
    return { moving: false };
  }
  const man = h.mannequin;
  const dist = Math.hypot(man.x - cam.x, man.z - cam.z);
  man.yaw = yawTo(man, cam);

  if (beat.stage === "approach") {
    if (dist < 5.2) {
      beat.stage = "stare";
      beat.t = 0;
      lookYaw = yawTo(cam, man);
      return { moving: false };
    }
    const goal = dist > 8 && h.door ? h.door : man;
    const step = walkToward(goal.x, goal.z, dt);
    beat.t += dt;
    if (step.stuck || beat.t > 8) {
      beat.stage = "stare";
      beat.t = 0;
      lookYaw = yawTo(cam, man);
    }
    return { moving: step.moving };
  }
  if (beat.stage === "stare") {
    cam.yaw = lerpAngle(cam.yaw, lookYaw, Math.min(1, dt * 2.2));
    beat.t += dt;
    if (beat.t > 2.1) {
      beat.stage = "shut";
      beat.t = 0;
      closeLids(0.22, () => {
        h.blinks += 1;
        nudgeCloser(man, 0.42);
        audio.scrape();
      });
    }
    return { moving: false };
  }
  if (beat.stage === "shut") {
    if (blink.phase === "open") {
      beat.stage = "linger";
      beat.t = 0;
      lookYaw = yawTo(cam, man);
    }
    return { moving: false };
  }
  if (beat.stage !== "linger") return { moving: false };
  cam.yaw = lerpAngle(cam.yaw, lookYaw, Math.min(1, dt * 1.6));
  beat.t += dt;
  if (beat.t > 2.4) {
    beat.stage = "leaving";
    beat.hunt = null;
    nextBeat();
  }
  return { moving: false };
}

function stepGlow(dt) {
  if (beat?.spec.kind === "skydive" || skyFall.active) return;
  if (beat?.stage === "glow" && !skyWorld) ensureSky();
  let want = 0;
  if (beat?.spec.kind !== "end" && cam.recipeId === "poolrooms") {
    if (beat?.stage === "glow") want = 1;
    else if (cam.feet > 8.2) want = Math.max(0, Math.min(1, (cam.feet - 8.2) / 6));
  }
  glow.amount += (want - glow.amount) * Math.min(1, dt * (want > glow.amount ? 1.55 : 2.8));
  if (glow.amount <= 0.01 || (blink.phase !== "open" && blink.phase !== "opening")) return;
  setWhite(ease(glow.amount) * 0.96);
  view.setBlinkDim(-glow.amount * 3.1);
  const fovGlow = lerp(FOV, 98, ease(glow.amount));
  fovNow += (fovGlow - fovNow) * Math.min(1, dt * 2.2);
  view.setFov(fovNow);
}

function stepTour(dt, now) {
  stepLook(dt, now);
  if (beat?.spec.kind === "skydive") {
    stepSkyDive(dt, now);
    return;
  }
  stepGlance(dt);
  if (!beat || beat.spec.kind === "end") {
    putCamera(false, dt, now);
    return;
  }
  if (blink.phase !== "fall") {
    wantPitch = beat.spec.lookUp ? vaultPitch() : -0.04;
    cam.pitch = lerp(cam.pitch, wantPitch, Math.min(1, dt * (cam.feet > 8 ? 1.05 : 1.4)));
  }
  let moving = false;
  if (blink.phase === "open" || blink.phase === "opening") {
    const result = stepWander(dt);
    moving = !!result?.moving;
  }
  if (beat?.spec.kind === "skydive") {
    stepSkyDive(dt, now);
    return;
  }
  if (blink.phase !== "fall") stepHop(dt, moving);
  putCamera(moving, dt, now);
  stepGlow(dt);
}

function previewDrift(dt, now) {
  cam.yaw += dt * 0.04;
  cam.pitch = Math.sin(now * 0.0006) * 0.02;
  const idle = Math.sin(now * 0.008) * 0.01;
  view.setCamera(cam.x, cam.y + idle, cam.z, cam.yaw, cam.pitch, 0);
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!skyFall.active) stepBlink(dt);
  if (playing) {
    if (skyFall.active) {
      view.setFlash(false);
    } else {
      const tile = worldToTile(cam.x, cam.z);
      const here = cellInfo(cam.recipeId, cam.seed, tile.tx, tile.tz);
      audio.tick(dt, cam.recipeId, here.light);
      view.setFlash(cam.recipeId !== "poolrooms", blink.amount);
    }
    stepTour(dt, now);
  } else if (ui.end.hidden) {
    previewDrift(dt, now);
  } else {
    putCamera(false, dt, now);
  }
  if (!skyFall.active && ui.end.hidden) {
    view.syncChunks(cam.x, cam.z);
    view.syncProps(ents);
  }
  view.render();
  requestAnimationFrame(tick);
}

function enter() {
  ui.menu.hidden = true;
  ui.end.hidden = true;
  playing = true;
  audio.resume();
  goFullscreen();
  setLookHint(true);
  grab();
  closeLids(0.45, () => beginBeat(0));
}

function restart() {
  ui.end.hidden = true;
  playing = true;
  audio.resume();
  setLookHint(true);
  grab();
  closeLids(0.2, () => beginBeat(0));
}

ui.btnEnter.addEventListener("click", enter);
ui.btnAgain.addEventListener("click", restart);
ui.canvas.addEventListener("click", () => {
  if (playing) grab();
});
document.addEventListener("fullscreenchange", () => view.resize());
document.addEventListener("webkitfullscreenchange", () => view.resize());
document.addEventListener("pointerlockchange", () => {
  const on = looking();
  document.documentElement.classList.toggle("looking", on);
  if (on) setLookHint(false);
  else {
    look.unlockAt = performance.now();
    if (playing) setLookHint(true);
  }
});
window.addEventListener("mousemove", (evt) => {
  if (!playing || !looking()) return;
  look.yaw = Math.max(-1.4, Math.min(1.4, look.yaw - evt.movementX * 0.0022));
  look.pitch = Math.max(-0.42, Math.min(0.38, look.pitch - evt.movementY * 0.0018));
  look.moved = performance.now();
});

window.addEventListener("keydown", (evt) => {
  if (evt.code === "KeyA" || evt.code === "KeyD") lookKeys.add(evt.code);
  if (evt.repeat) return;
  if (evt.code === "KeyF") {
    evt.preventDefault();
    goFullscreen();
    return;
  }
  if (!playing) {
    if (evt.code === "Space" || evt.code === "Enter" || evt.code === "NumpadEnter") {
      evt.preventDefault();
      if (!ui.end.hidden) restart();
      else enter();
    }
    return;
  }
  if (evt.code === "Space" || evt.code === "ArrowRight") {
    evt.preventDefault();
    if (beatIndex >= BEATS.length - 1) startCut(BEATS.length - 1);
    else startCut(beatIndex + 1);
  } else if (evt.code === "ArrowLeft") {
    evt.preventDefault();
    prevBeat();
  } else if (evt.code === "Escape") {
    evt.preventDefault();
    if (looking() || performance.now() - look.unlockAt < 450) return;
    startCut(BEATS.length - 1);
  } else if (evt.code.startsWith("Digit")) {
    const n = Number(evt.code.slice(5));
    if (n >= 1 && n <= BEATS.length) {
      evt.preventDefault();
      startCut(n - 1);
    }
  }
});
window.addEventListener("keyup", (evt) => lookKeys.delete(evt.code));

loadLevel(BEATS[0].recipeId, BEATS[0].seed);
view.setFov(FOV);
view.setFlash(true, 0);
applyLids(0);
window.__atrium = () => beginAtriumLeg();
window.__seek = (i) => {
  if (!beat?.path) return null;
  beat.i = Math.max(0, Math.min(beat.path.length - 1, i | 0));
  beat.best = null;
  beat.hold = 0;
  const n = beat.path[beat.i];
  if (n) {
    cam.x = n.x;
    cam.z = n.z;
    cam.feet = groundAt(cam.recipeId, cam.seed, cam.x, cam.z);
    cam.y = EYE + cam.feet;
  }
  return window.__tour();
};
window.__tour = () => ({
  playing,
  beatIndex,
  id: beat?.spec.id,
  stage: beat?.stage,
  i: beat?.i,
  pathLen: beat?.path?.length,
  yaw: cam.yaw,
  lookYaw,
  pitch: cam.pitch,
  y: cam.y,
  grounded: hop.grounded,
  hop: hop.pending,
  feet: cam.feet,
  glow: glow.amount,
  x: cam.x,
  z: cam.z,
  blink: blink.phase,
  recipeId: cam.recipeId,
  cutTo,
  hunt: beat?.hunt
    ? {
        blinks: beat.hunt.blinks,
        dist: Math.hypot(beat.hunt.mannequin.x - cam.x, beat.hunt.mannequin.z - cam.z),
      }
    : null,
  ents: ents.map((e) => ({ kind: e.kind, niche: !!e.niche, x: e.x, z: e.z })),
});
requestAnimationFrame(tick);
