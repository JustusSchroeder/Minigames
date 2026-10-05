import * as THREE from "three";
import {
  COLS,
  ROWS,
  TILE,
  fieldSize,
  tileCenter,
  KEEP_TILES,
  keepCenter,
  sampleTerrain,
  terrainHeight,
  tileTerrain,
  WALL_MESH_LEN,
  GATE_LEN,
} from "./world.js?v=7";

const TROOP_KINDS = ["spearman", "slinger", "raider", "knight", "warden"];
const ENEMY_KINDS = ["goblin", "runner", "archer", "brute", "ogre", "bat", "climber", "ram"];
const TROOP_LEVELS = 4;

function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({
    color,
    flatShading: false,
    ...opts,
  });
}

function mesh(geo, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(geo, mat(color, opts.mat || {}));
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  return m;
}

function seeded(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function livingGround(width, depth, segX, segZ, heightAt) {
  const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  return geo;
}

function grain(x, z) {
  let n = Math.imul(Math.floor(x * 2) | 0, 374761393) ^ Math.imul(Math.floor(z * 2) | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((((n ^ (n >>> 16)) >>> 0) / 4294967296) - 0.5) * 7;
}

function groundRgb(x, z) {
  const info = sampleTerrain(x, z);
  const g = grain(x, z);
  const pack = (r, gr, b, wobble = g) => [
    Math.max(0, Math.min(255, r + wobble)),
    Math.max(0, Math.min(255, gr + wobble)),
    Math.max(0, Math.min(255, b + wobble * 0.6)),
  ];
  if (info.kind === "sea" || info.kind === "shallows") {
    if (info.kind === "shallows" && info.e < 1.22) return pack(232, 236, 190, g * 0.25);
    if (info.kind === "shallows") return pack(118, 216, 228, g * 0.2);
    return pack(56, 186, 220, g * 0.18);
  }
  if (info.kind === "beach") return pack(240, 204, 58);
  if (info.kind === "rock") return pack(168, 166, 160, g * 0.4);
  const lawn = 0.5 + 0.5 * Math.sin(x * 0.008) * Math.cos(z * 0.007);
  return pack(86 + lawn * 8, 198 + lawn * 6, 56, g * 0.55);
}

function paintGroundTexture(planeW, planeD, originX, originZ) {
  const size = 2048;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const inv = 1 / size;
  for (let py = 0; py < size; py += 1) {
    const wz = (py + 0.5) * inv * planeD + originZ - planeD * 0.5;
    for (let px = 0; px < size; px += 1) {
      const wx = (px + 0.5) * inv * planeW + originX - planeW * 0.5;
      const [r, g, b] = groundRgb(wx, wz);
      const i = (py * size + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}

function grassMat(map) {
  return new THREE.MeshLambertMaterial({
    map,
    flatShading: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

function makeSky() {
  const R = 2400;
  const geo = new THREE.SphereGeometry(R, 24, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / R, -0.2, 1);
    c.setHSL(0.56, 0.52, 0.68 + t * 0.12);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })
  );
}

function ringPoint(w, d, inset, extra, rand) {
  const m = inset + rand() * extra;
  const rw = w + m * 2;
  const rd = d + m * 2;
  const perim = 2 * (rw + rd);
  let s = rand() * perim;
  let x;
  let z;
  if (s < rw) {
    x = s - rw / 2;
    z = -rd / 2;
  } else if (s < rw + rd) {
    x = rw / 2;
    z = s - rw - rd / 2;
  } else if (s < rw * 2 + rd) {
    x = rw / 2 - (s - rw - rd);
    z = rd / 2;
  } else {
    x = -rw / 2;
    z = rd / 2 - (s - rw * 2 - rd);
  }
  return { x: x + w / 2, z: z + d / 2 };
}

function puffGeo(rand, squash) {
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    const n = 0.9 + rand() * 0.16;
    pos.setXYZ(i, pos.getX(i) * n, y * squash * (0.92 + rand() * 0.12), pos.getZ(i) * (0.9 + rand() * 0.16));
  }
  geo.computeVertexNormals();
  return geo;
}

function trunkGeo(rand) {
  const geo = new THREE.CylinderGeometry(0.16, 0.32, 1, 7);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  const lean = (rand() - 0.5) * 0.22;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (0.9 + rand() * 0.2) + lean * y * y);
    pos.setZ(i, pos.getZ(i) * (0.9 + rand() * 0.2));
  }
  geo.computeVertexNormals();
  return geo;
}

const FOLIAGE = [0x4e8638, 0x3d7330, 0x68964a, 0x567f3c, 0x2f6434, 0x7a9a52];

function makeTree(rand, scale) {
  const g = new THREE.Group();
  const h = 1.15 + rand() * 0.9;
  const trunk = new THREE.Mesh(trunkGeo(rand), mat(rand() > 0.5 ? 0x7a4e2c : 0x6a4024));
  trunk.castShadow = true;
  trunk.scale.set(scale * (0.85 + rand() * 0.3), scale * h, scale * (0.85 + rand() * 0.3));
  g.add(trunk);
  const puffs = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < puffs; i += 1) {
    const leaf = new THREE.Mesh(puffGeo(rand, 0.72 + rand() * 0.25), mat(FOLIAGE[Math.floor(rand() * FOLIAGE.length)]));
    leaf.castShadow = true;
    const s = scale * (0.85 + rand() * 0.55);
    leaf.scale.set(s * (0.9 + rand() * 0.4), s * (0.7 + rand() * 0.35), s * (0.85 + rand() * 0.4));
    leaf.position.set((rand() - 0.5) * scale * 0.45, scale * (h * 0.72 + i * 0.28), (rand() - 0.5) * scale * 0.4);
    g.add(leaf);
  }
  return g;
}

function makeBush(rand) {
  const g = new THREE.Group();
  const n = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < n; i += 1) {
    const leaf = new THREE.Mesh(puffGeo(rand, 0.62), mat(FOLIAGE[Math.floor(rand() * FOLIAGE.length)]));
    leaf.castShadow = true;
    const s = 0.45 + rand() * 0.4;
    leaf.scale.set(s * 1.3, s * 0.7, s);
    leaf.position.set((i - 1) * 0.28, s * 0.35, (rand() - 0.5) * 0.2);
    g.add(leaf);
  }
  return g;
}

function chunkRockGeo(rand) {
  const sides = 6;
  const slices = 4;
  const profiles = [
    [0.42, 0.92, 1, 0.7, 0.22],
    [0.28, 0.62, 0.95, 0.55, 0.12],
    [0.55, 0.88, 0.66, 0.34, 0.1],
  ];
  const profile = profiles[Math.floor(rand() * profiles.length)];
  const stretchX = 0.75 + rand() * 0.7;
  const stretchZ = 0.7 + rand() * 0.65;
  const verts = [];
  for (let s = 0; s <= slices; s += 1) {
    const y = s * 0.22;
    for (let i = 0; i < sides; i += 1) {
      const a = (i / sides) * Math.PI * 2;
      const wobble = 0.86 + rand() * 0.22;
      const rad = profile[s] * wobble;
      verts.push([Math.cos(a) * rad * stretchX, y, Math.sin(a) * rad * stretchZ]);
    }
  }
  const positions = [];
  const colors = [];
  const base = new THREE.Color([0x8a8176, 0x6e675e, 0x9a8d7c, 0x746456][Math.floor(rand() * 4)]);
  const push = (ia, ib, ic) => {
    for (const idx of [ia, ib, ic]) {
      positions.push(verts[idx][0], verts[idx][1], verts[idx][2]);
      const shade = 0.82 + rand() * 0.28;
      colors.push(base.r * shade, base.g * shade, base.b * shade);
    }
  };
  const ring = sides;
  for (let s = 0; s < slices; s += 1) {
    for (let i = 0; i < sides; i += 1) {
      const a = s * ring + i;
      const b = s * ring + ((i + 1) % sides);
      const c = a + ring;
      const d = b + ring;
      push(a, c, b);
      push(b, c, d);
    }
  }
  for (let i = 1; i < sides - 1; i += 1) push(0, i, i + 1);
  const top = slices * ring;
  for (let i = 1; i < sides - 1; i += 1) push(top, top + i + 1, top + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function makeRock(rand) {
  return new THREE.Mesh(
    chunkRockGeo(rand),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
}

const STONE = 0xc8b496;
const STONE_DARK = 0xb39a7c;
const STONE_LIGHT = 0xd8c8ae;
const DOOR = 0x3a3648;
const SLATE = 0x6a5d6e;
const FLAG = 0xc45a4a;

function addMerlons(g, width, depth, y, thick = 0.16, rise = 0.28) {
  const hw = width / 2;
  const hd = depth / 2;
  const along = (len, axis) => {
    const count = Math.max(2, Math.round(len / 0.38));
    const step = len / count;
    for (let i = 0; i < count; i += 1) {
      if (i % 2) continue;
      const t = -len / 2 + step * (i + 0.5);
      if (axis === "x") {
        g.add(mesh(new THREE.BoxGeometry(step * 0.72, rise, thick), STONE_LIGHT, t, y + rise / 2, hd - thick / 2));
        g.add(mesh(new THREE.BoxGeometry(step * 0.72, rise, thick), STONE_LIGHT, t, y + rise / 2, -hd + thick / 2));
      } else {
        g.add(mesh(new THREE.BoxGeometry(thick, rise, step * 0.72), STONE_LIGHT, hw - thick / 2, y + rise / 2, t));
        g.add(mesh(new THREE.BoxGeometry(thick, rise, step * 0.72), STONE_LIGHT, -hw + thick / 2, y + rise / 2, t));
      }
    }
  };
  along(width, "x");
  along(depth - thick * 2, "z");
}

function addSlits(g, faceZ, y0, rows, cols, spanX, color = DOOR) {
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x = (c - (cols - 1) / 2) * (spanX / Math.max(1, cols - 1));
      const y = y0 + r * 0.42;
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.04), color, x, y, faceZ, { cast: false }));
    }
  }
}

function addBanner(g, x, y, z) {
  g.add(mesh(new THREE.BoxGeometry(0.035, 0.55, 0.035), 0xeee6d6, x, y, z, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.12, 0.02), FLAG, x + 0.11, y + 0.18, z, { cast: false }));
}

function addKeepBanner(g, x, y, z, scale = 1) {
  g.add(mesh(new THREE.BoxGeometry(0.045 * scale, 0.72 * scale, 0.045 * scale), 0xeee6d6, x, y, z, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.3 * scale, 0.16 * scale, 0.03 * scale), FLAG, x + 0.15 * scale, y + 0.24 * scale, z, { cast: false }));
}

function addKeepTurret(g, x, z, h, r, roof, fancy) {
  const sides = fancy ? 12 : 8;
  const cap = fancy ? STONE_LIGHT : STONE;
  g.add(mesh(new THREE.CylinderGeometry(r * 0.88, r * 1.06, h, sides), STONE_DARK, x, h / 2, z));
  g.add(mesh(new THREE.CylinderGeometry(r * 1.14, r * 1.14, 0.3, sides), cap, x, h, z));
  if (fancy) g.add(mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.1, sides), 0xc4a24a, x, h + 0.2, z));
  g.add(mesh(new THREE.ConeGeometry(r * 1.26, roof, 8), fancy ? 0x4a3858 : SLATE, x, h + 0.22 + roof / 2, z));
  if (fancy) addKeepBanner(g, x, h + roof + 0.42, z, Math.max(1, r * 1.4));
}

function addKeepDoor(g, zFace, scale) {
  g.add(mesh(new THREE.BoxGeometry(1.25 * scale, 0.22 * scale, 0.9 * scale), STONE, 0, 0.24 * scale, zFace));
  g.add(mesh(new THREE.BoxGeometry(0.82 * scale, 1.45 * scale, 0.14 * scale), DOOR, 0, 0.92 * scale, zFace - 0.1 * scale));
  g.add(mesh(new THREE.BoxGeometry(1.02 * scale, 0.14 * scale, 0.22 * scale), 0x5c3a22, 0, 1.68 * scale, zFace - 0.02 * scale));
  g.add(mesh(new THREE.BoxGeometry(0.1 * scale, 0.36 * scale, 0.05 * scale), 0x2a2733, 0.16 * scale, 0.95 * scale, zFace - 0.02 * scale, { cast: false }));
}

function addKeepRing(g, size, h, thick, y0, merlon) {
  const y = y0 + h / 2;
  const inset = size / 2 - thick / 2;
  g.add(mesh(new THREE.BoxGeometry(size, h, thick), STONE, 0, y, inset));
  g.add(mesh(new THREE.BoxGeometry(size, h, thick), STONE, 0, y, -inset));
  g.add(mesh(new THREE.BoxGeometry(thick, h, size - thick * 2), STONE, inset, y, 0));
  g.add(mesh(new THREE.BoxGeometry(thick, h, size - thick * 2), STONE, -inset, y, 0));
  addMerlons(g, size, size, y0 + h, thick * 0.9, merlon);
}

function makeKeep(level = 0) {
  const g = new THREE.Group();
  g.userData.keepRoot = true;
  const lv = Math.max(0, Math.min(3, level || 0));
  const gold = 0xd4b44a;
  const brass = 0xc4a24a;

  if (lv === 0) {
    g.add(mesh(new THREE.BoxGeometry(6.1, 0.32, 6.1), STONE_DARK, 0, 0.16, 0));
    g.add(mesh(new THREE.BoxGeometry(5.6, 0.38, 5.6), STONE, 0, 0.48, 0));
    const body = mesh(new THREE.BoxGeometry(4.8, 6.2, 4.8), STONE, 0, 3.7, 0);
    body.userData.keepBody = true;
    g.add(body);
    g.add(mesh(new THREE.BoxGeometry(5.15, 0.28, 5.15), STONE_DARK, 0, 6.9, 0));
    addMerlons(g, 5.15, 5.15, 7.04, 0.26, 0.48);
    addSlits(g, 2.42, 2.1, 4, 3, 2.4);
    addSlits(g, -2.42, 2.4, 3, 3, 2.2);
    addKeepDoor(g, 2.55, 1.15);
    addKeepTurret(g, 2.55, -2.55, 8.4, 0.72, 1.35, false);
    addKeepTurret(g, -2.5, 2.5, 5.6, 0.5, 0.85, false);
    addKeepBanner(g, 0, 7.7, 2.4, 1.15);
    return g;
  }

  if (lv === 1) {
    g.add(mesh(new THREE.BoxGeometry(9.6, 0.38, 9.6), STONE_DARK, 0, 0.19, 0));
    addKeepRing(g, 9.4, 4.4, 0.7, 0.38, 0.55);
    const body = mesh(new THREE.BoxGeometry(5.6, 9.2, 5.6), STONE, 0, 5.1, 0);
    body.userData.keepBody = true;
    g.add(body);
    g.add(mesh(new THREE.BoxGeometry(6.0, 0.32, 6.0), STONE_LIGHT, 0, 9.8, 0));
    addMerlons(g, 6.0, 6.0, 9.96, 0.28, 0.52);
    addSlits(g, 2.82, 2.8, 5, 3, 2.8);
    addSlits(g, -2.82, 3.2, 4, 3, 2.5);
    addKeepDoor(g, 4.85, 1.35);
    g.add(mesh(new THREE.BoxGeometry(2.4, 3.2, 1.6), STONE_DARK, 0, 1.9, 4.1));
    addKeepTurret(g, 4.15, 4.15, 12.2, 0.95, 1.7, false);
    addKeepTurret(g, -4.15, 4.15, 12.2, 0.95, 1.7, false);
    addKeepTurret(g, 4.15, -4.15, 12.2, 0.95, 1.7, false);
    addKeepTurret(g, -4.15, -4.15, 12.2, 0.95, 1.7, false);
    addKeepBanner(g, 0, 10.7, 2.9, 1.3);
    addKeepBanner(g, 4.15, 14.3, 4.15, 1.2);
    return g;
  }

  if (lv === 2) {
    g.add(mesh(new THREE.BoxGeometry(13.2, 0.42, 13.2), STONE_DARK, 0, 0.21, 0));
    addKeepRing(g, 13.0, 5.4, 0.85, 0.42, 0.62);
    addKeepRing(g, 8.4, 3.6, 0.55, 0.42, 0.42);
    const body = mesh(new THREE.BoxGeometry(6.6, 12.8, 6.6), STONE_LIGHT, 0, 7.1, 0);
    body.userData.keepBody = true;
    g.add(body);
    g.add(mesh(new THREE.BoxGeometry(7.1, 0.36, 7.1), STONE, 0, 13.6, 0));
    addMerlons(g, 7.1, 7.1, 13.78, 0.32, 0.58);
    addSlits(g, 3.32, 3.4, 6, 4, 3.6);
    addSlits(g, -3.32, 3.8, 5, 3, 3.2);
    g.add(mesh(new THREE.BoxGeometry(7.0, 0.12, 0.12), brass, 0, 8.4, 3.34));
    addKeepDoor(g, 6.65, 1.55);
    g.add(mesh(new THREE.BoxGeometry(3.2, 4.4, 2.2), STONE, 0, 2.5, 5.5));
    g.add(mesh(new THREE.BoxGeometry(1.1, 2.2, 0.16), DOOR, 0, 1.4, 6.55));
    addKeepTurret(g, 5.7, 5.7, 16.5, 1.15, 2.2, true);
    addKeepTurret(g, -5.7, 5.7, 16.5, 1.15, 2.2, true);
    addKeepTurret(g, 5.7, -5.7, 16.5, 1.15, 2.2, true);
    addKeepTurret(g, -5.7, -5.7, 16.5, 1.15, 2.2, true);
    addKeepTurret(g, 0, -5.9, 11.2, 0.72, 1.4, false);
    addKeepBanner(g, 0, 14.7, 3.4, 1.45);
    return g;
  }

  g.add(mesh(new THREE.BoxGeometry(17.2, 0.5, 17.2), STONE_DARK, 0, 0.25, 0));
  addKeepRing(g, 16.8, 6.4, 1.05, 0.5, 0.72);
  addKeepRing(g, 11.4, 4.6, 0.7, 0.5, 0.52);
  const hall = mesh(new THREE.BoxGeometry(8.4, 10.4, 8.4), STONE, 0, 6.7, 0);
  hall.userData.keepBody = true;
  g.add(hall);
  const spire = mesh(new THREE.BoxGeometry(4.6, 16.5, 4.6), STONE_LIGHT, 0, 16.4, 0);
  spire.userData.keepBody = true;
  g.add(spire);
  g.add(mesh(new THREE.BoxGeometry(5.2, 0.4, 5.2), gold, 0, 24.8, 0));
  addMerlons(g, 5.2, 5.2, 25.0, 0.34, 0.62);
  g.add(mesh(new THREE.ConeGeometry(1.35, 3.4, 8), 0x4a3858, 0, 27.1, 0));
  addKeepBanner(g, 0, 29.0, 0, 1.7);
  addSlits(g, 4.22, 3.2, 5, 4, 4.2);
  addSlits(g, 2.32, 10.4, 6, 3, 2.4);
  g.add(mesh(new THREE.BoxGeometry(8.8, 0.14, 0.14), gold, 0, 9.6, 4.24));
  g.add(mesh(new THREE.BoxGeometry(4.9, 0.12, 0.12), brass, 0, 18.6, 2.34));
  addKeepDoor(g, 8.55, 1.7);
  g.add(mesh(new THREE.BoxGeometry(4.0, 5.4, 2.6), STONE_DARK, 0, 3.0, 7.1));
  g.add(mesh(new THREE.BoxGeometry(1.4, 2.6, 0.2), DOOR, 0, 1.55, 8.35));
  g.add(mesh(new THREE.BoxGeometry(2.2, 1.1, 0.7), gold, 0, 4.5, 8.2));
  addKeepTurret(g, 7.4, 7.4, 21.5, 1.45, 2.8, true);
  addKeepTurret(g, -7.4, 7.4, 21.5, 1.45, 2.8, true);
  addKeepTurret(g, 7.4, -7.4, 21.5, 1.45, 2.8, true);
  addKeepTurret(g, -7.4, -7.4, 21.5, 1.45, 2.8, true);
  addKeepTurret(g, 0, 7.6, 14.8, 0.85, 1.7, true);
  addKeepTurret(g, 0, -7.6, 14.8, 0.85, 1.7, true);
  addKeepBanner(g, 7.4, 24.8, 7.4, 1.5);
  addKeepBanner(g, -7.4, 24.8, -7.4, 1.5);
  return g;
}

