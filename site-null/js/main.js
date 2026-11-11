import { createGame } from "./game.js";

const ui = {
  canvas: document.getElementById("view"),
  menu: document.getElementById("menu"),
  pause: document.getElementById("pause"),
  crosshair: document.getElementById("crosshair"),
  blinkMeter: document.getElementById("blink-meter"),
  blinkFill: document.getElementById("blink-fill"),
  eyelids: document.getElementById("eyelids"),
  lidTop: document.querySelector(".lid.top"),
  lidBot: document.querySelector(".lid.bot"),
  lidFade: document.querySelector(".lid.fade"),
  place: document.getElementById("place"),
  prompt: document.getElementById("prompt"),
  lookHint: document.getElementById("look-hint"),
  jumpscare: document.getElementById("jumpscare"),
  deathVeil: document.getElementById("death-veil"),
  btnEnter: document.getElementById("btn-enter"),
  btnResume: document.getElementById("btn-resume"),
  btnFull: document.getElementById("btn-full"),
  btnFullPause: document.getElementById("btn-full-pause"),
  btnHub: document.getElementById("btn-hub"),
};

createGame(ui);
