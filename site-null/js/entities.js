import { TILE, cellInfo, losClear, moveBody, rand01, spawnPoint, tileCenter, worldToTile } from "./world.js";

export const HUNT_DELAY = 75;
export const HUNT_COOLDOWN = 120;
const STALK_MIN = 6.2;
const STALK_MAX = 12.8;
const SLOW_SPEED = 1.52;
const LUNGE_SPEED = 4.7;
const LUNGE_RANGE = 3.25;
const CATCH_RANGE = 1.22;
const SEE_NEED = 0.4;
const SEPARATE = 5.2;
const PEEK_HOLD_MIN = 8.5;
const PEEK_HOLD_MAX = 14.5;
const LOOK_LINGER = 6.5;
const ENGAGE_EXTRA = {
  lurker: 0,
  portrait: 8,
  guest: 14,
  mannequin: 20,
};

export function createHunt() {
  return { t: 0, seen: false, seeT: 0, cool: 0, waveT: 0, saw: false };
}

export function resetHunt(hunt) {
  hunt.t = 0;
  hunt.seen = false;
  hunt.seeT = 0;
  hunt.cool = 0;
  hunt.waveT = 0;
  hunt.saw = false;
}

export function tickHunt(hunt, dt) {
  hunt.t += dt;
  if (hunt.cool > 0) hunt.cool = Math.max(0, hunt.cool - dt);
  else if (hunt.seen && hunt.t >= HUNT_DELAY) hunt.waveT += dt;
  if (!hunt.saw) hunt.seeT = Math.max(0, hunt.seeT - dt * 0.45);
  hunt.saw = false;
}

export function markHunterSeen(hunt, visible, dt) {
  if (!visible) return;
  hunt.saw = true;
  hunt.seeT += dt;
  if (hunt.seeT >= SEE_NEED) hunt.seen = true;
}

export function canEngage(hunt, kind) {
  if (!hunt.seen || hunt.cool > 0 || hunt.t < HUNT_DELAY) return false;
  return hunt.waveT >= (ENGAGE_EXTRA[kind] || 0);
}

export function afterKill(hunt) {
  hunt.cool = HUNT_COOLDOWN;
  hunt.waveT = 0;
}

function hunterPos(ent) {
  if (!ent || !ent.live) return null;
  if (ent.kind === "chair") return null;
  if (ent.kind === "portrait" && ent.hunting) return { x: ent.hx, z: ent.hz };
  return { x: ent.x, z: ent.z };
}

function tooNearOthers(p, others, self) {
  if (!p || !others) return false;
  for (const o of others) {
    if (!o || o === self) continue;
    const q = hunterPos(o);
    if (!q) continue;
    if (Math.hypot(p.x - q.x, p.z - q.z) < SEPARATE) return true;
  }
  return false;
}

function rollHold() {
  return PEEK_HOLD_MIN + Math.random() * (PEEK_HOLD_MAX - PEEK_HOLD_MIN);
}

function farOpen(recipeId, seed, player, min = 7, max = 16, occupied, self) {
  const { tx, tz } = worldToTile(player.x, player.z);
  let fallback = null;
  for (let i = 0; i < 64; i++) {
    const ang = rand01(seed, i + 3, 21) * Math.PI * 2;
    const distM = min + rand01(seed, i + 8, 5) * (max - min);
    const tiles = distM / TILE;
    const ox = tx + Math.round(Math.cos(ang) * tiles);
    const oz = tz + Math.round(Math.sin(ang) * tiles);
    const info = cellInfo(recipeId, seed, ox, oz);
    if (info.pillar || info.water || info.solid || info.blockR || info.opens < 1) continue;
    const p = tileCenter(ox, oz);
    if (!fallback) fallback = p;
    if (!tooNearOthers(p, occupied, self)) return p;
  }
  if (fallback) return fallback;
  const r0 = Math.max(2, Math.round(min / TILE));
  const r1 = Math.max(r0 + 1, Math.round(max / TILE));
  for (let r = r0; r <= r1; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const info = cellInfo(recipeId, seed, tx + dx, tz + dz);
        if (info.pillar || info.water || info.solid || info.blockR || info.opens < 1) continue;
        return tileCenter(tx + dx, tz + dz);
      }
    }
  }
  return tileCenter(tx + 3, tz + 2);
}

