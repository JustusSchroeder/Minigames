export function createAudio() {
  let ctx = null;
  let master = null;
  let buzzOsc = null;
  let buzzGain = null;
  let rumbleOsc = null;
  let rumbleGain = null;
  let noiseSrc = null;
  let noiseFilter = null;
  let noiseGain = null;
  let jazzOsc = null;
  let jazzGain = null;
  let muted = false;
  let recipeId = "lobby";
  let light = "normal";
  let t = 0;
  let nextEvent = 1.2;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.15;
    master.connect(ctx.destination);

    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = n.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuf = n;

    buzzOsc = ctx.createOscillator();
    buzzOsc.type = "sine";
    buzzOsc.frequency.value = 118;
    const buzzFilter = ctx.createBiquadFilter();
    buzzFilter.type = "highpass";
    buzzFilter.frequency.value = 80;
    buzzGain = ctx.createGain();
    buzzGain.gain.value = 0.16;
    buzzOsc.connect(buzzFilter);
    buzzFilter.connect(buzzGain);
    buzzGain.connect(master);
    buzzOsc.start();

    rumbleOsc = ctx.createOscillator();
    rumbleOsc.type = "sine";
    rumbleOsc.frequency.value = 42;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleOsc.connect(rumbleGain);
    rumbleGain.connect(master);
    rumbleOsc.start();

    noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;
    noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 800;
    noiseFilter.Q.value = 0.7;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(master);
    noiseSrc.start();

    jazzOsc = ctx.createOscillator();
    jazzOsc.type = "sine";
    jazzOsc.frequency.value = 196;
    jazzGain = ctx.createGain();
    jazzGain.gain.value = 0;
    const jazzFilter = ctx.createBiquadFilter();
    jazzFilter.type = "lowpass";
    jazzFilter.frequency.value = 900;
    jazzOsc.connect(jazzFilter);
    jazzFilter.connect(jazzGain);
    jazzGain.connect(master);
    jazzOsc.start();

    return ctx;
  }

  function tone(now, type, freq, vol, dur, dest = master) {
    if (muted || !ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = Math.max(0.0001, vol);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g);
    g.connect(dest);
    o.start(now);
    o.stop(now + dur + 0.02);
    return o;
  }

  function burst(now, vol, dur, type, freq, q = 0.8) {
    if (muted || !ctx || !noiseBuf) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = Math.max(0.0001, vol);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(now);
    src.stop(now + dur + 0.02);
  }

  const recipes = {
    lobby: { buzz: 118, buzzVol: 0.2, rumble: 38, rumbleVol: 0.012, noise: 2400, noiseVol: 0.018, jazz: 0 },
    habitable: { buzz: 72, buzzVol: 0.07, rumble: 36, rumbleVol: 0.02, noise: 400, noiseVol: 0.012, jazz: 0 },
    pipes: { buzz: 96, buzzVol: 0.1, rumble: 48, rumbleVol: 0.07, noise: 520, noiseVol: 0.055, jazz: 0 },
    office: { buzz: 132, buzzVol: 0.055, rumble: 40, rumbleVol: 0.008, noise: 280, noiseVol: 0.028, jazz: 0 },
    hotel: { buzz: 88, buzzVol: 0.03, rumble: 44, rumbleVol: 0.018, noise: 700, noiseVol: 0.01, jazz: 0.016 },
    caves: { buzz: 40, buzzVol: 0.012, rumble: 28, rumbleVol: 0.03, noise: 180, noiseVol: 0.02, jazz: 0 },
    poolrooms: { buzz: 86, buzzVol: 0.02, rumble: 50, rumbleVol: 0.015, noise: 320, noiseVol: 0.04, jazz: 0 },
  };

  function applyLevels() {
    if (!ctx) return;
    const rec = recipes[recipeId] || recipes.lobby;
    const dead = light === "dead";
    const harsh = light === "harsh";
    const now = ctx.currentTime;
    let buzzVol = rec.buzzVol;
    if (recipeId === "lobby" && dead) buzzVol = 0.008;
    else if (dead) buzzVol *= 0.25;
    if (recipeId === "lobby" && harsh) buzzVol *= 1.55;
    buzzOsc.frequency.setTargetAtTime(rec.buzz, now, 0.25);
    buzzGain.gain.setTargetAtTime(buzzVol, now, 0.25);
    rumbleOsc.frequency.setTargetAtTime(rec.rumble, now, 0.3);
    rumbleGain.gain.setTargetAtTime(rec.rumbleVol, now, 0.3);
    noiseFilter.frequency.setTargetAtTime(rec.noise, now, 0.3);
    noiseGain.gain.setTargetAtTime(rec.noiseVol, now, 0.3);
    jazzGain.gain.setTargetAtTime(rec.jazz, now, 0.4);
  }

  function setRecipe(id) {
    recipeId = id;
    if (!ensure()) return;
    applyLevels();
  }

  function setLight(mode) {
    if (mode === light) return;
    light = mode;
    applyLevels();
  }

  function foot(kind) {
    if (muted || !ensure()) return;
    const now = ctx.currentTime;
    if (kind === "water") {
      burst(now, 0.06, 0.18, "lowpass", 700);
      tone(now, "sine", 90, 0.03, 0.12);
      return;
    }
    if (kind === "concrete" || kind === "rock") {
      burst(now, 0.045, 0.07, "highpass", 900);
      tone(now, "triangle", kind === "rock" ? 95 : 140, 0.035, 0.07);
      return;
    }
    if (kind === "tile") {
      tone(now, "triangle", 210, 0.03, 0.05);
      burst(now, 0.02, 0.05, "highpass", 1800);
      return;
    }
    if (kind === "wood") {
      tone(now, "triangle", 160, 0.04, 0.08);
      return;
    }
    burst(now, 0.028, 0.09, "lowpass", 420);
    tone(now, "sine", 105, 0.02, 0.08);
  }

  function blink() {
    if (muted || !ensure()) return;
    tone(ctx.currentTime, "sine", 240, 0.025, 0.06);
  }

  function chair() {
    if (muted || !ensure()) return;
    burst(ctx.currentTime, 0.045, 0.22, "bandpass", 280, 1.4);
    tone(ctx.currentTime, "sawtooth", 70, 0.02, 0.2);
  }

  function scrape() {
    if (muted || !ensure()) return;
    burst(ctx.currentTime, 0.05, 0.35, "bandpass", 160, 0.9);
    tone(ctx.currentTime, "sawtooth", 48, 0.03, 0.32);
  }

  function mannequin(dist = 6) {
    if (muted || !ensure()) return;
    const vol = Math.max(0.15, 1 - dist / 11);
    burst(ctx.currentTime, 0.04 * vol, 0.28, "highpass", 1100);
    tone(ctx.currentTime, "square", 62, 0.012 * vol, 0.18);
  }

  function whisper(scale = 1) {
    if (muted || !ensure()) return;
    const now = ctx.currentTime;
    burst(now, 0.03 * scale, 0.7, "bandpass", 1400 + Math.random() * 400, 2.2);
    tone(now, "sine", 180 + Math.random() * 50, 0.02 * scale, 0.55);
  }

  function howl() {
    if (muted || !ensure()) return;
    const now = ctx.currentTime;
    const o = tone(now, "sine", 340, 0.035, 1.4);
    if (o) o.frequency.exponentialRampToValueAtTime(90, now + 1.25);
  }

  function wake() {
    if (muted || !ensure()) return;
    const now = ctx.currentTime;
    tone(now, "sawtooth", 180, 0.04, 1.1);
    burst(now, 0.03, 0.8, "lowpass", 240);
  }

  function hunt(dist) {
    if (muted || !ensure()) return;
    const vol = Math.max(0, 1 - dist / 10) * 0.05;
    if (vol < 0.004) return;
    burst(ctx.currentTime, vol, 0.12, "lowpass", 180);
    tone(ctx.currentTime, "triangle", 70, vol * 0.7, 0.1);
  }

  function guestNear(dist) {
    if (muted || !ensure()) return;
    const vol = Math.max(0, 1 - dist / 12);
    if (vol < 0.08) return;
    burst(ctx.currentTime, 0.035 * vol, 0.2, "bandpass", 220, 1.1);
    tone(ctx.currentTime, "sine", 140 + Math.random() * 80, 0.018 * vol, 0.16);
  }

  function tick(dt, id, mode) {
    if (id) recipeId = id;
    if (mode) setLight(mode);
    if (!ensure() || muted) return;
    t += dt;
    const rec = recipes[recipeId] || recipes.lobby;
    const now = ctx.currentTime;

    if (recipeId === "lobby" && light !== "dead") {
      const wave = 0.2 + Math.sin(t * 0.55) * 0.035 + Math.sin(t * 2.3) * 0.012;
      const spike = Math.sin(t * 0.13) > 0.92 ? 0.12 : 0;
      buzzGain.gain.setTargetAtTime(wave + spike, now, 0.08);
    }

    if (rec.jazz > 0) {
      const notes = [196, 233, 262, 294];
      jazzOsc.frequency.setTargetAtTime(notes[Math.floor(t / 6.5) % notes.length], now, 0.8);
    }

    nextEvent -= dt;
    if (nextEvent > 0) return;
    if (recipeId === "pipes") {
      nextEvent = 1.6 + Math.random() * 2.4;
      burst(now, 0.06, 0.45, "bandpass", 480 + Math.random() * 220, 0.6);
      tone(now, "sine", 55, 0.02, 0.3);
    } else if (recipeId === "caves") {
      nextEvent = 0.7 + Math.random() * 1.8;
      burst(now, 0.045, 0.12, "lowpass", 1600);
      burst(now + 0.09, 0.028, 0.14, "lowpass", 1400);
      burst(now + 0.2, 0.016, 0.16, "lowpass", 1100);
    } else if (recipeId === "poolrooms") {
      nextEvent = 1.1 + Math.random() * 2;
      burst(now, 0.035, 0.22, "lowpass", 900);
    } else if (recipeId === "office") {
      nextEvent = 4 + Math.random() * 6;
      burst(now, 0.02, 0.35, "lowpass", 700);
    } else if (recipeId === "hotel") {
      nextEvent = 5 + Math.random() * 8;
      if (Math.random() < 0.45) whisper(0.45);
      else burst(now, 0.018, 0.4, "bandpass", 900, 1.6);
    } else if (recipeId === "habitable") {
      nextEvent = 6 + Math.random() * 8;
      burst(now, 0.02, 0.3, "lowpass", 200);
    } else {
      nextEvent = 8 + Math.random() * 10;
    }
  }

  function resume() {
    ensure()?.resume();
    if (master && !muted) master.gain.setTargetAtTime(0.15, ctx.currentTime, 0.05);
  }

  return {
    resume,
    setRecipe,
    setLight,
    tick,
    foot,
    blink,
    chair,
    scrape,
    mannequin,
    whisper,
    howl,
    wake,
    hunt,
    guestNear,
  };
}