const WOOD = 0x8a5c38;
const WOOD_DARK = 0x5c3a22;
const THATCH = 0xc49648;
const WHEAT = 0xe2c45c;
const CLOTH = 0xf2ead8;
const IRON = 0x4a4e55;
const IRON_LIGHT = 0x6a7078;
const RUST = 0x8a5a3a;
const BRASS = 0xc4a24a;
const ROPE = 0xc4a070;
const PARCHMENT = 0xf0e2b8;
const MAGIC = 0x5a8ee8;
const CRYSTAL = 0xb8e4ff;
const GOLD = 0xd4b44a;
const PLATE = 0x9aa4b0;
const PLATE_DARK = 0x6e7784;
const ELITE = 0xe8e0c4;

function addCrate(g, x, y, z, s = 0.2) {
  g.add(mesh(new THREE.BoxGeometry(s, s, s), WOOD, x, y + s / 2, z));
  g.add(mesh(new THREE.BoxGeometry(s + 0.02, 0.024, 0.024), WOOD_DARK, x, y + s * 0.32, z + s * 0.5, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(s + 0.02, 0.024, 0.024), WOOD_DARK, x, y + s * 0.68, z + s * 0.5, { cast: false }));
}

function addBarrel(g, x, y, z, h = 0.24, r = 0.11) {
  g.add(mesh(new THREE.CylinderGeometry(r, r * 1.06, h, 8), WOOD, x, y + h / 2, z));
  g.add(mesh(new THREE.TorusGeometry(r, 0.012, 5, 8), IRON, x, y + h * 0.28, z, { rx: Math.PI / 2 }));
  g.add(mesh(new THREE.TorusGeometry(r, 0.012, 5, 8), IRON, x, y + h * 0.72, z, { rx: Math.PI / 2 }));
}

function addWindow(g, x, y, z, w = 0.16, h = 0.22) {
  g.add(mesh(new THREE.BoxGeometry(w, h, 0.05), DOOR, x, y, z, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.02, h, 0.06), WOOD_DARK, x, y, z, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(w + 0.05, 0.03, 0.06), WOOD_DARK, x, y + h / 2 + 0.02, z, { cast: false }));
}

function addAim() {
  const g = new THREE.Group();
  g.userData.aim = true;
  return g;
}

function addRoundEmplacement(g, radius) {
  g.add(mesh(new THREE.CylinderGeometry(radius * 1.12, radius * 1.18, 0.1, 20), STONE_DARK, 0, 0.05, 0));
  g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.12, 20), STONE, 0, 0.16, 0));
  g.add(mesh(new THREE.TorusGeometry(radius * 0.94, 0.04, 8, 20), STONE_LIGHT, 0, 0.23, 0, { rx: Math.PI / 2 }));
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    g.add(mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.08, 8), STONE_LIGHT, Math.sin(a) * radius * 0.94, 0.26, Math.cos(a) * radius * 0.94));
  }
}

function gableFace(w, rise, z) {
  const hw = w * 0.5;
  const geo = new THREE.BufferGeometry();
  const front = z >= 0;
  const verts = front
    ? [-hw, 0, z, hw, 0, z, 0, rise, z, -hw, 0, z, 0, rise, z, hw, 0, z]
    : [-hw, 0, z, 0, rise, z, hw, 0, z, -hw, 0, z, hw, 0, z, 0, rise, z];
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.computeVertexNormals();
  return geo;
}

function addRidgeRoof(g, w, d, rise, y, color) {
  const hw = w * 0.5;
  const thick = 0.1;
  const slope = Math.hypot(hw, rise);
  const ang = Math.atan2(rise, hw);
  const cx = hw * 0.5;
  const cy = y + rise * 0.5;
  g.add(mesh(new THREE.BoxGeometry(slope + 0.08, thick, d + 0.1), color, -cx, cy, 0, { rz: ang }));
  g.add(mesh(new THREE.BoxGeometry(slope + 0.08, thick, d + 0.1), color, cx, cy, 0, { rz: -ang }));
  g.add(mesh(new THREE.BoxGeometry(0.12, 0.08, d + 0.12), color, 0, y + rise + 0.02, 0));
  g.add(mesh(gableFace(w * 0.94, rise, d * 0.5), WOOD, 0, y, 0, { cast: false }));
  g.add(mesh(gableFace(w * 0.94, rise, -d * 0.5), WOOD, 0, y, 0, { cast: false }));
}

const WALL_VIS_H = 1.72;
const WALL_VIS_HALF = WALL_VIS_H / 2;

function makeWallGeometry(level = 0) {
  const parts = [];
  const h = WALL_VIS_H + level * 0.2;
  const len = WALL_MESH_LEN;
  const add = (w, ht, d, x, y, z, hex, rot) => {
    parts.push(voxelBox(w, ht, d, x, y, z, hex, rot));
  };
  if (level >= 2) {
    const face = level >= 3 ? STONE_LIGHT : STONE;
    add(len * 0.98, h * 0.9, 0.36, 0, h * 0.45, 0, face);
    add(len, 0.14, 0.9, 0, h + 0.08, 0, level >= 3 ? STONE_LIGHT : WOOD);
    const blocks = 5;
    const bw = len / blocks;
    for (const side of [-1, 1]) {
      const z = side * 0.26;
      for (let i = 0; i < blocks; i += 1) {
        const x = -len / 2 + bw * (i + 0.5);
        const shade = (i + (side > 0 ? 1 : 0)) % 2 ? STONE : STONE_DARK;
        add(bw * 0.92, h * 0.88, 0.32, x, h * 0.44, z, shade);
      }
      add(len * 1.02, 0.18, 0.4, 0, 0.4, z, STONE_DARK);
      add(len * 1.02, 0.14, 0.38, 0, h * 0.64, z, level >= 3 ? BRASS : STONE_LIGHT);
      if (level >= 3) {
        add(0.08, 0.46, 0.05, -0.32, 0.86, z + side * 0.1, DOOR);
        add(0.08, 0.46, 0.05, 0.32, 0.86, z + side * 0.1, DOOR);
      }
    }
    const count = level >= 3 ? 8 : 6;
    const step = len / count;
    for (let i = 0; i < count; i += 1) {
      if (i % 2) continue;
      const t = -len / 2 + step * (i + 0.5);
      add(step * 0.72, 0.4 + (level >= 3 ? 0.1 : 0), 0.2, t, h + 0.28, 0.34, STONE_LIGHT);
      add(step * 0.72, 0.4 + (level >= 3 ? 0.1 : 0), 0.2, t, h + 0.28, -0.34, STONE_LIGHT);
    }
    add(0.28, h + 0.55, 0.28, -len / 2, (h + 0.55) / 2, 0, STONE_DARK);
    add(0.28, h + 0.55, 0.28, len / 2, (h + 0.55) / 2, 0, STONE_DARK);
    if (level >= 3) {
      add(0.06, 0.62, 0.06, -len / 2, h + 0.82, 0, 0xeee6d6);
      add(0.22, 0.12, 0.03, -len / 2 + 0.12, h + 1.05, 0, FLAG);
      add(0.18, 0.08, 0.18, -len / 2, h + 0.58, 0, GOLD);
      add(0.18, 0.08, 0.18, len / 2, h + 0.58, 0, GOLD);
    }
  } else {
    add(len * 0.98, h * 0.88, 0.28, 0, h * 0.44, 0, STONE);
    add(len, 0.12, 0.78, 0, h + 0.06, 0, WOOD);
    const logs = 6;
    const logW = len / logs;
    for (const side of [-1, 1]) {
      const z = side * 0.22;
      for (let i = 0; i < logs; i += 1) {
        const x = -len / 2 + logW * (i + 0.5);
        const shade = i % 2 ? WOOD : WOOD_DARK;
        const hh = h + (i % 3 === 0 ? 0.1 : 0) + (level >= 1 ? 0.08 : 0);
        add(logW * 0.84, hh, 0.28, x, hh / 2, z, shade);
        add(logW * 0.42, 0.26, 0.22, x, hh + 0.1, z, shade);
        if (level >= 1) add(logW * 0.9, 0.06, 0.32, x, hh * 0.55, z, IRON);
      }
      add(len * 1.02, 0.16, 0.36, 0, 0.38, z, STONE_DARK);
      add(len * 1.02, 0.16, 0.36, 0, h * 0.58, z, level >= 1 ? IRON : STONE_DARK);
      add(0.08, 0.42, 0.05, -0.34, 0.78, z + side * 0.08, DOOR);
      add(0.08, 0.42, 0.05, 0.34, 0.78, z + side * 0.08, DOOR);
    }
    const count = 6;
    const step = len / count;
    for (let i = 0; i < count; i += 1) {
      if (i % 2) continue;
      const t = -len / 2 + step * (i + 0.5);
      add(step * 0.7, 0.34, 0.16, t, h + 0.06 + 0.17, 0.28, STONE_LIGHT);
      add(step * 0.7, 0.34, 0.16, t, h + 0.06 + 0.17, -0.28, STONE_LIGHT);
    }
    add(0.2, h + 0.32, 0.2, -len / 2, (h + 0.32) / 2, 0, WOOD_DARK);
    add(0.2, h + 0.32, 0.2, len / 2, (h + 0.32) / 2, 0, WOOD_DARK);
    if (level >= 1) {
      add(0.12, 0.18, 0.12, -len / 2, h + 0.42, 0, IRON);
      add(0.12, 0.18, 0.12, len / 2, h + 0.42, 0, IRON);
    }
  }
  return mergeGeos(parts);
}