function openPeekCell(recipeId, seed, ox, oz, player, minD, maxD) {
  const info = cellInfo(recipeId, seed, ox, oz);
  if (info.pillar || info.water || info.solid || info.blockR || info.opens < 1) return null;
  const p = tileCenter(ox, oz);
  const d = Math.hypot(p.x - player.x, p.z - player.z);
  if (d < minD || d > maxD) return null;
  return { p, d, los: losClear(recipeId, seed, player.x, player.z, p.x, p.z) };
}

function facingDot(player, x, z) {
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const dx = x - player.x;
  const dz = z - player.z;
  const len = Math.hypot(dx, dz) || 1;
  return (dx * fx + dz * fz) / len;
}

function inViewCone(player, x, z) {
  return facingDot(player, x, z) > 0.52;
}

function peekSpot(recipeId, seed, player, salt = 0, occupied, self) {
  const { tx, tz } = worldToTile(player.x, player.z);
  const minD = STALK_MIN;
  const maxD = STALK_MAX + 1.2;
  let hiddenBack = null;
  let hiddenFront = null;
  let behind = null;
  for (let i = 0; i < 180; i++) {
    const distM = minD + rand01(seed, i + salt, 19) * (maxD - minD);
    const tiles = distM / TILE;
    const pick = rand01(seed, i + 3, salt + 8);
    let ang;
    if (pick < 0.5) ang = player.yaw + Math.PI + (rand01(seed, i + 5, 8) - 0.5) * 1.8;
    else if (pick < 0.82) {
      const side = rand01(seed, i + 6, 3) < 0.5 ? 1 : -1;
      ang = player.yaw + side * (Math.PI * 0.5) + (rand01(seed, i + 7, 9) - 0.5) * 1.1;
    } else ang = rand01(seed, i + salt, 21) * Math.PI * 2;
    const ox = tx + Math.round(Math.sin(ang) * tiles);
    const oz = tz + Math.round(Math.cos(ang) * tiles);
    const hit = openPeekCell(recipeId, seed, ox, oz, player, minD, maxD);
    if (!hit) continue;
    if (tooNearOthers(hit.p, occupied, self)) continue;
    const seen = hit.los && inViewCone(player, hit.p.x, hit.p.z);
    if (seen && rand01(seed, i, salt + 4) > 0.1) continue;
    const face = facingDot(player, hit.p.x, hit.p.z);
    if (!hit.los && face < 0.12) return hit.p;
    if (!hit.los) {
      if (!hiddenBack && face < 0.12) hiddenBack = hit.p;
      else if (!hiddenFront) hiddenFront = hit.p;
    } else if (face < 0.05 && !behind) {
      behind = hit.p;
    }
  }
  if (hiddenBack || hiddenFront || behind) return hiddenBack || hiddenFront || behind;
  for (let i = 0; i < 48; i++) {
    const distM = 9 + rand01(seed, i + 40, salt) * 12;
    const tiles = distM / TILE;
    const ang = player.yaw + Math.PI + (rand01(seed, i + 11, 4) - 0.5) * 1.4;
    const ox = tx + Math.round(Math.sin(ang) * tiles);
    const oz = tz + Math.round(Math.cos(ang) * tiles);
    const hit = openPeekCell(recipeId, seed, ox, oz, player, 7, 28);
    if (!hit || tooNearOthers(hit.p, occupied, self)) continue;
    if (!inViewCone(player, hit.p.x, hit.p.z)) return hit.p;
  }
  return farOpen(recipeId, seed, player, STALK_MIN, STALK_MAX, occupied, self);
}

