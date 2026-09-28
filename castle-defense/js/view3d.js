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
} from "./world.js";

const UNIT_KINDS = ["spearman", "slinger", "raider", "knight", "warden", "goblin", "runner", "archer", "brute", "ogre"];

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
  return new THREE.MeshLambertMaterial({ map, flatShading: false });
}

function makeSky() {
  const geo = new THREE.SphereGeometry(2200, 24, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / 2200, -0.2, 1);
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

function makeKeep() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(3.35, 0.38, 3.35), STONE_DARK, 0, 0.19, 0));
  const body = mesh(new THREE.BoxGeometry(2.7, 3.35, 2.7), STONE, 0, 2.05, 0);
  body.userData.keepBody = true;
  g.add(body);
  g.add(mesh(new THREE.BoxGeometry(2.95, 0.22, 2.95), STONE_DARK, 0, 3.78, 0));
  g.add(mesh(new THREE.BoxGeometry(2.15, 0.08, 2.15), STONE_LIGHT, 0, 3.92, 0, { cast: false }));
  addMerlons(g, 2.95, 2.95, 3.88, 0.2, 0.34);
  addSlits(g, 1.37, 1.15, 4, 3, 1.55);
  addSlits(g, -1.37, 1.35, 3, 2, 1.1);
  g.add(mesh(new THREE.BoxGeometry(0.55, 1.05, 0.1), DOOR, 0, 0.72, 1.38));
  g.add(mesh(new THREE.BoxGeometry(0.08, 0.32, 0.04), 0x2a2733, 0.14, 0.78, 1.44, { cast: false }));
  const turret = mesh(new THREE.CylinderGeometry(0.42, 0.48, 2.4, 10), STONE_DARK, 1.55, 2.4, -1.55);
  g.add(turret);
  g.add(mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.16, 10), STONE_LIGHT, 1.55, 3.62, -1.55));
  g.add(mesh(new THREE.ConeGeometry(0.58, 0.95, 8), SLATE, 1.55, 4.18, -1.55));
  addBanner(g, 1.55, 4.72, -1.55);
  return g;
}

const WOOD = 0x8a5c38;
const WOOD_DARK = 0x5c3a22;
const THATCH = 0xc49648;
const WHEAT = 0xe2c45c;
const CLOTH = 0xf2ead8;
const IRON = 0x4a4e55;

function ridgeRoof(w, d, rise) {
  const hw = w / 2;
  const hd = d / 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, 0, rise, -hd, 0, rise, hd]),
      3
    )
  );
  geo.setIndex([0, 4, 3, 3, 4, 5, 1, 2, 5, 1, 5, 4, 0, 1, 4, 3, 5, 2]);
  geo.computeVertexNormals();
  return geo;
}

const WALL_VIS_H = 1.72;
const WALL_VIS_HALF = WALL_VIS_H / 2;

function makeWallGeometry() {
  const parts = [];
  const h = WALL_VIS_H;
  const len = WALL_MESH_LEN;
  const add = (w, ht, d, x, y, z, hex, rot) => {
    parts.push(voxelBox(w, ht, d, x, y, z, hex, rot));
  };
  const logs = 6;
  const logW = len / logs;
  for (let i = 0; i < logs; i += 1) {
    const x = -len / 2 + logW * (i + 0.5);
    const shade = i % 2 ? WOOD : WOOD_DARK;
    const hh = h + (i % 3 === 0 ? 0.1 : 0);
    add(logW * 0.84, hh, 0.44, x, hh / 2, 0.04, shade);
    add(logW * 0.42, 0.26, 0.28, x, hh + 0.1, 0.04, shade);
  }
  add(len * 0.98, h * 0.88, 0.3, 0, h * 0.44, -0.1, STONE);
  add(len * 1.02, 0.16, 0.52, 0, 0.38, 0.1, STONE_DARK);
  add(len * 1.02, 0.16, 0.52, 0, h * 0.58, 0.12, STONE_DARK);
  add(len, 0.12, 0.72, 0, h + 0.06, 0.02, WOOD);
  const count = 6;
  const step = len / count;
  for (let i = 0; i < count; i += 1) {
    if (i % 2) continue;
    const t = -len / 2 + step * (i + 0.5);
    add(step * 0.7, 0.34, 0.16, t, h + 0.06 + 0.17, 0.26, STONE_LIGHT);
    add(step * 0.7, 0.34, 0.16, t, h + 0.06 + 0.17, -0.26, STONE_LIGHT);
  }
  add(0.2, h + 0.32, 0.2, -len / 2, (h + 0.32) / 2, 0, WOOD_DARK);
  add(0.2, h + 0.32, 0.2, len / 2, (h + 0.32) / 2, 0, WOOD_DARK);
  add(0.08, 0.42, 0.05, -0.34, 0.78, 0.28, DOOR);
  add(0.08, 0.42, 0.05, 0.34, 0.78, 0.28, DOOR);
  return mergeGeos(parts);
}

