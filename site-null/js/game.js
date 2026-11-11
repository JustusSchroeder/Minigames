import { createAudio } from "./audio.js";
import {
  spawnEntities,
  stepChair,
  stepGuest,
  stepLurker,
  stepMannequin,
  stepPortrait,
  stepWhisper,
  visibleTarget,
} from "./entities.js";
import { RECIPE_ORDER, getRecipe, nextRecipe } from "./levels.js";
import { createView3D } from "./view3d.js";
import { RADIUS, cellInfo, moveBody, nearExit, newSeed, spawnPoint, unstuck, worldToTile } from "./world.js";

const SAVE_KEY = "site-null-save";
const EYE = 1.65;
const WALK = 2.8;
const SPRINT = 4.6;

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
  const free = unstuck(state.recipeId, state.seed, state.x, state.z);
  state.x = free.x;
  state.z = free.z;
  let ents = spawnEntities(state.recipeId, state.seed, state);
  let playing = false;
  let locked = false;
  let hadLock = false;
  let last = performance.now();
  let saveAt = 0;
  let footT = 0;
  let pendingExit = null;
  let spawnGrace = 1.2;
  let guestSeen = false;
  let blinkPhase = "open";
  let blinkT = 0;
  let blinkHold = 0.08;
  let blinkAmt = 0;
  let scare = null;

  view.applyRecipe(state.recipeId, state.seed);
  view.setCamera(state.x, state.y, state.z, state.yaw, state.pitch);
  view.syncChunks(state.x, state.z);
  view.syncProps(ents);
  ui.place.textContent = getRecipe(state.recipeId).name;

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
    state.yaw = spawn.yaw ?? 0;
    if (!state.journal.includes(recipeId)) state.journal.push(recipeId);
    ents = spawnEntities(recipeId, seed, state);
    guestSeen = false;
    pendingExit = null;
    spawnGrace = 1.5;
    view.applyRecipe(recipeId, seed);
    view.syncChunks(state.x, state.z);
    audio.setRecipe(recipeId);
    ui.place.textContent = getRecipe(recipeId).name;
    persist();
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
  }

  function respawnHere() {
    const spawn = spawnPoint(state.recipeId, state.seed);
    const free = unstuck(state.recipeId, state.seed, spawn.x, spawn.z);
    state.x = free.x;
    state.z = free.z;
    state.yaw = spawn.yaw ?? 0;
    state.pitch = 0.16;
    state.blink = 1;
    blinkPhase = "open";
    blinkT = 0;
    applyLids(0);
    ents = spawnEntities(state.recipeId, state.seed, state);
    guestSeen = false;
    pendingExit = null;
    spawnGrace = 2.5;
    view.setFov(74);
    view.applyRecipe(state.recipeId, state.seed);
    view.syncChunks(state.x, state.z);
    persist();
  }

  function stepScare(dt) {
    scare.t += dt;
    const punch = Math.max(0, 1 - scare.t / 0.55);
    view.setCamera(
      state.x,
      EYE + punch * 0.1,
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
      view.setFov(74);
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
        state.battery = Math.max(0, state.battery - dt / 600);
      }
      view.setFlash(state.flash && state.battery > 0, blinkAmt);

      const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
      const speed = sprint ? SPRINT : WALK;
      let mx = 0;
      let mz = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
      if (mx || mz) {
        const len = Math.hypot(mx, mz) || 1;
        mx /= len;
        mz /= len;
        const sin = Math.sin(state.yaw);
        const cos = Math.cos(state.yaw);
        const wx = (mx * cos + mz * sin) * speed * dt;
        const wz = (-mx * sin + mz * cos) * speed * dt;
        const next = moveBody(state.recipeId, state.seed, state.x, state.z, wx, wz, RADIUS);
        state.x = next.x;
        state.z = next.z;
        footT += dt * (sprint ? 2.2 : 1.6);
        if (footT > 0.55) {
          footT = 0;
          const tile = worldToTile(state.x, state.z);
          audio.foot(cellInfo(state.recipeId, state.seed, tile.tx, tile.tz).floor);
        }
      }

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

      for (const ent of ents) {
        if (ent.kind === "chair") {
          const looking = seen(ent.x, 0.5, ent.z) && eyesOpen;
          stepChair(ent, state, looking);
          if (ent.seen && !looking && Math.random() < dt * 1.6) audio.chair();
        } else if (ent.kind === "guest" && ent.live) {
          const vis = seen(ent.x, 1.1, ent.z);
          const dist = Math.hypot(ent.x - state.x, ent.z - state.z);
          if (vis && eyesOpen && !guestSeen) {
            guestSeen = true;
            audio.scrape();
          }
          const ev = stepGuest(ent, state.recipeId, state.seed, state, !(vis && eyesOpen), dt);
          if (ev === "catch") {
            if (spawnGrace <= 0) startJumpscare();
            else ent.live = true;
          } else if (ev === "near" && Math.random() < dt * 1.4) audio.guestNear(dist);
        } else if (ent.kind === "lurker" && ent.live) {
          const vis = seen(ent.x, 1.55, ent.z);
          const dist = Math.hypot(ent.x - state.x, ent.z - state.z);
          const ev = stepLurker(ent, state.recipeId, state.seed, state, vis, eyesOpen, dt);
          if (ev === "spot") audio.spot();
          if (ev === "lunge") audio.howl();
          if (ev === "hunt" && Math.random() < dt * 2.6) audio.lurkNear(dist);
          if (ev === "near" && Math.random() < dt * 0.55) audio.lurkNear(dist);
          if (ev === "catch") {
            if (spawnGrace <= 0) startJumpscare();
            else {
              ent.live = true;
              ent.phase = "lurk";
            }
          }
        } else if (ent.kind === "mannequin" && ent.live) {
          const vis = seen(ent.x, 1.2, ent.z);
          const dist = Math.hypot(ent.x - state.x, ent.z - state.z);
          const ev = stepMannequin(ent, state.recipeId, state.seed, state, vis, eyesOpen, dt);
          if (ev === "catch") {
            blinkNow(0.55);
            audio.scrape();
          } else if (ev === "near" && Math.random() < dt * 1.1) audio.mannequin(dist);
        } else if (ent.kind === "whisper" && ent.live) {
          const dist = Math.hypot(ent.x - state.x, ent.z - state.z);
          const ev = stepWhisper(ent, state.recipeId, state.seed, state, dt);
          if (ev === "call") {
            if (Math.random() < 0.35) audio.howl();
            else audio.whisper();
          }
          if (ev === "near" && Math.random() < dt * 1.3) audio.whisper(Math.max(0.35, 1 - dist / 8));
          if (ev === "catch") blinkNow(0.55);
        } else if (ent.kind === "portrait" && ent.live) {
          const vis = seen(ent.x, 0.3, ent.z);
          const ev = stepPortrait(ent, state.recipeId, state.seed, state, vis, eyesOpen, dt);
          if (ev === "wake") audio.wake();
          if (ev === "hunt") {
            const dist = Math.hypot(ent.hx - state.x, ent.hz - state.z);
            if (Math.random() < dt * 2.2) audio.hunt(dist);
          }
          if (ev === "catch") {
            blinkNow(0.55);
            audio.wake();
          }
        }
      }

      view.setCamera(state.x, EYE + Math.sin(now * 0.008) * 0.012, state.z, state.yaw, state.pitch);
      view.syncChunks(state.x, state.z);
      view.syncProps(ents);

      if (now > saveAt) {
        saveAt = now + 4000;
        persist();
      }
    } else {
      view.setCamera(state.x, EYE, state.z, state.yaw, state.pitch);
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
    if (evt.code === "KeyF") state.flash = !state.flash;
    if (evt.code === "Space") {
      evt.preventDefault();
      if (playing && !scare) blinkNow();
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

  requestAnimationFrame(tick);
  return { state, recipes: RECIPE_ORDER };
}