function facePlayer(ent, player) {
  ent.yaw = Math.atan2(player.x - ent.x, player.z - ent.z);
}

function holdStalk(ent, recipeId, seed, player, lookingAt, dt, others) {
  if (ent.salt == null) ent.salt = 1;
  if (ent.hold == null) ent.hold = rollHold();
  facePlayer(ent, player);
  const dist = Math.hypot(ent.x - player.x, ent.z - player.z);
  const tooClose = dist < STALK_MIN - 0.6;
  const tooFar = dist > STALK_MAX + 1.8;
  const face = facingDot(player, ent.x, ent.z);
  if ((lookingAt || face > 0.18) && !tooClose) {
    ent.hold = Math.max(ent.hold, lookingAt ? LOOK_LINGER : 2.2);
    return dist < 16 ? "near" : null;
  }
  ent.hold -= dt;
  if (tooClose || tooFar || ent.hold <= 0) {
    const next = peekSpot(recipeId, seed, player, ent.salt++, others, ent);
    if (next) {
      const nd = Math.hypot(next.x - player.x, next.z - player.z);
      const inBand = nd >= STALK_MIN - 0.5 && nd <= STALK_MAX + 1.6;
      if (inBand && (tooClose || tooFar || !tooNearOthers(next, others, ent))) {
        ent.x = next.x;
        ent.z = next.z;
        ent.hold = rollHold();
        ent.noticed = false;
        facePlayer(ent, player);
        return "vanish";
      }
    }
    if (ent.hold <= 0) ent.hold = 1.2;
  }
  return dist < 16 ? "near" : null;
}

function approachSpeed(dist) {
  if (dist < LUNGE_RANGE) return LUNGE_SPEED;
  if (dist < 6.2) return 2.05;
  return SLOW_SPEED;
}

function closeIn(ent, recipeId, seed, player, dt, canMove, catchRange = CATCH_RANGE) {
  facePlayer(ent, player);
  const dist = Math.hypot(ent.x - player.x, ent.z - player.z);
  if (dist < catchRange) {
    ent.live = false;
    return "catch";
  }
  if (!canMove) return dist < 14 ? "near" : null;
  const speed = approachSpeed(dist);
  chase(ent, recipeId, seed, player, speed, dt, 0.28);
  if (dist < LUNGE_RANGE) {
    if (!ent.lunging) {
      ent.lunging = true;
      return "lunge";
    }
    return "hunt";
  }
  ent.lunging = false;
  return dist < 14 ? "near" : null;
}

export function createChair(recipeId, seed, player) {
  const spot = spawnPoint(recipeId, seed);
  return {
    kind: "chair",
    x: spot.x + 0.7,
    z: spot.z + 0.4,
    y: 0,
    seen: false,
  };
}

export function createGuest(recipeId, seed, player, occupied) {
  if (rand01(seed, 99, 77) > 0.55) return { kind: "guest", x: 0, z: 0, y: 0, live: false };
  const p = peekSpot(recipeId, seed, player, 11, occupied);
  return { kind: "guest", x: p.x, z: p.z, y: 0, live: true, hold: rollHold(), salt: 11, lunging: false };
}

export function createMannequin(recipeId, seed, player, occupied) {
  const p = peekSpot(recipeId, seed, player, 6, occupied);
  return { kind: "mannequin", x: p.x, z: p.z, y: 0, yaw: 0, live: true, unseen: 0, hold: rollHold(), salt: 6, lunging: false };
}

export function createPortrait(recipeId, seed, player, occupied) {
  if (rand01(seed, 5, 2) > 0.62) return { kind: "portrait", x: 0, z: 0, y: 0.02, live: false, stare: 0, hunting: false };
  const p = farOpen(recipeId, seed, player, 4, 9, occupied);
  return {
    kind: "portrait",
    x: p.x,
    z: p.z,
    y: 0.02,
    hx: p.x,
    hz: p.z,
    live: true,
    stare: 0,
    hunting: false,
  };
}