function makeGateGeometry(level = 0) {
  const parts = [];
  const add = (w, ht, d, x, y, z, hex, rot) => {
    parts.push(voxelBox(w, ht, d, x, y, z, hex, rot));
  };
  const lv = Math.max(0, Math.min(3, level || 0));
  const len = GATE_LEN;
  const end = len / 2;
  const crenel = (x, z, w, y, d, hex) => {
    add(w * 0.42, 0.34, d, x - w * 0.28, y + 0.17, z, hex);
    add(w * 0.42, 0.34, d, x + w * 0.28, y + 0.17, z, hex);
  };

  if (lv >= 3) {
    const towerW = 1.22;
    const towerD = 1.72;
    const towerH = 3.55;
    const bodyH = 2.55;
    for (const side of [-1, 1]) {
      const tx = side * (end - towerW * 0.48);
      add(towerW, towerH, towerD, tx, towerH / 2, 0, STONE);
      add(towerW + 0.16, 0.2, towerD + 0.16, tx, towerH + 0.08, 0, STONE_DARK);
      add(towerW + 0.08, 0.12, towerD + 0.08, tx, towerH + 0.22, 0, STONE_LIGHT);
      for (const fz of [-1, 1]) {
        crenel(tx, fz * (towerD * 0.48), towerW * 0.9, towerH + 0.22, 0.22, STONE_LIGHT);
      }
      crenel(tx, 0, 0.28, towerH + 0.22, towerD * 0.92, STONE);
      add(0.22, 0.7, 0.22, tx, towerH + 0.55, towerD * 0.42, STONE_DARK);
      add(0.08, 0.85, 0.08, tx, towerH + 1.05, towerD * 0.42, 0xeee6d6);
      add(0.28, 0.16, 0.04, tx + side * 0.12, towerH + 1.42, towerD * 0.42, FLAG);
      add(0.16, 0.55, 0.08, tx, 1.55, towerD * 0.52, DOOR);
      add(0.12, 0.22, 0.04, tx, 2.35, towerD * 0.54, DOOR);
      add(0.2, 0.1, 0.2, tx, towerH + 0.32, 0, GOLD);
    }
    add(len * 0.52, bodyH, 1.28, 0, bodyH / 2, 0, STONE);
    add(len * 0.56, 0.22, 1.42, 0, bodyH + 0.08, 0, STONE_DARK);
    add(len * 0.5, 0.14, 1.2, 0, bodyH + 0.24, 0, STONE_LIGHT);
    crenel(0, 0.58, 1.6, bodyH + 0.24, 0.2, STONE_LIGHT);
    crenel(0, -0.58, 1.6, bodyH + 0.24, 0.2, STONE_LIGHT);
    add(1.7, 0.18, 0.16, 0, 2.05, 0.7, STONE_DARK);
    add(1.55, 0.12, 0.5, 0, 0.08, 0, STONE_DARK);
    add(0.16, 1.85, 0.16, -0.82, 1.05, 0.52, STONE_DARK);
    add(0.16, 1.85, 0.16, 0.82, 1.05, 0.52, STONE_DARK);
    add(1.72, 0.22, 0.22, 0, 1.95, 0.52, STONE);
    add(0.08, 1.55, 0.06, -0.55, 0.9, 0.18, IRON);
    add(0.08, 1.55, 0.06, -0.18, 0.9, 0.18, IRON);
    add(0.08, 1.55, 0.06, 0.18, 0.9, 0.18, IRON);
    add(0.08, 1.55, 0.06, 0.55, 0.9, 0.18, IRON);
    add(1.5, 0.08, 0.08, 0, 1.7, 0.18, IRON);
    add(0.68, 1.48, 0.1, -0.36, 0.82, 0.08, 0x4a2e1c);
    add(0.68, 1.48, 0.1, 0.36, 0.82, 0.08, 0x4a2e1c);
    add(0.08, 1.48, 0.12, 0, 0.82, 0.12, IRON);
    add(0.1, 0.14, 0.08, 0.08, 0.95, 0.16, GOLD);
    add(0.22, 0.1, 0.22, 0, bodyH + 0.38, 0, GOLD);
    return mergeGeos(parts);
  }

  if (lv >= 2) {
    const pierW = 0.95;
    const pierH = 2.62;
    const pierD = 1.18;
    const openW = 1.36;
    const doorH = 1.72;
    for (const side of [-1, 1]) {
      const x = side * (end - pierW * 0.5);
      add(pierW, pierH, pierD, x, pierH / 2, 0, STONE);
      add(pierW + 0.1, 0.16, pierD + 0.1, x, pierH + 0.06, 0, STONE_DARK);
      crenel(x, 0.48, pierW, pierH + 0.06, 0.2, STONE_LIGHT);
      crenel(x, -0.48, pierW, pierH + 0.06, 0.2, STONE_LIGHT);
      add(0.14, 0.42, 0.08, x, 1.35, pierD * 0.52, DOOR);
      add(0.58, 2.08, 1.02, side * 0.98, 1.04, 0, STONE);
    }
    add(openW + 0.6, 0.34, 1.1, 0, doorH + 0.3, 0, STONE);
    add(0.52, 0.42, 0.72, -0.46, doorH + 0.58, 0, STONE);
    add(0.52, 0.42, 0.72, 0.46, doorH + 0.58, 0, STONE);
    add(0.72, 0.32, 0.78, 0, doorH + 0.72, 0, STONE_LIGHT);
    add(openW + 0.2, 0.12, 0.52, 0, 0.07, 0, STONE_DARK);
    const leaf = openW / 2 - 0.02;
    add(leaf, doorH, 0.16, -leaf / 2 - 0.015, doorH / 2 + 0.08, 0.04, 0x4a2e1c);
    add(leaf, doorH, 0.16, leaf / 2 + 0.015, doorH / 2 + 0.08, 0.04, 0x3a2414);
    add(0.08, doorH, 0.18, 0, doorH / 2 + 0.08, 0.1, IRON);
    add(0.06, doorH * 0.92, 0.05, -0.42, doorH * 0.5, 0.16, IRON);
    add(0.06, doorH * 0.92, 0.05, -0.14, doorH * 0.5, 0.16, IRON);
    add(0.06, doorH * 0.92, 0.05, 0.14, doorH * 0.5, 0.16, IRON);
    add(0.06, doorH * 0.92, 0.05, 0.42, doorH * 0.5, 0.16, IRON);
    add(openW * 0.9, 0.07, 0.07, 0, doorH * 0.92, 0.16, IRON);
    add(0.16, 0.2, 0.16, 0, pierH + 0.12, 0, IRON);
    return mergeGeos(parts);
  }

  if (lv >= 1) {
    const postH = 2.22;
    const openW = 1.28;
    const doorH = 1.78;
    for (const side of [-1, 1]) {
      add(0.92, WALL_VIS_H + 0.08, 0.62, side * (end - 0.46), (WALL_VIS_H + 0.08) / 2, 0, WOOD);
      add(0.92, 0.14, 0.74, side * (end - 0.46), WALL_VIS_H + 0.12, 0, WOOD_DARK);
      add(0.24, 0.34, 0.18, side * (end - 0.18), WALL_VIS_H + 0.36, 0.24, STONE_LIGHT);
      add(0.24, 0.34, 0.18, side * (end - 0.18), WALL_VIS_H + 0.36, -0.24, STONE_LIGHT);
      const px = side * (openW / 2 + 0.22);
      add(0.42, postH, 0.64, px, postH / 2, 0, WOOD_DARK);
      add(0.48, 0.1, 0.7, px, 0.55, 0, IRON);
      add(0.48, 0.1, 0.7, px, 1.4, 0, IRON);
      add(0.16, 0.28, 0.16, px, postH + 0.1, 0, IRON);
      add(0.5, WALL_VIS_H, 0.58, side * 1.2, WALL_VIS_H / 2, 0, WOOD);
    }
    add(openW + 0.72, 0.3, 0.66, 0, doorH + 0.22, 0, WOOD);
    add(openW + 0.88, 0.12, 1.0, 0, doorH + 0.4, 0, WOOD_DARK);
    add(1.2, 0.1, 1.08, -0.7, doorH + 0.5, 0, WOOD, { rz: 0.42 });
    add(1.2, 0.1, 1.08, 0.7, doorH + 0.5, 0, WOOD, { rz: -0.42 });
    add(0.22, 0.18, 1.08, 0, doorH + 0.7, 0, WOOD_DARK);
    add(openW + 0.12, 0.1, 0.5, 0, 0.07, 0, STONE_DARK);
    const leaf = openW / 2 - 0.02;
    add(leaf, doorH, 0.16, -leaf / 2 - 0.015, doorH / 2 + 0.08, 0.05, 0x5c3a22);
    add(leaf, doorH, 0.16, leaf / 2 + 0.015, doorH / 2 + 0.08, 0.05, 0x4a2e1c);
    add(0.08, doorH, 0.18, 0, doorH / 2 + 0.08, 0.1, IRON);
    add(0.32, 0.06, 0.04, -0.32, 0.55, 0.14, IRON);
    add(0.32, 0.06, 0.04, -0.32, 1.2, 0.14, IRON);
    add(0.32, 0.06, 0.04, 0.32, 0.55, 0.14, IRON);
    add(0.32, 0.06, 0.04, 0.32, 1.2, 0.14, IRON);
    add(0.1, 0.12, 0.08, 0.08, 0.95, 0.16, BRASS);
    return mergeGeos(parts);
  }

  const postH = 1.95;
  for (const side of [-1, 1]) {
    const x = side * 1.42;
    add(0.4, postH, 0.62, x, postH / 2, 0, WOOD_DARK);
    add(0.46, 0.12, 0.68, x, 0.42, 0, WOOD);
    add(0.18, 0.24, 0.18, x, postH + 0.08, 0, WOOD);
    add(0.78, WALL_VIS_H, 0.58, side * (end - 0.38), WALL_VIS_H / 2, 0, WOOD);
    add(0.78, 0.14, 0.7, side * (end - 0.38), WALL_VIS_H + 0.05, 0, WOOD_DARK);
    add(0.22, 0.32, 0.18, side * (end - 0.14), WALL_VIS_H + 0.28, 0.22, STONE_LIGHT);
    add(0.22, 0.32, 0.18, side * (end - 0.14), WALL_VIS_H + 0.28, -0.22, STONE_LIGHT);
  }
  add(2.35, 0.26, 0.55, 0, 1.88, 0, WOOD);
  add(2.2, 0.1, 0.7, 0, 2.04, 0, WOOD_DARK);
  add(1.55, 0.08, 0.42, 0, 0.06, 0, STONE_DARK);
  add(0.64, 1.42, 0.08, -0.36, 0.78, 0.06, 0x6a4428, { ry: 0.18 });
  add(0.64, 1.42, 0.08, 0.36, 0.78, 0.06, 0x6a4428, { ry: -0.18 });
  add(0.06, 1.42, 0.08, 0, 0.78, 0.1, WOOD_DARK);
  add(0.22, 0.05, 0.04, -0.28, 0.7, 0.12, IRON);
  add(0.08, 0.1, 0.06, 0.06, 0.88, 0.14, IRON);
  add(0.18, 0.55, 0.18, -1.05, 1.15, 0.22, WOOD_DARK);
  add(0.18, 0.55, 0.18, 1.05, 1.15, 0.22, WOOD_DARK);
  return mergeGeos(parts);
}

function makeBoat() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.55, 0.32, 4.2), 0x6a4024, 0, 0.18, 0));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.22, 1.1), 0x4a2c18, 0, 0.28, 2.0));
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.28, 0.85), 0x7a4a28, 0, 0.32, 2.5));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.38, 4.0), 0x3a2414, 0.7, 0.38, 0));
  g.add(mesh(new THREE.BoxGeometry(0.1, 0.38, 4.0), 0x3a2414, -0.7, 0.38, 0));
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.1, 0.12), 0x3a2414, 0, 0.38, -2.0));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.4), WOOD, 0, 0.3, 0.4));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.4), WOOD, 0, 0.3, -0.5));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.06, 0.4), WOOD, 0, 0.3, -1.4));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.8, 6), 0x3a2414, 0, 1.1, -0.2));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.95, 0.5), 0xc45a28, 0.28, 1.45, -0.2, { cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.1, 0.28), IRON, 0, 0.24, 2.2));
  return g;
}

