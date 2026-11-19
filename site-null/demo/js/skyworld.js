import * as THREE from "three";

const SKY = 0x8ebbe3;
const HAZE = 0x8ebbe3;
const GRASS = 0xffffff;
const GRASS_HILL = 0xfff3c4;
const WORLD_R = 11000;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}

function fbm(x, z) {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += valueNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.02;
  }
  return sum / norm;
}

export function heightAt(x, z) {
  let big = fbm(x * 0.00115, z * 0.00115);
  const mid = fbm(x * 0.0031, z * 0.0031 + 18);
  big = Math.pow(big, 1.55);
  return big * 420 + mid * 85 - 18;
}

function grassTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#c6e86f";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 210 + Math.random() * 40;
    g.fillStyle = `rgba(${v * 0.78},${v},${v * 0.48},${0.06 + Math.random() * 0.09})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(180, 180);
  tex.anisotropy = 4;
  return tex;
}

function makeDiscGeometry(radius, rings, segs) {
  const positions = [];
  const uvs = [];
  const indices = [];
  positions.push(0, 0, 0);
  uvs.push(0.5, 0.5);
  for (let r = 1; r <= rings; r++) {
    const rad = (r / rings) * radius;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const z = Math.sin(a) * rad;
      positions.push(x, 0, z);
      uvs.push(x / (radius * 2) + 0.5, z / (radius * 2) + 0.5);
    }
  }
  for (let s = 0; s < segs; s++) {
    const a = 1 + s;
    const b = 1 + ((s + 1) % segs);
    indices.push(0, b, a);
  }
  for (let r = 0; r < rings - 1; r++) {
    const row0 = 1 + r * segs;
    const row1 = 1 + (r + 1) * segs;
    for (let s = 0; s < segs; s++) {
      const s2 = (s + 1) % segs;
      const ia = row0 + s;
      const ib = row0 + s2;
      const ic = row1 + s;
      const id = row1 + s2;
      indices.push(ia, ib, ic);
      indices.push(ib, id, ic);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function makeHouse() {
  const g = new THREE.Group();
  const w = 4.4 + Math.random() * 3.2;
  const d = 3.6 + Math.random() * 2.6;
  const h = 3.4 + Math.random() * 2.2;
  const plaster = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(0.09, 0.08, 0.82 + Math.random() * 0.08),
  });
  const roofMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color().setHSL(0.08, 0.1, 0.72 + Math.random() * 0.08),
  });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2c3338 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plaster);
  body.position.y = h * 0.5;
  g.add(body);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w * 1.06, 0.55, d * 1.06), roofMat);
  roof.position.y = h + 0.2;
  g.add(roof);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.58, 1.15, 4), roofMat);
  peak.position.y = h + 0.95;
  peak.rotation.y = Math.PI * 0.25;
  g.add(peak);
  const win = new THREE.Mesh(new THREE.BoxGeometry(Math.min(1.15, w * 0.28), Math.min(1.35, h * 0.38), 0.08), dark);
  win.position.set(0, h * 0.52, d * 0.5 + 0.02);
  g.add(win);
  const win2 = win.clone();
  win2.position.x = -w * 0.24;
  g.add(win2);
  g.userData.height = h + 1.4;
  return g;
}

function pickHouses(count) {
  const spots = [];
  const minDist = 32;
  for (let i = 0; i < 18000 && spots.length < count; i++) {
    const ang = hash2(i, 4) * Math.PI * 2;
    const rad = Math.sqrt(hash2(i, 8)) * 5600;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const y = heightAt(x, z);
    if (y < 60) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < minDist)) continue;
    spots.push({ x, z, y });
  }
  const villages = Math.min(40, Math.floor(spots.length * 0.18));
  for (let v = 0; v < villages; v++) {
    const base = spots[Math.floor(hash2(v, 21) * spots.length) % spots.length];
    const n = 3 + Math.floor(hash2(v, 22) * 5);
    for (let k = 0; k < n && spots.length < count + 80; k++) {
      const a = hash2(v * 17 + k, 23) * Math.PI * 2;
      const d = 12 + hash2(v * 17 + k, 24) * 28;
      const x = base.x + Math.cos(a) * d;
      const z = base.z + Math.sin(a) * d;
      const y = heightAt(x, z);
      if (y < 50) continue;
      if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 10)) continue;
      spots.push({ x, z, y });
    }
  }
  return spots;
}

function balloonSpot(idx) {
  const kind = hash2(idx, 9);
  let x;
  let z;
  if (kind < 0.38) {
    x = 80 + (hash2(idx, 11) - 0.5) * 3200;
    z = 400 - hash2(idx, 12) * 3800;
  } else {
    const ang = hash2(idx, 11) * Math.PI * 2;
    const rad = Math.sqrt(hash2(idx, 12)) * 6400;
    x = Math.cos(ang) * rad;
    z = Math.sin(ang) * rad;
  }
  const groundY = heightAt(x, z);
  const air = hash2(idx, 2);
  const y = groundY + 22 + air * 640;
  const r = 2.6 + hash2(idx, 4) * 6.8 + (hash2(idx, 14) > 0.93 ? 8 : 0);
  return { x, z, y, r };
}

export function createSkyWorld() {
  const root = new THREE.Group();
  root.name = "skyworld";

  const hemi = new THREE.HemisphereLight(0xe4f2ff, 0x9ec86a, 1.18);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e0, 1.45);
  sun.position.set(500, 900, 280);
  root.add(sun);

  const skyMat = new THREE.MeshBasicMaterial({ color: SKY, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(14000, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), skyMat);
  root.add(sky);

  const terrain = makeDiscGeometry(WORLD_R, 160, 240);
  const pos = terrain.attributes.position;
  const color = new Float32Array(pos.count * 3);
  const low = new THREE.Color(GRASS);
  const high = new THREE.Color(GRASS_HILL);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const t = Math.max(0, Math.min(1, (y - 30) / 340));
    tmp.copy(low).lerp(high, t);
    color[i * 3] = tmp.r;
    color[i * 3 + 1] = tmp.g;
    color[i * 3 + 2] = tmp.b;
  }
  pos.needsUpdate = true;
  terrain.setAttribute("color", new THREE.BufferAttribute(color, 3));
  terrain.computeVertexNormals();
  const grassMap = grassTex();
  const ground = new THREE.Mesh(
    terrain,
    new THREE.MeshLambertMaterial({
      color: 0xffffff,
      map: grassMap,
      vertexColors: true,
    })
  );
  root.add(ground);

  const houseSpots = pickHouses(360);
  for (let i = 0; i < 220; i++) {
    const x = 80 + (hash2(i, 31) - 0.5) * 2400;
    const z = -200 - hash2(i, 32) * 3000;
    const y = heightAt(x, z);
    if (y < 70) continue;
    if (houseSpots.some((s) => Math.hypot(s.x - x, s.z - z) < 22)) continue;
    houseSpots.push({ x, z, y });
  }
  for (const spot of houseSpots) {
    const house = makeHouse();
    house.position.set(spot.x, spot.y - 0.15, spot.z);
    house.scale.setScalar(3.1);
    house.rotation.y = hash2(Math.round(spot.x), Math.round(spot.z)) * Math.PI * 2;
    const tilt = (hash2(Math.round(spot.z), Math.round(spot.x)) - 0.5) * 0.08;
    house.rotation.z = tilt;
    root.add(house);
  }

  const balloonGeo = new THREE.SphereGeometry(1, 10, 8);
  const balloonMat = new THREE.MeshLambertMaterial({
    emissive: 0x222222,
    emissiveIntensity: 0.45,
  });
  const balloonCount = 1800;
  const balloons = new THREE.InstancedMesh(balloonGeo, balloonMat, balloonCount);
  balloons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  balloons.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const balloonColor = new THREE.Color();
  const balloonData = [];
  const linePos = [];
  for (let idx = 0; idx < balloonCount; idx++) {
    const spot = balloonSpot(idx);
    balloonColor.setHSL(hash2(idx, 5), 0.82, 0.54);
    dummy.position.set(spot.x, spot.y, spot.z);
    dummy.scale.setScalar(spot.r);
    dummy.updateMatrix();
    balloons.setMatrixAt(idx, dummy.matrix);
    balloons.setColorAt(idx, balloonColor);
    balloonData.push({
      i: idx,
      cx: spot.x,
      cy: spot.y,
      cz: spot.z,
      r: spot.r,
      phase: hash2(idx, 6) * Math.PI * 2,
      speed: 0.22 + hash2(idx, 7) * 0.45,
      lean: 0.08 + hash2(idx, 15) * 0.1,
      string: 5.5 + hash2(idx, 8) * 4.2,
    });
    linePos.push(spot.x, spot.y - spot.r, spot.z, spot.x, spot.y - spot.r - 6, spot.z);
  }
  if (balloons.instanceColor) balloons.instanceColor.needsUpdate = true;
  root.add(balloons);

  const strings = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3)),
    new THREE.LineBasicMaterial({ color: 0xe8e2d6, transparent: true, opacity: 0.7 })
  );
  strings.frustumCulled = false;
  root.add(strings);
  const stringPos = strings.geometry.attributes.position;

  const WIND_N = 380;
  const windGeo = new THREE.BoxGeometry(1, 1, 1);
  const windMat = new THREE.MeshBasicMaterial({
    color: 0xf4fbff,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    fog: false,
  });
  const windStreaks = new THREE.InstancedMesh(windGeo, windMat, WIND_N);
  windStreaks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  windStreaks.frustumCulled = false;
  windStreaks.visible = false;
  root.add(windStreaks);
  const windDummy = new THREE.Object3D();
  const windBits = [];
  for (let i = 0; i < WIND_N; i++) {
    windBits.push({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, w: 0.1, len: 8, tilt: 0, alive: false });
  }

  function respawnWind(p, cam) {
    const close = Math.random() < 0.16;
    const a = Math.random() * Math.PI * 2;
    const r = close ? 3.2 + Math.random() * 6 : 6 + Math.random() * 14;
    p.x = cam.x + Math.cos(a) * r + (Math.random() - 0.5) * 1.4;
    p.y = cam.y - 2 - Math.random() * (close ? 9 : 18);
    p.z = cam.z + Math.sin(a) * r + (Math.random() - 0.5) * 1.4;
    p.vx = (Math.random() - 0.5) * 16;
    p.vy = 48 + Math.random() * 50;
    p.vz = (Math.random() - 0.5) * 16;
    p.w = close ? 0.08 + Math.random() * 0.07 : 0.03 + Math.random() * 0.045;
    p.len = close ? 5 + Math.random() * 7 : 6 + Math.random() * 10;
    p.tilt = (Math.random() - 0.5) * 0.28;
    p.alive = true;
  }

  let hidden = [];
  let saved = null;
  let time = 0;

  const dropPoint = { x: 80, z: -560, yaw: 0.08, y: 1020 };

  function sampleHeight(x, z) {
    return heightAt(x, z);
  }

  function update(dt, cam) {
    time += dt;
    const gust = 0.7 + 0.9 * Math.sin(time * 0.55) + 0.35 * Math.sin(time * 1.4);
    const falling = !!(cam && cam.falling);
    grassMap.offset.x = time * 0.016;
    grassMap.offset.y = time * 0.011;
    for (const b of balloonData) {
      const sway = Math.sin(time * b.speed * (falling ? 1.8 : 1) + b.phase);
      const whip = falling ? 2.6 : 1;
      let y = b.cy + sway * (2.2 + gust * 2.4) * whip;
      let x = b.cx + Math.sin(time * 0.22 + b.phase) * (14 * gust) * whip + Math.sin(time * 0.51) * 6;
      let z = b.cz + Math.cos(time * 0.18 + b.phase) * (12 * gust) * whip + Math.sin(time * 0.13) * 16;
      if (falling) {
        const dx = x - cam.x;
        const dy = y - cam.y;
        const dz = z - cam.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 80 * 80 && d2 > 0.4) {
          const d = Math.sqrt(d2);
          const push = (1 - d / 80) * 38;
          x += (dx / d) * push;
          z += (dz / d) * push;
          y += push * 0.7;
        }
      }
      dummy.position.set(x, y, z);
      dummy.scale.setScalar(b.r);
      dummy.rotation.set(
        Math.sin(time * 0.55 + b.phase) * (falling ? 0.35 : 0.12),
        0,
        b.lean * gust * whip + sway * 0.22 + (falling ? 0.28 : 0)
      );
      dummy.updateMatrix();
      balloons.setMatrixAt(b.i, dummy.matrix);
      const k = b.i * 2;
      const tail = b.string + sway * 1.6;
      stringPos.setXYZ(k, x, y - b.r * 0.92, z);
      stringPos.setXYZ(k + 1, x - gust * 5.5 * whip, y - b.r - tail, z + gust * 2.2);
    }
    balloons.instanceMatrix.needsUpdate = true;
    stringPos.needsUpdate = true;

    windStreaks.visible = falling;
    if (falling) {
      const speed = Math.max(18, Math.abs(cam.vy));
      for (let i = 0; i < WIND_N; i++) {
        const p = windBits[i];
        if (!p.alive) respawnWind(p, cam);
        p.x += p.vx * dt;
        p.y += (p.vy + speed * 1.8) * dt;
        p.z += p.vz * dt;
        const dx = p.x - cam.x;
        const dy = p.y - cam.y;
        const dz = p.z - cam.z;
        if (dx * dx + dz * dz > 22 * 22 || dy > 14 || dy < -28) respawnWind(p, cam);
        windDummy.position.set(p.x, p.y, p.z);
        windDummy.scale.set(p.w, p.len + speed * 0.06, p.w);
        windDummy.rotation.set(p.tilt, 0, p.tilt * 0.7 + p.vx * 0.012);
        windDummy.updateMatrix();
        windStreaks.setMatrixAt(i, windDummy.matrix);
      }
      windStreaks.instanceMatrix.needsUpdate = true;
    }
  }

  function activate(scene, camera) {
    if (root.parent !== scene) scene.add(root);
    hidden = [];
    for (const child of scene.children) {
      if (child === root || child === camera) continue;
      if (!child.visible) continue;
      child.visible = false;
      hidden.push(child);
    }
    saved = {
      far: camera.far,
      near: camera.near,
      bg: scene.background,
      fog: scene.fog,
    };
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(HAZE, 3600, 9000);
    camera.near = 0.6;
    camera.far = 14000;
    camera.updateProjectionMatrix();
    root.visible = true;
  }

  function deactivate(scene, camera) {
    for (const child of hidden) child.visible = true;
    hidden = [];
    if (saved && camera) {
      camera.near = saved.near;
      camera.far = saved.far;
      camera.updateProjectionMatrix();
      scene.background = saved.bg;
      scene.fog = saved.fog;
      saved = null;
    }
    root.visible = false;
    if (root.parent) root.parent.remove(root);
  }

  function dispose() {
    root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m.map) m.map.dispose();
          m.dispose();
        }
      }
    });
  }

  return { root, dropPoint, sampleHeight, update, activate, deactivate, dispose };
}