export function createShowcase(kind, x, z) {
  const base = { x, z, y: 0, showcase: true, live: true };
  if (kind === "chair") return { ...base, kind: "chair", seen: true };
  if (kind === "guest") return { ...base, kind: "guest", hold: 99, salt: 0, lunging: false, phase: "stalk" };
  if (kind === "mannequin") {
    return { ...base, kind: "mannequin", yaw: 0, unseen: 0, hold: 99, salt: 0, lunging: false, phase: "stalk" };
  }
  if (kind === "lurker") return { ...base, kind: "lurker", yaw: 0, phase: "stalk", hold: 99, salt: 0, lunging: false };
  if (kind === "portrait") {
    return { ...base, kind: "portrait", hx: x, hz: z, stare: 0, hunting: false, stand: true };
  }
  return null;
}

export function createLurker(recipeId, seed, player, occupied) {
  const p = peekSpot(recipeId, seed, player, 2, occupied);
  return {
    kind: "lurker",
    x: p.x,
    z: p.z,
    y: 0,
    yaw: Math.atan2(player.x - p.x, player.z - p.z),
    live: true,
    phase: "stalk",
    hold: rollHold(),
    salt: 3,
    lunging: false,
  };
}

const LEVEL_HUNTERS = {
  lobby: ["lurker"],
  habitable: ["lurker", "guest"],
  pipes: ["lurker", "mannequin"],
  office: ["lurker", "guest", "portrait", "mannequin"],
  hotel: ["lurker", "portrait", "guest"],
  caves: ["lurker", "mannequin"],
  poolrooms: ["lurker", "guest"],
};

function pickHunterKinds(recipeId, seed) {
  const pool = (LEVEL_HUNTERS[recipeId] || ["lurker"]).slice();
  const roll = rand01(seed, 3, 8);
  const count = roll < 0.78 ? 1 : 2;
  const picked = [];
  let n = 0;
  while (picked.length < count && pool.length && n < 8) {
    const idx = Math.floor(rand01(seed, 14 + n, 9) * pool.length) % pool.length;
    const kind = pool.splice(idx, 1)[0];
    n += 1;
    if (kind === "guest" && picked.includes("lurker")) continue;
    if (kind === "lurker" && picked.includes("guest")) continue;
    picked.push(kind);
  }
  return picked;
}

function makeHunter(kind, recipeId, seed, player, occupied) {
  if (kind === "lurker") return createLurker(recipeId, seed, player, occupied);
  if (kind === "guest") {
    const ent = createGuest(recipeId, seed, player, occupied);
    if (!ent.live) {
      ent.live = true;
      const p = peekSpot(recipeId, seed, player, 21, occupied);
      ent.x = p.x;
      ent.z = p.z;
    }
    return ent;
  }
  if (kind === "mannequin") return createMannequin(recipeId, seed, player, occupied);
  if (kind === "portrait") {
    const ent = createPortrait(recipeId, seed, player, occupied);
    if (!ent.live) {
      ent.live = true;
      const p = farOpen(recipeId, seed, player, 4, 9, occupied);
      ent.x = p.x;
      ent.z = p.z;
      ent.hx = p.x;
      ent.hz = p.z;
    }
    return ent;
  }
  return null;
}

export function spawnEntities(recipeId, seed, player) {
  const list = [createChair(recipeId, seed, player)];
  const hunters = [];
  for (const kind of pickHunterKinds(recipeId, seed)) {
    const ent = makeHunter(kind, recipeId, seed, player, hunters);
    if (!ent || !ent.live) continue;
    hunters.push(ent);
    list.push(ent);
  }
  return list;
}