function makeBuilding(kind, level = 0) {
  const g = new THREE.Group();
  const lv = Math.max(0, Math.min(3, level || 0));
  if (kind === "keep") {
    return makeKeep(lv);
  }
  if (kind === "wall") {
    const wall = new THREE.Mesh(
      makeWallGeometry(lv),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    );
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  } else if (kind === "gate") {
    const gate = new THREE.Mesh(
      makeGateGeometry(lv),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    );
    gate.castShadow = true;
    gate.receiveShadow = true;
    g.add(gate);
  } else if (kind === "crossbow") {
    addRoundEmplacement(g, 0.72 + lv * 0.04);
    addCrate(g, 0.58, 0.24, -0.48, 0.16);
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), 0xefe6d2, 0.54, 0.46, -0.48));
    g.add(mesh(new THREE.BoxGeometry(0.03, 0.1, 0.03), 0xefe6d2, 0.6, 0.45, -0.44));
    if (lv >= 1) {
      addCrate(g, -0.58, 0.24, -0.5, 0.15);
      g.add(mesh(new THREE.BoxGeometry(0.22, 0.06, 0.22), lv >= 3 ? GOLD : BRASS, 0.62, 0.28, 0.58));
    }
    if (lv >= 2) {
      g.add(mesh(new THREE.CylinderGeometry(0.76, 0.8, 0.12, 16), STONE_DARK, 0, 0.3, 0));
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), IRON, 0.7, 0.46, 0.7));
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), IRON, -0.7, 0.46, 0.7));
    }
    if (lv >= 3) {
      g.add(mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), GOLD, 0, 0.34, -0.62));
      addBanner(g, 0.72, 0.82, -0.62);
    }
    const aim = addAim();
    aim.position.set(0, 0.28, 0);
    aim.add(mesh(new THREE.CylinderGeometry(0.52, 0.54, 0.08, 20), WOOD_DARK, 0, 0.04, 0));
    aim.add(mesh(new THREE.TorusGeometry(0.5, 0.028, 8, 20), BRASS, 0, 0.08, 0, { rx: Math.PI / 2 }));
    aim.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 12), IRON, 0, 0.1, 0));
    aim.add(mesh(new THREE.BoxGeometry(0.18, 0.16, 0.72), WOOD, 0, 0.18, 0.02));
    aim.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.2), WOOD_DARK, 0, 0.22, -0.28));
    const prod = mesh(new THREE.TorusGeometry(0.42, 0.05, 7, 16, Math.PI), BRASS, 0, 0.24, 0.18);
    prod.rotation.x = Math.PI / 2;
    aim.add(prod);
    aim.add(mesh(new THREE.BoxGeometry(0.7, 0.09, 0.11), WOOD, -0.34, 0.24, 0.08, { ry: -0.55 }));
    aim.add(mesh(new THREE.BoxGeometry(0.7, 0.09, 0.11), WOOD, 0.34, 0.24, 0.08, { ry: 0.55 }));
    aim.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), BRASS, -0.58, 0.24, -0.12));
    aim.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), BRASS, 0.58, 0.24, -0.12));
    aim.add(mesh(new THREE.BoxGeometry(1.16, 0.02, 0.02), ROPE, 0, 0.24, -0.14, { cast: false }));
    aim.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.22), WOOD_DARK, 0, 0.22, 0.22));
    aim.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.58), 0xefe6d2, 0, 0.22, 0.18));
    aim.add(mesh(new THREE.ConeGeometry(0.035, 0.1, 5), IRON, 0, 0.22, 0.5, { rx: Math.PI / 2 }));
    aim.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), WOOD, 0, 0.34, -0.08));
    aim.add(mesh(new THREE.BoxGeometry(0.26, 0.03, 0.18), lv >= 2 ? GOLD : BRASS, 0, 0.43, -0.08));
    const bolts = 5 + lv * 2;
    for (let i = 0; i < bolts; i += 1) {
      aim.add(mesh(new THREE.BoxGeometry(0.028, 0.14 + lv * 0.02, 0.028), lv >= 3 ? GOLD : 0xefe6d2, (i - (bolts - 1) / 2) * 0.042, 0.5, -0.08));
    }
    for (const x of [-0.2, 0.2]) {
      aim.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), WOOD_DARK, x, 0.18, -0.2, { rz: Math.PI / 2 }));
      aim.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8), BRASS, x, 0.18, -0.2, { rz: Math.PI / 2 }));
    }
    g.add(aim);
    g.userData.aim = aim;
  } else if (kind === "cannon") {
    addRoundEmplacement(g, 0.78 + lv * 0.04);
    addBarrel(g, -0.7, 0.24, -0.42, 0.24, 0.1);
    addBarrel(g, -0.56, 0.24, -0.56, 0.2, 0.09);
    g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), IRON, 0.62, 0.34, -0.48));
    g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), IRON, 0.72, 0.32, -0.36));
    g.add(mesh(new THREE.SphereGeometry(0.07, 8, 6), IRON, 0.66, 0.46, -0.42));
    if (lv >= 1) {
      g.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), IRON, 0.5, 0.34, -0.56));
      g.add(mesh(new THREE.SphereGeometry(0.08, 8, 6), IRON, 0.78, 0.42, -0.5));
      addBarrel(g, -0.78, 0.24, -0.28, 0.22, 0.09);
    }
    if (lv >= 2) {
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.28, 0.5), IRON, 0.72, 0.38, 0.12));
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 10), IRON_LIGHT, 0.72, 0.28, 0.28, { rz: Math.PI / 2 }));
    }
    if (lv >= 3) {
      g.add(mesh(new THREE.TorusGeometry(0.82, 0.04, 8, 18), GOLD, 0, 0.28, 0, { rx: Math.PI / 2 }));
      addBanner(g, 0.78, 0.88, -0.55);
    }
    const aim = addAim();
    aim.position.set(0, 0.28, 0);
    aim.add(mesh(new THREE.CylinderGeometry(0.5, 0.52, 0.09, 20), WOOD, 0, 0.05, 0));
    aim.add(mesh(new THREE.TorusGeometry(0.48, 0.03, 8, 20), IRON, 0, 0.1, 0, { rx: Math.PI / 2 }));
    aim.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.08, 12), IRON_LIGHT, 0, 0.1, 0));
    for (const x of [-0.2, 0.2]) {
      aim.add(mesh(new THREE.BoxGeometry(0.1, 0.22, 0.55), WOOD_DARK, x, 0.2, 0.02));
      aim.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 8), BRASS, x, 0.22, 0.08, { rz: Math.PI / 2 }));
    }
    aim.add(mesh(new THREE.BoxGeometry(0.32, 0.08, 0.42), WOOD, 0, 0.12, -0.02));
    const tilt = Math.PI / 2 - 0.14;
    const barrel = mesh(new THREE.CylinderGeometry(0.1 + lv * 0.012, 0.16 + lv * 0.02, 1.15 + lv * 0.12, 12), lv >= 3 ? 0x3a3e44 : IRON, 0, 0.28, 0.22);
    barrel.rotation.x = tilt;
    aim.add(barrel);
    const breech = mesh(new THREE.SphereGeometry(0.12 + lv * 0.015, 8, 6), IRON, 0, 0.16, -0.32);
    aim.add(breech);
    const muzzle = mesh(new THREE.CylinderGeometry(0.15 + lv * 0.02, 0.11 + lv * 0.015, 0.12, 12), lv >= 2 ? BRASS : IRON_LIGHT, 0, 0.36, 0.74 + lv * 0.08);
    muzzle.rotation.x = tilt;
    aim.add(muzzle);
    for (const t of [-0.18, 0.12, 0.4]) {
      const ring = mesh(new THREE.TorusGeometry(0.13 + t * 0.02, 0.02, 7, 12), RUST, 0, 0.28 + t * 0.14, 0.22 + t);
      ring.rotation.x = tilt;
      aim.add(ring);
    }
    aim.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 0.14), BRASS, 0, 0.38, -0.12));
    aim.add(mesh(new THREE.BoxGeometry(0.22, 0.12, 0.08), WOOD_DARK, 0, 0.22, -0.42));
    g.add(aim);
    g.userData.aim = aim;
  } else if (kind === "air") {
    addRoundEmplacement(g, 0.74 + lv * 0.04);
    g.add(mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.16, 16), STONE_DARK, 0, 0.3, 0));
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), IRON, 0.58, 0.28, -0.5));
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.14, 0.18), IRON_LIGHT, -0.56, 0.26, -0.48));
    if (lv >= 1) g.add(mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 16), BRASS, 0, 0.34, 0, { rx: Math.PI / 2 }));
    if (lv >= 2) {
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.48, 0.1), IRON, 0.68, 0.52, 0.62));
      g.add(mesh(new THREE.BoxGeometry(0.1, 0.48, 0.1), IRON, -0.68, 0.52, 0.62));
    }
    if (lv >= 3) addBanner(g, 0.72, 0.92, -0.52);
    const aim = addAim();
    aim.position.set(0, 0.38, 0);
    aim.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.1, 16), IRON, 0, 0.06, 0));
    aim.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.12, 10), IRON_LIGHT, 0, 0.16, 0));
    const tilt = 0.72;
    for (const x of [-0.16, 0.16]) {
      const tube = mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.95 + lv * 0.08, 8), lv >= 3 ? 0x3a3e44 : IRON, x, 0.38, 0.18);
      tube.rotation.x = tilt;
      aim.add(tube);
      const lip = mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.1, 8), BRASS, x, 0.62, 0.58);
      lip.rotation.x = tilt;
      aim.add(lip);
    }
    aim.add(mesh(new THREE.BoxGeometry(0.42, 0.12, 0.28), WOOD_DARK, 0, 0.22, -0.08));
    aim.add(mesh(new THREE.BoxGeometry(0.08, 0.16, 0.18), BRASS, 0, 0.32, -0.22));
    const dish = mesh(new THREE.CylinderGeometry(0.22, 0.08, 0.08, 12), IRON_LIGHT, 0, 0.52, -0.12, { rx: 0.4 });
    aim.add(dish);
    g.add(aim);
    g.userData.aim = aim;
  } else if (kind === "farm") {
    const millBody = lv >= 2 ? STONE : WOOD;
    const millRoof = lv >= 3 ? SLATE : THATCH;
    g.add(mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.38, 10), STONE_DARK, -0.28, 0.19, -0.18));
    g.add(mesh(new THREE.CylinderGeometry(0.4 + lv * 0.02, 0.44 + lv * 0.02, 1.22 + lv * 0.12, 10), millBody, -0.28, 0.98 + lv * 0.06, -0.18));
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.18, 0.06), DOOR, -0.08, 1.15, 0.22, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.2, 0.05), DOOR, -0.48, 1.15, 0.22, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.36, 0.06), WOOD_DARK, -0.28, 0.52, 0.24));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), STONE, -0.28, 0.42, 0.08));
    g.add(mesh(new THREE.ConeGeometry(0.56 + lv * 0.04, 0.42, 8), millRoof, -0.28, 1.72 + lv * 0.12, -0.18));
    g.add(mesh(new THREE.ConeGeometry(0.22, 0.2, 7), millRoof, -0.28, 1.98 + lv * 0.12, -0.18));
    if (lv >= 3) g.add(mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), GOLD, -0.28, 2.28, -0.18));
    const sails = new THREE.Group();
    sails.position.set(-0.28, 1.42 + lv * 0.12, 0.26);
    sails.userData.spin = true;
    for (let i = 0; i < 4; i += 1) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      arm.add(mesh(new THREE.BoxGeometry(0.07, 1.22, 0.07), WOOD_DARK, 0, 0.55, 0));
      arm.add(mesh(new THREE.BoxGeometry(0.34 + lv * 0.04, 1.02 + lv * 0.08, 0.03), lv >= 2 ? 0xfff6d8 : CLOTH, 0.17, 0.58, 0.02, { cast: false }));
      arm.add(mesh(new THREE.BoxGeometry(0.34, 0.03, 0.03), WOOD, 0.17, 0.1, 0.02, { cast: false }));
      sails.add(arm);
    }
    g.add(sails);
    g.add(mesh(new THREE.BoxGeometry(1.05, 0.06, 0.78), 0x7a5a32, 0.5, 0.05, 0.3));
    const rows = 5 + lv;
    const cols = 6 + lv;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const h = 0.14 + lv * 0.03 + ((row * 3 + col) % 4) * 0.045;
        g.add(mesh(new THREE.BoxGeometry(0.07, h, 0.07), lv >= 3 ? 0xf0d070 : WHEAT, 0.16 + col * 0.12, 0.08 + h / 2, 0.04 + row * 0.12, { cast: false }));
      }
    }
    if (lv >= 1) addBarrel(g, 0.88, 0.16, -0.28, 0.2, 0.09);
    if (lv >= 2) addCrate(g, 0.18, 0.16, -0.58, 0.16);
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.24, 0.8), WOOD, 0.02, 0.15, 0.3));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.24, 0.8), WOOD, 0.98, 0.15, 0.3));
    g.add(mesh(new THREE.BoxGeometry(1.02, 0.24, 0.04), WOOD, 0.5, 0.15, -0.08));
    g.add(mesh(new THREE.BoxGeometry(1.02, 0.24, 0.04), WOOD, 0.5, 0.15, 0.68));
    addBarrel(g, 0.72, 0.16, -0.42, 0.22, 0.1);
    g.add(mesh(new THREE.BoxGeometry(0.38, 0.12, 0.22), WOOD, 0.28, 0.14, -0.52));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8), WOOD_DARK, 0.14, 0.12, -0.52, { rz: Math.PI / 2 }));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.42, 0.04), WOOD_DARK, 0.92, 0.29, -0.18));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.12, 0.02), CLOTH, 0.98, 0.42, -0.18, { cast: false }));
  } else if (kind === "barracks") {
    const hall = lv >= 2 ? STONE : WOOD;
    const hallTrim = lv >= 2 ? STONE_DARK : WOOD_DARK;
    const roof = lv >= 2 ? SLATE : THATCH;
    g.add(mesh(new THREE.BoxGeometry(1.78, 0.16, 1.22), STONE_DARK, 0, 0.08, 0));
    g.add(mesh(new THREE.BoxGeometry(1.58, 0.92 + lv * 0.1, 1.02), hall, 0, 0.62 + lv * 0.05, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.92 + lv * 0.1, 1.02), hallTrim, -0.8, 0.62 + lv * 0.05, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.92 + lv * 0.1, 1.02), hallTrim, 0.8, 0.62 + lv * 0.05, 0));
    g.add(mesh(new THREE.BoxGeometry(1.58, 0.06, 1.02), hallTrim, 0, 1.05 + lv * 0.1, 0));
    addRidgeRoof(g, 1.82, 1.24, 0.58, 1.08 + lv * 0.1, roof);
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.55, 0.22), STONE, 0.62, 1.28 + lv * 0.1, -0.18));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.22, 0.16), STONE_DARK, 0.62, 1.64 + lv * 0.1, -0.18));
    if (lv >= 1) {
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), IRON, 0.52, 0.5, 0.68));
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.62, 0.08), IRON_LIGHT, 0.3, 0.46, 0.68));
    }
    if (lv >= 3) {
      addMerlons(g, 1.7, 1.16, 1.18 + lv * 0.1, 0.1, 0.18);
      addBanner(g, -0.72, 1.62 + lv * 0.1, -0.18);
    }
    g.add(mesh(new THREE.BoxGeometry(0.48, 0.78, 0.08), WOOD_DARK, -0.22, 0.52, 0.54));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 0.04), 0x2a2733, -0.1, 0.52, 0.59, { cast: false }));
    addWindow(g, 0.42, 0.78, 0.54, 0.2, 0.22);
    addWindow(g, -0.62, 0.78, 0.54, 0.16, 0.18);
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.62, 0.08), WOOD_DARK, -0.72, 0.42, 0.68));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), IRON, -0.6, 0.44, 0.68));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.54, 0.08), IRON, -0.5, 0.42, 0.68));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.4, 0.08), IRON_LIGHT, -0.4, 0.38, 0.68));
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.22, 0.04), 0x3a62c8, -0.72, 0.62, 0.74, { cast: false }));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.62, 6), WOOD, 0.68, 0.38, 0.68));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.28, 0.1), WOOD, 0.68, 0.28, 0.68));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), 0xe2b48a, 0.68, 0.72, 0.68));
    addBanner(g, 0.72, 1.52 + lv * 0.1, -0.18);
  } else if (kind === "mage") {
    const rise = lv * 0.18;
    g.add(mesh(new THREE.BoxGeometry(1.28, 0.18, 1.28), STONE_DARK, 0, 0.09, 0));
    g.add(mesh(new THREE.BoxGeometry(1.02, 1.55 + rise, 1.02), lv >= 3 ? 0xb8a488 : STONE, 0, 0.94 + rise / 2, 0));
    g.add(mesh(new THREE.BoxGeometry(0.16, 1.4 + rise, 0.16), STONE_DARK, 0.52, 0.82 + rise / 2, 0.52));
    g.add(mesh(new THREE.BoxGeometry(0.16, 1.4 + rise, 0.16), STONE_DARK, -0.52, 0.82 + rise / 2, 0.52));
    g.add(mesh(new THREE.BoxGeometry(0.16, 1.4 + rise, 0.16), STONE_DARK, 0.52, 0.82 + rise / 2, -0.52));
    g.add(mesh(new THREE.BoxGeometry(0.16, 1.4 + rise, 0.16), STONE_DARK, -0.52, 0.82 + rise / 2, -0.52));
    g.add(mesh(new THREE.BoxGeometry(1.16, 0.14, 1.16), STONE_LIGHT, 0, 1.72 + rise, 0));
    addMerlons(g, 1.16, 1.16, 1.78 + rise, 0.12, 0.2 + lv * 0.04);
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.5, 0.08), WOOD_DARK, 0, 0.4, 0.54));
    addWindow(g, -0.28, 1.05 + rise * 0.4, 0.54, 0.16, 0.22);
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.24, 0.06), MAGIC, 0.3, 1.12 + rise * 0.4, 0.54, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.03, 0.18), PARCHMENT, -0.38, 0.42, 0.58, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(0.14, 0.03, 0.16), 0x5a8ee8, -0.36, 0.45, 0.56, { cast: false }));
    if (lv >= 1) g.add(mesh(new THREE.BoxGeometry(0.18, 0.24, 0.06), CRYSTAL, -0.3, 1.42 + rise * 0.3, 0.54, { cast: false }));
    if (lv >= 2) {
      g.add(mesh(new THREE.OctahedronGeometry(0.1, 0), MAGIC, 0.52, 1.9 + rise, 0.52, { cast: false }));
      g.add(mesh(new THREE.OctahedronGeometry(0.1, 0), MAGIC, -0.52, 1.9 + rise, -0.52, { cast: false }));
    }
    addBanner(g, 0.52, 2.05 + rise, -0.52);
    const aim = addAim();
    aim.position.set(0, 1.92 + rise, 0);
    aim.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), lv >= 3 ? GOLD : WOOD, 0, 0.18, 0.12, { rx: 0.45 }));
    const gem = mesh(new THREE.OctahedronGeometry(0.2 + lv * 0.04, 0), lv >= 3 ? 0xe8f6ff : CRYSTAL, 0, 0.42, 0.28);
    gem.userData.spin = true;
    aim.add(gem);
    aim.add(mesh(new THREE.OctahedronGeometry(0.08, 0), MAGIC, 0.16, 0.22, 0.08, { cast: false }));
    if (lv >= 3) {
      const orb = mesh(new THREE.OctahedronGeometry(0.1, 0), GOLD, -0.18, 0.3, 0.12, { cast: false });
      orb.userData.spin = true;
      aim.add(orb);
    }
    g.add(aim);
    g.userData.aim = aim;
  } else if (kind === "spikes") {
    const frame = lv >= 2 ? IRON : WOOD;
    g.add(mesh(new THREE.BoxGeometry(1.42, 0.08, 1.42), 0x3a2a1c, 0, 0.02, 0, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(1.18, 0.06, 1.18), lv >= 2 ? IRON : WOOD_DARK, 0, 0.04, 0, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(1.48, 0.1, 0.12), frame, 0, 0.12, 0.66));
    g.add(mesh(new THREE.BoxGeometry(1.48, 0.1, 0.12), frame, 0, 0.12, -0.66));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 1.48), frame, 0.66, 0.12, 0));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.1, 1.48), frame, -0.66, 0.12, 0));
    for (const [x, z] of [
      [-0.66, -0.66],
      [0.66, -0.66],
      [-0.66, 0.66],
      [0.66, 0.66],
    ]) {
      g.add(mesh(new THREE.BoxGeometry(0.08, 0.42 + lv * 0.08, 0.08), lv >= 2 ? IRON : WOOD_DARK, x, 0.28 + lv * 0.04, z));
      g.add(mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), lv >= 3 ? GOLD : ROPE, x + (x > 0 ? -0.12 : 0.12), 0.42 + lv * 0.08, z));
    }
    const span = 2 + (lv >= 2 ? 1 : 0);
    for (let z = -span; z <= span; z += 1) {
      for (let x = -span; x <= span; x += 1) {
        if ((x + z) % 2) continue;
        const h = 0.3 + lv * 0.08 + ((x * x + z * z) % 3) * 0.08;
        const shade = lv >= 3 ? ((x + z) % 4 === 0 ? GOLD : IRON_LIGHT) : (x + z) % 4 === 0 ? RUST : IRON;
        g.add(mesh(new THREE.ConeGeometry(0.07, h, 5), shade, x * 0.18, 0.08 + h / 2, z * 0.18, { cast: false }));
      }
    }
  } else if (kind === "workshop") {
    const shop = lv >= 2 ? STONE : WOOD;
    const shopTrim = lv >= 2 ? STONE_DARK : WOOD_DARK;
    const roof = lv >= 3 ? SLATE : 0x4a382c;
    g.add(mesh(new THREE.BoxGeometry(1.62, 0.14, 1.28), STONE_DARK, 0, 0.07, 0));
    g.add(mesh(new THREE.BoxGeometry(1.4, 0.78 + lv * 0.08, 1.05), shop, 0, 0.52 + lv * 0.04, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.78 + lv * 0.08, 1.05), shopTrim, -0.7, 0.52 + lv * 0.04, 0));
    g.add(mesh(new THREE.BoxGeometry(0.1, 0.78 + lv * 0.08, 1.05), shopTrim, 0.7, 0.52 + lv * 0.04, 0));
    addRidgeRoof(g, 1.72, 1.26, 0.58, 0.91 + lv * 0.08, roof);
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.48 + lv * 0.12, 0.28), STONE, -0.48, 1.18 + lv * 0.08, -0.12));
    g.add(mesh(new THREE.BoxGeometry(0.2, 0.22, 0.2), STONE_DARK, -0.48, 1.5 + lv * 0.14, -0.12));
    if (lv >= 1) g.add(mesh(new THREE.BoxGeometry(0.14, 0.18, 0.14), 0x2a2a30, -0.48, 1.68 + lv * 0.14, -0.12));
    g.add(mesh(new THREE.BoxGeometry(0.36, 0.62, 0.08), WOOD_DARK, 0.18, 0.42, 0.54));
    g.add(mesh(new THREE.BoxGeometry(0.58, 0.16, 0.42), IRON, -0.42, 0.2, 0.62));
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), IRON_LIGHT, -0.42, 0.36, 0.62));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.18, 0.04), IRON, -0.28, 0.46, 0.62));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.2, 8), lv >= 3 ? 0xff7a38 : 0xc45a28, 0.48, 0.22, 0.58));
    g.add(mesh(new THREE.BoxGeometry(0.22, 0.08, 0.18), WOOD, 0.48, 0.34, 0.58));
    g.add(mesh(new THREE.BoxGeometry(0.42, 0.08, 0.28), WOOD, 0.48, 0.42, -0.38));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), IRON, 0.38, 0.52, -0.32));
    g.add(mesh(new THREE.BoxGeometry(0.12, 0.04, 0.04), IRON, 0.42, 0.58, -0.32));
    addBarrel(g, -0.62, 0.14, -0.48, 0.22, 0.1);
    if (lv >= 1) addCrate(g, 0.62, 0.14, 0.58, 0.16);
    if (lv >= 2) {
      g.add(mesh(new THREE.BoxGeometry(0.36, 0.12, 0.28), IRON, 0.52, 0.2, -0.55));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), IRON_LIGHT, 0.52, 0.34, -0.55));
    }
    if (lv >= 3) {
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), 0xff8a40, -0.42, 0.5, 0.62, { cast: false }));
      addBanner(g, -0.62, 1.42 + lv * 0.08, -0.16);
    }
    addBanner(g, 0.62, 1.28 + lv * 0.08, -0.16);
  }
  g.userData.kind = kind;
  return g;
}

function paintGeo(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i += 1) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geo;
}

function voxelBox(w, h, d, x, y, z, hex, rot) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (rot) {
    const rx = rot.x || rot.rx || 0;
    const ry = rot.y || rot.ry || 0;
    const rz = rot.z || rot.rz || 0;
    if (rx) geo.rotateX(rx);
    if (ry) geo.rotateY(ry);
    if (rz) geo.rotateZ(rz);
  }
  geo.translate(x, y, z);
  return paintGeo(geo, hex);
}

function mergeGeos(geos) {
  let vcount = 0;
  let icount = 0;
  for (const g of geos) {
    vcount += g.attributes.position.count;
    icount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vcount * 3);
  const nrm = new Float32Array(vcount * 3);
  const col = new Float32Array(vcount * 3);
  const idx = new Uint32Array(icount);
  let vo = 0;
  let io = 0;
  let vbase = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, vo);
    nrm.set(g.attributes.normal.array, vo);
    col.set(g.attributes.color.array, vo);
    const vc = g.attributes.position.count;
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i += 1) idx[io + i] = ia[i] + vbase;
      io += ia.length;
    } else {
      for (let i = 0; i < vc; i += 1) idx[io + i] = vbase + i;
      io += vc;
    }
    vo += vc * 3;
    vbase += vc;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox();
  out.computeBoundingSphere();
  return out;
}

