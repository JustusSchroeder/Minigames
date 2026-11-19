import { createAudio } from "./audio.js";
import {
  afterKill,
  canEngage,
  createHunt,
  markHunterSeen,
  resetHunt,
  createShowcase,
  spawnEntities,
  stepChair,
  stepGuest,
  stepLurker,
  stepMannequin,
  stepPortrait,
  tickHunt,
  visibleTarget,
} from "./entities.js";
import { RECIPE_ORDER, getRecipe, nextRecipe } from "./levels.js";
import { createView3D } from "./view3d.js";
import {
  RADIUS,
  cellInfo,
  findSpiral,
  moveBody,
  moveOnFoot,
  nearExit,
  newSeed,
  sampleCeiling,
  sampleFloor,
  spawnPoint,
  unstuck,
  worldToTile,
} from "./world.js";

const SAVE_KEY = "site-null-save";
const ADMIN_KEY = "site-null-admin";
const EYE = 1.65;
const HEAD = 1.72;
const WALK = 2.8;
const SPRINT = 4.6;
const GRAVITY = 22;
const JUMP_VEL = 7.4;
const STEP_UP = 0.52;
const FOV = 74;
const FOV_RUN = 78;
const ADMIN_DIGITS = {
  Digit1: 1,
  Digit2: 2,
  Digit3: 3,
  Digit4: 4,
  Digit5: 5,
  Digit6: 6,
  Digit7: 7,
  Digit0: 0,
  Numpad1: 1,
  Numpad2: 2,
  Numpad3: 3,
  Numpad4: 4,
  Numpad5: 5,
  Numpad6: 6,
  Numpad7: 7,
  Numpad0: 0,
};

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data.seed !== "number") return null;
    return data;
  } catch {
    return null;
  }
}

function fresh() {
  const recipeId = "lobby";
  const seed = newSeed();
  const spawn = spawnPoint(recipeId, seed);
  return {
    recipeId,
    seed,
    x: spawn.x,
    y: EYE,
    z: spawn.z,
    yaw: spawn.yaw ?? 0,
    pitch: 0.16,
    flash: true,
    battery: 1,
    blink: 1,
    journal: ["lobby"],
  };
}