export function stepChair(chair, player, lookingAt) {
  if (lookingAt) {
    chair.seen = true;
    return;
  }
  if (!chair.seen) return;
  const behind = -1.15;
  chair.x = player.x - Math.sin(player.yaw) * behind;
  chair.z = player.z - Math.cos(player.yaw) * behind;
}

function chase(ent, recipeId, seed, player, speed, dt, radius = 0.32) {
  const ang = Math.atan2(player.x - ent.x, player.z - ent.z);
  const next = moveBody(
    recipeId,
    seed,
    ent.x,
    ent.z,
    Math.sin(ang) * speed * dt,
    Math.cos(ang) * speed * dt,
    radius
  );
  ent.x = next.x;
  ent.z = next.z;
  ent.yaw = ang;
}

export function stepGuest(guest, recipeId, seed, player, lookingAt, eyesOpen, dt, engage, others) {
  if (!guest.live) return null;
  const watching = lookingAt && eyesOpen;
  if (!engage) return holdStalk(guest, recipeId, seed, player, watching, dt, others);
  guest.phase = guest.lunging ? "charging" : "close";
  return closeIn(guest, recipeId, seed, player, dt, !watching);
}

export function stepMannequin(ent, recipeId, seed, player, lookingAt, eyesOpen, dt, engage, others) {
  if (!ent.live) return null;
  const watching = lookingAt && eyesOpen;
  if (!engage) return holdStalk(ent, recipeId, seed, player, watching, dt, others);
  if (watching) {
    ent.unseen = 0;
    facePlayer(ent, player);
    return null;
  }
  ent.unseen += dt;
  if (ent.unseen < 0.9) {
    facePlayer(ent, player);
    return null;
  }
  ent.phase = ent.lunging ? "charging" : "close";
  return closeIn(ent, recipeId, seed, player, dt, true);
}

export function stepLurker(ent, recipeId, seed, player, lookingAt, eyesOpen, dt, engage, others) {
  if (!ent.live) return null;
  const watching = lookingAt && eyesOpen;
  if (!engage) {
    ent.phase = "stalk";
    return holdStalk(ent, recipeId, seed, player, watching, dt, others);
  }
  const ev = closeIn(ent, recipeId, seed, player, dt, true);
  ent.phase = ent.lunging ? "charging" : "close";
  return ev;
}

export function stepPortrait(ent, recipeId, seed, player, lookingAt, eyesOpen, dt, engage) {
  if (!ent.live) return null;
  if (!engage) {
    ent.hunting = false;
    if (lookingAt && eyesOpen) {
      ent.stare = Math.min(ent.stare + dt, 1.2);
      return "stare";
    }
    ent.stare = Math.max(0, ent.stare - dt * 0.35);
    return null;
  }
  if (!ent.hunting && lookingAt && eyesOpen) {
    ent.stare += dt;
    if (ent.stare > 1.7) {
      ent.hunting = true;
      ent.lunging = false;
      const behind = 8.5;
      ent.hx = player.x - Math.sin(player.yaw) * behind;
      ent.hz = player.z - Math.cos(player.yaw) * behind;
      return "wake";
    }
    return "stare";
  }
  if (!ent.hunting) {
    ent.stare = Math.max(0, ent.stare - dt * 0.35);
    return null;
  }
  const dummy = { x: ent.hx, z: ent.hz, live: true, lunging: ent.lunging };
  const ev = closeIn(dummy, recipeId, seed, player, dt, true, CATCH_RANGE);
  ent.hx = dummy.x;
  ent.hz = dummy.z;
  ent.lunging = dummy.lunging;
  if (ev === "catch") {
    ent.live = false;
    ent.hunting = false;
  }
  return ev;
}

export function visibleTarget(view, x, y, z, recipeId, seed, fromX, fromZ) {
  if (!view.inView(x, y, z)) return false;
  return losClear(recipeId, seed, fromX, fromZ, x, z);
}