function makeBuilding(kind) {
  const g = new THREE.Group();
  if (kind === "wall") {
    const wall = new THREE.Mesh(
      makeWallGeometry(),
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    );
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
  } else if (kind === "crossbow") {
    g.add(mesh(new THREE.BoxGeometry(1.15, 0.16, 1.15), WOOD_DARK, 0, 0.08, 0));
    for (const [x, z] of [[-0.42, -0.42], [0.42, -0.42], [-0.42, 0.42], [0.42, 0.42]]) {
      g.add(mesh(new THREE.BoxGeometry(0.12, 1.35, 0.12), WOOD, x, 0.75, z));
    }
    g.add(mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), WOOD, 0, 1.42, 0));
    g.add(mesh(new THREE.BoxGeometry(1.22, 0.22, 0.08), WOOD_DARK, 0, 1.58, 0.56));
    g.add(mesh(new THREE.BoxGeometry(1.22, 0.22, 0.08), WOOD_DARK, 0, 1.58, -0.56));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 1.1), WOOD_DARK, 0.56, 1.58, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.22, 1.1), WOOD_DARK, -0.56, 1.58, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), WOOD_DARK, -0.52, 0.7, 0.2, { rx: 0.45 }));
    const bow = mesh(new THREE.TorusGeometry(0.38, 0.04, 6, 12, Math.PI), 0xd2b48c, 0, 1.72, 0.18);
    bow.rotation.y = Math.PI / 2;
    g.add(bow);
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), 0xefe6d2, 0, 1.72, 0.05));
    addBanner(g, 0.5, 1.95, -0.5);
  } else if (kind === "cannon") {
    g.add(mesh(new THREE.BoxGeometry(1.55, 0.38, 1.35), 0x8a6a48, 0, 0.2, 0));
    g.add(mesh(new THREE.BoxGeometry(1.15, 0.22, 0.7), WOOD, 0, 0.48, 0.1));
    const barrel = mesh(new THREE.CylinderGeometry(0.13, 0.18, 1.25, 10), IRON, 0, 0.72, 0.35);
    barrel.rotation.x = Math.PI / 2.2;
    g.add(barrel);
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), WOOD_DARK, -0.42, 0.42, 0.05, { rz: Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), WOOD_DARK, 0.42, 0.42, 0.05, { rz: Math.PI / 2 }));
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 8), WOOD, -0.55, 0.28, -0.42));
    g.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.22, 8), WOOD_DARK, 0.52, 0.24, -0.38));
    g.add(mesh(new THREE.BoxGeometry(0.35, 0.18, 0.22), 0x6e5840, 0.15, 0.48, -0.5));
  } else if (kind === "farm") {
    g.add(mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.45, 10), STONE_DARK, -0.28, 0.22, -0.18));
    g.add(mesh(new THREE.CylinderGeometry(0.38, 0.42, 1.15, 10), WOOD, -0.28, 1.0, -0.18));
    g.add(mesh(new THREE.ConeGeometry(0.5, 0.55, 8), THATCH, -0.28, 1.82, -0.18));
    g.add(mesh(new THREE.BoxGeometry(0.16, 0.32, 0.05), WOOD_DARK, -0.28, 0.55, 0.22));
    const sails = new THREE.Group();
    sails.position.set(-0.28, 1.42, 0.22);
    sails.userData.spin = true;
    for (let i = 0; i < 4; i += 1) {
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI) / 2;
      arm.add(mesh(new THREE.BoxGeometry(0.07, 1.15, 0.07), WOOD_DARK, 0, 0.52, 0));
      arm.add(mesh(new THREE.BoxGeometry(0.32, 0.95, 0.03), CLOTH, 0.16, 0.55, 0.02, { cast: false }));
      sails.add(arm);
    }
    g.add(sails);
    g.add(mesh(new THREE.BoxGeometry(0.95, 0.06, 0.7), 0x7a5a32, 0.48, 0.05, 0.28));
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 5; col += 1) {
        const h = 0.16 + ((row + col) % 3) * 0.05;
        g.add(mesh(new THREE.BoxGeometry(0.08, h, 0.08), WHEAT, 0.18 + col * 0.16, 0.08 + h / 2, 0.08 + row * 0.16, { cast: false }));
      }
    }
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.22, 0.72), WOOD, 0.04, 0.14, 0.28));
    g.add(mesh(new THREE.BoxGeometry(0.04, 0.22, 0.72), WOOD, 0.92, 0.14, 0.28));
  } else if (kind === "barracks") {
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.18, 1.15), STONE_DARK, 0, 0.09, 0));
    g.add(mesh(new THREE.BoxGeometry(1.55, 0.85, 1.0), WOOD, 0, 0.6, 0));
    g.add(mesh(ridgeRoof(1.75, 1.2, 0.62), THATCH, 0, 1.02, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.85, 1.0), WOOD_DARK, -0.78, 0.6, 0));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.85, 1.0), WOOD_DARK, 0.78, 0.6, 0));
    g.add(mesh(new THREE.BoxGeometry(0.38, 0.7, 0.08), WOOD_DARK, 0, 0.48, 0.52));
    g.add(mesh(new THREE.BoxGeometry(0.18, 0.18, 0.04), DOOR, 0.42, 0.78, 0.52, { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.55, 0.08), WOOD_DARK, -0.72, 0.4, 0.62));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.42, 0.08), IRON, -0.62, 0.42, 0.62));
    g.add(mesh(new THREE.BoxGeometry(0.08, 0.48, 0.08), IRON, -0.52, 0.4, 0.62));
    g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.7, 6), WOOD, 0.62, 0.4, 0.7));
    g.add(mesh(new THREE.BoxGeometry(0.28, 0.22, 0.08), 0xc4a070, 0.62, 0.72, 0.7));
    addBanner(g, 0.7, 1.45, -0.2);
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