function addTroopTier(add, kind, level, p, dims) {
  if (level < 1) return;
  const { armW, armX, bodyW, bodyD, head, legW, legX } = dims;
  const plate = level >= 3 ? ELITE : level >= 2 ? PLATE : PLATE_DARK;
  const trim = level >= 3 ? GOLD : p.accent;
  const glow = level >= 3 ? CRYSTAL : p.steel;
  const rightX = armX;

  add("body", head + 1.5, 2.2, head + 1.3, 0, 24 + head - 0.55, 0.28, plate);
  add("leftArm", armW + 1.5, 3.5, 5.4, -armX, 22.3, 0.2, plate);
  add("rightArm", armW + 1.2, 3.2, 5.2, rightX, 22.3, 0.2, plate);

  if (level >= 2) {
    add("body", bodyW + 0.8, 7.6, 2.4, 0, 19.1, bodyD * 0.5 + 0.75, plate);
    add("leftLeg", legW + 0.8, 5.6, 4.8, -legX, 6.4, 0.35, plate);
    add("rightLeg", legW + 0.8, 5.6, 4.8, legX, 6.4, 0.35, plate);
    add("body", 2.6, 1.3, 1.3, 0, 21.5, bodyD * 0.5 + 1.45, trim);
  }

  if (level >= 3) {
    add("body", 1.5, 5.4, 1.5, 0, 24 + head + 2.6, 0, trim);
    add("body", 2.4, 2.4, 1.3, 0, 20.5, bodyD * 0.5 + 1.7, glow);
    add("body", 1.2, 1.2, 1.2, -2.2, 22.2, bodyD * 0.5 + 1.1, trim);
    add("body", 1.2, 1.2, 1.2, 2.2, 22.2, bodyD * 0.5 + 1.1, trim);
  }

  if (kind === "spearman") {
    add("leftArm", 5.4, 7.4, 1.4, -armX, 16.4, 2.1, plate);
    if (level >= 2) add("rightArm", 1.8, 1.8, 24, rightX, 11, 13, p.steel);
    if (level >= 3) add("rightArm", 3.2, 3.2, 3.2, rightX, 11, 25, glow);
  } else if (kind === "slinger") {
    add("body", 3.4, 4, 2.6, armX, 16.4, -1.6, p.wood);
    if (level >= 2) add("leftArm", 1.4, 12, 1.4, -armX - 0.5, 16.5, 4.2, trim, { rz: 0.4 });
    if (level >= 3) add("rightArm", 2.2, 2.2, 2.2, armX, 14.4, 5.2, glow);
  } else if (kind === "raider") {
    add("rightArm", 2.6, 2.2, 2.2, rightX, 11, 10.4, plate);
    add("leftArm", 1.8, 4.2, 1.8, -armX, 8.4, 1.4, plate);
    if (level >= 2) add("rightArm", 2.2, 1.6, 10, rightX, 11, 6, p.steel);
    if (level >= 3) {
      add("rightArm", 2.4, 2.4, 2.4, rightX, 11, 12.4, 0xff8a40);
      add("body", 3, 2.2, 1, 0, 23.2, bodyD * 0.5 + 1.5, 0xc45a28);
    }
  } else if (kind === "knight") {
    add("body", 6.6, 4.6, 2.6, 0, 23.8, bodyD * 0.5 + 0.9, plate);
    add("leftArm", armW + 1.4, 6.4, 5.6, -armX, 21.4, 0, plate);
    if (level >= 2) add("rightArm", 1.8, 1.8, 18, rightX, 11, 10, p.steel);
    if (level >= 3) {
      add("rightArm", 2.8, 2.8, 2.8, rightX, 11, 19, GOLD);
      add("body", 3.2, 1.6, 3.2, 0, 24 + head + 1.1, 0, GOLD);
    }
  } else if (kind === "warden") {
    add("rightArm", 4, 4, 4, rightX, 11, 20.4, trim);
    if (level >= 2) {
      add("body", head + 2.2, 4.2, head + 1.8, 0, 24 + head - 0.6, 0.4, p.shirt);
      add("rightArm", 2.4, 2.4, 2.4, rightX, 13.4, 18, MAGIC);
    }
    if (level >= 3) {
      add("rightArm", 4.4, 4.4, 4.4, rightX, 11, 22, glow);
      add("body", 2, 2, 2, -2.4, 24 + head + 1.2, 0.6, MAGIC);
      add("body", 2, 2, 2, 2.4, 24 + head + 1.2, 0.6, MAGIC);
    }
  }
}

function makeUnitGeometry(kind, level = 0) {
  const buckets = { body: [], leftArm: [], rightArm: [], leftLeg: [], rightLeg: [] };
  const px =
    kind === "ogre" || kind === "ram"
      ? 0.038
      : kind === "brute"
        ? 0.03
        : kind === "bat"
          ? 0.018
          : kind === "runner" || kind === "raider"
            ? 0.021
            : kind === "goblin" || kind === "spearman" || kind === "slinger" || kind === "climber"
              ? 0.022
              : 0.026;
  const bodyW = kind === "ogre" || kind === "ram" ? 12 : kind === "brute" ? 10 : kind === "bat" ? 6 : kind === "runner" || kind === "raider" ? 7 : 8;
  const bodyD = kind === "ogre" ? 8 : kind === "brute" ? 7 : 6;
  const armW = kind === "ogre" ? 5 : kind === "brute" ? 5 : kind === "runner" || kind === "raider" ? 3.5 : 4;
  const legW = kind === "ogre" ? 5 : kind === "brute" ? 5 : kind === "runner" || kind === "raider" ? 3.5 : 4;
  const head = kind === "ogre" ? 11 : kind === "brute" ? 9 : 8;
  const add = (bucket, sx, sy, sz, cx, cy, cz, hex, rot) => {
    buckets[bucket].push(voxelBox(sx * px, sy * px, sz * px, cx * px, cy * px, cz * px, hex, rot));
  };

  const palettes = {
    spearman: {
      skin: 0xe2b48a,
      shirt: 0x3a62c8,
      pants: 0x2a3040,
      shoes: 0x1c1c22,
      head: 0xe2b48a,
      accent: 0x2a468c,
      dark: 0x1a1c22,
      steel: 0x8b949e,
      wood: 0x5a3a22,
    },
    slinger: {
      skin: 0xe2b48a,
      shirt: 0x5a8a3a,
      pants: 0x3a4a28,
      shoes: 0x24180e,
      head: 0xe2b48a,
      accent: 0x3d5a22,
      dark: 0x1a1c22,
      steel: 0xc4b48a,
      wood: 0x6b4423,
    },
    raider: {
      skin: 0xe2b48a,
      shirt: 0xc45a28,
      pants: 0x4a2818,
      shoes: 0x1a120c,
      head: 0xe2b48a,
      accent: 0x8a3a14,
      dark: 0x1a1c22,
      steel: 0x8a8a82,
      wood: 0x4a3820,
    },
    knight: {
      skin: 0xe2b48a,
      shirt: 0xd9d4cc,
      pants: 0x2a3040,
      shoes: 0x1c1c22,
      head: 0x9aa4b0,
      accent: 0x6e7784,
      dark: 0x1a1c22,
      steel: 0x8b949e,
      wood: 0x5a3a22,
    },
    warden: {
      skin: 0xe2b48a,
      shirt: 0x6b4a9b,
      pants: 0x2a2040,
      shoes: 0x1c1c22,
      head: 0xe2b48a,
      accent: 0xd4b44a,
      dark: 0x1a1c22,
      steel: 0xd8c9a0,
      wood: 0x5a3a22,
    },
    goblin: {
      skin: 0x5dad32,
      shirt: 0x6b4428,
      pants: 0x3d2a18,
      shoes: 0x2a1c10,
      head: 0x62b536,
      accent: 0x3d8a22,
      dark: 0x14220c,
      steel: 0x6b5a3a,
      wood: 0x6b4423,
    },
    runner: {
      skin: 0x8fbf4a,
      shirt: 0x4a5a32,
      pants: 0x2e3820,
      shoes: 0x1a2014,
      head: 0x9cc85a,
      accent: 0x6a8a38,
      dark: 0x1a220c,
      steel: 0x6a6a5a,
      wood: 0x4a3820,
    },
    archer: {
      skin: 0x4e9a2e,
      shirt: 0x5a3a22,
      pants: 0x3a2818,
      shoes: 0x24180e,
      head: 0x58a834,
      accent: 0x3d2814,
      dark: 0x14180c,
      steel: 0xc4b48a,
      wood: 0x6b4423,
    },
    brute: {
      skin: 0x3d7a28,
      shirt: 0x4a3020,
      pants: 0x2a1c12,
      shoes: 0x1a120c,
      head: 0x45862c,
      accent: 0x5a5048,
      dark: 0x10140a,
      steel: 0x6a6560,
      wood: 0x5a3820,
    },
    ogre: {
      skin: 0x3a6a22,
      shirt: 0x4a2418,
      pants: 0x2a1810,
      shoes: 0x18140c,
      head: 0x427828,
      accent: 0x5a2018,
      dark: 0x0c1008,
      steel: 0xd8c9a0,
      wood: 0x4a3018,
    },
    bat: {
      skin: 0x3a4a28,
      shirt: 0x2a3820,
      pants: 0x1c2414,
      shoes: 0x14180c,
      head: 0x6a8a32,
      accent: 0x4a2818,
      dark: 0x10140a,
      steel: 0x8a7a5a,
      wood: 0x3a2814,
    },
    climber: {
      skin: 0x4e8a2a,
      shirt: 0x3a2a18,
      pants: 0x24180e,
      shoes: 0x1a120c,
      head: 0x58a030,
      accent: 0x6a5238,
      dark: 0x14180c,
      steel: 0x8a8a82,
      wood: 0x4a3018,
    },
    ram: {
      skin: 0x3a6a22,
      shirt: 0x5a3a22,
      pants: 0x2a1810,
      shoes: 0x18140c,
      head: 0x427828,
      accent: 0x6e5840,
      dark: 0x0c1008,
      steel: 0x8a8a82,
      wood: 0x6b4423,
    },
  };
  const p = palettes[kind] || palettes.goblin;
  const legX = bodyW * 0.25;
  const armX = bodyW * 0.5 + armW * 0.5;
  const headY = 24 + head * 0.5;
  const headZ = kind === "ogre" ? 2 : 0;

  add("leftLeg", legW, 12, 4, -legX, 6, 0, p.pants);
  add("rightLeg", legW, 12, 4, legX, 6, 0, p.pants);
  add("leftLeg", legW, 3, 5, -legX, 1.4, 0.6, p.shoes);
  add("rightLeg", legW, 3, 5, legX, 1.4, 0.6, p.shoes);
  add("body", bodyW, 12, bodyD, 0, 18, 0, p.shirt);
  add("body", bodyW * 0.7, 2, bodyD + 0.6, 0, 12.4, 0, p.accent);

  if (kind === "runner" || kind === "bat") {
    add("leftArm", armW, 4, 12, -armX, 22, 6, p.skin);
    add("rightArm", armW, 4, 12, armX, 22, 6, p.skin);
    add("leftArm", armW, 4, 4, -armX, 22, 13, p.skin);
    add("rightArm", armW, 4, 4, armX, 22, 13, p.skin);
  } else {
    add("leftArm", armW, 12, 4, -armX, 18, 0, p.skin);
    add("leftArm", armW, 4, 4, -armX, 10, 0, p.skin);
    if (kind === "archer" || kind === "slinger") {
      add("rightArm", armW, 10, 4, armX, 20, 2, p.skin);
      add("rightArm", armW, 4, 4, armX, 14, 4, p.skin);
    } else {
      add("rightArm", armW, 12, 4, armX, 18, 0, p.skin);
      add("rightArm", armW, 4, 4, armX, 10, 0, p.skin);
    }
  }

  add("body", head, head, head, 0, headY, headZ, p.head);

  if (kind === "spearman") {
    add("body", 1.6, 1.1, 0.5, -1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", 1.6, 1.1, 0.5, 1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", head + 0.8, 2.4, head + 0.6, 0, 24 + head - 0.4, 0.2, p.accent);
    add("leftArm", armW + 0.6, 5, 4.6, -armX, 21, 0, p.shirt);
    add("rightArm", 1.4, 1.4, 20, armX, 11, 11, p.steel);
    add("rightArm", 2.6, 2.2, 2.2, armX, 11, 2.2, p.wood);
    add("rightArm", 2.4, 2.4, 3.4, armX, 11, 21.4, p.steel);
  } else if (kind === "slinger") {
    add("body", 1.3, 1.3, 0.5, -1.6, 27.2, head * 0.5, p.dark);
    add("body", 1.3, 1.3, 0.5, 1.6, 27.2, head * 0.5, p.dark);
    add("body", head + 0.8, 3, head + 0.6, 0, 24.6, 0.3, p.accent);
    add("leftArm", 1.2, 10, 1.2, -armX - 0.4, 16, 4, p.wood, { rz: 0.4 });
    add("body", 2.6, 3.2, 2.2, armX, 16, -1.4, p.wood);
    add("rightArm", 1.8, 1.8, 1.8, armX, 14.4, 4.2, p.skin);
  } else if (kind === "raider") {
    add("body", 1.6, 1.2, 0.5, -1.5, 27.4, head * 0.5, p.dark);
    add("body", 1.6, 1.2, 0.5, 1.5, 27.4, head * 0.5, p.dark);
    add("body", head + 0.4, 2.2, head + 0.2, 0, 24.8, 0.3, p.accent);
    add("rightArm", 1.6, 1.6, 8, armX, 11, 5.2, p.steel);
    add("rightArm", 5.2, 4.2, 2.2, armX, 11, 10.2, p.steel);
    add("leftArm", 1.4, 3.2, 1.4, -armX, 8.5, 1.2, p.steel);
  } else if (kind === "knight") {
    add("body", head + 1.2, 3.2, head + 1.2, 0, 24.2, 0.3, p.accent);
    add("body", 5.6, 2.6, 1, 0, 28.5, head * 0.5 + 0.4, 0x5a646e);
    add("body", 1.9, 1.5, 0.55, -1.8, 27.6, head * 0.5 + 0.55, p.dark);
    add("body", 1.9, 1.5, 0.55, 1.8, 27.6, head * 0.5 + 0.55, p.dark);
    add("body", 2.8, 1.3, 2.8, 0, 24 + head + 0.55, 0, 0xe8e8ea);
    add("body", 6.2, 4.2, 2.2, 0, 23.6, bodyD * 0.5 + 0.7, p.accent);
    add("body", 3.6, 4, 1.4, 0, 20.2, bodyD * 0.5 + 1, p.accent);
    add("leftArm", armW + 1, 6, 5.2, -armX, 21.2, 0, p.head);
    add("rightArm", 1.5, 1.5, 15, armX, 11, 8.4, p.steel);
    add("rightArm", 4.2, 1.5, 1.5, armX, 11, 2.2, p.wood);
    add("rightArm", 1.4, 1.4, 2.2, armX, 11, 0.8, p.wood);
  } else if (kind === "warden") {
    add("body", 1.6, 1.1, 0.5, -1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", 1.6, 1.1, 0.5, 1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", head + 1.8, 3.6, head + 1.4, 0, 24 + head - 0.8, 0.3, p.accent);
    add("body", head + 0.8, 7, 3.2, 0, 24 + head * 0.2, -2.2, p.shirt);
    add("body", bodyW + 1.4, 14, bodyD + 1.2, 0, 17, 0.4, p.shirt);
    add("rightArm", 1.5, 1.5, 18, armX, 11, 10, p.wood);
    add("rightArm", 3.8, 3.8, 3.8, armX, 11, 20, p.accent);
  } else if (kind === "goblin") {
    add("body", 2.4, 4, 1.2, -head * 0.55, 28.5, 0, p.head);
    add("body", 2.4, 4, 1.2, head * 0.55, 28.5, 0, p.head);
    add("body", 1.2, 1.2, 0.5, -1.6, 27.2, head * 0.5, p.dark);
    add("body", 1.2, 1.2, 0.5, 1.6, 27.2, head * 0.5, p.dark);
    add("body", 1.1, 2.2, 1.1, -1.5, 24.4, head * 0.5, 0xf0e0c0);
    add("body", 1.1, 2.2, 1.1, 1.5, 24.4, head * 0.5, 0xf0e0c0);
    add("rightArm", 2.6, 2.6, 10, armX, 11, 6.2, p.wood);
    add("rightArm", 4.4, 4.4, 4.4, armX, 11, 12.4, p.wood);
  } else if (kind === "runner") {
    add("body", 1.6, 1.2, 0.5, -1.5, 27.4, head * 0.5, p.dark);
    add("body", 1.6, 1.2, 0.5, 1.5, 27.4, head * 0.5, p.dark);
    add("body", 3.2, 1.6, 0.6, 0, 25.2, head * 0.5, 0x3a2018);
    add("body", bodyW * 0.35, 6, 0.5, 0, 19, bodyD * 0.5 + 0.2, p.accent);
  } else if (kind === "archer") {
    add("body", head + 1.6, 4, head + 1.4, 0, 24 + head - 1, 0.4, p.accent);
    add("body", head + 0.6, 6, 3, 0, 24 + head * 0.35, -2.2, p.accent);
    add("body", 1.3, 1.3, 0.5, -1.6, 27.2, head * 0.5, p.dark);
    add("body", 1.3, 1.3, 0.5, 1.6, 27.2, head * 0.5, p.dark);
    add("leftArm", 1.2, 14, 1.2, -armX - 1, 20, 6, p.wood, { rz: 0.18 });
    add("leftArm", 0.4, 12, 0.4, -armX + 2.2, 20, 6, 0xefe6d2);
    add("body", 2.2, 6, 2.2, 0, 20, -bodyD * 0.5 - 1.4, p.wood);
    add("body", 0.7, 7, 0.7, 0, 21, -bodyD * 0.5 - 1.4, p.steel);
  } else if (kind === "bat") {
    add("body", 2.2, 3.2, 1, -head * 0.45, 28.2, 0, p.head);
    add("body", 2.2, 3.2, 1, head * 0.45, 28.2, 0, p.head);
    add("body", 1.1, 1.1, 0.5, -1.3, 27, head * 0.45, p.dark);
    add("body", 1.1, 1.1, 0.5, 1.3, 27, head * 0.45, p.dark);
    add("leftArm", 2, 3, 14, -armX, 22, 2, p.accent);
    add("rightArm", 2, 3, 14, armX, 22, 2, p.accent);
    add("leftArm", 1.2, 8, 3, -armX - 2, 20, 8, p.shirt);
    add("rightArm", 1.2, 8, 3, armX + 2, 20, 8, p.shirt);
  } else if (kind === "climber") {
    add("body", 2.2, 4.2, 1.1, -head * 0.5, 28.6, 0, p.head);
    add("body", 2.2, 4.2, 1.1, head * 0.5, 28.6, 0, p.head);
    add("body", 1.2, 1.2, 0.5, -1.5, 27.2, head * 0.5, p.dark);
    add("body", 1.2, 1.2, 0.5, 1.5, 27.2, head * 0.5, p.dark);
    add("leftArm", 2.2, 2.2, 3.6, -armX, 9, 2.4, p.steel);
    add("rightArm", 2.2, 2.2, 3.6, armX, 9, 2.4, p.steel);
    add("body", bodyW * 0.4, 5, 0.6, 0, 18, bodyD * 0.5 + 0.3, p.accent);
  } else if (kind === "ram") {
    add("body", 3.2, 6, 2, -head * 0.4, 24 + head + 1, 1, p.head);
    add("body", 3.2, 6, 2, head * 0.4, 24 + head + 1, 1, p.head);
    add("body", 2.2, 2.2, 0.7, -2.2, 28, head * 0.5 + 1.2, p.dark);
    add("body", 2.2, 2.2, 0.7, 2.2, 28, head * 0.5 + 1.2, p.dark);
    add("body", 8, 5, 4, 0, 16, bodyD * 0.5 + 2.4, p.wood);
    add("body", 3.2, 3.2, 6, 0, 16, bodyD * 0.5 + 6, p.wood);
    add("body", 2.2, 2.2, 2.2, 0, 16, bodyD * 0.5 + 9.2, p.steel);
    add("rightArm", 5, 12, 5, armX, 16, 2, p.wood);
  } else if (kind === "brute") {
    add("body", 2.8, 5, 1.4, -head * 0.55, 29, 0, p.head);
    add("body", 2.8, 5, 1.4, head * 0.55, 29, 0, p.head);
    add("body", 1.6, 1.6, 0.6, -1.8, 27.4, head * 0.5, p.dark);
    add("body", 1.6, 1.6, 0.6, 1.8, 27.4, head * 0.5, p.dark);
    add("body", 1.4, 2.8, 1.4, -1.7, 24.2, head * 0.5, 0xf2e4c4);
    add("body", 1.4, 2.8, 1.4, 1.7, 24.2, head * 0.5, 0xf2e4c4);
    add("leftArm", 7, 4, 6, -armX, 23.5, 0, p.accent);
    add("rightArm", 7, 4, 6, armX, 23.5, 0, p.accent);
    add("rightArm", 3.4, 3.4, 12, armX, 12, 7.2, p.wood);
    add("rightArm", 5.6, 5.6, 5.6, armX, 12, 14.4, p.wood);
    add("rightArm", 2, 2.6, 2.6, armX, 12, 17.6, p.steel);
    add("rightArm", 2, 2.6, 2.6, armX, 12, 11.2, p.steel);
  } else {
    add("body", 3.2, 6, 2, -head * 0.4, 24 + head + 1, 1, p.head);
    add("body", 3.2, 6, 2, head * 0.4, 24 + head + 1, 1, p.head);
    add("body", 2.2, 2.2, 0.7, -2.2, 28, head * 0.5 + 1.2, p.dark);
    add("body", 2.2, 2.2, 0.7, 2.2, 28, head * 0.5 + 1.2, p.dark);
    add("body", 4, 2.4, 0.8, 0, 25.2, head * 0.5 + 1.4, 0x3a1810);
    add("body", 2, 3.4, 2, -2.2, 23.6, head * 0.5 + 1.2, 0xf0e0c4);
    add("body", 2, 3.4, 2, 2.2, 23.6, head * 0.5 + 1.2, 0xf0e0c4);
    add("body", bodyW * 0.9, 8, bodyD + 2, 0, 16, 1.2, p.shirt);
    add("rightArm", 4.4, 4.4, 14, armX, 12, 8, p.wood);
    add("rightArm", 6.2, 6.2, 6.2, armX, 12, 16, p.wood);
    add("rightArm", 2.8, 2.8, 5, armX, 12, 20, p.steel);
  }

  if (TROOP_KINDS.includes(kind)) {
    addTroopTier(add, kind, level, p, { armW, armX, bodyW, bodyD, head, legW, legX });
  }

  const pivots = {
    body: { x: 0, y: 0, z: 0 },
    leftLeg: { x: -legX * px, y: 12 * px, z: 0 },
    rightLeg: { x: legX * px, y: 12 * px, z: 0 },
    leftArm: { x: -armX * px, y: 24 * px, z: 0 },
    rightArm: { x: armX * px, y: 24 * px, z: 0 },
  };
  const bake = (name) => {
    const geo = mergeGeos(buckets[name]);
    const pvt = pivots[name];
    if (pvt.x || pvt.y || pvt.z) geo.translate(-pvt.x, -pvt.y, -pvt.z);
    return geo;
  };
  const raised = false;
  const shambling = kind === "runner" || kind === "bat";
  return {
    body: bake("body"),
    leftArm: bake("leftArm"),
    rightArm: bake("rightArm"),
    leftLeg: bake("leftLeg"),
    rightLeg: bake("rightLeg"),
    pivots,
    raised,
    shambling,
    cadence: kind === "bat" ? 13.5 : kind === "runner" || kind === "raider" ? 10.5 : kind === "ogre" || kind === "brute" || kind === "knight" || kind === "ram" ? 6.2 : 8.2,
  };
}

