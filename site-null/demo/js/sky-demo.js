import * as THREE from "three";
import { createAudio } from "../../js/audio.js";
import { createSkyWorld } from "./skyworld.js";

function rewriteAsset(url) {
  if (typeof url === "string" && url.startsWith("assets/")) return `../${url}`;
  return url;
}

const _fetch = window.fetch.bind(window);
window.fetch = (input, init) => _fetch(rewriteAsset(input), init);
THREE.DefaultLoadingManager.setURLModifier(rewriteAsset);

const canvas = document.getElementById("view");
const menu = document.getElementById("menu");
const blackout = document.getElementById("blackout");
const lookHint = document.getElementById("look-hint");
const lidTop = document.querySelector(".lid.top");
const lidBot = document.querySelector(".lid.bot");
const lidFade = document.querySelector(".lid.fade");
const btnEnter = document.getElementById("btn-enter");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(1.4, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.6, 14000);
scene.add(camera);

const audio = createAudio();
const sky = createSkyWorld();
sky.activate(scene, camera);

const LOOK_ANG = -0.52;
const cam = { x: 80, y: 1020, z: -560, yaw: 0.08, pitch: LOOK_ANG, vy: -24 };
const look = { yaw: 0, pitch: 0 };
const windLook = { yaw: 0, pitch: 0, roll: 0 };
const gust = { x: 0, z: 0, tx: 0, tz: 0, t: 0 };
let baseYaw = 0.08;
let stage = "idle";
let t = 0;
let playing = false;
let last = performance.now();
let roll = 0;
let lidAmt = 0;

function ease(u) {
  const x = Math.max(0, Math.min(1, u));
  return x * x * (3 - 2 * x);
}

function lerp(a, b, k) {
  return a + (b - a) * k;
}

function applyLids(amount) {
  lidAmt = amount;
  const e = ease(amount);
  if (lidTop) lidTop.style.transform = `translateY(${(-102 + e * 102).toFixed(2)}%)`;
  if (lidBot) lidBot.style.transform = `translateY(${(102 - e * 102).toFixed(2)}%)`;
  if (lidFade) lidFade.style.opacity = String(e * 0.4);
}

function setBlack(amount) {
  if (blackout) blackout.style.opacity = String(Math.max(0, Math.min(1, amount)));
}

function looking() {
  return document.pointerLockElement === canvas;
}

function grab() {
  const out = canvas.requestPointerLock({ unadjustedMovement: true });
  if (out && typeof out.catch === "function") out.catch(() => canvas.requestPointerLock());
}