function makeUnitGeometry(kind) {
  const buckets = { body: [], leftArm: [], rightArm: [], leftLeg: [], rightLeg: [] };
  const px =
    kind === "ogre"
      ? 0.038
      : kind === "brute"
        ? 0.03
        : kind === "runner" || kind === "raider"
          ? 0.021
          : kind === "goblin" || kind === "spearman" || kind === "slinger"
            ? 0.022
            : 0.026;
  const bodyW = kind === "ogre" ? 12 : kind === "brute" ? 10 : kind === "runner" || kind === "raider" ? 7 : 8;
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

  if (kind === "runner") {
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
      add("rightArm", armW, 12, 4, armX + 0.6, 28, 0, p.skin);
      add("rightArm", armW, 4, 4, armX + 0.6, 36, 0, p.skin);
    }
  }

  add("body", head, head, head, 0, headY, headZ, p.head);

  if (kind === "spearman") {
    add("body", 1.6, 1.1, 0.5, -1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", 1.6, 1.1, 0.5, 1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", head + 0.8, 2.4, head + 0.6, 0, 24 + head - 0.4, 0.2, p.accent);
    add("leftArm", armW + 0.6, 5, 4.6, -armX, 21, 0, p.shirt);
    add("rightArm", 1.1, 22, 1.1, armX + 0.6, 49, 0, p.steel);
    add("rightArm", 2.6, 1.1, 1.1, armX + 0.6, 38.2, 0, p.wood);
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
    add("rightArm", 2.2, 5, 1.2, armX + 0.6, 42, 0, p.steel);
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
    add("rightArm", 1.2, 18, 1.2, armX + 0.6, 47, 0, p.steel);
    add("rightArm", 3.2, 1.2, 1.2, armX + 0.6, 38.4, 0, p.wood);
    add("rightArm", 1, 2, 1, armX + 0.6, 37.2, 0, p.wood);
  } else if (kind === "warden") {
    add("body", 1.6, 1.1, 0.5, -1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", 1.6, 1.1, 0.5, 1.7, 27.6, head * 0.5 + 0.4, p.dark);
    add("body", head + 1.8, 3.6, head + 1.4, 0, 24 + head - 0.8, 0.3, p.accent);
    add("body", head + 0.8, 7, 3.2, 0, 24 + head * 0.2, -2.2, p.shirt);
    add("body", bodyW + 1.4, 14, bodyD + 1.2, 0, 17, 0.4, p.shirt);
    add("rightArm", 1.3, 22, 1.3, armX + 0.6, 48, 0, p.wood);
    add("rightArm", 3.4, 3.4, 3.4, armX + 0.6, 60, 0, p.accent);
  } else if (kind === "goblin") {
    add("body", 2.4, 4, 1.2, -head * 0.55, 28.5, 0, p.head);
    add("body", 2.4, 4, 1.2, head * 0.55, 28.5, 0, p.head);
    add("body", 1.2, 1.2, 0.5, -1.6, 27.2, head * 0.5, p.dark);
    add("body", 1.2, 1.2, 0.5, 1.6, 27.2, head * 0.5, p.dark);
    add("body", 1.1, 2.2, 1.1, -1.5, 24.4, head * 0.5, 0xf0e0c0);
    add("body", 1.1, 2.2, 1.1, 1.5, 24.4, head * 0.5, 0xf0e0c0);
    add("rightArm", 3.2, 3.2, 3.2, armX + 0.6, 38, 0, p.wood);
    add("rightArm", 3.6, 12, 3.6, armX + 0.6, 46, 0, p.wood);
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
  } else if (kind === "brute") {
    add("body", 2.8, 5, 1.4, -head * 0.55, 29, 0, p.head);
    add("body", 2.8, 5, 1.4, head * 0.55, 29, 0, p.head);
    add("body", 1.6, 1.6, 0.6, -1.8, 27.4, head * 0.5, p.dark);
    add("body", 1.6, 1.6, 0.6, 1.8, 27.4, head * 0.5, p.dark);
    add("body", 1.4, 2.8, 1.4, -1.7, 24.2, head * 0.5, 0xf2e4c4);
    add("body", 1.4, 2.8, 1.4, 1.7, 24.2, head * 0.5, 0xf2e4c4);
    add("leftArm", 7, 4, 6, -armX, 23.5, 0, p.accent);
    add("rightArm", 7, 4, 6, armX, 23.5, 0, p.accent);
    add("rightArm", 4.2, 4.2, 4.2, armX + 0.6, 38, 0, p.wood);
    add("rightArm", 4.6, 14, 4.6, armX + 0.6, 48, 0, p.wood);
    add("rightArm", 1.6, 2.4, 1.6, armX + 0.6, 55.5, 1.4, p.steel);
    add("rightArm", 1.6, 2.4, 1.6, armX + 0.6, 55.5, -1.4, p.steel);
  } else {
    add("body", 3.2, 6, 2, -head * 0.4, 24 + head + 1, 1, p.head);
    add("body", 3.2, 6, 2, head * 0.4, 24 + head + 1, 1, p.head);
    add("body", 2.2, 2.2, 0.7, -2.2, 28, head * 0.5 + 1.2, p.dark);
    add("body", 2.2, 2.2, 0.7, 2.2, 28, head * 0.5 + 1.2, p.dark);
    add("body", 4, 2.4, 0.8, 0, 25.2, head * 0.5 + 1.4, 0x3a1810);
    add("body", 2, 3.4, 2, -2.2, 23.6, head * 0.5 + 1.2, 0xf0e0c4);
    add("body", 2, 3.4, 2, 2.2, 23.6, head * 0.5 + 1.2, 0xf0e0c4);
    add("body", bodyW * 0.9, 8, bodyD + 2, 0, 16, 1.2, p.shirt);
    add("rightArm", 5.5, 5.5, 5.5, armX + 1, 38, 2, p.wood);
    add("rightArm", 6, 18, 6, armX + 1, 50, 2, p.wood);
    add("rightArm", 2.4, 6, 2.4, armX + 1, 60, 2, p.steel);
  }

  const rightArmX = kind === "runner" || kind === "archer" || kind === "slinger" ? armX : armX + 0.6;
  const pivots = {
    body: { x: 0, y: 0, z: 0 },
    leftLeg: { x: -legX * px, y: 12 * px, z: 0 },
    rightLeg: { x: legX * px, y: 12 * px, z: 0 },
    leftArm: { x: -armX * px, y: 24 * px, z: 0 },
    rightArm: { x: rightArmX * px, y: 24 * px, z: 0 },
  };
  const bake = (name) => {
    const geo = mergeGeos(buckets[name]);
    const pvt = pivots[name];
    if (pvt.x || pvt.y || pvt.z) geo.translate(-pvt.x, -pvt.y, -pvt.z);
    return geo;
  };
  const raised = kind !== "runner" && kind !== "archer" && kind !== "slinger";
  const shambling = kind === "runner";
  return {
    body: bake("body"),
    leftArm: bake("leftArm"),
    rightArm: bake("rightArm"),
    leftLeg: bake("leftLeg"),
    rightLeg: bake("rightLeg"),
    pivots,
    raised,
    shambling,
    cadence: kind === "runner" || kind === "raider" ? 10.5 : kind === "ogre" || kind === "brute" || kind === "knight" ? 6.2 : 8.2,
  };
}