export function createGame(ui) {
  const view = createView3D(ui.canvas);
  const audio = createAudio();
  const keys = new Set();
  let state = loadSave() || fresh();
  if (state.recipeId === "parking") state.recipeId = "habitable";
  if (!RECIPE_ORDER.includes(state.recipeId)) state.recipeId = "lobby";
  if (!state.pitch) state.pitch = 0.16;
  if (typeof state.battery !== "number" || state.battery < 0.08) state.battery = 1;
  if (state.flash == null) state.flash = true;
  const free = unstuck(state.recipeId, state.seed, state.x, state.z);
  state.x = free.x;
  state.z = free.z;
  state.y = EYE + sampleFloor(state.recipeId, state.seed, state.x, state.z);
  let ents = spawnEntities(state.recipeId, state.seed, state);
  let vy = 0;
  let jumpQueued = false;
  let coyote = 0;
  let playing = false;
  let locked = false;
  let hadLock = false;
  let last = performance.now();
  let saveAt = 0;
  let bobPhase = 0;
  let bobMix = 0;
  let bobSign = 0;
  let fovNow = FOV;
  let pendingExit = null;
  let spawnGrace = 1.2;
  let guestSeen = false;
  let blinkPhase = "open";
  let blinkT = 0;
  let blinkHold = 0.08;
  let blinkAmt = 0;
  let scare = null;
  const hunt = createHunt();

  view.applyRecipe(state.recipeId, state.seed);
  view.setCamera(state.x, state.y, state.z, state.yaw, state.pitch);
  view.syncChunks(state.x, state.z);
  view.syncProps(ents);
  ui.place.textContent = getRecipe(state.recipeId).name;

  let adminOn = localStorage.getItem(ADMIN_KEY) === "1" || new URLSearchParams(location.search).has("admin");
  let spawnMode = false;
  const german = localStorage.getItem("minigames-lang") === "de";
  const SHOWCASE = [
    { kind: "lurker", key: "Q", label: german ? "Lurker" : "Lurker" },
    { kind: "guest", key: "E", label: german ? "Guest" : "Guest" },
    { kind: "mannequin", key: "R", label: german ? "Mannequin" : "Mannequin" },
    { kind: "portrait", key: "T", label: german ? "Portrait" : "Portrait" },
    { kind: "chair", key: "Y", label: german ? "Stuhl" : "Chair" },
  ];

  function persistAdmin() {
    localStorage.setItem(ADMIN_KEY, adminOn ? "1" : "0");
  }

  function refreshAdmin() {
    if (!ui.adminLevels) return;
    for (const btn of ui.adminLevels.querySelectorAll("button")) {
      btn.classList.toggle("on", btn.dataset.recipe === state.recipeId);
    }
  }

  function setAdmin(on) {
    adminOn = on;
    if (!on) spawnMode = false;
    persistAdmin();
    if (ui.admin) ui.admin.hidden = !on;
    refreshAdmin();
    refreshSpawn();
  }

  function warpTo(recipeId) {
    if (scare) return;
    enterLevel(recipeId, newSeed());
    refreshAdmin();
  }

  function cycleLevel(dir) {
    const i = RECIPE_ORDER.indexOf(state.recipeId);
    const at = i < 0 ? 0 : (i + dir + RECIPE_ORDER.length) % RECIPE_ORDER.length;
    warpTo(RECIPE_ORDER[at]);
  }

  if (ui.adminLevels) {
    ui.adminLevels.replaceChildren(
      ...RECIPE_ORDER.map((id, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.recipe = id;
        const num = document.createElement("span");
        num.className = "n";
        num.textContent = String(i + 1);
        const label = document.createElement("span");
        label.textContent = getRecipe(id).name;
        btn.append(num, label);
        btn.addEventListener("click", () => warpTo(id));
        return btn;
      })
    );
  }
  function adminHelpText() {
    if (german) {
      return spawnMode
        ? "Q E R T Y setzen · C reihe · X leeren · M spawn · F9"
        : "1–7 springen · , . wechseln · 0 neu · G geom · M spawn · F9";
    }
    return spawnMode
      ? "Q E R T Y place · C lineup · X clear · M spawn · F9"
      : "1–7 jump · , . cycle · 0 reroll · G geom · M spawn · F9";
  }

  function refreshSpawn() {
    if (ui.adminSpawnToggle) {
      ui.adminSpawnToggle.classList.toggle("on", spawnMode);
      ui.adminSpawnToggle.textContent = german
        ? spawnMode
          ? "Spawn-Modus an"
          : "Spawn-Modus"
        : spawnMode
          ? "Spawn mode on"
          : "Spawn mode";
    }
    if (ui.adminHelp) ui.adminHelp.textContent = adminHelpText();
  }

  function setSpawnMode(on) {
    spawnMode = !!on;
    refreshSpawn();
  }

  function placeAhead(dist = 3.2, side = 0) {
    const fx = -Math.sin(state.yaw);
    const fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw);
    const rz = -Math.sin(state.yaw);
    const fromX = state.x + rx * side * 0.35;
    const fromZ = state.z + rz * side * 0.35;
    const hit = moveBody(state.recipeId, state.seed, fromX, fromZ, fx * dist + rx * side, fz * dist + rz * side, 0.28);
    if (Math.hypot(hit.x - state.x, hit.z - state.z) > 1.1) return hit;
    return moveBody(state.recipeId, state.seed, state.x, state.z, fx * 2.4, fz * 2.4, 0.28);
  }

  function spawnShowcase(kind, dist = 3.2, side = 0) {
    if (!adminOn) return;
    const shown = ents.filter((e) => e.showcase).length;
    if (shown >= 24) return;
    const at = placeAhead(dist, side);
    const ent = createShowcase(kind, at.x, at.z);
    if (!ent) return;
    ents.push(ent);
    view.syncProps(ents);
  }

  function spawnLineup() {
    if (!adminOn) return;
    ents = ents.filter((e) => !e.showcase);
    const kinds = SHOWCASE.map((item) => item.kind);
    const gap = 1.15;
    const start = -((kinds.length - 1) * gap) / 2;
    kinds.forEach((kind, i) => spawnShowcase(kind, 3.4, start + i * gap));
  }

  function clearShowcase() {
    ents = ents.filter((e) => !e.showcase);
    view.syncProps(ents);
  }

  if (ui.adminSpawnToggle) {
    ui.adminSpawnToggle.textContent = german ? "Spawn-Modus" : "Spawn mode";
    ui.adminSpawnToggle.addEventListener("click", (evt) => {
      evt.preventDefault();
      setSpawnMode(!spawnMode);
    });
  }
  if (ui.adminSpawnKinds) {
    const extras = [
      { kind: "lineup", key: "C", label: german ? "Reihe" : "Lineup" },
      { kind: "clear", key: "X", label: german ? "Leeren" : "Clear" },
    ];
    ui.adminSpawnKinds.replaceChildren(
      ...SHOWCASE.concat(extras).map((item) => {
        const btn = document.createElement("button");
        btn.type = "button";
        const key = document.createElement("span");
        key.className = "n";
        key.textContent = item.key;
        const label = document.createElement("span");
        label.textContent = item.label;
        btn.append(key, label);
        btn.addEventListener("click", (evt) => {
          evt.preventDefault();
          if (item.kind === "lineup") spawnLineup();
          else if (item.kind === "clear") clearShowcase();
          else spawnShowcase(item.kind);
        });
        return btn;
      })
    );
  }
  if (ui.adminHelp) ui.adminHelp.textContent = adminHelpText();
  setAdmin(adminOn);
  refreshSpawn();

  function persist() {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        recipeId: state.recipeId,
        seed: state.seed,
        x: state.x,
        y: state.y,
        z: state.z,
        yaw: state.yaw,
        pitch: state.pitch,
        flash: state.flash,
        battery: state.battery,
        blink: state.blink,
        journal: state.journal,
      })
    );
  }

  function setLocked(on) {
    locked = on;
    document.documentElement.classList.toggle("looking", on);
    ui.crosshair.hidden = !on;
    ui.blinkMeter.hidden = !on;
    ui.lookHint.hidden = on || !playing;
    ui.place.hidden = !playing;
  }

  function grab() {
    const out = ui.canvas.requestPointerLock({ unadjustedMovement: true });
    if (out && typeof out.catch === "function") out.catch(() => ui.canvas.requestPointerLock());
  }

  function goFullscreen() {
    const root = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) return;
    const req = root.requestFullscreen?.({ navigationUI: "hide" }) || root.webkitRequestFullscreen?.();
    if (req && typeof req.catch === "function") req.catch(() => {});
  }

  function toggleFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      document.exitFullscreen?.() || document.webkitExitFullscreen?.();
      return;
    }
    goFullscreen();
  }

  function enter() {
    playing = true;
    ui.menu.hidden = true;
    ui.pause.hidden = true;
    ui.place.hidden = false;
    ui.blinkMeter.hidden = false;
    audio.resume();
    audio.setRecipe(state.recipeId);
    goFullscreen();
    grab();
  }

  function pause() {
    if (!playing) return;
    ui.pause.hidden = false;
    persist();
    if (document.pointerLockElement === ui.canvas) document.exitPointerLock();
  }

  function enterLevel(recipeId, seed) {
    state.recipeId = recipeId;
    state.seed = seed;
    const spawn = spawnPoint(recipeId, seed);
    const free = unstuck(recipeId, seed, spawn.x, spawn.z);
    state.x = free.x;
    state.z = free.z;
    state.y = EYE + sampleFloor(recipeId, seed, state.x, state.z);
    vy = 0;
    jumpQueued = false;
    coyote = 0;
    state.yaw = spawn.yaw ?? 0;
    if (!state.journal.includes(recipeId)) state.journal.push(recipeId);
    ents = spawnEntities(recipeId, seed, state);
    guestSeen = false;
    pendingExit = null;
    spawnGrace = 1.5;
    resetHunt(hunt);
    resetBob();
    state.battery = Math.max(state.battery, 0.55);
    state.flash = true;
    view.applyRecipe(recipeId, seed);
    view.syncChunks(state.x, state.z);
    audio.setRecipe(recipeId);
    ui.place.textContent = getRecipe(recipeId).name;
    persist();
    refreshAdmin();
  }

  function resetBob() {
    bobPhase = 0;
    bobMix = 0;
    bobSign = 0;
    fovNow = FOV;
  }

  function stepWalkCam(dt, moving, sprint, now, grounded) {
    const on = moving && grounded;
    bobMix += ((on ? 1 : 0) - bobMix) * Math.min(1, dt * (on ? 7 : 9));
    if (on) bobPhase += dt * (sprint ? 12.4 : 8.8);
    const amp = bobMix * (sprint ? 0.78 : 0.5);
    const lift = Math.sin(bobPhase * 2);
    const sway = Math.sin(bobPhase);
    const idle = Math.sin(now * 0.008) * 0.008 * (1 - bobMix * 0.85);
    view.setCamera(
      state.x,
      state.y + idle + lift * 0.022 * amp,
      state.z,
      state.yaw,
      state.pitch + Math.cos(bobPhase * 2) * 0.005 * amp,
      sway * 0.012 * amp
    );
    const wantFov = on && sprint ? FOV_RUN : FOV;
    fovNow += (wantFov - fovNow) * Math.min(1, dt * 7);
    view.setFov(fovNow);
    if (on && bobMix > 0.22) {
      const sign = lift >= 0 ? 1 : -1;
      if (bobSign > 0 && sign < 0) {
        const tile = worldToTile(state.x, state.z);
        audio.foot(cellInfo(state.recipeId, state.seed, tile.tx, tile.tz).floor);
      }
      bobSign = sign;
    } else {
      bobSign = 0;
    }
  }

  function ease(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  function applyLids(amount) {
    blinkAmt = amount;
    const e = ease(amount);
    if (ui.lidTop) ui.lidTop.style.transform = `translateY(${(-102 + e * 102).toFixed(2)}%)`;
    if (ui.lidBot) ui.lidBot.style.transform = `translateY(${(102 - e * 102).toFixed(2)}%)`;
    if (ui.lidFade) ui.lidFade.style.opacity = String(e * 0.4);
    view.setBlinkDim(e);
  }

  function blinkNow(hold = 0.08) {
    if (blinkPhase === "open" || blinkPhase === "opening") {
      blinkPhase = "closing";
      blinkT = 0;
      blinkHold = hold;
      state.blink = 1;
      audio.blink();
      return;
    }
    blinkHold = Math.max(blinkHold, hold);
  }

  function stepBlink(dt) {
    const close = 0.1;
    const open = 0.18;
    if (blinkPhase === "closing") {
      blinkT += dt;
      applyLids(Math.min(1, blinkT / close));
      if (blinkT >= close) {
        blinkPhase = "shut";
        blinkT = 0;
        applyLids(1);
      }
    } else if (blinkPhase === "shut") {
      blinkT += dt;
      applyLids(1);
      if (blinkT >= blinkHold) {
        blinkPhase = "opening";
        blinkT = 0;
      }
    } else if (blinkPhase === "opening") {
      blinkT += dt;
      applyLids(1 - Math.min(1, blinkT / open));
      if (blinkT >= open) {
        blinkPhase = "open";
        blinkT = 0;
        applyLids(0);
      }
    } else {
      applyLids(0);
    }
  }

  function startJumpscare() {
    if (scare) return;
    scare = { t: 0, black: false };
    audio.scream();
    blinkPhase = "open";
    blinkT = 0;
    applyLids(0);
    if (ui.prompt) ui.prompt.hidden = true;
    if (ui.jumpscare) {
      ui.jumpscare.hidden = false;
      ui.jumpscare.classList.remove("on", "fade");
      void ui.jumpscare.offsetWidth;
      ui.jumpscare.classList.add("on");
    }
    if (ui.deathVeil) {
      ui.deathVeil.hidden = true;
      ui.deathVeil.classList.remove("on");
    }
    view.setFov(96);
    fovNow = 96;
  }

  function respawnHere() {
    const spawn = spawnPoint(state.recipeId, state.seed);
    const free = unstuck(state.recipeId, state.seed, spawn.x, spawn.z);
    state.x = free.x;
    state.z = free.z;
    state.yaw = spawn.yaw ?? 0;
    state.pitch = 0.16;
    state.y = EYE + sampleFloor(state.recipeId, state.seed, state.x, state.z);
    vy = 0;
    jumpQueued = false;
    coyote = 0;
    state.blink = 1;
    blinkPhase = "open";
    blinkT = 0;
    applyLids(0);
    ents = spawnEntities(state.recipeId, state.seed, state);
    guestSeen = false;
    pendingExit = null;
    spawnGrace = 2.5;
    afterKill(hunt);
    state.battery = Math.max(state.battery, 0.45);
    state.flash = true;
    resetBob();
    view.setFov(FOV);
    view.applyRecipe(state.recipeId, state.seed);
    view.syncChunks(state.x, state.z);
    persist();
  }

  function stepScare(dt) {
    scare.t += dt;
    const punch = Math.max(0, 1 - scare.t / 0.55);
    view.setCamera(
      state.x,
      state.y + punch * 0.1,
      state.z,
      state.yaw + (Math.random() - 0.5) * 0.2 * punch,
      state.pitch + (Math.random() - 0.5) * 0.16 * punch
    );
    view.setFlash(false, 0);
    view.syncChunks(state.x, state.z);
    view.syncProps(ents);
    if (scare.t > 0.7 && !scare.black) {
      scare.black = true;
      if (ui.jumpscare) ui.jumpscare.classList.add("fade");
      if (ui.deathVeil) {
        ui.deathVeil.hidden = false;
        ui.deathVeil.classList.add("on");
      }
      resetBob();
      view.setFov(FOV);
    }
    if (scare.t > 2.05) {
      respawnHere();
      if (ui.jumpscare) {
        ui.jumpscare.hidden = true;
        ui.jumpscare.classList.remove("on", "fade");
      }
      if (ui.deathVeil) {
        ui.deathVeil.hidden = true;
        ui.deathVeil.classList.remove("on");
      }
      scare = null;
    }
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (playing && scare) {
      stepScare(dt);
    } else if (playing) {
      state.blink -= dt / (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 3.6 : 4.5);
      if (state.blink <= 0) blinkNow();
      ui.blinkFill.style.transform = `scaleX(${Math.max(0, Math.min(1, state.blink))})`;

      stepBlink(dt);
      if (state.flash && state.battery > 0) {
        state.battery = Math.max(0, state.battery - dt / 900);
      } else if (!state.flash && state.battery < 1) {
        state.battery = Math.min(1, state.battery + dt / 220);
      }
      view.setFlash(state.flash && state.battery > 0.02, blinkAmt);

      const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const speed = sprint ? SPRINT : WALK;
      let mx = 0;
      let mz = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
      const moving = !!(mx || mz);
      let feet = state.y - EYE;
      if (moving) {
        const len = Math.hypot(mx, mz) || 1;
        mx /= len;
        mz /= len;
        const sin = Math.sin(state.yaw);
        const cos = Math.cos(state.yaw);
        const wx = (mx * cos + mz * sin) * speed * dt;
        const wz = (-mx * sin + mz * cos) * speed * dt;
        const next = moveOnFoot(state.recipeId, state.seed, state.x, state.z, feet, wx, wz, RADIUS, STEP_UP);
        state.x = next.x;
        state.z = next.z;
      }
      const support = sampleFloor(state.recipeId, state.seed, state.x, state.z, feet, STEP_UP);
      const ceilY = sampleCeiling(state.recipeId, state.seed, state.x, state.z, feet);
      const onGround = vy <= 0.12 && feet <= support + 0.08 && support >= feet - 0.08;
      if (onGround) coyote = 0.12;
      else coyote = Math.max(0, coyote - dt);
      const wantJump = jumpQueued && coyote > 0;
      jumpQueued = false;
      if (wantJump) {
        vy = JUMP_VEL;
        coyote = 0;
      }
      if (onGround && !wantJump) {
        feet = support;
        vy = 0;
      } else {
        vy -= GRAVITY * dt;
        feet += vy * dt;
        const land = sampleFloor(state.recipeId, state.seed, state.x, state.z, feet, 0.08);
        if (vy <= 0 && feet <= land) {
          feet = land;
          vy = 0;
          coyote = 0.12;
        }
      }
      if (feet + HEAD > ceilY) {
        if (vy > 0) vy = 0;
        const squeezed = ceilY - HEAD;
        if (squeezed >= support - 0.02) feet = squeezed;
      }
      state.y = feet + EYE;
      const grounded = vy <= 0.05 && feet <= support + 0.08;

      if (spawnGrace > 0) spawnGrace -= dt;
      const tile = worldToTile(state.x, state.z);
      const here = cellInfo(state.recipeId, state.seed, tile.tx, tile.tz);
      audio.tick(dt, state.recipeId, here.light);
      if (here.manila && Math.random() < dt * 0.4) audio.whisper(0.35);
      const atExit = spawnGrace <= 0 && here.door && nearExit(state.x, state.z, here);
      if (atExit) {
        pendingExit = here.exit || { to: nextRecipe(state.recipeId), label: `Threshold → ${getRecipe(nextRecipe(state.recipeId)).short}` };
        ui.prompt.hidden = false;
        const hint = localStorage.getItem("minigames-lang") === "de" ? "Enter — " : "Enter — ";
        ui.prompt.textContent = hint + (pendingExit.label || `Threshold → ${getRecipe(pendingExit.to).short}`);
      } else {
        pendingExit = null;
        ui.prompt.hidden = true;
      }

      const eyesOpen = blinkAmt < 0.55;
      const seen = (x, y, z) => visibleTarget(view, x, y, z, state.recipeId, state.seed, state.x, state.z);
      tickHunt(hunt, dt);

      function notice(ent, vis, sting) {
        markHunterSeen(hunt, vis && eyesOpen, dt);
        if (vis && eyesOpen && !ent.noticed) {
          ent.noticed = true;
          if (sting) sting();
        }
        if (!vis) ent.noticed = false;
      }

      function got(ent, scareKill) {
        if (spawnGrace > 0) {
          ent.live = true;
          ent.lunging = false;
          if (ent.kind === "lurker") ent.phase = "stalk";
          if (ent.kind === "portrait") ent.hunting = false;
          return;
        }
        if (scareKill) {
          afterKill(hunt);
          startJumpscare();
        } else {
          blinkNow(0.55);
          audio.scrape();
        }
      }

      for (const ent of ents) {
        if (ent.showcase || spawnMode) continue;
        if (ent.kind === "chair") {
          const looking = seen(ent.x, 0.5, ent.z) && eyesOpen;
          stepChair(ent, state, looking);
          if (ent.seen && !looking && Math.random() < dt * 1.6) audio.chair();
        } else if (ent.kind === "guest" && ent.live) {
          const vis = seen(ent.x, 1.1, ent.z);
          const dist = Math.hypot(ent.x - state.x, ent.z - state.z);
          const engage = canEngage(hunt, "guest");
          notice(ent, vis, () => {
            if (!guestSeen) {
              guestSeen = true;
              audio.scrape();
            } else if (!engage) audio.spot();
          });
          const ev = stepGuest(ent, state.recipeId, state.seed, state, vis, eyesOpen, dt, engage, ents);
          if (ev === "catch") got(ent, true);
          else if (ev === "lunge") audio.howl();
          else if (ev === "hunt" && Math.random() < dt * 1.6) audio.guestNear(dist);
          else if (ev === "near" && Math.random() < dt * (engage ? 1.1 : 0.35)) audio.guestNear(dist);
        } else if (ent.kind === "lurker" && ent.live) {
          const vis = seen(ent.x, 1.55, ent.z);
          const dist = Math.hypot(ent.x - state.x, ent.z - state.z);
          const engage = canEngage(hunt, "lurker");
          notice(ent, vis, () => audio.spot());
          const ev = stepLurker(ent, state.recipeId, state.seed, state, vis, eyesOpen, dt, engage, ents);
          if (ev === "catch") got(ent, true);
          else if (ev === "lunge") audio.howl();
          else if (ev === "hunt" && Math.random() < dt * 1.8) audio.lurkNear(dist);
          else if (ev === "near" && Math.random() < dt * (engage ? 0.7 : 0.28)) audio.lurkNear(dist);
        } else if (ent.kind === "mannequin" && ent.live) {
          const vis = seen(ent.x, 1.05, ent.z);
          const dist = Math.hypot(ent.x - state.x, ent.z - state.z);
          const engage = canEngage(hunt, "mannequin");
          notice(ent, vis);
          const ev = stepMannequin(ent, state.recipeId, state.seed, state, vis, eyesOpen, dt, engage, ents);
          if (ev === "catch") got(ent, false);
          else if (ev === "lunge") audio.scrape();
          else if (ev === "near" && Math.random() < dt * (engage ? 1.0 : 0.3)) audio.mannequin(dist);
        } else if (ent.kind === "portrait" && ent.live) {
          const vis = seen(ent.x, 0.3, ent.z) || (ent.hunting && seen(ent.hx, 1.0, ent.hz));
          const engage = canEngage(hunt, "portrait");
          notice(ent, vis);
          const ev = stepPortrait(ent, state.recipeId, state.seed, state, vis, eyesOpen, dt, engage);
          if (ev === "wake") audio.wake();
          if (ev === "hunt" || ev === "near") {
            const dist = Math.hypot((ent.hunting ? ent.hx : ent.x) - state.x, (ent.hunting ? ent.hz : ent.z) - state.z);
            if (Math.random() < dt * (engage ? 1.6 : 0.25)) audio.hunt(dist);
          }
          if (ev === "lunge") audio.wake();
          if (ev === "catch") got(ent, false);
        }
      }

      stepWalkCam(dt, moving, sprint, now, grounded);
      view.syncChunks(state.x, state.z);
      view.syncProps(ents);

      if (now > saveAt) {
        saveAt = now + 4000;
        persist();
      }
    } else {
      view.setCamera(state.x, state.y, state.z, state.yaw, state.pitch);
      view.syncChunks(state.x, state.z);
      view.syncProps(ents);
    }

    view.render();
    requestAnimationFrame(tick);
  }

  ui.canvas.addEventListener("click", () => {
    if (!playing) return;
    if (ui.pause.hidden === false) return;
    grab();
  });

  document.addEventListener("pointerlockchange", () => {
    const on = document.pointerLockElement === ui.canvas;
    if (on) hadLock = true;
    setLocked(on);
    if (playing && !on && hadLock && ui.pause.hidden && !scare) {
      hadLock = false;
      pause();
    }
  });

  ui.canvas.addEventListener("mousemove", (evt) => {
    if (!locked || scare) return;
    state.yaw -= evt.movementX * 0.0022;
    state.pitch -= evt.movementY * 0.002;
    state.pitch = Math.max(-1.2, Math.min(1.1, state.pitch));
  });

  window.addEventListener("keydown", (evt) => {
    keys.add(evt.code);
    if (evt.code === "F9" || evt.code === "Backquote") {
      evt.preventDefault();
      setAdmin(!adminOn);
      return;
    }
    if (adminOn && !evt.repeat && !evt.metaKey && !evt.ctrlKey && !evt.altKey) {
      const digit = ADMIN_DIGITS[evt.code];
      if (digit >= 1 && digit <= RECIPE_ORDER.length) {
        evt.preventDefault();
        warpTo(RECIPE_ORDER[digit - 1]);
        return;
      }
      if (digit === 0) {
        evt.preventDefault();
        warpTo(state.recipeId);
        return;
      }
      if (evt.code === "Comma" || evt.code === "BracketLeft" || evt.code === "PageUp") {
        evt.preventDefault();
        cycleLevel(-1);
        return;
      }
      if (evt.code === "Period" || evt.code === "BracketRight" || evt.code === "PageDown") {
        evt.preventDefault();
        cycleLevel(1);
        return;
      }
      if (evt.code === "KeyG") {
        evt.preventDefault();
        view.setGeomDebug(!view.geomDebug());
        view.syncChunks(state.x, state.z);
        return;
      }
      if (evt.code === "KeyM") {
        evt.preventDefault();
        setSpawnMode(!spawnMode);
        return;
      }
      if (spawnMode) {
        const spawnKey = {
          KeyQ: "lurker",
          KeyE: "guest",
          KeyR: "mannequin",
          KeyT: "portrait",
          KeyY: "chair",
        }[evt.code];
        if (spawnKey) {
          evt.preventDefault();
          spawnShowcase(spawnKey);
          return;
        }
        if (evt.code === "KeyC") {
          evt.preventDefault();
          spawnLineup();
          return;
        }
        if (evt.code === "KeyX" || evt.code === "Delete" || evt.code === "Backspace") {
          evt.preventDefault();
          clearShowcase();
          return;
        }
      }
    }
    if (evt.code === "KeyF") {
      evt.preventDefault();
      if (!playing || scare) return;
      state.flash = !state.flash;
      if (state.flash && state.battery < 0.08) state.battery = 0.35;
      view.setFlash(state.flash && state.battery > 0.02, blinkAmt);
    }
    if (evt.code === "Space") {
      evt.preventDefault();
      if (!playing || scare) return;
      if (!evt.repeat) jumpQueued = true;
    }
    if (evt.code === "Escape" && playing && !scare) pause();
    if ((evt.code === "Enter" || evt.code === "NumpadEnter") && playing && pendingExit && ui.pause.hidden) {
      evt.preventDefault();
      const dest = pendingExit.to;
      pendingExit = null;
      enterLevel(dest, newSeed());
    }
  });
  window.addEventListener("keyup", (evt) => keys.delete(evt.code));

  ui.btnEnter.addEventListener("click", enter);
  ui.btnResume.addEventListener("click", enter);
  if (ui.btnFull) ui.btnFull.addEventListener("click", toggleFullscreen);
  if (ui.btnFullPause) ui.btnFullPause.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => view.resize());
  document.addEventListener("webkitfullscreenchange", () => view.resize());
  ui.btnHub.addEventListener("click", () => {
    persist();
    location.href = "../";
  });

  const lang = localStorage.getItem("minigames-lang");
  if (lang === "de") {
    const hub = document.querySelector(".hub-link");
    if (hub) hub.textContent = "Alle Spiele";
    ui.btnEnter.textContent = "Eintreten";
    ui.btnResume.textContent = "Weiter";
    ui.btnHub.textContent = "Alle Spiele";
    ui.lookHint.textContent = "Klicken zum Umsehen";
    if (ui.btnFull) ui.btnFull.textContent = "Vollbild";
    if (ui.btnFullPause) ui.btnFullPause.textContent = "Vollbild";
  }

  if (adminOn) {
    window.__sn = {
      get() {
        return { x: state.x, y: state.y, z: state.z, yaw: state.yaw, pitch: state.pitch, seed: state.seed, recipeId: state.recipeId, feet: state.y - EYE };
      },
      showcase() {
        return ents.filter((e) => e.showcase).map((e) => ({ kind: e.kind, x: e.x, z: e.z }));
      },
      spawn(kind) {
        spawnShowcase(kind);
        return this.showcase();
      },
      lineup() {
        spawnLineup();
        return this.showcase();
      },
      clearShowcase,
      warp(recipeId, seed) {
        enterLevel(recipeId, seed ?? state.seed);
      },
      goto(x, z, yaw = 0, pitch = 0.12) {
        state.x = x;
        state.z = z;
        state.yaw = yaw;
        state.pitch = pitch;
        state.y = EYE + sampleFloor(state.recipeId, state.seed, x, z, 0, STEP_UP);
        vy = 0;
        view.setCamera(x, state.y, z, yaw, pitch);
        view.syncChunks(x, z);
      },
      spiral() {
        if (state.recipeId !== "poolrooms") this.warp("poolrooms");
        const hit = findSpiral(state.seed, getRecipe("poolrooms").extra);
        if (hit) this.goto(hit.x, hit.z, hit.yaw, 0.18);
        return hit;
      },
    };
  }

  requestAnimationFrame(tick);
  return { state, recipes: RECIPE_ORDER };
}