function resize() {
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function resetFall() {
  const drop = sky.dropPoint;
  cam.x = drop.x;
  cam.z = drop.z;
  cam.y = drop.y ?? 1020;
  cam.yaw = drop.yaw;
  cam.pitch = LOOK_ANG;
  cam.vy = -22;
  baseYaw = drop.yaw;
  look.yaw = 0;
  look.pitch = 0;
  windLook.yaw = 0;
  windLook.pitch = 0;
  windLook.roll = 0;
  gust.x = 0;
  gust.z = 0;
  gust.tx = 0;
  gust.tz = 0;
  gust.t = 0.4;
  roll = 0;
  t = 0;
  stage = "fall";
  camera.fov = 72;
  camera.updateProjectionMatrix();
  setBlack(0);
  applyLids(0);
}

function triggerImpact() {
  if (stage !== "fall") return;
  stage = "impact";
  t = 0;
  cam.vy = 0;
  applyLids(1);
  setBlack(1);
  if (lookHint) lookHint.hidden = true;
  audio.scrape();
  roll = 0.2;
  camera.fov = 120;
  camera.updateProjectionMatrix();
}

function putCamera() {
  camera.position.set(cam.x, cam.y, cam.z);
  camera.rotation.order = "YXZ";
  camera.rotation.y = cam.yaw + look.yaw + windLook.yaw;
  camera.rotation.x = cam.pitch + look.pitch + windLook.pitch;
  camera.rotation.z = roll;
}

function step(dt, now) {
  const falling = stage === "fall";
  sky.update(dt, { x: cam.x, y: cam.y, z: cam.z, vy: cam.vy, falling });
  if (stage === "idle") {
    cam.yaw += dt * 0.04;
    putCamera();
    return;
  }
  if (stage === "dead") {
    applyLids(1);
    setBlack(1);
    putCamera();
    return;
  }
  if (stage === "impact") {
    t += dt;
    applyLids(1);
    setBlack(Math.min(1, 0.75 + t * 0.4));
    roll *= Math.max(0, 1 - dt * 8);
    windLook.pitch *= Math.max(0, 1 - dt * 6);
    cam.pitch = lerp(cam.pitch, 0.55, Math.min(1, dt * 6));
    if (t > 2.1) stage = "dead";
    putCamera();
    return;
  }
  gust.t -= dt;
  if (gust.t <= 0) {
    gust.tx = (Math.random() - 0.5) * 28;
    gust.tz = (Math.random() - 0.5) * 18;
    gust.t = 0.35 + Math.random() * 0.7;
  }
  gust.x = lerp(gust.x, gust.tx, Math.min(1, dt * 2.4));
  gust.z = lerp(gust.z, gust.tz, Math.min(1, dt * 2.1));

  cam.vy -= 7 * dt;
  if (cam.vy < -48) cam.vy = -48;
  cam.y += cam.vy * dt;
  cam.z -= (16 + Math.sin(t * 0.33) * 8 + gust.z * 0.7) * dt;
  cam.x += (Math.sin(t * 0.48) * 11 + Math.sin(t * 1.15) * 6 + gust.x * 0.95) * dt;
  t += dt;

  cam.yaw = baseYaw + Math.sin(t * 0.31) * 0.14 + Math.sin(t * 0.87) * 0.06;
  cam.pitch = LOOK_ANG + Math.sin(t * 0.72) * 0.08 + Math.sin(t * 1.4) * 0.04;
  windLook.yaw = lerp(windLook.yaw, gust.x * 0.014, Math.min(1, dt * 3.2));
  windLook.pitch = lerp(windLook.pitch, -gust.z * 0.01 + Math.sin(t * 2.1) * 0.04, Math.min(1, dt * 3.4));
  roll = Math.sin(t * 1.25) * 0.14 + Math.sin(t * 0.42) * 0.09 + gust.x * 0.018;
  camera.fov = lerp(camera.fov, 84 + Math.abs(gust.x) * 0.22, Math.min(1, dt * 0.7));
  camera.updateProjectionMatrix();

  const ground = sky.sampleHeight(cam.x, cam.z);
  const alt = cam.y - ground;
  if (alt < 22) applyLids(ease(1 - alt / 22) * 0.55);
  if (alt < 5) applyLids(0.9);
  if (cam.y <= ground + 1.25) {
    cam.y = ground + 0.35;
    triggerImpact();
  }
  putCamera();
}

function tick(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt, now);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

function enter() {
  menu.hidden = true;
  playing = true;
  audio.resume();
  const root = document.documentElement;
  if (!document.fullscreenElement) root.requestFullscreen?.({ navigationUI: "hide" })?.catch?.(() => {});
  if (lookHint) lookHint.hidden = false;
  grab();
  applyLids(1);
  setTimeout(() => {
    resetFall();
  }, 180);
}

btnEnter.addEventListener("click", enter);
canvas.addEventListener("click", () => {
  if (playing) grab();
});
document.addEventListener("pointerlockchange", () => {
  if (!lookHint) return;
  lookHint.hidden = looking() || !playing || stage !== "fall";
});
window.addEventListener("mousemove", (evt) => {
  if (!playing || !looking() || stage !== "fall") return;
  look.yaw = Math.max(-0.85, Math.min(0.85, look.yaw - evt.movementX * 0.0022));
  look.pitch = Math.max(-0.35, Math.min(0.35, look.pitch - evt.movementY * 0.0018));
});
window.addEventListener("keydown", (evt) => {
  if (evt.repeat) return;
  if (!playing) {
    if (evt.code === "Space" || evt.code === "Enter") {
      evt.preventDefault();
      enter();
    }
    return;
  }
  if (evt.code === "Space" || evt.code === "Enter") {
    evt.preventDefault();
    if (stage === "fall") triggerImpact();
    else if (stage === "dead") resetFall();
  }
});
window.addEventListener("resize", resize);
window.addEventListener("fullscreenchange", resize);

resize();
resetFall();
stage = "idle";
cam.y = sky.sampleHeight(cam.x, cam.z) + 110;
cam.pitch = LOOK_ANG;
cam.vy = 0;
applyLids(0);
requestAnimationFrame(tick);