const TROOP_PORTRAIT_KINDS = ["spearman", "slinger", "raider", "knight", "warden"];
const UNIT_PART_NAMES = ["body", "leftLeg", "rightLeg", "leftArm", "rightArm"];

function assembledUnitGeometry(kind) {
  const rig = makeUnitGeometry(kind);
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
    const geo = assembledUnitGeometry(kind);
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
    portraits[kind] = canvas.toDataURL("image/png");
    geo.dispose();
    material.dispose();
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
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87c4ea);
  scene.fog = new THREE.Fog(0xb9d8ee, 1200, 2800);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.5, 4000);
  const { w, d } = fieldSize();
  const home = keepCenter();
  const flyPad = 0.4;
  const eye = {
    x: home.x,
    y: 340,
    z: Math.min(d - 20, home.z + 110),
    yaw: Math.PI,
    pitch: 0.95,
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
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.04;
  scene.add(
    sun,
    sun.target,
    new THREE.AmbientLight(0xfff0d8, 0.42),
    new THREE.HemisphereLight(0xd7ecff, 0xa8b86a, 0.48)
  );

  scene.add(makeSky());

  const heightAt = new Float32Array(COLS * ROWS);

  function sampleHeight(x, z) {
    return terrainHeight(x, z);
  }

  function groundY(x, z) {
    const c = Math.max(0, Math.min(COLS - 1, Math.floor(x / TILE)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.floor(z / TILE)));
    return heightAt[r * COLS + c];
  }

  function plantY(x, z, sink = 0.08) {
    return groundY(x, z) - sink;
  }

  const planeW = w + 400;
  const planeD = d + 400;
  const terrain = new THREE.Mesh(
    livingGround(planeW, planeD, 260, 260, (x, z) => sampleHeight(x + w / 2, z + d / 2)),
    grassMat(paintGroundTexture(planeW, planeD, w / 2, d / 2))
  );
  terrain.position.set(w / 2, 0, d / 2);
  terrain.receiveShadow = true;
  terrain.castShadow = false;
  scene.add(terrain);

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

  const keep = makeKeep();
  const k0 = tileCenter(KEEP_TILES[0][0], KEEP_TILES[0][1]);
  const k1 = tileCenter(KEEP_TILES[3][0], KEEP_TILES[3][1]);
  const keepX = (k0.x + k1.x) / 2;
  const keepZ = (k0.z + k1.z) / 2;
  keep.position.set(keepX, plantY(keepX, keepZ, 0.06), keepZ);
  scene.add(keep);

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
    mat: { transparent: true, opacity: 0.22 },
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
  for (const kind of UNIT_KINDS) {
    const rig = makeUnitGeometry(kind);
    const meshes = {};
    for (const name of PARTS) meshes[name] = makeUnitMesh(rig[name]);
    unitLayer[kind] = {
      meshes,
      pivots: rig.pivots,
      raised: rig.raised,
      shambling: rig.shambling,
      cadence: rig.cadence,
    };
  }

  const wallMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const wallMesh = new THREE.InstancedMesh(makeWallGeometry(), wallMat, MAX_WALLS);
  wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.frustumCulled = false;
  wallMesh.count = 0;
  wallMesh.visible = false;
  scene.add(wallMesh);

  const boltMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.12, 0.28), mat(0x5a3a1a), MAX_SHOTS);
  const ballMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 0), mat(0x222228), MAX_SHOTS);
  for (const mesh of [boltMesh, ballMesh]) {
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
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

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

    const minY = 1.05;
    const maxY = 420;
    const minX = flyPad;
    const maxX = w - flyPad;
    const minZ = flyPad;
    const maxZ = d - flyPad;
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
    eye.y = 340;
    eye.z = Math.min(d - 20, home.z + 110);
    eye.yaw = Math.PI;
    eye.pitch = 0.95;
    eye.vx = 0;
    eye.vy = 0;
    eye.vz = 0;
    sprint = false;
    camera.fov = 58;
    camera.updateProjectionMatrix();
    applyCam();
  }

  function groundAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(ground, hit)) return { x: hit.x, z: hit.z };
    return null;
  }

  function lookGround() {
    pointer.set(0, 0);
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.direction.y >= -0.02) return null;
    if (!raycaster.ray.intersectPlane(ground, hit)) return null;
    return { x: hit.x, z: hit.z };
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
      wallPost.visible = false;
      wallPostEnd.visible = false;
      snapRing.visible = false;
      return;
    }
    if (ghostState.kind === "wall" && ghostState.mode) {
      ghostMesh.visible = false;
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
      snapRing.visible = Boolean(ringAt);
      if (ringAt) {
        snapRing.position.set(ringAt.x, plantY(ringAt.x, ringAt.z, -0.12), ringAt.z);
        snapRing.material.color.setHex(ok ? 0xfff4a3 : 0xff8a7a);
      }
      if (ghostState.mode === "stretch") {
        const dx = ghostState.bx - ghostState.ax;
        const dz = ghostState.bz - ghostState.az;
        const length = Math.hypot(dx, dz);
        wallGhost.visible = length > 0.12;
        if (wallGhost.visible) {
          placeWallNode(wallGhost, ghostState.ax, ghostState.az, ghostState.bx, ghostState.bz, length, Math.atan2(-dz, dx));
          tintGhost(wallGhost, ok);
        }
      } else {
        wallGhost.visible = false;
      }
      return;
    }
    wallGhost.visible = false;
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

  function syncList(map, items, factory, place) {
    const seen = new Set();
    for (const item of items) {
      seen.add(item.id);
      let node = map.get(item.id);
      if (!node) {
        node = factory(item);
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
    grid.visible = !!state.showGrid;
    if (state.ghost?.mode) {
      hover.visible = false;
    } else if (state.ghost) {
      hover.visible = true;
      hover.position.set(state.ghost.center.x, plantY(state.ghost.center.x, state.ghost.center.z, -0.14), state.ghost.center.z);
      hover.scale.set(state.ghost.tilesW * TILE * 0.96, state.ghost.tilesH * TILE * 0.96, 1);
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
    for (const b of state.buildings) {
      if (b.kind === "wall") walls.push(b);
      else placed.push(b);
    }
    syncList(
      buildings,
      placed,
      (b) => makeBuilding(b.kind),
      (node, b) => {
        node.position.set(b.x, plantY(b.x, b.z, 0.08), b.z);
        node.rotation.y = 0;
        const s = stampScale(b.kind);
        node.scale.set(s.x, 1, s.z);
      }
    );

    const wallN = Math.min(walls.length, MAX_WALLS);
    for (let i = 0; i < wallN; i += 1) {
      const b = walls[i];
      writeInstance(
        wallMesh,
        i,
        b.x,
        groundY(b.x, b.z),
        b.z,
        b.yaw || 0,
        Math.max(0.08, (b.length || WALL_MESH_LEN) / WALL_MESH_LEN),
        1,
        1
      );
    }
    finishInstances(wallMesh, wallN);

    const picked = new Set(state.picked || []);
    const byKind = {};
    for (const kind of Object.keys(unitLayer)) byKind[kind] = [];
    for (const u of state.troops) {
      if (byKind[u.kind]) byKind[u.kind].push(u);
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
      const { meshes, pivots, raised, shambling, cadence } = layer;
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
        lastPose.set(u.id, { x: u.x, z: u.z, yaw, phase, t: now });
        const swing = Math.sin(phase);
        const amp = moving ? 1 : 0.18;
        const bob = moving ? Math.abs(swing) * 0.03 : 0.008 * Math.sin(phase * 0.5);
        const y = groundY(u.x, u.z) + bob;
        const lean = moving ? 0.07 : 0.015 * Math.sin(phase * 0.5);
        const waddle = swing * (moving ? 0.055 : 0.012);
        const leg = swing * 0.48 * amp;
        const hang = swing * 0.38 * amp;
        const chop = u.cooldown > 0.18 ? Math.min(0.55, u.cooldown) * 0.7 : 0;
        let leftArm = shambling ? hang * 0.45 : -hang;
        let rightArm = shambling ? -hang * 0.45 : raised ? hang * 0.16 - chop : hang * 0.22;
        const leftArmZ = shambling ? 0.08 * amp * swing : 0;
        const rightArmZ = shambling ? -0.08 * amp * swing : 0;
        writeRigPart(meshes.body, i, u.x, y, u.z, yaw, pivots.body, lean, waddle);
        writeRigPart(meshes.leftLeg, i, u.x, y, u.z, yaw, pivots.leftLeg, leg, 0);
        writeRigPart(meshes.rightLeg, i, u.x, y, u.z, yaw, pivots.rightLeg, -leg, 0);
        writeRigPart(meshes.leftArm, i, u.x, y, u.z, yaw, pivots.leftArm, leftArm, leftArmZ);
        writeRigPart(meshes.rightArm, i, u.x, y, u.z, yaw, pivots.rightArm, rightArm, rightArmZ);
        const shade = 0.9 + ((Math.imul(u.id, 2246822519) >>> 0) % 18) / 100;
        if (picked.has(u.id)) tintColor.setRGB(1, 0.86, 0.28);
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
    for (const p of state.projectiles) {
      const y = groundY(p.x, p.z) + 0.7;
      if (p.splash) {
        if (balls < MAX_SHOTS) {
          writeInstance(ballMesh, balls, p.x, y, p.z);
          balls += 1;
        }
      } else if (bolts < MAX_SHOTS) {
        writeInstance(boltMesh, bolts, p.x, y, p.z);
        bolts += 1;
      }
    }
    finishInstances(boltMesh, bolts);
    finishInstances(ballMesh, balls);

    syncList(
      flags,
      state.rallies,
      () => makeFlag(),
      (node, f) => node.position.set(f.x, plantY(f.x, f.z, 0.04), f.z)
    );

    keep.traverse((child) => {
      if (child.userData.keepBody && child.material?.emissive) {
        const hurt = state.keepHp / state.keepMax;
        child.material.emissive.setHex(hurt < 0.35 ? 0x440000 : 0x000000);
      }
    });
    for (const node of buildings.values()) {
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
    groundAt,
    lookGround,
    troopPortraits,
    sync,
    render() {
      renderer.render(scene, camera);
    },
  };
}