const TROOP_PORTRAIT_KINDS = ["spearman", "slinger", "raider", "knight", "warden"];
const UNIT_PART_NAMES = ["body", "leftLeg", "rightLeg", "leftArm", "rightArm"];

function assembledUnitGeometry(kind, level = 0) {
  const rig = makeUnitGeometry(kind, level);
  const geos = [];
  for (const name of UNIT_PART_NAMES) {
    const geo = rig[name].clone();
    const p = rig.pivots[name];
    geo.translate(p.x, p.y, p.z);
    geos.push(geo);
  }
  const merged = mergeGeos(geos);
  for (const geo of geos) geo.dispose();
  for (const name of UNIT_PART_NAMES) rig[name].dispose();
  return merged;
}

function makeTroopPortraits() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0xefe4c4, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const portraits = {};
  const center = new THREE.Vector3();
  const span = new THREE.Vector3();
  for (const kind of TROOP_PORTRAIT_KINDS) {
    for (let lv = 0; lv < TROOP_LEVELS; lv += 1) {
      const geo = assembledUnitGeometry(kind, lv);
      const scene = new THREE.Scene();
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const mesh = new THREE.Mesh(geo, material);
      scene.add(mesh);
      scene.add(new THREE.AmbientLight(0xfff0d8, 0.9));
      const key = new THREE.DirectionalLight(0xfff4d4, 1.2);
      key.position.set(1.5, 2.6, 1.9);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0x9ab8d8, 0.32);
      fill.position.set(-1.8, 1.1, 0.6);
      scene.add(fill);

      geo.computeBoundingBox();
      geo.boundingBox.getCenter(center);
      geo.boundingBox.getSize(span);
      mesh.position.set(-center.x, -center.y, -center.z);

      const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 24);
      const dist = Math.max(span.x, span.y, span.z) * 1.72;
      cam.position.set(dist * 0.62, dist * 0.18, dist * 1.08);
      cam.lookAt(0, span.y * 0.04, 0);
      renderer.render(scene, cam);
      const url = canvas.toDataURL("image/png");
      portraits[`${kind}:${lv}`] = url;
      if (lv === 0) portraits[kind] = url;
      geo.dispose();
      material.dispose();
    }
  }
  renderer.dispose();
  return portraits;
}

function stampScale() {
  return { x: 1, z: 1 };
}

function makeFlag() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05), 0xeee6d6, 0, 0.6, 0));
  g.add(mesh(new THREE.BoxGeometry(0.38, 0.2, 0.03), FLAG, 0.2, 1.05, 0));
  return g;
}

function makeBolt() {
  return mesh(new THREE.BoxGeometry(0.12, 0.12, 0.28), 0x5a3a1a, 0, 0, 0);
}

function makeBall() {
  return mesh(new THREE.IcosahedronGeometry(0.16, 0), 0x222228, 0, 0, 0);
}

