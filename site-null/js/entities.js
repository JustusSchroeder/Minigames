import { cellInfo, losClear, moveBody, rand01, spawnPoint, tileCenter, worldToTile } from "./world.js";

function farOpen(recipeId, seed, player, min = 7, max = 16) {
  const { tx, tz } = worldToTile(player.x, player.z);
  for (let i = 0; i < 48; i++) {
    const ang = rand01(seed, i + 3, 21) * Math.PI * 2;
    const dist = min + rand01(seed, i + 8, 5) * (max - min);
    const ox = tx + Math.round(Math.cos(ang) * dist);
    const oz = tz + Math.round(Math.sin(ang) * dist);
    const info = cellInfo(recipeId, seed, ox, oz);
    if (info.pillar || info.water || info.solid || info.opens < 1) continue;
    return tileCenter(ox, oz);
  }
  const p = tileCenter(tx + 10, tz + 4);
  return p;
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

export function createGuest(recipeId, seed, player) {
  if (rand01(seed, 99, 77) > 0.55) return { kind: "guest", x: 0, z: 0, y: 0, live: false };
  const p = farOpen(recipeId, seed, player, 9, 15);
  return { kind: "guest", x: p.x, z: p.z, y: 0, live: true };
}

export function createMannequin(recipeId, seed, player) {
  const p = farOpen(recipeId, seed, player, 6, 12);
  return { kind: "mannequin", x: p.x, z: p.z, y: 0, yaw: 0, live: true, unseen: 0 };
}

export function createWhisper(recipeId, seed, player) {
  if (recipeId !== "habitable" && recipeId !== "pipes" && rand01(seed, 4, 1) > 0.45) {
    return { kind: "whisper", x: 0, z: 0, y: 0, live: false, shown: false };
  }
  const p = farOpen(recipeId, seed, player, 10, 18);
  return { kind: "whisper", x: p.x, z: p.z, y: 0, live: true, shown: false, next: 1.2 };
}

export function createPortrait(recipeId, seed, player) {
  if (rand01(seed, 5, 2) > 0.62) return { kind: "portrait", x: 0, z: 0, y: 0.02, live: false, stare: 0, hunting: false };
  const p = farOpen(recipeId, seed, player, 4, 9);
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

function ambushSpot(recipeId, seed, player, salt = 0) {
  const { tx, tz } = worldToTile(player.x, player.z);
  let fallback = null;
  for (let i = 0; i < 80; i++) {
    const behind = i % 3 !== 2;
    const jitter = (rand01(seed, i + salt, 17) - 0.5) * (behind ? 1.15 : Math.PI * 2);
    const ang = behind ? player.yaw + jitter : rand01(seed, i + salt, 3) * Math.PI * 2;
    const dist = (behind ? 5 : 8) + rand01(seed, i + 9 + salt, 5) * (behind ? 7 : 9);
    const ox = tx + Math.round(Math.sin(ang) * dist);
    const oz = tz + Math.round(Math.cos(ang) * dist);
    const info = cellInfo(recipeId, seed, ox, oz);
    if (info.pillar || info.water || info.solid || info.opens < 1) continue;
    const p = tileCenter(ox, oz);
    if (Math.hypot(p.x - player.x, p.z - player.z) < 6.2) continue;
    if (!fallback) fallback = p;
    if (!losClear(recipeId, seed, player.x, player.z, p.x, p.z)) return p;
  }
  return fallback || farOpen(recipeId, seed, player, 8, 16);
}

export function createLurker(recipeId, seed, player) {
  const p = ambushSpot(recipeId, seed, player, 2);
  return {
    kind: "lurker",
    x: p.x,
    z: p.z,
    y: 0,
    yaw: Math.atan2(player.x - p.x, player.z - p.z),
    live: true,
    phase: "lurk",
    freeze: 0,
    lurkT: 0,
    salt: 3,
  };
}

export function spawnEntities(recipeId, seed, player) {
  const list = [createChair(recipeId, seed, player), createLurker(recipeId, seed, player)];
  if (recipeId === "lobby") return list;
  const guest = createGuest(recipeId, seed, player);
  if (guest.live) list.push(guest);
  if (recipeId === "pipes" || recipeId === "caves" || rand01(seed, 3, 8) < 0.75) {
    list.push(createMannequin(recipeId, seed, player));
  }
  const whisper = createWhisper(recipeId, seed, player);
  if (whisper.live) list.push(whisper);
  if (recipeId === "hotel" || recipeId === "office") {
    const portrait = createPortrait(recipeId, seed, player);
    if (portrait.live) list.push(portrait);
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

export function stepGuest(guest, recipeId, seed, player, canMove, dt) {
  if (!guest.live) return null;
  const dist = Math.hypot(guest.x - player.x, guest.z - player.z);
  if (dist < 1.15) {
    guest.live = false;
    return "catch";
  }
  if (!canMove) return null;
  chase(guest, recipeId, seed, player, 9.5, dt);
  return dist < 14 ? "near" : null;
}

export function stepMannequin(ent, recipeId, seed, player, lookingAt, eyesOpen, dt) {
  if (!ent.live) return null;
  const dist = Math.hypot(ent.x - player.x, ent.z - player.z);
  if (dist < 1.2) {
    ent.live = false;
    return "catch";
  }
  if (lookingAt && eyesOpen) {
    ent.unseen = 0;
    return null;
  }
  ent.unseen += dt;
  ent.yaw = Math.atan2(player.x - ent.x, player.z - ent.z);
  if (ent.unseen > 1.4) chase(ent, recipeId, seed, player, 2.1, dt);
  return ent.unseen > 1.4 && dist < 10 ? "near" : null;
}

export function stepWhisper(ent, recipeId, seed, player, dt) {
  if (!ent.live) return null;
  const dist = Math.hypot(ent.x - player.x, ent.z - player.z);
  ent.next -= dt;
  if (ent.next <= 0) {
    ent.next = 2.4 + Math.random() * 2.2;
    if (!ent.shown) return "call";
  }
  if (dist < 4.2) ent.shown = true;
  if (ent.shown) {
    if (dist < 1.2) {
      ent.live = false;
      return "catch";
    }
    chase(ent, recipeId, seed, player, 1.7, dt);
    return "near";
  }
  return null;
}

export function stepLurker(ent, recipeId, seed, player, lookingAt, eyesOpen, dt) {
  if (!ent.live) return null;
  const dist = Math.hypot(ent.x - player.x, ent.z - player.z);
  ent.yaw = Math.atan2(player.x - ent.x, player.z - ent.z);

  if (ent.phase === "charging") {
    if (dist < 1.35) {
      ent.live = false;
      return "catch";
    }
    chase(ent, recipeId, seed, player, 8.2, dt, 0.28);
    return "hunt";
  }

  if (ent.phase === "glimpsed") {
    ent.freeze -= dt;
    if (ent.freeze <= 0) {
      ent.phase = "charging";
      return "lunge";
    }
    return null;
  }

  if (dist < 1.35) {
    ent.live = false;
    return "catch";
  }

  if (lookingAt && eyesOpen) {
    ent.phase = "glimpsed";
    ent.freeze = 0.28 + Math.random() * 0.22;
    return "spot";
  }

  ent.lurkT += dt;
  if (ent.lurkT > 3.6 || dist > 20) {
    const next = ambushSpot(recipeId, seed, player, ent.salt++);
    if (next && !losClear(recipeId, seed, player.x, player.z, next.x, next.z)) {
      ent.x = next.x;
      ent.z = next.z;
      ent.lurkT = 0;
    } else if (ent.lurkT > 6) {
      const far = farOpen(recipeId, seed, player, 7, 14);
      ent.x = far.x;
      ent.z = far.z;
      ent.lurkT = 0;
    }
  }
  return dist < 12 ? "near" : null;
}

export function stepPortrait(ent, recipeId, seed, player, lookingAt, eyesOpen, dt) {
  if (!ent.live) return null;
  if (!ent.hunting && lookingAt && eyesOpen) {
    ent.stare += dt;
    if (ent.stare > 1.7) {
      ent.hunting = true;
      const behind = 7;
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
  const dist = Math.hypot(ent.hx - player.x, ent.hz - player.z);
  if (dist < 1.2) {
    ent.live = false;
    ent.hunting = false;
    return "catch";
  }
  const dummy = { x: ent.hx, z: ent.hz };
  chase(dummy, recipeId, seed, player, 4.4, dt, 0.3);
  ent.hx = dummy.x;
  ent.hz = dummy.z;
  return "hunt";
}

export function visibleTarget(view, x, y, z, recipeId, seed, fromX, fromZ) {
  if (!view.inView(x, y, z)) return false;
  return losClear(recipeId, seed, fromX, fromZ, x, z);
}
