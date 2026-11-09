import * as THREE from "three";
import { getRecipe } from "./levels.js";
import { CHUNK, STREAM, TILE, cellInfo, chunkKey, worldToChunk } from "./world.js";

function noise(g, n) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    g.fillRect(Math.random() * g.canvas.width, Math.random() * g.canvas.height, 2 + Math.random() * 18, 2 + Math.random() * 10);
  }
}

function canvasTex(draw, repeatX, repeatY) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  draw(g, c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  return tex;
}

function bumpTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = 90 + Math.random() * 80;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 10, 2 + Math.random() * 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 2.2);
  return tex;
}

function makeMaps() {
  const wallpaper = canvasTex((g, c) => {
    g.fillStyle = "#d2b24c";
    g.fillRect(0, 0, c.width, c.height);
    const col = 36;
    const row = 26;
    for (let x = 0; x < c.width; x += col) {
      g.fillStyle = "#c4a240";
      g.fillRect(x, 0, 3, c.height);
      g.fillStyle = "#be9a38";
      g.fillRect(x + 17, 0, 1, c.height);
      for (let y = 0; y < c.height; y += row) {
        g.fillStyle = "#b89238";
        g.beginPath();
        g.moveTo(x + 6, y + 4);
        g.lineTo(x + 20, y + 13);
        g.lineTo(x + 6, y + 22);
        g.lineTo(x + 10, y + 13);
        g.closePath();
        g.fill();
        g.fillStyle = "#a88230";
        g.beginPath();
        g.moveTo(x + 22, y + 8);
        g.lineTo(x + 32, y + 13);
        g.lineTo(x + 22, y + 18);
        g.closePath();
        g.fill();
      }
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(80, 60, 16, ${Math.random() * 0.06})`;
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 1, 1);
    }
  }, 2.1, 2.0);

  const carpet = canvasTex((g, c) => {
    g.fillStyle = "#8a7030";
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 11000; i++) {
      g.fillStyle = Math.random() > 0.5 ? "#7a6228" : "#9a7e38";
      g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
    }
  }, 2.4, 2.4);

  const wood = canvasTex((g, c) => {
    g.fillStyle = "#8a6a3a";
    g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < c.height; y += 42) {
      g.fillStyle = y % 84 === 0 ? "#7a5a30" : "#9a7844";
      g.fillRect(0, y, c.width, 40);
      g.strokeStyle = "rgba(40, 24, 8, 0.35)";
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(c.width, y);
      g.stroke();
    }
    noise(g, 80);
  }, 1.6, 1.6);

  const tile = canvasTex((g, c) => {
    g.fillStyle = "#9aa39c";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#6e7670";
    g.lineWidth = 6;
    for (let i = 0; i <= 8; i++) {
      g.beginPath();
      g.moveTo((i * c.width) / 8, 0);
      g.lineTo((i * c.width) / 8, c.height);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (i * c.height) / 8);
      g.lineTo(c.width, (i * c.height) / 8);
      g.stroke();
    }
    noise(g, 140);
  }, 1.8, 1.8);

  const concrete = canvasTex((g, c) => {
    g.fillStyle = "#3a3732";
    g.fillRect(0, 0, c.width, c.height);
    noise(g, 500);
    g.strokeStyle = "rgba(10,8,6,0.4)";
    g.beginPath();
    g.moveTo(20, 80);
    g.lineTo(480, 200);
    g.stroke();
  }, 2.6, 2.6);

  const poolTile = canvasTex((g, c) => {
    g.fillStyle = "#c5cdc8";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#8e9792";
    g.lineWidth = 5;
    for (let i = 0; i <= 6; i++) {
      g.beginPath();
      g.moveTo((i * c.width) / 6, 0);
      g.lineTo((i * c.width) / 6, c.height);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (i * c.height) / 6);
      g.lineTo(c.width, (i * c.height) / 6);
      g.stroke();
    }
    noise(g, 90);
  }, 1.5, 1.6);

  const ceiling = canvasTex((g, c) => {
    g.fillStyle = "#d8cba0";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#6a5c38";
    g.lineWidth = 10;
    for (let i = 0; i <= 2; i++) {
      g.beginPath();
      g.moveTo((i * c.width) / 2, 0);
      g.lineTo((i * c.width) / 2, c.height);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (i * c.height) / 2);
      g.lineTo(c.width, (i * c.height) / 2);
      g.stroke();
    }
    noise(g, 80);
  }, 1, 1);

  const face = canvasTex((g, c) => {
    g.fillStyle = "#1a1612";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#2c2418";
    g.beginPath();
    g.ellipse(256, 270, 110, 140, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#0c0a08";
    g.beginPath();
    g.ellipse(220, 250, 18, 10, 0, 0, Math.PI * 2);
    g.ellipse(292, 250, 18, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#3a3020";
    g.beginPath();
    g.moveTo(230, 320);
    g.quadraticCurveTo(256, 340, 282, 320);
    g.stroke();
  }, 1, 1);
  face.repeat.set(1, 1);

  return { wallpaper, carpet, wood, tile, concrete, poolTile, ceiling, face, bump: bumpTex() };
}

function std(map, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: opts.bump,
    bumpScale: opts.bumpScale ?? 0,
    roughness: opts.roughness ?? 0.86,
    metalness: opts.metalness ?? 0,
    color: opts.color ?? 0xffffff,
  });
}

export function createView3D(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.4, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.68;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(74, 1, 0.08, 60);
  const maps = makeMaps();

  const mats = {
    lobbyWall: std(maps.wallpaper, { roughness: 0.86, bump: maps.bump, bumpScale: 0.04 }),
    lobbyFloor: std(maps.carpet, { roughness: 0.98, bump: maps.bump, bumpScale: 0.03 }),
    manilaWall: new THREE.MeshStandardMaterial({ color: 0xc4b48a, roughness: 0.86 }),
    woodFloor: std(maps.wood, { roughness: 0.88, bump: maps.bump, bumpScale: 0.08 }),
    poolWall: std(maps.poolTile, { roughness: 0.28, metalness: 0.06, bump: maps.bump, bumpScale: 0.06 }),
    poolFloor: std(maps.tile, { roughness: 0.34, bump: maps.bump, bumpScale: 0.05 }),
    parkWall: std(maps.concrete, { roughness: 0.92, bump: maps.bump, bumpScale: 0.22 }),
    parkFloor: std(maps.concrete, { roughness: 0.94, bump: maps.bump, bumpScale: 0.12 }),
    ceiling: new THREE.MeshStandardMaterial({
      map: maps.ceiling,
      roughness: 0.86,
      emissive: 0x4a4030,
      emissiveIntensity: 0.22,
    }),
    voidCeil: new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 1 }),
    door: new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.72 }),
    woodDoor: new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.68 }),
    fireDoor: new THREE.MeshStandardMaterial({ color: 0x8c1818, roughness: 0.55, metalness: 0.15 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a8e94, roughness: 0.32, metalness: 0.72 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.62 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc4a056, roughness: 0.35, metalness: 0.55 }),
    exitSign: new THREE.MeshStandardMaterial({ color: 0x144018, emissive: 0x2cff55, emissiveIntensity: 1.3 }),
    voidDark: new THREE.MeshStandardMaterial({ color: 0x030303, roughness: 1 }),
    yellowTear: new THREE.MeshStandardMaterial({ color: 0xd2b24c, roughness: 0.8 }),
    carpetRed: new THREE.MeshStandardMaterial({ color: 0x6a2428, roughness: 0.9 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x4a3218, roughness: 0.74 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.85 }),
    box: new THREE.MeshStandardMaterial({ color: 0x8a7048, roughness: 0.9 }),
    cone: new THREE.MeshStandardMaterial({ color: 0xc45a18, roughness: 0.55 }),
    outlet: new THREE.MeshStandardMaterial({ color: 0xc8b888, roughness: 0.5 }),
    deadLight: new THREE.MeshStandardMaterial({ color: 0x3a3830, roughness: 0.7, emissive: 0x000000 }),
    harshLight: new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe8a0, emissiveIntensity: 2.4 }),
    guest: new THREE.MeshStandardMaterial({ color: 0xc8c0b4, roughness: 0.5 }),
    mannequin: new THREE.MeshStandardMaterial({ color: 0xd4c8b8, roughness: 0.35 }),
    shadow: new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1, transparent: true, opacity: 0.82 }),
    hunter: new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.7 }),
    portrait: new THREE.MeshStandardMaterial({ map: maps.face, roughness: 0.55 }),
    light: new THREE.MeshStandardMaterial({ color: 0xe8d8a0, emissive: 0xd4bc78, emissiveIntensity: 0.7 }),
    rock: new THREE.MeshStandardMaterial({ color: 0x4a4338, roughness: 0.95 }),
    hotelWall: new THREE.MeshStandardMaterial({ color: 0x6a3a3a, roughness: 0.78 }),
    officeWall: new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.7 }),
    pipeMetal: new THREE.MeshStandardMaterial({ color: 0x6a6860, metalness: 0.55, roughness: 0.35 }),
    rust: new THREE.MeshStandardMaterial({ color: 0x8a3a18, roughness: 0.7, metalness: 0.2 }),
    lamp: new THREE.MeshStandardMaterial({ color: 0xe8d090, emissive: 0xc8a050, emissiveIntensity: 0.6 }),
    cooler: new THREE.MeshStandardMaterial({ color: 0x3a5a7a, roughness: 0.45 }),
    water: new THREE.MeshPhysicalMaterial({
      color: 0x163836,
      roughness: 0.12,
      metalness: 0.18,
      transparent: true,
      opacity: 0.88,
    }),
  };

  const ambient = new THREE.AmbientLight(0xc8b98a, 0.08);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xfff2cc, 0x3a2e18, 0.12);
  scene.add(hemi);

  const flash = new THREE.SpotLight(0xfff3d0, 0, 18, 0.48, 0.32, 1);
  flash.castShadow = true;
  flash.shadow.mapSize.set(512, 512);
  flash.shadow.camera.near = 0.2;
  flash.shadow.camera.far = 18;
  camera.add(flash);
  flash.position.set(0.12, -0.12, 0.1);
  flash.target.position.set(0, -0.05, -6);
  camera.add(flash.target);
  scene.add(camera);

  const chunks = new Map();
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  const chairMesh = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), mats.chair);
  seat.position.y = 0.46;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.06), mats.chair);
  back.position.set(0, 0.7, -0.18);
  chairMesh.add(seat, back);
  for (const [ox, oz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.05), mats.chair);
    leg.position.set(ox, 0.22, oz);
    chairMesh.add(leg);
  }
  scene.add(chairMesh);

  function humanoid(mat, tall = 1.15) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, tall, 0.28), mat);
    body.position.y = tall * 0.55 + 0.12;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.24), mat);
    head.position.y = tall + 0.28;
    g.add(body, head);
    return g;
  }

  const guestMesh = humanoid(mats.guest);
  scene.add(guestMesh);
  const mannequinMesh = humanoid(mats.mannequin, 1.2);
  scene.add(mannequinMesh);
  const whisperMesh = humanoid(mats.shadow, 1.45);
  scene.add(whisperMesh);
  const hunterMesh = humanoid(mats.hunter, 1.05);
  scene.add(hunterMesh);
  const portraitMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.03), mats.portrait);
  portraitMesh.rotation.x = -Math.PI / 2.4;
  scene.add(portraitMesh);

  let recipeId = "lobby";
  let seed = 1;

  function wallMat() {
    if (recipeId === "poolrooms") return mats.poolWall;
    if (recipeId === "habitable" || recipeId === "pipes") return mats.parkWall;
    if (recipeId === "hotel") return mats.hotelWall;
    if (recipeId === "office") return mats.officeWall;
    if (recipeId === "caves") return mats.rock;
    return mats.lobbyWall;
  }

  function floorMat(kind) {
    if (kind === "water") return mats.water;
    if (kind === "tile") return mats.poolFloor;
    if (kind === "concrete") return mats.parkFloor;
    if (kind === "rock") return mats.rock;
    if (kind === "wood") return mats.woodFloor;
    return mats.lobbyFloor;
  }

  function applyRecipe(id, nextSeed) {
    recipeId = id;
    seed = nextSeed;
    const rec = getRecipe(id);
    scene.background = new THREE.Color(rec.fog);
    scene.fog = new THREE.Fog(rec.fog, rec.fogNear, rec.fogFar);
    ambient.intensity = rec.ambient;
    ambient.color.setHex(rec.light);
    hemi.color.setHex(rec.light);
    hemi.groundColor.setHex(0x8a7848);
    hemi.intensity = rec.ambient + 0.2;
    mats.light.emissive.setHex(rec.light);
    mats.light.color.setHex(rec.light);
    for (const [key, group] of chunks) {
      worldRoot.remove(group);
      chunks.delete(key);
    }
  }

  function addBox(group, geo, mat, x, y, z, cast = false) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  }

  function addProp(group, kind, x, z, info, h) {
    if (kind === "chair") {
      const seat = addBox(group, new THREE.BoxGeometry(0.4, 0.05, 0.4), mats.chair, x + 0.15, 0.44, z - 0.1, true);
      addBox(group, new THREE.BoxGeometry(0.4, 0.42, 0.05), mats.chair, x + 0.15, 0.66, z - 0.28, true);
      void seat;
    } else if (kind === "crate") {
      addBox(group, new THREE.BoxGeometry(0.55, 0.5, 0.55), mats.crate, x, 0.25, z, true);
    } else if (kind === "box") {
      addBox(group, new THREE.BoxGeometry(0.42, 0.28, 0.36), mats.box, x + 0.2, 0.14, z + 0.15, true);
    } else if (kind === "cone") {
      addBox(group, new THREE.ConeGeometry(0.14, 0.42, 8), mats.cone, x - 0.3, 0.21, z + 0.2, true);
    } else if (kind === "ladder") {
      addBox(group, new THREE.BoxGeometry(0.05, h - 0.2, 0.05), mats.crate, x + 0.7, (h - 0.2) / 2, z, true);
      addBox(group, new THREE.BoxGeometry(0.05, h - 0.2, 0.05), mats.crate, x + 0.95, (h - 0.2) / 2, z, true);
    } else if (kind === "pipe") {
      addBox(group, new THREE.CylinderGeometry(0.08, 0.08, h - 0.3, 8), mats.rust, x + 0.85, h / 2, z, true);
      addBox(group, new THREE.CylinderGeometry(0.06, 0.06, h - 0.4, 8), mats.pipeMetal, x + 1.0, h / 2, z + 0.12, true);
    } else if (kind === "stalag") {
      addBox(group, new THREE.ConeGeometry(0.18, 0.7, 7), mats.rock, x, 0.35, z, true);
    } else if (kind === "lamp") {
      addBox(group, new THREE.CylinderGeometry(0.08, 0.12, 0.55, 8), mats.lamp, x, 0.7, z + 0.7);
    } else if (kind === "cooler") {
      addBox(group, new THREE.BoxGeometry(0.38, 0.9, 0.38), mats.cooler, x, 0.45, z, true);
    } else if (kind === "table") {
      addBox(group, new THREE.CylinderGeometry(0.08, 0.1, 0.72, 8), mats.crate, x, 0.36, z, true);
      addBox(group, new THREE.CylinderGeometry(0.46, 0.46, 0.06, 10), mats.crate, x, 0.74, z, true);
    } else if (kind === "outlet") {
      const side = info.walls.e ? 1 : info.walls.w ? -1 : 0;
      const zs = info.walls.n ? 1 : info.walls.s ? -1 : 0;
      if (side || zs) {
        addBox(
          group,
          new THREE.BoxGeometry(side ? 0.04 : 0.12, 0.1, zs ? 0.04 : 0.12),
          mats.outlet,
          x + side * 1.12,
          0.42,
          z + zs * 1.12
        );
      }
    }
  }

  function facePose(face, cxw, czw) {
    const inset = TILE / 2 - 0.13;
    if (face === "n") return { x: cxw, z: czw + inset, yaw: 0 };
    if (face === "s") return { x: cxw, z: czw - inset, yaw: Math.PI };
    if (face === "e") return { x: cxw + inset, z: czw, yaw: -Math.PI / 2 };
    if (face === "w") return { x: cxw - inset, z: czw, yaw: Math.PI / 2 };
    return { x: cxw, z: czw, yaw: 0 };
  }

  function addLocal(rig, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    rig.add(m);
    return m;
  }

  function addDoorLeaf(rig, mat, y = 1.08) {
    addLocal(rig, new THREE.BoxGeometry(1.02, 2.18, 0.08), mats.steelDark, 0, y, 0.02);
    addLocal(rig, new THREE.BoxGeometry(0.88, 2.02, 0.05), mat, 0, y, 0.01);
    addLocal(rig, new THREE.BoxGeometry(0.08, 0.03, 0.12), mats.brass, 0.34, y - 0.05, -0.04);
    addLocal(rig, new THREE.BoxGeometry(0.03, 0.12, 0.03), mats.brass, 0.38, y - 0.05, -0.05);
  }

  function addStairs(rig, stepMat, railMat, down = true) {
    addLocal(rig, new THREE.BoxGeometry(1.28, 2.35, 0.04), mats.voidDark, 0, 1.15, 0.06);
    for (let i = 0; i < 7; i++) {
      const y = down ? 0.07 + i * 0.13 : 0.16 + i * 0.18;
      const z = down ? -0.08 - i * 0.12 : -0.06 - i * 0.14;
      addLocal(rig, new THREE.BoxGeometry(1.05, 0.07, 0.16), stepMat, 0, y, z);
    }
    addLocal(rig, new THREE.BoxGeometry(0.05, 0.85, 0.95), railMat, -0.5, down ? 0.55 : 0.85, -0.35);
    addLocal(rig, new THREE.BoxGeometry(0.05, 0.85, 0.95), railMat, 0.5, down ? 0.55 : 0.85, -0.35);
  }

  function addExit(group, info, cxw, czw, h) {
    const kind = info.exit?.kind || "door";
    const face = info.exit?.face;
    if (kind === "dry" && !face) {
      addBox(group, new THREE.BoxGeometry(TILE - 0.15, 0.04, TILE - 0.15), mats.water, cxw, 0.04, czw);
      return;
    }
    const pose = facePose(face || "n", cxw, czw);
    const rig = new THREE.Group();
    rig.position.set(pose.x, 0, pose.z);
    rig.rotation.y = pose.yaw;
    group.add(rig);

    if (kind === "elevator") {
      addLocal(rig, new THREE.BoxGeometry(1.46, 2.5, 0.12), mats.steel, 0, 1.25, 0.03);
      addLocal(rig, new THREE.BoxGeometry(1.2, 2.28, 0.04), mats.voidDark, 0, 1.2, 0.05);
      addLocal(rig, new THREE.BoxGeometry(0.54, 2.15, 0.05), mats.steelDark, -0.28, 1.18, 0.0);
      addLocal(rig, new THREE.BoxGeometry(0.54, 2.15, 0.05), mats.steelDark, 0.28, 1.18, 0.0);
      addLocal(rig, new THREE.BoxGeometry(0.12, 0.28, 0.04), mats.steel, 0.72, 1.15, -0.02);
      addLocal(rig, new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), mats.exitSign, 0.72, 1.22, -0.05);
    } else if (kind === "stair") {
      const hotel = recipeId === "hotel";
      addStairs(rig, hotel ? mats.carpetRed : mats.parkFloor, hotel ? mats.brass : mats.steel);
      if (hotel) addLocal(rig, new THREE.BoxGeometry(1.05, 0.02, 0.9), mats.carpetRed, 0, 0.09, -0.2);
    } else if (kind === "boiler") {
      addStairs(rig, mats.rust, mats.steelDark, true);
      addLocal(rig, new THREE.BoxGeometry(1.3, 0.08, 0.1), mats.rust, 0, 2.2, 0.02);
    } else if (kind === "fireexit") {
      addDoorLeaf(rig, mats.fireDoor);
      addLocal(rig, new THREE.BoxGeometry(0.42, 0.12, 0.04), mats.exitSign, 0, 2.28, -0.02);
    } else if (kind === "manila") {
      addDoorLeaf(rig, mats.woodDoor, 1.05);
    } else if (kind === "garage") {
      const portal = recipeId === "habitable" || recipeId === "caves" ? mats.yellowTear : mats.parkWall;
      addLocal(rig, new THREE.BoxGeometry(1.35, h * 0.92, 0.06), portal, 0, h * 0.46, 0.02);
      addLocal(rig, new THREE.BoxGeometry(1.05, h * 0.78, 0.03), mats.voidDark, 0, h * 0.42, 0.0);
    } else if (kind === "cave") {
      addLocal(rig, new THREE.CylinderGeometry(0.62, 0.72, 0.12, 10), mats.voidDark, 0, 0.85, 0.04);
      addBox(group, new THREE.BoxGeometry(0.9, 0.06, 0.9), mats.water, cxw, 0.05, czw);
    } else if (kind === "dry") {
      addLocal(rig, new THREE.BoxGeometry(1.2, 2.3, 0.08), mats.manilaWall, 0, 1.15, 0.03);
      addLocal(rig, new THREE.BoxGeometry(0.95, 2.05, 0.04), mats.voidDark, 0, 1.1, 0.01);
    } else {
      addDoorLeaf(rig, mats.steel);
    }
  }

  function buildChunk(cx, cz) {
    const rec = getRecipe(recipeId);
    const group = new THREE.Group();
    group.userData.cx = cx;
    group.userData.cz = cz;
    group.userData.lights = [];
    const wallG = new THREE.BoxGeometry(1, 1, 1);
    const floorG = new THREE.BoxGeometry(TILE, 0.06, TILE);
    const ceilG = new THREE.BoxGeometry(TILE, 0.08, TILE);
    const pillarG = new THREE.CylinderGeometry(0.18, 0.2, rec.ceiling, 10);
    const boardG = new THREE.BoxGeometry(0.08, 0.1, TILE);
    const boardZ = new THREE.BoxGeometry(TILE, 0.1, 0.08);

    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        const tx = cx * CHUNK + lx;
        const tz = cz * CHUNK + lz;
        const info = cellInfo(recipeId, seed, tx, tz);
        const cxw = (tx + 0.5) * TILE;
        const czw = (tz + 0.5) * TILE;
        const recH = rec.ceiling;
        const curved = info.curved;

        if (info.solid) {
          const rock = addBox(group, wallG, mats.rock, cxw, recH / 2, czw, true);
          rock.scale.set(TILE, recH, TILE);
          continue;
        }

        if (info.floor === "water") {
          addBox(group, floorG, mats.water, cxw, 0.1, czw);
        } else {
          addBox(group, floorG, floorMat(info.floor), cxw, info.door ? -0.01 : -0.03, czw);
        }

        const h = recH;
        if (info.hole) {
          addBox(group, ceilG, mats.voidCeil, cxw, h + 0.18, czw);
        } else {
          addBox(group, ceilG, mats.ceiling, cxw, h + 0.02, czw);
        }
        const thick = curved ? 0.22 : 0.2;
        const wmat = info.manila ? mats.manilaWall : wallMat();
        if (info.walls.e) {
          const w = addBox(group, wallG, wmat, cxw + TILE / 2, h / 2, czw, true);
          w.scale.set(thick, h, TILE);
          if (!curved) addBox(group, boardG, wmat, cxw + TILE / 2, 0.06, czw);
        }
        if (info.walls.n) {
          const w = addBox(group, wallG, wmat, cxw, h / 2, czw + TILE / 2, true);
          w.scale.set(TILE, h, thick);
          if (!curved) addBox(group, boardZ, wmat, cxw, 0.06, czw + TILE / 2);
        }
        if (info.walls.w) {
          const w = addBox(group, wallG, wmat, cxw - TILE / 2, h / 2, czw, true);
          w.scale.set(thick, h, TILE);
          if (!curved) addBox(group, boardG, wmat, cxw - TILE / 2, 0.06, czw);
        }
        if (info.walls.s) {
          const w = addBox(group, wallG, wmat, cxw, h / 2, czw - TILE / 2, true);
          w.scale.set(TILE, h, thick);
          if (!curved) addBox(group, boardZ, wmat, cxw, 0.06, czw - TILE / 2);
        }
        if (curved && (info.walls.e || info.walls.n || info.walls.w || info.walls.s)) {
          const col = addBox(group, new THREE.CylinderGeometry(0.22, 0.26, h, 10), wallMat(), cxw + (info.walls.e ? 0.9 : info.walls.w ? -0.9 : 0), h / 2, czw + (info.walls.n ? 0.9 : info.walls.s ? -0.9 : 0), true);
          void col;
        }

        if (info.pillar) addBox(group, pillarG, wallMat(), cxw, rec.ceiling / 2, czw, true);

        if (info.door || info.exit) addExit(group, info, cxw, czw, h);

        if (!info.water && !info.hole) {
          const mode = info.light || "normal";
          const lmat = mode === "dead" ? mats.deadLight : mode === "harsh" ? mats.harshLight : mats.light;
          addBox(group, new THREE.BoxGeometry(1.15, 0.05, 0.42), lmat, cxw, h - 0.01, czw);
          if (mode !== "dead") {
            group.userData.lights.push({ x: cxw, y: h - 0.16, z: czw, mode });
          }
        }

        if (info.prop) addProp(group, info.prop, cxw, czw, info, h);
      }
    }

    worldRoot.add(group);
    return group;
  }

  const pool = [];
  for (let i = 0; i < 12; i++) {
    const p = new THREE.PointLight(0xfff1c2, 0, 11, 1.4);
    p.castShadow = false;
    scene.add(p);
    pool.push(p);
  }

  function syncChunks(px, pz) {
    const { cx, cz } = worldToChunk(px, pz);
    const need = new Set();
    for (let dx = -STREAM; dx <= STREAM; dx++) {
      for (let dz = -STREAM; dz <= STREAM; dz++) {
        need.add(chunkKey(cx + dx, cz + dz));
      }
    }
    for (const [key, group] of chunks) {
      if (!need.has(key)) {
        worldRoot.remove(group);
        chunks.delete(key);
      }
    }
    for (const key of need) {
      if (chunks.has(key)) continue;
      const [sx, sz] = key.split(",").map(Number);
      chunks.set(key, buildChunk(sx, sz));
    }

    const rec = getRecipe(recipeId);
    const lights = [];
    for (const group of chunks.values()) {
      for (const l of group.userData.lights) lights.push(l);
    }
    const ranked = lights
      .map((l) => ({ l, d: (l.x - px) * (l.x - px) + (l.z - pz) * (l.z - pz) }))
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < pool.length; i++) {
      const item = ranked[i];
      const p = pool[i];
      if (!item) {
        p.intensity = 0;
        continue;
      }
      p.color.setHex(item.l.mode === "harsh" ? 0xfff4c8 : rec.light);
      p.position.set(item.l.x, item.l.y, item.l.z);
      const flicker =
        item.l.mode === "harsh"
          ? 0.85 + Math.sin(performance.now() * 0.04 + item.l.x) * 0.18
          : 0.92 + Math.sin(performance.now() * 0.012 + item.l.x) * 0.06;
      const gain = item.l.mode === "harsh" ? 26 : item.l.mode === "dim" ? 7 : 15;
      p.intensity = rec.lightGain * gain * flicker;
      p.distance = item.l.mode === "harsh" ? 12 : recipeId === "poolrooms" ? 11 : 7.5;
    }
  }

  function setCamera(x, y, z, yaw, pitch) {
    camera.position.set(x, y, z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
  }

  function setFlash(on, dim = 0) {
    flash.intensity = on ? 24 * (1 - dim * 0.7) : 0;
  }

  function setBlinkDim(amount) {
    renderer.toneMappingExposure = 0.68 * (1 - amount * 0.55);
  }

  function syncProps(ents) {
    const chair = ents.find((e) => e.kind === "chair");
    const guest = ents.find((e) => e.kind === "guest");
    const mannequin = ents.find((e) => e.kind === "mannequin");
    const whisper = ents.find((e) => e.kind === "whisper");
    const portrait = ents.find((e) => e.kind === "portrait");
    chairMesh.visible = !!chair;
    if (chair) chairMesh.position.set(chair.x, 0, chair.z);
    guestMesh.visible = !!(guest && guest.live);
    if (guest && guest.live) {
      guestMesh.position.set(guest.x, 0, guest.z);
      if (guest.yaw != null) guestMesh.rotation.y = guest.yaw;
    }
    mannequinMesh.visible = !!(mannequin && mannequin.live);
    if (mannequin && mannequin.live) {
      mannequinMesh.position.set(mannequin.x, 0, mannequin.z);
      mannequinMesh.rotation.y = mannequin.yaw || 0;
    }
    whisperMesh.visible = !!(whisper && whisper.live && whisper.shown);
    if (whisper && whisper.live) {
      whisperMesh.position.set(whisper.x, 0, whisper.z);
      whisperMesh.rotation.y = whisper.yaw || 0;
    }
    portraitMesh.visible = !!(portrait && portrait.live);
    hunterMesh.visible = !!(portrait && portrait.live && portrait.hunting);
    if (portrait && portrait.live) {
      portraitMesh.position.set(portrait.x, 0.28, portrait.z);
      if (portrait.hunting) hunterMesh.position.set(portrait.hx, 0, portrait.hz);
    }
  }

  const ndc = new THREE.Vector3();
  function inView(x, y, z) {
    ndc.set(x, y, z).project(camera);
    return ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) < 1.05 && Math.abs(ndc.y) < 1.15;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function render() {
    renderer.render(scene, camera);
  }

  applyRecipe("lobby", 1);
  resize();
  window.addEventListener("resize", resize);

  return {
    camera,
    applyRecipe,
    syncChunks,
    setCamera,
    setFlash,
    setBlinkDim,
    syncProps,
    inView,
    resize,
    render,
  };
}