export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c4ea);
  scene.fog = new THREE.Fog(0x7ec6ea, 70, 260);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 2800);
  const { w, d } = fieldSize();
  const home = keepCenter();
  const flyMargin = 90;
  const CAM_START_Y = 30;
  const CAM_MAX_Y = 54;
  const CAM_START_PITCH = 0.7;
  const eye = {
    x: home.x,
    y: CAM_START_Y,
    z: home.z + 28,
    yaw: Math.PI,
    pitch: CAM_START_PITCH,
    vx: 0,
    vy: 0,
    vz: 0,
  };
  let sprint = false;
  let lastForwardTap = 0;

  const keys = new Set();
  const sun = new THREE.DirectionalLight(0xfff4d4, 1.35);
  sun.position.set(w / 2 + 160, 240, d / 2 + 90);
  sun.target.position.set(w / 2, 0, d / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -400;
  sun.shadow.camera.right = 400;
  sun.shadow.camera.top = 450;
  sun.shadow.camera.bottom = -450;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 1200;
  sun.shadow.radius = 2;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.08;
  const ambient = new THREE.AmbientLight(0xfff0d8, 0.42);
  const hemi = new THREE.HemisphereLight(0xd7ecff, 0xa8b86a, 0.48);
  const sky = makeSky();
  sky.position.set(w / 2, 0, d / 2);
  scene.add(sun, sun.target, ambient, hemi, sky);

  const heightAt = new Float32Array(COLS * ROWS);

  function sampleHeight(x, z) {
    return terrainHeight(x, z);
  }

  function groundY(x, z) {
    return sampleHeight(x, z);
  }

  function plantY(x, z, sink = 0.08) {
    return sampleHeight(x, z) - sink + 0.12;
  }

  const LOOKS = {
    day: {
      bg: 0x87c4ea,
      fog: 0x7ec6ea,
      fogNear: 70,
      fogFar: 260,
      sun: 0xfff4d4,
      sunI: 1.35,
      sunY: 240,
      sunX: w / 2 + 160,
      sunZ: d / 2 + 90,
      amb: 0xfff0d8,
      ambI: 0.42,
      hemiSky: 0xd7ecff,
      hemiGround: 0xa8b86a,
      hemiI: 0.48,
      exposure: 1,
      sky: 0xffffff,
      rain: false,
    },
    dusk: {
      bg: 0xc47a4a,
      fog: 0xc48a68,
      fogNear: 80,
      fogFar: 280,
      sun: 0xffb070,
      sunI: 0.85,
      sunY: 90,
      sunX: w / 2 + 280,
      sunZ: d / 2 + 40,
      amb: 0xffc8a0,
      ambI: 0.32,
      hemiSky: 0xffc090,
      hemiGround: 0x6a5840,
      hemiI: 0.4,
      exposure: 0.92,
      sky: 0xffc8a8,
      rain: false,
    },
    night: {
      bg: 0x1a2848,
      fog: 0x243658,
      fogNear: 60,
      fogFar: 220,
      sun: 0xc8d8ff,
      sunI: 0.38,
      sunY: 70,
      sunX: w / 2 - 80,
      sunZ: d / 2 + 200,
      amb: 0x6a7aa8,
      ambI: 0.22,
      hemiSky: 0x3a5080,
      hemiGround: 0x2a3828,
      hemiI: 0.28,
      exposure: 0.78,
      sky: 0x6a88c8,
      rain: false,
    },
    storm: {
      bg: 0x2a3340,
      fog: 0x4a5560,
      fogNear: 40,
      fogFar: 170,
      sun: 0xb8c4d0,
      sunI: 0.28,
      sunY: 110,
      sunX: w / 2 + 40,
      sunZ: d / 2 + 60,
      amb: 0x8898a8,
      ambI: 0.26,
      hemiSky: 0x607080,
      hemiGround: 0x3a4438,
      hemiI: 0.22,
      exposure: 0.72,
      sky: 0x8898a8,
      rain: true,
    },
  };

  const atmosCur = { ...LOOKS.day };
  const colA = new THREE.Color();
  const colB = new THREE.Color();
  let rainOn = false;
  const MAX_RAIN = 240;
  const rainPos = new Float32Array(MAX_RAIN * 3);
  for (let i = 0; i < MAX_RAIN; i += 1) {
    rainPos[i * 3] = (Math.random() - 0.5) * 80;
    rainPos[i * 3 + 1] = Math.random() * 40;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  const rainMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.035, 0.55, 0.035),
    new THREE.MeshBasicMaterial({ color: 0xb8cce0, transparent: true, opacity: 0.45, depthWrite: false }),
    MAX_RAIN
  );
  rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  rainMesh.castShadow = false;
  rainMesh.frustumCulled = false;
  rainMesh.visible = false;
  scene.add(rainMesh);
  let lastRain = performance.now();
  const rainDummy = new THREE.Object3D();

  function lookName(wave, phase) {
    if (phase === "prep" || phase === "menu" || !wave) return "day";
    const n = phase === "between" ? wave + 1 : wave;
    if (n <= 3) return "day";
    if (n <= 5) return "dusk";
    if (n <= 7) return "night";
    return "storm";
  }

  function lerpLook(from, to, t) {
    const mix = (a, b) => a + (b - a) * t;
    colA.setHex(from.bg);
    colB.setHex(to.bg);
    atmosCur.bg = colA.lerp(colB, t).getHex();
    colA.setHex(from.fog);
    colB.setHex(to.fog);
    atmosCur.fog = colA.lerp(colB, t).getHex();
    colA.setHex(from.sun);
    colB.setHex(to.sun);
    atmosCur.sun = colA.lerp(colB, t).getHex();
    colA.setHex(from.amb);
    colB.setHex(to.amb);
    atmosCur.amb = colA.lerp(colB, t).getHex();
    colA.setHex(from.hemiSky);
    colB.setHex(to.hemiSky);
    atmosCur.hemiSky = colA.lerp(colB, t).getHex();
    colA.setHex(from.hemiGround);
    colB.setHex(to.hemiGround);
    atmosCur.hemiGround = colA.lerp(colB, t).getHex();
    colA.setHex(from.sky);
    colB.setHex(to.sky);
    atmosCur.sky = colA.lerp(colB, t).getHex();
    atmosCur.fogNear = mix(from.fogNear, to.fogNear);
    atmosCur.fogFar = mix(from.fogFar, to.fogFar);
    atmosCur.sunI = mix(from.sunI, to.sunI);
    atmosCur.sunY = mix(from.sunY, to.sunY);
    atmosCur.sunX = mix(from.sunX, to.sunX);
    atmosCur.sunZ = mix(from.sunZ, to.sunZ);
    atmosCur.ambI = mix(from.ambI, to.ambI);
    atmosCur.hemiI = mix(from.hemiI, to.hemiI);
    atmosCur.exposure = mix(from.exposure, to.exposure);
    atmosCur.rain = to.rain;
  }

  let atmosTarget = LOOKS.day;
  function applyLook() {
    scene.background.setHex(atmosCur.bg);
    scene.fog.color.setHex(atmosCur.fog);
    scene.fog.near = atmosCur.fogNear;
    scene.fog.far = atmosCur.fogFar;
    sun.color.setHex(atmosCur.sun);
    sun.intensity = atmosCur.sunI;
    sun.position.set(atmosCur.sunX, atmosCur.sunY, atmosCur.sunZ);
    ambient.color.setHex(atmosCur.amb);
    ambient.intensity = atmosCur.ambI;
    hemi.color.setHex(atmosCur.hemiSky);
    hemi.groundColor.setHex(atmosCur.hemiGround);
    hemi.intensity = atmosCur.hemiI;
    renderer.toneMappingExposure = atmosCur.exposure;
    sky.material.color.setHex(atmosCur.sky);
    rainOn = Boolean(atmosCur.rain);
  }

  function setAtmosphere({ wave = 0, phase = "prep" } = {}) {
    atmosTarget = LOOKS[lookName(wave, phase)] || LOOKS.day;
    lerpLook(atmosCur, atmosTarget, 0.08);
    applyLook();
  }

  function stepRain() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastRain) / 1000);
    lastRain = now;
    if (!rainOn) {
      rainMesh.visible = false;
      return;
    }
    rainMesh.visible = true;
    const cx = camera.position.x;
    const cy = camera.position.y;
    const cz = camera.position.z;
    const span = 48;
    const drop = 34 * dt;
    for (let i = 0; i < MAX_RAIN; i += 1) {
      let x = rainPos[i * 3] + cx;
      let y = rainPos[i * 3 + 1] + cy;
      let z = rainPos[i * 3 + 2] + cz;
      y -= drop;
      x += (i % 5) * 0.02;
      if (y < cy - 18) y += 36;
      if (x < cx - span) x += span * 2;
      if (x > cx + span) x -= span * 2;
      if (z < cz - span) z += span * 2;
      if (z > cz + span) z -= span * 2;
      rainPos[i * 3] = x - cx;
      rainPos[i * 3 + 1] = y - cy;
      rainPos[i * 3 + 2] = z - cz;
      rainDummy.position.set(x, y, z);
      rainDummy.rotation.set(0.18, 0, 0.05);
      rainDummy.scale.set(1, 1, 1);
      rainDummy.updateMatrix();
      rainMesh.setMatrixAt(i, rainDummy.matrix);
    }
    rainMesh.count = MAX_RAIN;
    rainMesh.instanceMatrix.needsUpdate = true;
  }

  const planeW = w + 2400;
  const planeD = d + 2400;
  const terrain = new THREE.Mesh(
    livingGround(planeW, planeD, 260, 260, (x, z) => sampleHeight(x + w / 2, z + d / 2)),
    grassMat(paintGroundTexture(planeW, planeD, w / 2, d / 2))
  );
  terrain.position.set(w / 2, 0, d / 2);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  scene.add(terrain);

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(18000, 18000, 1, 1),
    new THREE.MeshLambertMaterial({
      color: 0x38badc,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(w / 2, terrainHeight(0, 0), d / 2);
  ocean.receiveShadow = true;
  ocean.castShadow = false;
  scene.add(ocean);

  const deco = new THREE.Group();
  scene.add(deco);
  const rand = seeded(41);

  function placeOnGround(obj, x, z, sink = 0.1) {
    obj.position.set(x, sampleHeight(x, z) - sink, z);
    deco.add(obj);
  }

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      const ground = tileTerrain(c, r);
      const p = tileCenter(c, r);
      heightAt[r * COLS + c] = sampleHeight(p.x, p.z);
      if (ground === "forest") {
        if ((c + r * 3) % 5 !== 0) continue;
        if (rand() > 0.4) continue;
        const tree = makeTree(rand, 1.8 + rand() * 0.8);
        tree.rotation.y = rand() * Math.PI * 2;
        placeOnGround(tree, p.x + (rand() - 0.5) * 1.6, p.z + (rand() - 0.5) * 1.6, 0.2);
      }
      if (ground === "rock" && (c + r) % 4 === 0 && rand() > 0.35) {
        const rock = makeRock(rand);
        rock.rotation.set(0, rand() * Math.PI * 2, 0);
        const s = 8 + rand() * 10;
        rock.scale.set(s * (0.8 + rand() * 0.5), s * (0.45 + rand() * 0.35), s * (0.8 + rand() * 0.45));
        rock.castShadow = true;
        rock.receiveShadow = true;
        placeOnGround(rock, p.x + (rand() - 0.5) * 0.6, p.z + (rand() - 0.5) * 0.6, 0.2);
      }
    }
  }

  for (let i = 0; i < 5; i += 1) {
    const cloud = new THREE.Group();
    for (let p = 0; p < 3; p += 1) {
      const puff = mesh(new THREE.SphereGeometry(1.3, 10, 8), 0xf7fbff, (p - 1) * 1.3, rand() * 0.3, 0, {
        mat: { fog: false },
        cast: false,
      });
      puff.scale.set(1.2 + rand() * 0.5, 0.65, 0.9 + rand() * 0.3);
      cloud.add(puff);
    }
    const spot = ringPoint(w, d, 10, 30, rand);
    cloud.position.set(spot.x, 140 + rand() * 50, spot.z);
    cloud.scale.setScalar(5);
    deco.add(cloud);
  }

  deco.traverse((child) => {
    if (child.isMesh) child.castShadow = false;
  });

  const k0 = tileCenter(KEEP_TILES[0][0], KEEP_TILES[0][1]);
  const k1 = tileCenter(KEEP_TILES[3][0], KEEP_TILES[3][1]);
  const keepX = (k0.x + k1.x) / 2;
  const keepZ = (k0.z + k1.z) / 2;

  const gridPts = [];
  for (let c = 0; c <= COLS; c += 1) {
    gridPts.push(c * TILE, plantY(c * TILE, 0, -0.16), 0, c * TILE, plantY(c * TILE, d, -0.16), d);
  }
  for (let r = 0; r <= ROWS; r += 1) {
    gridPts.push(0, plantY(0, r * TILE, -0.16), r * TILE, w, plantY(w, r * TILE, -0.16), r * TILE);
  }
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3)),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 })
  );
  grid.visible = false;
  scene.add(grid);

  const ghost = makeBuilding("wall");
  ghost.visible = false;
  ghost.traverse((child) => {
    if (child.material) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = 0.45;
    }
  });
  scene.add(ghost);

  const wallGhost = new THREE.Mesh(
    makeWallGeometry(),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.45 })
  );
  wallGhost.castShadow = false;
  wallGhost.visible = false;
  scene.add(wallGhost);

  const gateGhostGeos = [0, 1, 2, 3].map((lv) => makeGateGeometry(lv));
  const gateGhost = new THREE.Mesh(
    gateGhostGeos[0],
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.45 })
  );
  gateGhost.castShadow = false;
  gateGhost.visible = false;
  gateGhost.userData.level = 0;
  scene.add(gateGhost);

  const wallPost = mesh(new THREE.CylinderGeometry(0.14, 0.16, WALL_VIS_H, 6), 0x6adf7a, 0, WALL_VIS_HALF, 0, {
    mat: { transparent: true, opacity: 0.7 },
    cast: false,
  });
  wallPost.visible = false;
  scene.add(wallPost);

  const wallPostEnd = wallPost.clone();
  wallPostEnd.traverse((child) => {
    if (child.material) child.material = child.material.clone();
  });
  wallPostEnd.visible = false;
  scene.add(wallPostEnd);

  const snapRing = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.4, 10),
    new THREE.MeshBasicMaterial({
      color: 0xfff4a3,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  snapRing.rotation.x = -Math.PI / 2;
  snapRing.visible = false;
  scene.add(snapRing);

  const rangeRing = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  );
  rangeRing.rotation.x = -Math.PI / 2;
  rangeRing.position.y = 0.07;
  rangeRing.visible = false;
  scene.add(rangeRing);

  const hover = mesh(new THREE.PlaneGeometry(1, 1), 0xffffff, 0, 0.05, 0, {
    rx: -Math.PI / 2,
    mat: { transparent: true, opacity: 0.22, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 },
    cast: false,
  });
  hover.visible = false;
  scene.add(hover);

  const marquee = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: 0x7ecbff,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  marquee.rotation.x = -Math.PI / 2;
  marquee.visible = false;
  scene.add(marquee);

  const marqueeEdge = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, -0.5),
      new THREE.Vector3(0.5, 0, 0.5),
      new THREE.Vector3(-0.5, 0, 0.5),
      new THREE.Vector3(-0.5, 0, -0.5),
    ]),
    new THREE.LineBasicMaterial({ color: 0xd8f2ff })
  );
  marqueeEdge.visible = false;
  scene.add(marqueeEdge);

  const buildings = new Map();
  const boats = new Map();
  const flags = new Map();
  const dummy = new THREE.Object3D();
  const MAX_UNITS = 640;
  const MAX_WALLS = 400;
  const MAX_SHOTS = 96;
  const unitMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const unitLayer = {};
  const lastPose = new Map();
  const tintColor = new THREE.Color();
  const partDummy = new THREE.Object3D();
  const PARTS = ["body", "leftLeg", "rightLeg", "leftArm", "rightArm"];
  function makeUnitMesh(geo) {
    const mesh = new THREE.InstancedMesh(geo, unitMat, MAX_UNITS);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_UNITS * 3), 3);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }
  function makeUnitLayer(kind, level = 0) {
    const rig = makeUnitGeometry(kind, level);
    const meshes = {};
    for (const name of PARTS) meshes[name] = makeUnitMesh(rig[name]);
    return {
      meshes,
      pivots: rig.pivots,
      raised: rig.raised,
      shambling: rig.shambling,
      cadence: rig.cadence,
    };
  }
  for (const kind of ENEMY_KINDS) unitLayer[kind] = makeUnitLayer(kind, 0);
  for (const kind of TROOP_KINDS) {
    for (let lv = 0; lv < TROOP_LEVELS; lv += 1) unitLayer[`${kind}:${lv}`] = makeUnitLayer(kind, lv);
  }

  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const wallMeshes = [];
  for (let lv = 0; lv < TROOP_LEVELS; lv += 1) {
    const wallMesh = new THREE.InstancedMesh(makeWallGeometry(lv), wallMat, MAX_WALLS);
    wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wallMesh.frustumCulled = false;
    wallMesh.count = 0;
    wallMesh.visible = false;
    scene.add(wallMesh);
    wallMeshes.push(wallMesh);
  }

  const gateMeshes = [];
  for (let lv = 0; lv < TROOP_LEVELS; lv += 1) {
    const gateMesh = new THREE.InstancedMesh(makeGateGeometry(lv), wallMat, MAX_WALLS);
    gateMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    gateMesh.castShadow = true;
    gateMesh.receiveShadow = true;
    gateMesh.frustumCulled = false;
    gateMesh.count = 0;
    gateMesh.visible = false;
    scene.add(gateMesh);
    gateMeshes.push(gateMesh);
  }

  const boltMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.46), mat(0x5a3a1a), MAX_SHOTS);
  const ballMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 0), mat(0x222228), MAX_SHOTS);
  const sparkMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.16, 0), mat(0x7ec8ff), MAX_SHOTS);
  const flakMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.2, 0), mat(0xffd36a), MAX_SHOTS);
  for (const mesh of [boltMesh, ballMesh, sparkMesh, flakMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.visible = false;
    scene.add(mesh);
  }

  function writeInstance(mesh, i, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function writeRigPart(mesh, i, x, y, z, yaw, pivot, rx, rz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    partDummy.position.set(pivot.x, pivot.y, pivot.z);
    partDummy.rotation.set(rx, 0, rz);
    partDummy.scale.set(1, 1, 1);
    partDummy.updateMatrix();
    dummy.matrix.multiply(partDummy.matrix);
    mesh.setMatrixAt(i, dummy.matrix);
  }

  function finishInstances(mesh, n) {
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.visible = n > 0;
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function applyCam() {
    camera.position.set(eye.x, eye.y, eye.z);
    const cp = Math.cos(eye.pitch);
    const sp = Math.sin(eye.pitch);
    const sy = Math.sin(eye.yaw);
    const cy = Math.cos(eye.yaw);
    camera.lookAt(eye.x - sy * cp, eye.y - sp, eye.z + cy * cp);
  }

  function fly(dt) {
    const locked = document.pointerLockElement === canvas;
    const ticks = dt * 20;
    const forward = locked && (keys.has("KeyW") || keys.has("ArrowUp"));
    const back = locked && (keys.has("KeyS") || keys.has("ArrowDown"));
    const left = locked && (keys.has("KeyA") || keys.has("ArrowLeft"));
    const right = locked && (keys.has("KeyD") || keys.has("ArrowRight"));
    const up = locked && keys.has("Space");
    const down = locked && (keys.has("ShiftLeft") || keys.has("ShiftRight"));
    if (!forward) sprint = false;

    const sy = Math.sin(eye.yaw);
    const cy = Math.cos(eye.yaw);
    const fx = -sy;
    const fz = cy;
    const rx = -cy;
    const rz = -sy;

    let ix = 0;
    let iy = 0;
    let iz = 0;
    if (forward) {
      ix += fx;
      iz += fz;
    }
    if (back) {
      ix -= fx;
      iz -= fz;
    }
    if (left) {
      ix -= rx;
      iz -= rz;
    }
    if (right) {
      ix += rx;
      iz += rz;
    }
    if (up) iy += 1;
    if (down) iy -= 1;

    const planar = Math.hypot(ix, iz);
    if (planar > 1) {
      ix /= planar;
      iz /= planar;
    }

    const impulse = 2.75 * TILE * (sprint ? 2.2 : 1);
    const climb = 5.4 * TILE * (sprint ? 2.2 : 1);
    eye.vx += ix * impulse * ticks;
    eye.vy += iy * climb * ticks;
    eye.vz += iz * impulse * ticks;
    const drag = Math.pow(0.91, ticks);
    eye.vx *= drag;
    eye.vy *= drag;
    eye.vz *= drag;

    eye.x += eye.vx * dt;
    eye.y += eye.vy * dt;
    eye.z += eye.vz * dt;

    const minY = Math.max(0.85, groundY(eye.x, eye.z) + 1.2);
    const maxY = CAM_MAX_Y;
    const minX = -flyMargin;
    const maxX = w + flyMargin;
    const minZ = -flyMargin;
    const maxZ = d + flyMargin;
    if (eye.x < minX || eye.x > maxX) eye.vx = 0;
    if (eye.z < minZ || eye.z > maxZ) eye.vz = 0;
    if (eye.y < minY || eye.y > maxY) eye.vy = 0;
    eye.x = THREE.MathUtils.clamp(eye.x, minX, maxX);
    eye.y = THREE.MathUtils.clamp(eye.y, minY, maxY);
    eye.z = THREE.MathUtils.clamp(eye.z, minZ, maxZ);

    const fov = sprint ? 68 : 58;
    if (Math.abs(camera.fov - fov) > 0.04) {
      camera.fov += (fov - camera.fov) * Math.min(1, 8 * dt);
      camera.updateProjectionMatrix();
    }
  }

  function updateCamera(dt, blocked) {
    if (blocked) {
      eye.vx = 0;
      eye.vy = 0;
      eye.vz = 0;
      sprint = false;
    } else fly(dt);
    applyCam();
  }

  function resetCamera() {
    eye.x = home.x;
    eye.y = CAM_START_Y;
    eye.z = home.z + 28;
    eye.yaw = Math.PI;
    eye.pitch = CAM_START_PITCH;
    eye.vx = 0;
    eye.vy = 0;
    eye.vz = 0;
    sprint = false;
    camera.fov = 58;
    camera.updateProjectionMatrix();
    applyCam();
  }

  function setCamera(look) {
    if (look.x != null) eye.x = look.x;
    if (look.y != null) eye.y = look.y;
    if (look.z != null) eye.z = look.z;
    if (look.yaw != null) eye.yaw = look.yaw;
    if (look.pitch != null) eye.pitch = look.pitch;
    if (look.fov != null) {
      camera.fov = look.fov;
      camera.updateProjectionMatrix();
    }
    eye.vx = 0;
    eye.vy = 0;
    eye.vz = 0;
    applyCam();
  }

  function pickGround(ndcX, ndcY) {
    pointer.set(ndcX, ndcY);
    raycaster.setFromCamera(pointer, camera);
    const keepHits = [];
    for (const node of buildings.values()) {
      if (!node.userData.keepRoot) continue;
      const hits = raycaster.intersectObject(node, true);
      for (const hit of hits) keepHits.push(hit);
    }
    if (keepHits.length) {
      keepHits.sort((a, b) => a.distance - b.distance);
      return { x: keepHits[0].point.x, z: keepHits[0].point.z };
    }
    const hits = raycaster.intersectObject(terrain);
    if (hits.length) {
      const p = hits[0].point;
      return { x: p.x, z: p.z };
    }
    const o = raycaster.ray.origin;
    const d = raycaster.ray.direction;
    const yAt = (t) => o.y + d.y * t;
    const gAt = (t) => groundY(o.x + d.x * t, o.z + d.z * t);
    const lo0 = 0.25;
    if (yAt(lo0) <= gAt(lo0)) return { x: o.x + d.x * lo0, z: o.z + d.z * lo0 };
    let lo = lo0;
    let hi = null;
    for (let t = lo0; t <= 240; t += t < 16 ? 0.35 : 1.4) {
      if (yAt(t) <= gAt(t)) {
        hi = t;
        break;
      }
      lo = t;
    }
    if (hi == null) return null;
    for (let i = 0; i < 18; i += 1) {
      const mid = (lo + hi) * 0.5;
      if (yAt(mid) > gAt(mid)) lo = mid;
      else hi = mid;
    }
    return { x: o.x + d.x * hi, z: o.z + d.z * hi };
  }

  function groundAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ny = -((clientY - rect.top) / rect.height) * 2 + 1;
    return pickGround(nx, ny);
  }

  function lookGround() {
    return pickGround(0, 0);
  }

  let ghostMesh = ghost;

  function tintGhost(node, ok) {
    node.traverse((child) => {
      if (child.material && child.material.color) child.material.color.setHex(ok ? 0x6adf7a : 0xff5a4a);
    });
  }

  function placeWallNode(node, ax, az, bx, bz, length, yaw) {
    const x = (ax + bx) / 2;
    const z = (az + bz) / 2;
    node.position.set(x, plantY(x, z, 0.06), z);
    node.rotation.y = yaw;
    node.scale.set(Math.max(0.08, length / WALL_MESH_LEN), 1, 1);
  }

  function showGhost(ghostState) {
    if (!ghostState?.kind) {
      ghostMesh.visible = false;
      wallGhost.visible = false;
      gateGhost.visible = false;
      wallPost.visible = false;
      wallPostEnd.visible = false;
      snapRing.visible = false;
      return;
    }
    if (ghostState.mode === "insert") {
      ghostMesh.visible = false;
      wallGhost.visible = false;
      wallPost.visible = false;
      wallPostEnd.visible = false;
      snapRing.visible = false;
      const lv = Math.max(0, Math.min(3, ghostState.level || 0));
      if (gateGhost.userData.level !== lv) {
        gateGhost.geometry = gateGhostGeos[lv];
        gateGhost.userData.level = lv;
      }
      const x = (ghostState.ax + ghostState.bx) / 2;
      const z = (ghostState.az + ghostState.bz) / 2;
      gateGhost.visible = true;
      gateGhost.position.set(x, plantY(x, z, 0.06), z);
      gateGhost.rotation.y = ghostState.yaw || 0;
      gateGhost.scale.set(1, 1, 1);
      tintGhost(gateGhost, ghostState.ok);
      return;
    }
    if ((ghostState.kind === "wall" || ghostState.kind === "gate") && ghostState.mode) {
      ghostMesh.visible = false;
      const stretch = ghostState.kind === "gate" ? gateGhost : wallGhost;
      const other = ghostState.kind === "gate" ? wallGhost : gateGhost;
      other.visible = false;
      const ok = ghostState.ok;
      wallPost.visible = true;
      wallPost.position.set(ghostState.ax, plantY(ghostState.ax, ghostState.az, 0.06), ghostState.az);
      wallPost.scale.setScalar(ghostState.snappedStart ? 1.45 : 1);
      tintGhost(wallPost, ok);
      const showEnd = ghostState.mode === "stretch";
      wallPostEnd.visible = showEnd;
      if (showEnd) {
        wallPostEnd.position.set(ghostState.bx, plantY(ghostState.bx, ghostState.bz, 0.06), ghostState.bz);
        wallPostEnd.scale.setScalar(ghostState.snappedEnd ? 1.45 : 1);
        tintGhost(wallPostEnd, ok);
      }
      const ringAt = ghostState.snappedEnd
        ? { x: ghostState.bx, z: ghostState.bz }
        : ghostState.snappedStart
          ? { x: ghostState.ax, z: ghostState.az }
          : null;
      if (ringAt) {
        snapRing.visible = true;
        snapRing.position.set(ringAt.x, plantY(ringAt.x, ringAt.z, -0.14), ringAt.z);
      } else snapRing.visible = false;
      if (ghostState.mode === "stretch") {
        const dx = ghostState.bx - ghostState.ax;
        const dz = ghostState.bz - ghostState.az;
        const length = Math.hypot(dx, dz);
        stretch.visible = length > 0.05;
        if (stretch.visible) {
          placeWallNode(stretch, ghostState.ax, ghostState.az, ghostState.bx, ghostState.bz, length, Math.atan2(-dz, dx));
          tintGhost(stretch, ok);
        }
      } else stretch.visible = false;
      return;
    }
    wallGhost.visible = false;
    gateGhost.visible = false;
    wallPost.visible = false;
    wallPostEnd.visible = false;
    snapRing.visible = false;
    const { kind, ok, center, tilesW, tilesH } = ghostState;
    if (ghostMesh.userData.kind !== kind) {
      scene.remove(ghostMesh);
      ghostMesh = makeBuilding(kind);
      ghostMesh.traverse((child) => {
        if (child.material) {
          child.material = child.material.clone();
          child.material.transparent = true;
          child.material.opacity = 0.5;
        }
      });
      ghostMesh.userData.kind = kind;
      scene.add(ghostMesh);
    }
    ghostMesh.visible = true;
    ghostMesh.position.set(center.x, plantY(center.x, center.z, 0.06), center.z);
    ghostMesh.rotation.y = 0;
    ghostMesh.scale.set(tilesW, 1, tilesH);
    tintGhost(ghostMesh, ok);
  }

  function syncList(map, items, factory, place, keyOf) {
    const seen = new Set();
    for (const item of items) {
      seen.add(item.id);
      let node = map.get(item.id);
      const key = keyOf ? keyOf(item) : null;
      if (!node || (key != null && node.userData.syncKey !== key)) {
        if (node) scene.remove(node);
        node = factory(item);
        if (key != null) node.userData.syncKey = key;
        map.set(item.id, node);
        scene.add(node);
      }
      place(node, item);
    }
    for (const [id, node] of map) {
      if (!seen.has(id)) {
        scene.remove(node);
        map.delete(id);
      }
    }
  }

  function sync(state) {
    if (state.atmosphere) setAtmosphere(state.atmosphere);
    stepRain();
    grid.visible = !!state.showGrid;
    if (state.ghost) {
      hover.visible = false;
    } else if (state.hoverTile) {
      const p = tileCenter(state.hoverTile.c, state.hoverTile.r);
      hover.visible = true;
      hover.position.set(p.x, plantY(p.x, p.z, -0.14), p.z);
      hover.scale.set(TILE * 0.96, TILE * 0.96, 1);
    } else hover.visible = false;

    showGhost(state.ghost);

    if (state.range) {
      rangeRing.visible = true;
      rangeRing.position.set(state.range.x, plantY(state.range.x, state.range.z, -0.16), state.range.z);
      const r = state.range.radius;
      rangeRing.scale.set(r, r, 1);
    } else rangeRing.visible = false;

    if (state.marquee) {
      const { ax, az, bx, bz } = state.marquee;
      const w = Math.max(0.4, Math.abs(bx - ax));
      const d = Math.max(0.4, Math.abs(bz - az));
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      const y = plantY(cx, cz, -0.18);
      marquee.visible = true;
      marquee.position.set(cx, y, cz);
      marquee.scale.set(w, d, 1);
      marqueeEdge.visible = true;
      marqueeEdge.position.set(cx, y + 0.02, cz);
      marqueeEdge.scale.set(w, 1, d);
    } else {
      marquee.visible = false;
      marqueeEdge.visible = false;
    }

    const placed = [];
    const walls = [];
    const gates = [];
    for (const b of state.buildings) {
      if (b.kind === "wall") walls.push(b);
      else if (b.kind === "gate") gates.push(b);
      else placed.push(b);
    }
    syncList(
      buildings,
      placed,
      (b) => makeBuilding(b.kind, b.level || 0),
      (node, b) => {
        node.position.set(b.x, plantY(b.x, b.z, 0.08), b.z);
        node.rotation.y = 0;
        const s = stampScale(b.kind);
        const grow = b.kind === "keep" ? 1 : 1 + (b.level || 0) * 0.04;
        node.scale.set(s.x, grow, s.z);
        const aim = node.userData.aim;
        if (aim && b.aimYaw != null) {
          const cur = node.userData.shownYaw ?? b.aimYaw;
          let d = b.aimYaw - cur;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          const next = cur + d * 0.22;
          node.userData.shownYaw = next;
          aim.rotation.y = next;
        }
      },
      (b) => `${b.kind}:${b.level || 0}`
    );

    const wallsByLv = [[], [], [], []];
    for (const b of walls) wallsByLv[Math.min(3, b.level || 0)].push(b);
    for (let lv = 0; lv < wallMeshes.length; lv += 1) {
      const list = wallsByLv[lv];
      const wallN = Math.min(list.length, MAX_WALLS);
      for (let i = 0; i < wallN; i += 1) {
        const b = list[i];
        writeInstance(
          wallMeshes[lv],
          i,
          b.x,
          plantY(b.x, b.z, 0.06),
          b.z,
          b.yaw || 0,
          Math.max(0.08, (b.length || WALL_MESH_LEN) / WALL_MESH_LEN),
          1,
          1
        );
      }
      finishInstances(wallMeshes[lv], wallN);
    }

    const gatesByLv = [[], [], [], []];
    for (const b of gates) gatesByLv[Math.min(3, b.level || 0)].push(b);
    for (let lv = 0; lv < gateMeshes.length; lv += 1) {
      const list = gatesByLv[lv];
      const gateN = Math.min(list.length, MAX_WALLS);
      for (let i = 0; i < gateN; i += 1) {
        const b = list[i];
        writeInstance(
          gateMeshes[lv],
          i,
          b.x,
          plantY(b.x, b.z, 0.06),
          b.z,
          b.yaw || 0,
          1,
          1,
          1
        );
      }
      finishInstances(gateMeshes[lv], gateN);
    }

    syncList(
      boats,
      state.boats || [],
      () => makeBoat(),
      (node, b) => {
        node.position.set(b.x, 0.42, b.z);
        node.rotation.y = b.yaw || 0;
      }
    );

    const picked = new Set(state.picked || []);
    const byKind = {};
    for (const kind of Object.keys(unitLayer)) byKind[kind] = [];
    for (const u of state.troops) {
      const key = `${u.kind}:${u.level || 0}`;
      if (byKind[key]) byKind[key].push(u);
      else if (byKind[u.kind]) byKind[u.kind].push(u);
    }
    for (const u of state.enemies) {
      if (byKind[u.kind]) byKind[u.kind].push(u);
    }
    const now = performance.now();
    if (lastPose.size > 800) {
      const live = new Set();
      for (const u of state.troops) live.add(u.id);
      for (const u of state.enemies) live.add(u.id);
      for (const id of lastPose.keys()) if (!live.has(id)) lastPose.delete(id);
    }
    for (const [kind, layer] of Object.entries(unitLayer)) {
      const list = byKind[kind];
      const n = Math.min(list.length, MAX_UNITS);
      const { meshes, pivots, shambling, cadence } = layer;
      for (let i = 0; i < n; i += 1) {
        const u = list[i];
        const prev = lastPose.get(u.id);
        let yaw = prev?.yaw ?? Math.atan2(keepX - u.x, keepZ - u.z);
        let moving = false;
        let phase = prev?.phase ?? u.id * 0.73;
        if (prev) {
          const dx = u.x - prev.x;
          const dz = u.z - prev.z;
          if (dx * dx + dz * dz > 1e-6) {
            yaw = Math.atan2(dx, dz);
            moving = true;
          }
          const dt = Math.min(0.05, (now - prev.t) / 1000);
          phase += dt * (moving ? cadence : cadence * 0.22);
        }
        if (u.aimYaw != null) yaw = u.aimYaw;
        lastPose.set(u.id, { x: u.x, z: u.z, yaw, phase, t: now });
        const swing = Math.sin(phase);
        const amp = moving ? 1 : 0.18;
        const bob = moving ? Math.abs(swing) * 0.03 : 0.008 * Math.sin(phase * 0.5);
        const y = groundY(u.x, u.z) + bob + 0.03 + (u.fly ? 0.72 : 0);
        const lean = moving ? 0.07 : 0.015 * Math.sin(phase * 0.5);
        const waddle = swing * (moving ? 0.055 : 0.012);
        const leg = swing * 0.48 * amp;
        const hang = swing * 0.38 * amp;
        const chop = u.cooldown > 0.18 ? Math.min(0.55, u.cooldown) * 0.7 : 0;
        let leftArm = shambling ? hang * 0.45 : -hang;
        let rightArm = shambling ? -hang * 0.45 : hang * 0.85 - chop;
        const leftArmZ = shambling ? 0.08 * amp * swing : 0;
        const rightArmZ = shambling ? -0.08 * amp * swing : 0;
        writeRigPart(meshes.body, i, u.x, y, u.z, yaw, pivots.body, lean, waddle);
        writeRigPart(meshes.leftLeg, i, u.x, y, u.z, yaw, pivots.leftLeg, leg, 0);
        writeRigPart(meshes.rightLeg, i, u.x, y, u.z, yaw, pivots.rightLeg, -leg, 0);
        writeRigPart(meshes.leftArm, i, u.x, y, u.z, yaw, pivots.leftArm, leftArm, leftArmZ);
        writeRigPart(meshes.rightArm, i, u.x, y, u.z, yaw, pivots.rightArm, rightArm, rightArmZ);
        const shade = 0.9 + ((Math.imul(u.id, 2246822519) >>> 0) % 18) / 100;
        const lv = u.level || 0;
        if (picked.has(u.id)) tintColor.setRGB(1, 0.86, 0.28);
        else if (u.slow > 0) tintColor.setRGB(0.55, 0.78, 1);
        else if (lv >= 3) tintColor.setRGB(shade * 1.08, shade * 1.02, shade * 0.78);
        else if (lv >= 2) tintColor.setRGB(shade * 1.04, shade * 1.02, shade * 0.9);
        else tintColor.setRGB(shade, shade, shade);
        for (const name of PARTS) meshes[name].setColorAt(i, tintColor);
      }
      for (const name of PARTS) {
        finishInstances(meshes[name], n);
        if (meshes[name].instanceColor) meshes[name].instanceColor.needsUpdate = true;
      }
    }

    let bolts = 0;
    let balls = 0;
    let sparks = 0;
    let flaks = 0;
    for (const p of state.projectiles) {
      const y = groundY(p.x, p.z) + (p.fx === "spark" ? 1.15 : p.fx === "flak" ? 1.45 : 0.7);
      const yaw = Math.atan2(p.tx - p.x, p.tz - p.z);
      if (p.fx === "spark") {
        if (sparks < MAX_SHOTS) {
          writeInstance(sparkMesh, sparks, p.x, y, p.z, yaw);
          sparks += 1;
        }
      } else if (p.fx === "flak") {
        if (flaks < MAX_SHOTS) {
          writeInstance(flakMesh, flaks, p.x, y, p.z, yaw);
          flaks += 1;
        }
      } else if (p.fx === "ball" || p.splash) {
        if (balls < MAX_SHOTS) {
          writeInstance(ballMesh, balls, p.x, y, p.z, yaw);
          balls += 1;
        }
      } else if (bolts < MAX_SHOTS) {
        writeInstance(boltMesh, bolts, p.x, y, p.z, yaw);
        bolts += 1;
      }
    }
    finishInstances(boltMesh, bolts);
    finishInstances(ballMesh, balls);
    finishInstances(sparkMesh, sparks);
    finishInstances(flakMesh, flaks);

    syncList(
      flags,
      state.rallies,
      () => makeFlag(),
      (node, f) => node.position.set(f.x, plantY(f.x, f.z, 0.04), f.z)
    );

    for (const node of buildings.values()) {
      if (node.userData.keepRoot) {
        node.traverse((child) => {
          if (child.userData.keepBody && child.material?.emissive) {
            const hurt = state.keepHp / state.keepMax;
            child.material.emissive.setHex(hurt < 0.35 ? 0x440000 : 0x000000);
          }
        });
      }
      node.traverse((child) => {
        if (child.userData.spin) child.rotation.z += 0.012;
      });
    }
  }

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (
      document.pointerLockElement === canvas &&
      ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"].includes(e.code)
    ) {
      e.preventDefault();
    }
    if (e.code === "KeyW" && !e.repeat && document.pointerLockElement === canvas) {
      const now = performance.now();
      if (now - lastForwardTap < 280) sprint = true;
      lastForwardTap = now;
    }
    keys.add(e.code);
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("mousemove", (e) => {
    if (document.pointerLockElement !== canvas) return;
    eye.yaw += e.movementX * 0.0026;
    eye.pitch = THREE.MathUtils.clamp(eye.pitch + e.movementY * 0.0026, -1.52, 1.52);
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  resize();
  resetCamera();
  let troopPortraits = {};
  try {
    troopPortraits = makeTroopPortraits();
  } catch {
    troopPortraits = {};
  }

  return {
    updateCamera,
    resetCamera,
    setCamera,
    groundAt,
    lookGround,
    troopPortraits,
    setAtmosphere,
    sync,
    render() {
      renderer.render(scene, camera);
    },
  };
}
