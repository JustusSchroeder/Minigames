import * as THREE from "three";
import { getRecipe } from "./levels.js";
import { CHUNK, STREAM, TILE, cellInfo, chunkKey, groundAt, worldToChunk } from "./world.js";
import {
  roomProfile,
  POOL_MACRO,
  POOL_PILLAR_R,
  POOL_WALL_T,
  POOL_ARC_SEGS,
  outlineWallRuns,
  outerForSegment,
  outlineSAt,
  roundedRectOutline,
  sdfClosed,
  spiralLayout,
  OCULUS_THETA,
  oculusRim,
  vaultMetrics,
} from "./poolrooms.js";

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

function tileBumpTex(cols, rows, repeatX, repeatY) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#b0b0b0";
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "#3a3a3a";
  g.lineWidth = 4;
  for (let i = 0; i <= cols; i++) {
    const x = (i * 256) / cols;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = (j * 256) / rows;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(256, y);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function drawCeramic(g, c, spec) {
  const cols = spec.cols;
  const rows = spec.rows;
  const groutW = spec.groutW ?? 5;
  const colors = spec.colors;
  g.fillStyle = spec.grout;
  g.fillRect(0, 0, c.width, c.height);
  const tw = c.width / cols;
  const th = c.height / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const pick = colors[(i * 17 + j * 11) % colors.length];
      g.fillStyle = pick;
      g.fillRect(i * tw + groutW, j * th + groutW, tw - groutW * 2, th - groutW * 2);
      g.fillStyle = spec.glaze || "rgba(255,255,255,0.1)";
      g.fillRect(
        i * tw + groutW + 2,
        j * th + groutW + 2,
        (tw - groutW * 2) * 0.42,
        (th - groutW * 2) * 0.16
      );
    }
  }
  noise(g, spec.noise ?? 70);
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
    drawCeramic(g, c, {
      cols: 12,
      rows: 12,
      groutW: 4,
      grout: "#e7f4f1",
      colors: ["#b7ddd6", "#c8ebe4", "#a8d0cb", "#d4f2ec", "#9ec9c2", "#c0e4dc"],
      glaze: "rgba(255,255,255,0.14)",
      noise: 60,
    });
  }, 2.2, 2.4);

  const poolFloor = canvasTex((g, c) => {
    drawCeramic(g, c, {
      cols: 8,
      rows: 8,
      groutW: 5,
      grout: "#c5ddd8",
      colors: ["#8ec9bf", "#a3d6cd", "#7eb8b0", "#b5e0d8", "#6fa8a0"],
      glaze: "rgba(255,255,255,0.12)",
      noise: 50,
    });
  }, 2.0, 2.0);

  const poolBasin = canvasTex((g, c) => {
    drawCeramic(g, c, {
      cols: 8,
      rows: 8,
      groutW: 5,
      grout: "#5a8f88",
      colors: ["#2f7a72", "#3a8a82", "#276860", "#45968d", "#1f5c56"],
      glaze: "rgba(180,230,220,0.08)",
      noise: 40,
    });
  }, 2.0, 2.0);

  const poolCeil = canvasTex((g, c) => {
    g.fillStyle = "#dceeea";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f3faf8";
    g.fillRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = "#fbfffe";
    g.fillRect(28, 28, c.width - 56, c.height - 56);
    noise(g, 28);
  }, 1, 1);

  const poolStain = canvasTex((g, c) => {
    drawCeramic(g, c, {
      cols: 12,
      rows: 12,
      groutW: 4,
      grout: "#6a8f88",
      colors: ["#5a8a82", "#4a7a72", "#3f6e68", "#628e86"],
      glaze: "rgba(180,220,210,0.06)",
      noise: 40,
    });
  }, 2.2, 2.4);

  const checker = canvasTex((g, c) => {
    const n = 8;
    const tw = c.width / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        g.fillStyle = (i + j) % 2 === 0 ? "#d2c4a0" : "#4a453c";
        g.fillRect(i * tw, j * tw, tw, tw);
      }
    }
    noise(g, 40);
  }, 2.0, 2.0);

  const caustic = canvasTex((g, c) => {
    g.fillStyle = "#000000";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "rgba(180,255,240,0.55)";
    g.lineWidth = 3;
    for (let i = 0; i < 28; i++) {
      g.beginPath();
      const x0 = Math.random() * c.width;
      const y0 = Math.random() * c.height;
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + 40, y0 + 80, x0 + 90, y0 + 20);
      g.quadraticCurveTo(x0 + 140, y0 - 30, x0 + 180, y0 + 40);
      g.stroke();
    }
  }, 3.2, 3.2);

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

  return {
    wallpaper,
    carpet,
    wood,
    tile,
    concrete,
    poolTile,
    poolFloor,
    poolBasin,
    poolCeil,
    poolStain,
    checker,
    caustic,
    poolBump: tileBumpTex(12, 12, 2.2, 2.4),
    poolFloorBump: tileBumpTex(8, 8, 2.0, 2.0),
    ceiling,
    face,
    bump: bumpTex(),
  };
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
    poolWall: std(maps.poolTile, { roughness: 0.16, metalness: 0.04, bump: maps.poolBump, bumpScale: 0.045 }),
    poolFloor: Object.assign(std(maps.poolFloor, { roughness: 0.22, metalness: 0.04, bump: maps.poolFloorBump, bumpScale: 0.04 }), {
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    poolBasin: std(maps.poolBasin, { roughness: 0.28, metalness: 0.02, bump: maps.poolFloorBump, bumpScale: 0.05 }),
    officeFloor: std(maps.tile, { roughness: 0.34, bump: maps.bump, bumpScale: 0.05 }),
    poolCeiling: new THREE.MeshStandardMaterial({
      map: maps.poolCeil,
      roughness: 0.32,
      metalness: 0.02,
      emissive: 0xcfeae6,
      emissiveIntensity: 0.38,
    }),
    poolCeilingDim: new THREE.MeshStandardMaterial({
      map: maps.poolCeil,
      roughness: 0.4,
      metalness: 0.02,
      emissive: 0x6a9a96,
      emissiveIntensity: 0.08,
    }),
    poolWater: new THREE.MeshPhysicalMaterial({
      color: 0x1e8f86,
      roughness: 0.07,
      metalness: 0,
      transparent: true,
      opacity: 0.62,
      ior: 1.333,
      envMapIntensity: 1.35,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
    poolLine: std(maps.poolStain, { roughness: 0.28, metalness: 0.02, bump: maps.poolBump, bumpScale: 0.04 }),
    poolCeilTile: Object.assign(std(maps.poolTile, { roughness: 0.22, metalness: 0.03, bump: maps.poolBump, bumpScale: 0.03 }), {
      side: THREE.FrontSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    poolCeilInside: Object.assign(std(maps.poolTile, { roughness: 0.22, metalness: 0.03, bump: maps.poolBump, bumpScale: 0.03 }), {
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    leisureFloor: std(maps.checker, { roughness: 0.55, bump: maps.bump, bumpScale: 0.04 }),
    caustic: new THREE.MeshBasicMaterial({
      map: maps.caustic,
      transparent: true,
      opacity: 0.32,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xc8d0d4, metalness: 0.82, roughness: 0.22 }),
    mushroom: new THREE.MeshStandardMaterial({ color: 0xc45a32, roughness: 0.55 }),
    mushroomStem: new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.7 }),
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
    oculusSky: new THREE.MeshBasicMaterial({ color: 0xc5e6e0, side: THREE.DoubleSide }),
    yellowTear: new THREE.MeshStandardMaterial({ color: 0xd2b24c, roughness: 0.8 }),
    carpetRed: new THREE.MeshStandardMaterial({ color: 0x6a2428, roughness: 0.9 }),
    chair: new THREE.MeshStandardMaterial({ color: 0x4a3218, roughness: 0.74 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x6a4a28, roughness: 0.85 }),
    box: new THREE.MeshStandardMaterial({ color: 0x8a7048, roughness: 0.9 }),
    cone: new THREE.MeshStandardMaterial({ color: 0xc45a18, roughness: 0.55 }),
    outlet: new THREE.MeshStandardMaterial({ color: 0xc8b888, roughness: 0.5 }),
    deadLight: new THREE.MeshStandardMaterial({ color: 0x3a3830, roughness: 0.7, emissive: 0x000000 }),
    harshLight: new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xffe8a0, emissiveIntensity: 2.4 }),
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

  mats.poolWater.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      transformed.y += sin(position.x * 1.55 + uTime * 1.12) * 0.03 + sin(position.z * 1.22 - uTime * 0.88) * 0.022;`
    );
    mats.poolWater.userData.shader = shader;
  };
  mats.poolWater.customProgramCacheKey = () => "pool-water-waves";

  const ambient = new THREE.AmbientLight(0xc8b98a, 0.08);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xfff2cc, 0x3a2e18, 0.12);
  scene.add(hemi);

  const flash = new THREE.SpotLight(0xfff3d0, 0, 22, 0.52, 0.38, 1);
  flash.castShadow = true;
  flash.shadow.mapSize.set(512, 512);
  flash.shadow.camera.near = 0.2;
  flash.shadow.camera.far = 22;
  camera.add(flash);
  flash.position.set(0.14, -0.1, 0.08);
  flash.target.position.set(0, -0.04, -8);
  camera.add(flash.target);
  scene.add(camera);

  const chunks = new Map();
  const worldRoot = new THREE.Group();
  scene.add(worldRoot);

  const guestHeight = 2.15;
  const guestTex = new THREE.TextureLoader().load("assets/monster.png");
  guestTex.colorSpace = THREE.SRGBColorSpace;
  const guestMat = new THREE.SpriteMaterial({
    map: guestTex,
    transparent: true,
    alphaTest: 0.12,
    depthTest: true,
    depthWrite: false,
  });
  const lurkerAspect = 958 / 1742;
  const lurkerTex = new THREE.TextureLoader().load("assets/lurker.png");
  lurkerTex.colorSpace = THREE.SRGBColorSpace;
  const lurkerMat = new THREE.SpriteMaterial({
    map: lurkerTex,
    transparent: true,
    alphaTest: 0.18,
    depthTest: true,
    depthWrite: true,
    fog: true,
  });
  function lurkerHeight() {
    return Math.min(getRecipe(recipeId).ceiling * 0.94, 3.15);
  }
  const mannequinHeight = 2.75;
  const mannequinAspect = 386 / 518;
  const mannequinTex = new THREE.TextureLoader().load("assets/mannequin.png");
  mannequinTex.colorSpace = THREE.SRGBColorSpace;
  const mannequinMat = new THREE.SpriteMaterial({
    map: mannequinTex,
    transparent: true,
    alphaTest: 0.12,
    depthTest: true,
    depthWrite: false,
  });
  const portraitTex = new THREE.TextureLoader().load("assets/portrait.jpg");
  portraitTex.colorSpace = THREE.SRGBColorSpace;
  const portraitFloorMat = new THREE.MeshStandardMaterial({ map: portraitTex, roughness: 0.62 });
  const portraitHuntHeight = 1.55;
  const portraitHuntMat = new THREE.SpriteMaterial({
    map: portraitTex,
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: false,
  });

  function makeChairMesh() {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), mats.chair);
    seat.position.y = 0.46;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.06), mats.chair);
    back.position.set(0, 0.7, -0.18);
    group.add(seat, back);
    for (const [ox, oz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.44, 0.05), mats.chair);
      leg.position.set(ox, 0.22, oz);
      group.add(leg);
    }
    group.visible = false;
    scene.add(group);
    return group;
  }

  function makeSprite(mat, sx, sy) {
    const mesh = new THREE.Sprite(mat);
    mesh.scale.set(sx, sy, 1);
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }

  function makePortraitFloor() {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.98, 0.03), portraitFloorMat);
    mesh.rotation.x = -Math.PI / 2.4;
    mesh.visible = false;
    scene.add(mesh);
    return mesh;
  }

  const actorPools = {
    chair: { list: [], used: 0, make: makeChairMesh },
    guest: { list: [], used: 0, make: () => makeSprite(guestMat, guestHeight * (528 / 831), guestHeight) },
    lurker: { list: [], used: 0, make: () => makeSprite(lurkerMat, lurkerHeight() * lurkerAspect, lurkerHeight()) },
    mannequin: { list: [], used: 0, make: () => makeSprite(mannequinMat, mannequinHeight * mannequinAspect, mannequinHeight) },
    portraitFloor: { list: [], used: 0, make: makePortraitFloor },
    portraitStand: {
      list: [],
      used: 0,
      make: () => makeSprite(portraitHuntMat, portraitHuntHeight * (466 / 659), portraitHuntHeight),
    },
  };

  function takeActor(kind) {
    const pool = actorPools[kind];
    let mesh = pool.list[pool.used];
    if (!mesh) {
      mesh = pool.make();
      pool.list.push(mesh);
    }
    pool.used += 1;
    mesh.visible = true;
    return mesh;
  }

  function resetActors() {
    for (const pool of Object.values(actorPools)) {
      for (const mesh of pool.list) mesh.visible = false;
      pool.used = 0;
    }
  }

  let recipeId = "lobby";
  let seed = 1;
  let exposureBase = 0.68;
  let poolEnv = null;
  let geomDebug = new URLSearchParams(location.search).has("geomdebug");
  const dbgMats = {
    outline: new THREE.LineBasicMaterial({ color: 0xf0d24a, depthTest: false, transparent: true, opacity: 0.95 }),
    arc: new THREE.LineBasicMaterial({ color: 0x48e0e6, depthTest: false, transparent: true, opacity: 0.95 }),
    collision: new THREE.LineBasicMaterial({ color: 0xff4a4a, depthTest: false, transparent: true, opacity: 0.85 }),
    invalid: new THREE.LineBasicMaterial({ color: 0xff2a6d, depthTest: false }),
    join: new THREE.PointsMaterial({ color: 0xff3d8a, size: 0.14, depthTest: false, sizeAttenuation: true }),
  };

  function ensurePoolEnv() {
    if (poolEnv) return poolEnv;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0xc8ece8);
    envScene.add(new THREE.HemisphereLight(0xf5ffff, 0x0e4a46, 1.15));
    poolEnv = pmrem.fromScene(envScene, 0.03).texture;
    pmrem.dispose();
    return poolEnv;
  }

  function wallMat() {
    if (recipeId === "poolrooms") return mats.poolWall;
    if (recipeId === "habitable" || recipeId === "pipes") return mats.parkWall;
    if (recipeId === "hotel") return mats.hotelWall;
    if (recipeId === "office") return mats.officeWall;
    if (recipeId === "caves") return mats.rock;
    return mats.lobbyWall;
  }

  function floorMat(kind) {
    if (kind === "water") return recipeId === "poolrooms" ? mats.poolWater : mats.water;
    if (kind === "tile") return recipeId === "poolrooms" ? mats.poolFloor : mats.officeFloor;
    if (kind === "checker") return mats.leisureFloor;
    if (kind === "concrete") return mats.parkFloor;
    if (kind === "rock") return mats.rock;
    if (kind === "wood") return mats.woodFloor;
    return mats.lobbyFloor;
  }

  function applyRecipe(id, nextSeed) {
    recipeId = id;
    seed = nextSeed;
    const rec = getRecipe(id);
    const pools = id === "poolrooms";
    scene.background = new THREE.Color(rec.fog);
    scene.fog = new THREE.Fog(rec.fog, rec.fogNear, rec.fogFar);
    ambient.intensity = rec.ambient;
    ambient.color.setHex(rec.light);
    hemi.color.setHex(rec.light);
    hemi.groundColor.setHex(pools ? 0x1a5a55 : 0x8a7848);
    hemi.intensity = rec.ambient + (pools ? 0.32 : 0.2);
    mats.light.emissive.setHex(rec.light);
    mats.light.color.setHex(rec.light);
    exposureBase = rec.exposure ?? 0.68;
    renderer.toneMappingExposure = exposureBase;
    if (pools) {
      const env = ensurePoolEnv();
      mats.poolWater.envMap = env;
      mats.poolWall.envMap = env;
      mats.poolFloor.envMap = env;
      mats.poolBasin.envMap = env;
      mats.poolCeiling.envMap = env;
      mats.poolCeilingDim.envMap = env;
      mats.poolLine.envMap = env;
      mats.poolCeilTile.envMap = env;
      mats.poolCeilInside.envMap = env;
      mats.poolWall.envMapIntensity = 0.42;
      mats.poolFloor.envMapIntensity = 0.38;
      mats.poolBasin.envMapIntensity = 0.35;
      mats.poolCeiling.envMapIntensity = 0.2;
      mats.poolCeilTile.envMapIntensity = 0.28;
      mats.poolCeilInside.envMapIntensity = 0.28;
      mats.poolLine.envMapIntensity = 0.3;
    }
    for (const [key, group] of chunks) {
      disposeGroup(group);
      chunks.delete(key);
    }
  }

  function disposeGroup(group) {
    const geos = new Set();
    group.traverse((obj) => {
      if (obj.geometry) geos.add(obj.geometry);
    });
    worldRoot.remove(group);
    for (const geo of geos) geo.dispose();
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
      const side = info.walls.e ? 1 : info.walls.w ? -1 : 0;
      const zs = info.walls.n ? 1 : info.walls.s ? -1 : 0;
      if (!side && !zs) return;
      const inset = TILE / 2 - 0.16;
      const px = x + (side ? side * inset : 0.14);
      const pz = z + (zs ? zs * (side ? 0.14 : inset) : 0);
      const ph = h + 0.2;
      addBox(group, new THREE.CylinderGeometry(0.08, 0.08, ph, 8), mats.rust, px, ph / 2 - 0.1, pz, true);
      addBox(
        group,
        new THREE.CylinderGeometry(0.055, 0.055, ph, 8),
        mats.pipeMetal,
        px + (side ? -side * 0.15 : 0.13),
        ph / 2 - 0.1,
        pz + (zs && !side ? -zs * 0.15 : 0.09),
        true
      );
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

  function overlap1(a, b, lo, hi) {
    const x0 = Math.max(a, lo);
    const x1 = Math.min(b, hi);
    return x1 - x0 > 0.08 ? [x0, x1] : null;
  }

  function cutGaps(lo, hi, gaps) {
    let segs = [[lo, hi]];
    for (const g of gaps) {
      if (!g) continue;
      const next = [];
      for (const [a, b] of segs) {
        if (g.b <= a || g.a >= b) {
          next.push([a, b]);
          continue;
        }
        if (g.a > a + 0.08) next.push([a, g.a]);
        if (g.b < b - 0.08) next.push([g.b, b]);
      }
      segs = next;
    }
    return segs.filter(([a, b]) => b - a > 0.1);
  }

  function addRoundedRect(path, x0, y0, x1, y1, r) {
    r = Math.max(0, Math.min(r, (x1 - x0) * 0.5 - 0.02, (y1 - y0) * 0.5 - 0.02));
    if (r < 0.08) {
      path.moveTo(x0, y0);
      path.lineTo(x1, y0);
      path.lineTo(x1, y1);
      path.lineTo(x0, y1);
      path.closePath();
      return;
    }
    path.moveTo(x0 + r, y0);
    path.lineTo(x1 - r, y0);
    path.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
    path.lineTo(x1, y1 - r);
    path.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
    path.lineTo(x0 + r, y1);
    path.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
    path.lineTo(x0, y0 + r);
    path.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
    path.closePath();
  }

  function addRoundedRectCW(path, x0, y0, x1, y1, r) {
    r = Math.max(0, Math.min(r, (x1 - x0) * 0.5 - 0.02, (y1 - y0) * 0.5 - 0.02));
    if (r < 0.08) {
      path.moveTo(x0, y0);
      path.lineTo(x0, y1);
      path.lineTo(x1, y1);
      path.lineTo(x1, y0);
      path.closePath();
      return;
    }
    path.moveTo(x0 + r, y0);
    path.absarc(x0 + r, y0 + r, r, -Math.PI / 2, Math.PI, true);
    path.lineTo(x0, y1 - r);
    path.absarc(x0 + r, y1 - r, r, Math.PI, Math.PI / 2, true);
    path.lineTo(x1 - r, y1);
    path.absarc(x1 - r, y1 - r, r, Math.PI / 2, 0, true);
    path.lineTo(x1, y0 + r);
    path.absarc(x1 - r, y0 + r, r, 0, -Math.PI / 2, true);
    path.closePath();
  }

  function addRoundRectRadii(path, x0, y0, x1, y1, rSW, rSE, rNE, rNW) {
    const line = (x, y) => path.lineTo(x, y);
    path.moveTo(x0 + rSW, y0);
    line(x1 - rSE, y0);
    if (rSE > 0.05) path.absarc(x1 - rSE, y0 + rSE, rSE, -Math.PI / 2, 0, false);
    else line(x1, y0);
    line(x1, y1 - rNE);
    if (rNE > 0.05) path.absarc(x1 - rNE, y1 - rNE, rNE, 0, Math.PI / 2, false);
    else line(x1, y1);
    line(x0 + rNW, y1);
    if (rNW > 0.05) path.absarc(x0 + rNW, y1 - rNW, rNW, Math.PI / 2, Math.PI, false);
    else line(x0, y1);
    line(x0, y0 + rSW);
    if (rSW > 0.05) path.absarc(x0 + rSW, y0 + rSW, rSW, Math.PI, Math.PI * 1.5, false);
    else line(x0, y0);
    path.closePath();
  }

  function applyWallUV(mesh, cx, cz, R) {
    mesh.updateMatrix();
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    const rr = R || TILE;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      if (cx != null) {
        uv[i * 2] = (Math.atan2(v.z - cz, v.x - cx) * rr) / TILE;
        uv[i * 2 + 1] = v.y / TILE;
      } else {
        uv[i * 2] = v.x / TILE;
        uv[i * 2 + 1] = v.y / TILE;
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  function applyXZUV(mesh) {
    mesh.updateMatrix();
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      uv[i * 2] = v.x / TILE;
      uv[i * 2 + 1] = v.z / TILE;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  function applyDomeUV(mesh, rad) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const uv0 = geo.attributes.uv;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i);
      const horiz = Math.hypot(v.x, v.z);
      const theta = Math.acos(Math.max(-1, Math.min(1, v.y / rad)));
      const wrap = uv0 ? uv0.getX(i) : 0.5;
      uv[i * 2] = wrap * (Math.PI * 2 * Math.max(horiz, 0.35) / TILE);
      uv[i * 2 + 1] = (theta * rad) / TILE;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  function chunkOwns(x, z, cx, cz) {
    const span = CHUNK * TILE;
    return Math.floor(x / span + 1e-6) === cx && Math.floor(z / span + 1e-6) === cz;
  }

  function clipPolyToOutline(pts, outline, cx, cz) {
    if (!outline?.segments?.length || pts.length < 3) return pts;
    return pts.map((p) => {
      if (sdfClosed(p.x, p.z, outline) < -0.16) return p;
      const dx = cx - p.x;
      const dz = cz - p.z;
      const L = Math.hypot(dx, dz) || 1;
      let x = p.x;
      let z = p.z;
      for (let i = 0; i < 12; i++) {
        x += (dx / L) * 0.1;
        z += (dz / L) * 0.1;
        if (sdfClosed(x, z, outline) < -0.16) break;
      }
      return { x, z };
    });
  }

  function offsetPoly(pts, d) {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      const prev = pts[(i + n - 1) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      const ax = cur.x - prev.x;
      const az = cur.z - prev.z;
      const bx = next.x - cur.x;
      const bz = next.z - cur.z;
      const al = Math.hypot(ax, az) || 1;
      const bl = Math.hypot(bx, bz) || 1;
      let nx = az / al + bz / bl;
      let nz = -ax / al - bx / bl;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      out.push({ x: cur.x + nx * d, z: cur.z + nz * d });
    }
    return out;
  }

  function dedupePts(pts) {
    const out = [];
    for (const p of pts) {
      const prev = out[out.length - 1];
      if (prev && Math.hypot(p.x - prev.x, p.z - prev.z) < 1e-4) continue;
      out.push(p);
    }
    return out;
  }

  function polyFromSegs(segs) {
    const pts = [];
    for (const seg of segs) {
      if (seg.type === "corner") {
        pts.push({ x: seg.p0.x, z: seg.p0.z });
        continue;
      }
      if (seg.type === "arc") {
        const n = Math.max(6, POOL_ARC_SEGS);
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const a = seg.a0 + t * (seg.a1 - seg.a0);
          pts.push({ x: seg.c.x + seg.r * Math.cos(a), z: seg.c.z + seg.r * Math.sin(a) });
        }
        continue;
      }
      pts.push({ x: seg.p0.x, z: seg.p0.z });
    }
    return dedupePts(pts);
  }

  function radialRingGeo(outline, cx, cz, innerR) {
    const outer = polyFromSegs(outline.segments);
    const n = outer.length;
    const positions = [];
    const uvs = [];
    const indices = [];
    if (n < 3) return new THREE.BufferGeometry();
    for (let i = 0; i < n; i++) {
      const p = outer[i];
      const dx = p.x - cx;
      const dz = p.z - cz;
      const L = Math.hypot(dx, dz) || 1;
      const qx = cx + (dx / L) * innerR;
      const qz = cz + (dz / L) * innerR;
      positions.push(p.x, 0, p.z, qx, 0, qz);
      uvs.push(p.x / TILE, p.z / TILE, qx / TILE, qz / TILE);
    }
    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = ((i + 1) % n) * 2;
      const d = c + 1;
      indices.push(a, d, c, a, b, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  function circlePath(x, z, r, segs = 48, cw = true) {
    const path = new THREE.Path();
    const n = Math.max(12, segs);
    const sign = cw ? -1 : 1;
    path.moveTo(x + r, z);
    for (let i = 1; i <= n; i++) {
      const a = sign * (i / n) * Math.PI * 2;
      path.lineTo(x + r * Math.cos(a), z + r * Math.sin(a));
    }
    path.closePath();
    return path;
  }

  function shapeFromPoly(pts) {
    const s = new THREE.Shape();
    if (!pts.length) return s;
    s.moveTo(pts[0].x, pts[0].z);
    for (let i = 1; i < pts.length; i++) s.lineTo(pts[i].x, pts[i].z);
    s.closePath();
    return s;
  }

  function appendInner(path, segs, firstMove) {
    const pts = polyFromSegs(segs);
    if (!pts.length) return;
    if (firstMove) path.moveTo(pts[0].x, pts[0].z);
    for (let i = firstMove ? 1 : 0; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].z);
  }

  function shapeFromSegments(segs) {
    return shapeFromPoly(polyFromSegs(segs));
  }

  function pathFromSegmentsCW(segs) {
    const path = new THREE.Path();
    const pts = polyFromSegs(segs);
    if (!pts.length) return path;
    path.moveTo(pts[0].x, pts[0].z);
    for (let i = pts.length - 1; i >= 1; i--) path.lineTo(pts[i].x, pts[i].z);
    path.closePath();
    return path;
  }

  function wallShapeForRun(run, thick, prof) {
    const s = new THREE.Shape();
    const inner = polyFromSegs(run.filter((seg) => seg.type !== "opening"));
    if (!inner.length) return s;
    s.moveTo(inner[0].x, inner[0].z);
    for (let i = 1; i < inner.length; i++) s.lineTo(inner[i].x, inner[i].z);
    const outer = [];
    for (const seg of run) {
      if (seg.type === "opening") continue;
      for (const p of outerForSegment(seg, thick, prof)) outer.push(p);
    }
    const rev = dedupePts(outer).reverse();
    for (const p of rev) s.lineTo(p.x, p.z);
    s.closePath();
    return s;
  }

  function wallShapeClosed(outline, thick, prof) {
    const t = thick;
    let x0 = prof.X0;
    let x1 = prof.X1;
    let z0 = prof.Z0;
    let z1 = prof.Z1;
    for (const a of prof.alcoves || []) {
      x0 = Math.min(x0, a.X0);
      x1 = Math.max(x1, a.X1);
      z0 = Math.min(z0, a.Z0);
      z1 = Math.max(z1, a.Z1);
    }
    const s = new THREE.Shape();
    s.moveTo(x0 - t, z0 - t);
    s.lineTo(x1 + t, z0 - t);
    s.lineTo(x1 + t, z1 + t);
    s.lineTo(x0 - t, z1 + t);
    s.closePath();
    s.holes.push(pathFromSegmentsCW(outline.segments));
    return s;
  }

  function toXZ(geo, faceDown) {
    geo.rotateX(Math.PI / 2);
    if (!faceDown && geo.index) {
      const arr = geo.index.array;
      for (let i = 0; i < arr.length; i += 3) {
        const tmp = arr[i + 1];
        arr[i + 1] = arr[i + 2];
        arr[i + 2] = tmp;
      }
      geo.index.needsUpdate = true;
    }
    geo.computeVertexNormals();
    return geo;
  }

  function extrudePlan(shape, y0, y1) {
    const depth = Math.max(0.08, y1 - y0);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: false,
      steps: 1,
      curveSegments: POOL_ARC_SEGS,
    });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, y1, 0);
    geo.computeVertexNormals();
    return geo;
  }

  function applyOutlineWallUV(mesh, outline) {
    mesh.updateMatrix();
    const geo = mesh.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    const vn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      vn.fromBufferAttribute(nrm, i);
      if (Math.abs(vn.y) > 0.65) {
        uv[i * 2] = v.x / TILE;
        uv[i * 2 + 1] = v.z / TILE;
      } else {
        uv[i * 2] = outlineSAt(outline, v.x, v.z) / TILE;
        uv[i * 2 + 1] = v.y / TILE;
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  function applyHallShellUV(mesh) {
    mesh.updateMatrix();
    const geo = mesh.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    const vn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      vn.fromBufferAttribute(nrm, i);
      if (Math.abs(vn.y) > 0.55) {
        uv[i * 2] = v.x / TILE;
        uv[i * 2 + 1] = v.z / TILE;
      } else {
        uv[i * 2] = (Math.abs(vn.x) > Math.abs(vn.z) ? v.z : v.x) / TILE;
        uv[i * 2 + 1] = v.y / TILE;
      }
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  function applyVaultUV(mesh, alongX) {
    mesh.updateMatrix();
    const geo = mesh.geometry;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    const n = pos.count;
    const uv = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    const vn = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
      vn.fromBufferAttribute(nrm, i).transformDirection(mesh.matrix);
      const along = alongX ? v.x : v.z;
      const across = alongX ? v.z : v.x;
      const cap = alongX ? Math.abs(vn.x) > 0.7 : Math.abs(vn.z) > 0.7;
      uv[i * 2] = (cap ? across : along) / TILE;
      uv[i * 2 + 1] = v.y / TILE;
    }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  function addGeomDebug(group, prof, outline) {
    const y = 0.16;
    const linePts = [];
    const arcPts = [];
    const joinPts = [];
    for (const seg of outline.segments) {
      if (seg.type === "arc") {
        const n = POOL_ARC_SEGS;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const a = seg.a0 + (seg.a1 - seg.a0) * t;
          arcPts.push(new THREE.Vector3(seg.c.x + seg.r * Math.cos(a), y + 0.02, seg.c.z + seg.r * Math.sin(a)));
        }
        joinPts.push(new THREE.Vector3(seg.p0.x, y + 0.05, seg.p0.z), new THREE.Vector3(seg.p1.x, y + 0.05, seg.p1.z));
        arcPts.push(new THREE.Vector3(NaN, NaN, NaN));
      } else if (seg.type === "line" || seg.type === "opening") {
        linePts.push(new THREE.Vector3(seg.p0.x, y, seg.p0.z), new THREE.Vector3(seg.p1.x, y, seg.p1.z));
        joinPts.push(new THREE.Vector3(seg.p0.x, y + 0.05, seg.p0.z));
      }
    }
    if (linePts.length) {
      const g = new THREE.BufferGeometry().setFromPoints(linePts);
      const mesh = new THREE.LineSegments(g, dbgMats.outline);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    let arcRun = [];
    const flushArc = () => {
      if (arcRun.length < 2) {
        arcRun = [];
        return;
      }
      const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcRun), dbgMats.arc);
      mesh.frustumCulled = false;
      group.add(mesh);
      arcRun = [];
    };
    for (const p of arcPts) {
      if (Number.isNaN(p.x)) flushArc();
      else arcRun.push(p);
    }
    flushArc();
    if (joinPts.length) {
      const g = new THREE.BufferGeometry().setFromPoints(joinPts);
      const mesh = new THREE.Points(g, dbgMats.join);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    const inset = 0.16;
    const col = roundedRectOutline(
      prof.X0 + inset,
      prof.Z0 + inset,
      prof.X1 - inset,
      prof.Z1 - inset,
      {
        ne: Math.max(0, prof.rNE - inset),
        se: Math.max(0, prof.rSE - inset),
        nw: Math.max(0, prof.rNW - inset),
        sw: Math.max(0, prof.rSW - inset),
      }
    );
    const colPts = [];
    for (const seg of col.segments) {
      if (seg.type === "arc") {
        const n = POOL_ARC_SEGS;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const a = seg.a0 + (seg.a1 - seg.a0) * t;
          colPts.push(new THREE.Vector3(seg.c.x + seg.r * Math.cos(a), y + 0.08, seg.c.z + seg.r * Math.sin(a)));
        }
      } else {
        colPts.push(new THREE.Vector3(seg.p0.x, y + 0.08, seg.p0.z));
      }
    }
    if (colPts.length) {
      colPts.push(colPts[0].clone());
      const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints(colPts), dbgMats.collision);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
    for (const hit of outline.invalid || []) {
      const a = new THREE.Vector3(hit.a.x, y + 0.2, hit.a.z);
      const b = new THREE.Vector3(hit.b.x, y + 0.2, hit.b.z);
      const mesh = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), dbgMats.invalid);
      mesh.frustumCulled = false;
      group.add(mesh);
    }
  }

  function addPoolRooms(group, cx, cz, extra, wallG) {
    const cx0 = cx * CHUNK * TILE;
    const cz0 = cz * CHUNK * TILE;
    const cx1 = cx0 + CHUNK * TILE;
    const cz1 = cz0 + CHUNK * TILE;
    const tx0 = cx * CHUNK;
    const tz0 = cz * CHUNK;
    const mx0 = Math.floor(tx0 / POOL_MACRO) - 1;
    const mx1 = Math.floor((tx0 + CHUNK - 1) / POOL_MACRO) + 1;
    const mz0 = Math.floor(tz0 / POOL_MACRO) - 1;
    const mz1 = Math.floor((tz0 + CHUNK - 1) / POOL_MACRO) + 1;
    const thick = POOL_WALL_T;
    const wmat = mats.poolWall;

    const addVaultedHall = (hall, floorMatNow, ceilMatNow) => {
      const alongX = hall.axis === "x";
      const len = alongX ? hall.X1 - hall.X0 : hall.Z1 - hall.Z0;
      const wid = alongX ? hall.Z1 - hall.Z0 : hall.X1 - hall.X0;
      const W = wid / 2;
      if (W < 0.35 || len < 0.3 || hall.h < 2) return;
      const t = POOL_WALL_T;
      const J = W + t;
      const peak = hall.h + 0.06;
      const y1 = peak + t;
      const rise = Math.min(W * 0.7, Math.max(0.5, peak * 0.18));
      const spring = peak - rise;
      const R = (W * W + rise * rise) / (2 * rise);
      const cy = peak - R;
      const a0 = Math.atan2(spring - cy, W);
      const a1 = Math.atan2(spring - cy, -W);
      const hx = (hall.X0 + hall.X1) * 0.5;
      const hz = (hall.Z0 + hall.Z1) * 0.5;
      const h0 = hall.h0 ?? hall.h;
      const h1 = hall.h1 ?? hall.h;
      const barrel = Math.abs(h0 - h1) < 0.16;

      const floorShape = new THREE.Shape();
      floorShape.moveTo(hall.X0, hall.Z0);
      floorShape.lineTo(hall.X1, hall.Z0);
      floorShape.lineTo(hall.X1, hall.Z1);
      floorShape.lineTo(hall.X0, hall.Z1);
      floorShape.closePath();
      const floorG = toXZ(new THREE.ShapeGeometry(floorShape, 1), false);
      applyXZUV(addBox(group, floorG, floorMatNow, 0, -0.03, 0));

      const wallY0 = -0.58;
      const wallH = (barrel ? spring : peak) + 0.04 - wallY0;
      const wallY = wallY0 + wallH * 0.5;
      const wallLen = len + 0.16;
      if (alongX) {
        applyHallShellUV(addBox(group, new THREE.BoxGeometry(wallLen, wallH, t), wmat, hx, wallY, hall.Z0 - t * 0.5, true));
        applyHallShellUV(addBox(group, new THREE.BoxGeometry(wallLen, wallH, t), wmat, hx, wallY, hall.Z1 + t * 0.5, true));
      } else {
        applyHallShellUV(addBox(group, new THREE.BoxGeometry(t, wallH, wallLen), wmat, hall.X0 - t * 0.5, wallY, hz, true));
        applyHallShellUV(addBox(group, new THREE.BoxGeometry(t, wallH, wallLen), wmat, hall.X1 + t * 0.5, wallY, hz, true));
      }

      if (barrel) {
        const vs = new THREE.Shape();
        vs.moveTo(-W, spring);
        vs.lineTo(-J, spring);
        vs.lineTo(-J, y1);
        vs.lineTo(J, y1);
        vs.lineTo(J, spring);
        vs.lineTo(W, spring);
        vs.absarc(0, cy, R, a0, a1, false);
        vs.closePath();
        const pad = 0.1;
        const vgeo = new THREE.ExtrudeGeometry(vs, {
          depth: len + pad * 2,
          bevelEnabled: false,
          steps: 1,
          curveSegments: 28,
        });
        vgeo.computeVertexNormals();
        const vault = addBox(group, vgeo, mats.poolCeilInside, 0, 0, 0, true);
        if (alongX) {
          vault.position.set(hall.X0 - pad, 0, hz);
          vault.rotation.y = Math.PI / 2;
        } else {
          vault.position.set(hx, 0, hall.Z0 - pad);
        }
        applyVaultUV(vault, alongX);
      } else if (alongX) {
        applyXZUV(addBox(group, new THREE.BoxGeometry(len + 0.12, t, wid + t * 2), ceilMatNow, hx, peak + t * 0.5, hz, true));
      } else {
        applyXZUV(addBox(group, new THREE.BoxGeometry(wid + t * 2, t, len + 0.12), ceilMatNow, hx, peak + t * 0.5, hz, true));
      }

      const addEndLintel = (atStart, roomH) => {
        const gap = (roomH || hall.h) + 0.08 - peak;
        if (gap < 0.12) return;
        const y = peak + gap * 0.5;
        const across = wid + 0.04;
        const depth = t + 0.08;
        if (alongX) {
          const x = atStart ? hall.X0 : hall.X1;
          applyHallShellUV(addBox(group, new THREE.BoxGeometry(depth, gap, across), wmat, x, y, hz, true));
        } else {
          const z = atStart ? hall.Z0 : hall.Z1;
          applyHallShellUV(addBox(group, new THREE.BoxGeometry(across, gap, depth), wmat, hx, y, z, true));
        }
      };
      addEndLintel(true, hall.h0);
      addEndLintel(false, hall.h1);
    };

    const addJamb = (p, tangX, tangZ, y0, y1) => {
      const t = thick;
      const len = Math.hypot(tangX, tangZ) || 1;
      const nx = tangZ / len;
      const nz = -tangX / len;
      const mesh = addBox(
        group,
        new THREE.BoxGeometry(t + 0.08, y1 - y0, t + 0.08),
        wmat,
        p.x + nx * (t * 0.5),
        (y0 + y1) * 0.5,
        p.z + nz * (t * 0.5),
        true
      );
      applyHallShellUV(mesh);
    };

    const addOutlinedShell = (space, y0, y1, floorY, ceilY, floorMatNow, ceilMatNow, opts = {}) => {
      const outline = space.outline;
      if (!outline) return;
      const wallY0 = Math.min(y0, -0.58);
      const hasOpen = outline.segments.some((s) => s.type === "opening");
      if (!hasOpen) {
        const geo = extrudePlan(wallShapeClosed(outline, thick, space), wallY0, y1);
        applyOutlineWallUV(addBox(group, geo, wmat, 0, 0, 0, true), outline);
      } else {
        const runs = outlineWallRuns(outline);
        for (const run of runs) {
          if (!run.some((s) => s.type === "line" || s.type === "arc")) continue;
          const geo = extrudePlan(wallShapeForRun(run, thick, space), wallY0, y1);
          applyOutlineWallUV(addBox(group, geo, wmat, 0, 0, 0, true), outline);
        }
        for (const seg of outline.segments) {
          if (seg.type !== "opening") continue;
          addJamb(seg.p0, seg.p1.x - seg.p0.x, seg.p1.z - seg.p0.z, wallY0, y1);
          addJamb(seg.p1, seg.p1.x - seg.p0.x, seg.p1.z - seg.p0.z, wallY0, y1);
        }
      }
      const floorShape = shapeFromSegments(outline.segments);
      const floorG = toXZ(new THREE.ShapeGeometry(floorShape, POOL_ARC_SEGS), false);
      const floor = addBox(group, floorG, floorMatNow, 0, floorY, 0);
      applyXZUV(floor);
      if (opts.skipCeil) return;
      if (opts.vaultHole) {
        const ceilG = radialRingGeo(outline, opts.vaultHole.x, opts.vaultHole.z, opts.vaultHole.r);
        const ceil = addBox(group, ceilG, ceilMatNow, 0, ceilY, 0);
        return;
      }
      const ceilShape = shapeFromSegments(outline.segments);
      if (opts.oculus) {
        ceilShape.holes.push(circlePath(opts.oculus.x, opts.oculus.z, 1.15, 32, true));
      }
      const ceilG = toXZ(new THREE.ShapeGeometry(ceilShape, 24), true);
      const ceil = addBox(group, ceilG, ceilMatNow, 0, ceilY, 0);
      applyXZUV(ceil);
    };

    const addWaterBand = (x0, z0, x1, z1, r, padOut, padIn, y, depth, mat) => {
      const outer = roundedRectOutline(x0 - padOut, z0 - padOut, x1 + padOut, z1 + padOut, r + padOut);
      const inner = roundedRectOutline(x0 + padIn, z0 + padIn, x1 - padIn, z1 - padIn, Math.max(0.05, r - padIn));
      const shape = shapeFromSegments(outer.segments);
      shape.holes.push(pathFromSegmentsCW(inner.segments));
      const geo = extrudePlan(shape, y, y + depth);
      const mesh = addBox(group, geo, mat, 0, 0, 0);
      applyXZUV(mesh);
      return mesh;
    };

    for (let mx = mx0; mx <= mx1; mx++) {
      for (let mz = mz0; mz <= mz1; mz++) {
        const prof = roomProfile(seed, extra, mx, mz);
        const { X0, X1, Z0, Z1, h } = prof;
        if (X1 < cx0 - 1 || X0 > cx1 + 1 || Z1 < cz0 - 1 || Z0 > cz1 + 1) continue;
        const outline = prof.outline;
        const midX = (X0 + X1) * 0.5;
        const midZ = (Z0 + Z1) * 0.5;
        const owns = chunkOwns(midX, midZ, cx, cz);

        if (owns) {
          const y0 = -0.58;
          const y1 = h + 0.08;
          const floorMatNow = prof.biome === "leisure" ? mats.leisureFloor : mats.poolFloor;
          const ceilMatNow = prof.biome === "service" || prof.biome === "leisure" ? mats.poolCeilingDim : mats.poolCeilTile;
          const vm = prof.vault ? vaultMetrics(prof) : null;
          const vaultPhi = Math.PI * 0.46;
          const vaultRimY = vm ? vm.domeY + vm.rad * Math.cos(vaultPhi) : h + 0.06;
          addOutlinedShell(prof, y0, y1, -0.03, vm ? vaultRimY : h + 0.06, floorMatNow, ceilMatNow, {
            oculus: prof.oculus && !prof.vault ? { x: midX, z: midZ } : null,
            vaultHole: vm
              ? {
                  x: midX,
                  z: midZ,
                  r: Math.max(0.4, vm.rad * Math.sin(vaultPhi) * 0.9),
                }
              : null,
          });

          if (prof.vault) {
            const w = X1 - X0;
            const d = Z1 - Z0;
            const rad = Math.min(w, d) * 0.42;
            const domeY = h - rad * 0.12;
            const phi0 = prof.oculus ? OCULUS_THETA : 0;
            const dome = new THREE.SphereGeometry(rad, 48, 24, 0, Math.PI * 2, phi0, Math.PI * 0.52 - phi0);
            const vault = addBox(group, dome, mats.poolCeilInside, midX, domeY, midZ);
            applyDomeUV(vault, rad);
            if (prof.oculus) {
              const rim = oculusRim(rad, domeY);
              const wellH = Math.max(1.1, rad * 0.16);
              addBox(group, new THREE.TorusGeometry(rim.r, 0.07, 8, 28), wmat, midX, rim.y, midZ).rotation.x = Math.PI / 2;
              addBox(
                group,
                new THREE.CylinderGeometry(rim.r, rim.r, wellH, 24, 1, true),
                mats.poolCeilInside,
                midX,
                rim.y + wellH * 0.5,
                midZ
              );
              const sky = addBox(group, new THREE.CircleGeometry(rim.r, 24), mats.oculusSky, midX, rim.y + wellH, midZ);
              sky.rotation.x = -Math.PI / 2;
            }
          } else if (prof.oculus) {
            addBox(group, new THREE.TorusGeometry(1.15, 0.08, 8, 24), wmat, midX, h + 0.04, midZ).rotation.x = Math.PI / 2;
            const sky = addBox(group, new THREE.CircleGeometry(1.12, 24), mats.oculusSky, midX, h + 0.12, midZ);
            sky.rotation.x = -Math.PI / 2;
          }
          if (prof.spiral) {
            const sp = spiralLayout(prof);
            if (sp) {
              addBox(
                group,
                new THREE.CylinderGeometry(sp.pillarR, sp.pillarR + 0.02, sp.pillarH, 20),
                wmat,
                sp.midX,
                sp.pillarH * 0.5 - 0.12,
                sp.midZ,
                true
              );
              addBox(
                group,
                new THREE.CylinderGeometry(sp.pillarR + 0.04, sp.pillarR + 0.04, 0.12, 18),
                mats.poolLine,
                sp.midX,
                0.1,
                sp.midZ
              );
              for (let i = 0; i < sp.steps.length; i++) {
                const s = sp.steps[i];
                const step = addBox(group, new THREE.BoxGeometry(s.hw * 2, s.thick, s.hd * 2), mats.poolFloor, s.x, s.y, s.z, true);
                step.rotation.y = -s.ang;
                applyXZUV(step);
                const ox = Math.cos(s.ang) * (s.hw + 0.04);
                const oz = Math.sin(s.ang) * (s.hw + 0.04);
                addBox(group, new THREE.BoxGeometry(0.05, 0.88, 0.05), wmat, s.x + ox, s.top + 0.44, s.z + oz, true);
                if (i < sp.steps.length - 1) {
                  const n = sp.steps[i + 1];
                  const nx = n.x + Math.cos(n.ang) * (n.hw + 0.04);
                  const nz = n.z + Math.sin(n.ang) * (n.hw + 0.04);
                  const dx = nx - (s.x + ox);
                  const dz = nz - (s.z + oz);
                  const len = Math.hypot(dx, dz);
                  const rail = addBox(group, new THREE.BoxGeometry(0.05, 0.05, len), wmat, (s.x + ox + nx) * 0.5, (s.top + n.top) * 0.5 + 0.84, (s.z + oz + nz) * 0.5, true);
                  rail.rotation.y = Math.atan2(dx, dz);
                }
              }
            }
          }
          if (prof.play) {
            const w = prof.water;
            const mxp = w ? w.X0 + 1.5 : midX + 2.2;
            const mzp = w ? w.Z0 - 0.9 : midZ + 1.4;
            addBox(group, new THREE.CylinderGeometry(0.22, 0.28, 1.4, 8), mats.mushroomStem, mxp, 0.7, mzp, true);
            addBox(group, new THREE.SphereGeometry(0.72, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), mats.mushroom, mxp, 1.55, mzp, true);
          }
          if (prof.biome === "leisure") {
            addBox(group, wallG, mats.poolCeilingDim, midX, h - 0.12, midZ).scale.set(X1 - X0 - 1.2, 0.12, 0.22);
            addBox(group, wallG, mats.poolCeilingDim, midX, h - 0.12, midZ).scale.set(0.22, 0.12, Z1 - Z0 - 1.2);
          }
          if (geomDebug) addGeomDebug(group, prof, outline);
        }

        const floorMatNow = prof.biome === "leisure" ? mats.leisureFloor : mats.poolFloor;
        const ceilMatNow = prof.biome === "service" || prof.biome === "leisure" ? mats.poolCeilingDim : mats.poolCeilTile;
        for (const hall of prof.halls || []) {
          const hx = (hall.X0 + hall.X1) * 0.5;
          const hz = (hall.Z0 + hall.Z1) * 0.5;
          if (!chunkOwns(hx, hz, cx, cz)) continue;
          addVaultedHall(hall, floorMatNow, ceilMatNow);
          if (geomDebug) addGeomDebug(group, hall, hall.outline);
        }

        const water = prof.water;
        if (water) {
          const wx = (water.X0 + water.X1) * 0.5;
          const wz = (water.Z0 + water.Z1) * 0.5;
          if (chunkOwns(wx, wz, cx, cz)) {
            const addWaterShape = (ol, punchHoles) => {
              if (!ol?.segments?.length) return;
              let pts = polyFromSegs(ol.segments);
              if (pts.length > 3) pts = clipPolyToOutline(pts, outline, midX, midZ);
              if (pts.length < 4) return;
              const shape = shapeFromPoly(pts);
              if (punchHoles) {
                for (const hole of water.holes || []) {
                  if (hole.segments?.length) shape.holes.push(pathFromSegmentsCW(hole.segments));
                }
                for (const isl of water.islands || []) {
                  const islOutline = roundedRectOutline(isl.X0, isl.Z0, isl.X1, isl.Z1, Math.max(0.2, isl.R));
                  shape.holes.push(pathFromSegmentsCW(islOutline.segments));
                }
              }
              const surfG = toXZ(new THREE.ShapeGeometry(shape, POOL_ARC_SEGS), false);
              const surf = addBox(group, surfG, mats.poolWater, 0, 0.09, 0);
              surf.castShadow = false;
              const basin = addBox(group, surfG.clone(), mats.poolBasin, 0, -0.45, 0);
              applyXZUV(basin);
              const caust = addBox(group, surfG.clone(), mats.caustic, 0, -0.43, 0);
              caust.castShadow = false;
              const lipPts = pts;
              if (lipPts.length > 3) {
                const ring = new THREE.Shape();
                const outerLip = offsetPoly(lipPts, 0.08);
                const innerLip = offsetPoly(lipPts, -0.04);
                ring.moveTo(outerLip[0].x, outerLip[0].z);
                for (let i = 1; i < outerLip.length; i++) ring.lineTo(outerLip[i].x, outerLip[i].z);
                ring.closePath();
                const hole = new THREE.Path();
                hole.moveTo(innerLip[0].x, innerLip[0].z);
                for (let i = innerLip.length - 1; i >= 1; i--) hole.lineTo(innerLip[i].x, innerLip[i].z);
                hole.closePath();
                ring.holes.push(hole);
                applyXZUV(addBox(group, extrudePlan(ring, 0.02, 0.2), wmat, 0, 0, 0, true));
                const line = new THREE.Shape();
                const o2 = offsetPoly(lipPts, 0.05);
                const i2 = offsetPoly(lipPts, 0.01);
                line.moveTo(o2[0].x, o2[0].z);
                for (let i = 1; i < o2.length; i++) line.lineTo(o2[i].x, o2[i].z);
                line.closePath();
                const lh = new THREE.Path();
                lh.moveTo(i2[0].x, i2[0].z);
                for (let i = i2.length - 1; i >= 1; i--) lh.lineTo(i2[i].x, i2[i].z);
                lh.closePath();
                line.holes.push(lh);
                applyXZUV(addBox(group, extrudePlan(line, 0.1, 0.2), mats.poolLine, 0, 0, 0));
              }
            };
            const waterOutline = water.outline || roundedRectOutline(water.X0, water.Z0, water.X1, water.Z1, water.R);
            addWaterShape(waterOutline, true);
            for (const extra of water.extras || []) {
              const extraPts = polyFromSegs(extra.segments || []);
              if (extraPts.length < 4) continue;
              let sx = 0;
              let sz = 0;
              for (const p of extraPts) {
                sx += p.x;
                sz += p.z;
              }
              if (sdfClosed(sx / extraPts.length, sz / extraPts.length, outline) > -0.4) continue;
              addWaterShape(extra, false);
            }
            for (const isl of water.islands || []) {
              const islOutline = roundedRectOutline(isl.X0, isl.Z0, isl.X1, isl.Z1, Math.max(0.2, isl.R));
              const deck = shapeFromSegments(islOutline.segments);
              applyXZUV(addBox(group, extrudePlan(deck, -0.03, 0.12), mats.poolFloor, 0, 0, 0));
            }
            for (const pit of water.pits || []) {
              const pgeo = new THREE.CircleGeometry(pit.r, 16);
              pgeo.rotateX(-Math.PI / 2);
              const pmesh = addBox(group, pgeo, mats.voidDark, pit.x, 0.1, pit.z);
              pmesh.castShadow = false;
            }
          }
        }
      }
    }
  }

  function addCeilingStep(group, info, tx, tz, cxw, czw, h, wallG) {
    const dirs = [
      { dx: 1, dz: 0, x: cxw + TILE / 2, z: czw, sx: 0.16, sz: TILE },
      { dx: 0, dz: 1, x: cxw, z: czw + TILE / 2, sx: TILE, sz: 0.16 },
    ];
    for (const d of dirs) {
      const n = cellInfo(recipeId, seed, tx + d.dx, tz + d.dz);
      if (info.solid || n.solid) continue;
      const hn = n.ceiling || h;
      if (Math.abs(hn - h) < 0.12) continue;
      const lo = Math.min(h, hn);
      const hi = Math.max(h, hn);
      const fascia = addBox(group, wallG, mats.poolWall, d.x, (lo + hi) / 2, d.z);
      fascia.scale.set(d.sx, hi - lo + 0.1, d.sz);
      const lintel = addBox(group, wallG, mats.poolWall, d.x, lo + 0.06, d.z);
      lintel.scale.set(d.sx + 0.08, 0.18, d.sz + 0.08);
    }
  }

  function addPoolDecor(group, info, tx, tz, cxw, czw, h, wallG, colG, tubeG, tubeCapG) {
    if (info.galleryCol) {
      const col = addBox(group, colG, mats.poolWall, cxw, 1.15, czw, true);
      col.scale.set(1, 2.3, 1);
    }
    if (info.feature === "tube") {
      const alongX = info.featureAxis === "x";
      const hug = TILE / 2 - 0.22;
      const ox = alongX ? 0 : info.walls.w ? -hug : info.walls.e ? hug : 0;
      const oz = alongX ? (info.walls.s ? -hug : info.walls.n ? hug : 0) : 0;
      const y = h - 0.14;
      const dx = alongX ? 1 : 0;
      const dz = alongX ? 0 : 1;
      const nextTube = cellInfo(recipeId, seed, tx + dx, tz + dz).feature === "tube";
      const prevTube = cellInfo(recipeId, seed, tx - dx, tz - dz).feature === "tube";
      let a = -TILE / 2;
      let b = TILE / 2;
      if (!prevTube) a += 0.06;
      if (!nextTube) b -= 0.06;
      const len = b - a;
      const mid = (a + b) / 2;
      const tube = addBox(
        group,
        tubeG,
        mats.pipeMetal,
        cxw + ox + (alongX ? mid : 0),
        y,
        czw + oz + (alongX ? 0 : mid),
        true
      );
      tube.scale.set(1, len / TILE, 1);
      if (alongX) tube.rotation.z = Math.PI / 2;
      else tube.rotation.x = Math.PI / 2;
      const addCap = (along) => {
        const rx = cxw + ox + (alongX ? along : 0);
        const rz = czw + oz + (alongX ? 0 : along);
        addBox(group, tubeCapG, mats.pipeMetal, rx, y, rz, true);
        const riser = addBox(group, tubeG, mats.pipeMetal, rx, (y + h + 0.04) / 2, rz, true);
        riser.scale.set(1, Math.max(0.16, h + 0.04 - y) / TILE, 1);
        const intoX = alongX ? 0 : Math.sign(ox) || 1;
        const intoZ = alongX ? Math.sign(oz) || 1 : 0;
        const stub = addBox(group, tubeG, mats.pipeMetal, rx + intoX * 0.22, y, rz + intoZ * 0.22, true);
        stub.scale.set(1, 0.48 / TILE, 1);
        if (alongX) stub.rotation.x = Math.PI / 2;
        else stub.rotation.z = Math.PI / 2;
      };
      if (!prevTube) addCap(a);
      if (!nextTube) addCap(b);
    }
    if (info.feature === "ladder") {
      const pose = facePose(info.featureFace || "n", cxw, czw);
      const rig = new THREE.Group();
      rig.position.set(pose.x, 0, pose.z);
      rig.rotation.y = pose.yaw;
      group.add(rig);
      addLocal(rig, new THREE.CylinderGeometry(0.028, 0.028, 1.4, 6), mats.chrome, -0.22, 0.72, 0.12);
      addLocal(rig, new THREE.CylinderGeometry(0.028, 0.028, 1.4, 6), mats.chrome, 0.22, 0.72, 0.12);
      for (let i = 0; i < 6; i++) {
        const rung = addLocal(rig, new THREE.CylinderGeometry(0.022, 0.022, 0.48, 6), mats.chrome, 0, 0.22 + i * 0.18, 0.12);
        rung.rotation.z = Math.PI / 2;
      }
    }
    if (info.feature === "stairs" || info.feature === "chute") {
      const pose = facePose(info.featureFace || "n", cxw, czw);
      const rig = new THREE.Group();
      rig.position.set(pose.x, 0, pose.z);
      rig.rotation.y = pose.yaw;
      group.add(rig);
      if (info.feature === "stairs") {
        addLocal(rig, new THREE.BoxGeometry(1.2, h, 0.12), mats.poolWall, 0, h / 2, 0.08);
        for (let i = 0; i < 8; i++) {
          addLocal(rig, new THREE.BoxGeometry(1.05, 0.08, 0.18), mats.poolFloor, 0, 0.1 + i * 0.2, -0.05 - i * 0.12);
        }
        addLocal(rig, new THREE.BoxGeometry(0.05, 1.65, 1.05), mats.poolWall, -0.52, 0.9, -0.4);
        addLocal(rig, new THREE.BoxGeometry(0.05, 1.65, 1.05), mats.poolWall, 0.52, 0.9, -0.4);
      } else {
        const chute = addLocal(rig, new THREE.CylinderGeometry(0.42, 0.5, 2.4, 10), mats.poolWall, 0, 0.85, -0.15);
        chute.rotation.x = 0.72;
        addLocal(rig, new THREE.BoxGeometry(1.1, 1.1, 0.08), mats.voidDark, 0, 1.1, 0.06);
      }
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
    const pools = recipeId === "poolrooms";
    const pillarG = pools
      ? new THREE.CylinderGeometry(POOL_PILLAR_R, POOL_PILLAR_R + 0.02, 1, 18)
      : new THREE.CylinderGeometry(0.18, 0.2, 1, 10);
    const pillarSqG = pools ? new THREE.BoxGeometry(POOL_PILLAR_R * 1.65, 1, POOL_PILLAR_R * 1.65) : null;
    const colG = pools ? new THREE.CylinderGeometry(0.11, 0.13, 1, 8) : null;
    const tubeG = pools ? new THREE.CylinderGeometry(0.16, 0.16, TILE, 8) : null;
    const tubeCapG = pools ? new THREE.SphereGeometry(0.16, 8, 6) : null;
    const boardG = new THREE.BoxGeometry(0.08, 0.1, TILE);
    const boardZ = new THREE.BoxGeometry(TILE, 0.1, 0.08);

    for (let lx = 0; lx < CHUNK; lx++) {
      for (let lz = 0; lz < CHUNK; lz++) {
        const tx = cx * CHUNK + lx;
        const tz = cz * CHUNK + lz;
        const info = cellInfo(recipeId, seed, tx, tz);
        const cxw = (tx + 0.5) * TILE;
        const czw = (tz + 0.5) * TILE;
        const recH = pools ? info.ceiling || rec.ceiling : rec.ceiling;
        const curved = info.curved;

        if (info.solid) {
          if (pools) {
            const fillH = recH + 0.66;
            const fill = addBox(group, wallG, mats.poolWall, cxw, fillH * 0.5 - 0.58, czw, true);
            fill.scale.set(TILE + 0.06, fillH, TILE + 0.06);
            applyHallShellUV(fill);
            continue;
          }
          const rock = addBox(group, wallG, mats.rock, cxw, recH / 2, czw, true);
          rock.scale.set(TILE, recH, TILE);
          continue;
        }

        const skipPoolTiles = pools;
        if (!skipPoolTiles) {
          if (info.floor === "water") {
            addBox(group, floorG, mats.water, cxw, 0.1, czw);
          } else {
            addBox(group, floorG, floorMat(info.floor), cxw, info.door ? -0.01 : -0.03, czw);
          }
        }

        const h = recH;
        if (info.hole) {
          addBox(group, ceilG, mats.voidCeil, cxw, h + 0.18, czw);
        } else if (!pools) {
          const ceilMat =
            recipeId === "poolrooms"
              ? info.biome === "service"
                ? mats.poolCeilingDim
                : mats.poolCeilTile
              : mats.ceiling;
          const ceil = addBox(group, ceilG, ceilMat, cxw, h + 0.02, czw);
          if (pools) ceil.scale.set(1.012, 1, 1.012);
        }
        if (!pools) addCeilingStep(group, info, tx, tz, cxw, czw, h, wallG);
        const thick = curved ? 0.22 : 0.2;
        const wmat = info.manila ? mats.manilaWall : wallMat();
        if (!pools) {
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
        }
        if (curved && !pools && (info.walls.e || info.walls.n || info.walls.w || info.walls.s)) {
          const col = addBox(group, new THREE.CylinderGeometry(0.22, 0.26, h, 10), wallMat(), cxw + (info.walls.e ? 0.9 : info.walls.w ? -0.9 : 0), h / 2, czw + (info.walls.n ? 0.9 : info.walls.s ? -0.9 : 0), true);
          void col;
        }

        if (info.pillar) {
          const ph = pools ? h + 0.55 : recH;
          const square = pools && (info.biome === "channel" || info.biome === "service");
          const p = addBox(group, square ? pillarSqG : pillarG, wallMat(), cxw, ph / 2 - (pools ? 0.1 : 0), czw, true);
          p.scale.set(1, ph, 1);
          if (pools) {
            if (square) {
              addBox(group, new THREE.BoxGeometry(POOL_PILLAR_R * 1.75, 0.12, POOL_PILLAR_R * 1.75), mats.poolLine, cxw, 0.1, czw);
            } else {
              addBox(
                group,
                new THREE.CylinderGeometry(POOL_PILLAR_R + 0.035, POOL_PILLAR_R + 0.035, 0.12, 16),
                mats.poolLine,
                cxw,
                0.1,
                czw
              );
            }
          }
        }

        if (info.door || info.exit) addExit(group, info, cxw, czw, h);

        if (pools) addPoolDecor(group, info, tx, tz, cxw, czw, h, wallG, colG, tubeG, tubeCapG);

        if (recipeId === "poolrooms") {
          const mode = info.light === "dim" ? "dim" : "normal";
          if (info.light !== "dead") {
            const lightY = info.biome === "atrium" || info.biome === "gallery" ? Math.min(h - 0.3, 5.2) : h - 0.22;
            const dim = info.biome === "leisure" || info.biome === "service" ? "dim" : mode;
            group.userData.lights.push({ x: cxw, y: lightY, z: czw, mode: dim });
          }
        } else if (!info.water && !info.hole) {
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

    if (pools) addPoolRooms(group, cx, cz, rec.extra, wallG);

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
        disposeGroup(group);
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
      const pools = recipeId === "poolrooms";
      const flicker = pools
        ? 0.98 + Math.sin(performance.now() * 0.004 + item.l.x) * 0.02
        : item.l.mode === "harsh"
          ? 0.85 + Math.sin(performance.now() * 0.04 + item.l.x) * 0.18
          : 0.92 + Math.sin(performance.now() * 0.012 + item.l.x) * 0.06;
      const gain = pools ? 13 : item.l.mode === "harsh" ? 26 : item.l.mode === "dim" ? 7 : 15;
      p.intensity = rec.lightGain * gain * flicker;
      p.distance = item.l.mode === "harsh" ? 12 : pools ? 14 : 7.5;
    }
  }

  function setCamera(x, y, z, yaw, pitch, roll = 0) {
    camera.position.set(x, y, z);
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw;
    camera.rotation.x = pitch;
    camera.rotation.z = roll;
  }

  function setFov(fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }

  function setFlash(on, dim = 0) {
    flash.visible = !!on;
    flash.intensity = on ? 70 * (1 - dim * 0.55) : 0;
    flash.target.updateMatrixWorld();
  }

  function setBlinkDim(amount) {
    renderer.toneMappingExposure = exposureBase * (1 - amount * 0.55);
  }

  function huntStride(ent) {
    if (ent.showcase) return { lift: 0, squash: 1, lean: 0, twitch: 0 };
    const running = ent.phase === "close" || ent.phase === "charging" || ent.hunting;
    if (!running) return { lift: 0, squash: 1, lean: 0, twitch: 0.006 };
    const t = performance.now() * 0.001;
    const rate = ent.phase === "charging" ? 14.5 : 10.2;
    const step = Math.abs(Math.sin(t * rate));
    const sway = Math.sin(t * rate);
    return {
      lift: step * (ent.phase === "charging" ? 0.06 : 0.035),
      squash: 1 + step * 0.022,
      lean: sway * 0.025,
      twitch: ent.phase === "charging" ? 0.018 : 0.008,
    };
  }

  function standY(x, z) {
    return groundAt(recipeId, seed, x, z);
  }

  function syncProps(ents) {
    resetActors();
    for (const ent of ents) {
      if (ent.kind === "chair") {
        takeActor("chair").position.set(ent.x, standY(ent.x, ent.z), ent.z);
        continue;
      }
      if (!ent.live) continue;
      if (ent.kind === "guest") {
        const run = huntStride(ent);
        const h = guestHeight * run.squash;
        const mesh = takeActor("guest");
        mesh.position.set(ent.x, standY(ent.x, ent.z) + h * 0.5 + run.lift, ent.z);
        mesh.scale.set(guestHeight * (528 / 831) * (1 + run.lean), h, 1);
      } else if (ent.kind === "lurker") {
        const h0 = lurkerHeight();
        const w = h0 * lurkerAspect;
        const t = performance.now() * 0.001;
        const run = huntStride(ent);
        const h = h0 * run.squash * (1 + Math.sin(t * 21) * run.twitch * 0.6);
        const mesh = takeActor("lurker");
        mesh.position.set(ent.x, standY(ent.x, ent.z) + h * 0.5 + run.lift, ent.z);
        mesh.scale.set(w * (1 + run.lean + Math.sin(t * 17) * run.twitch), h, 1);
      } else if (ent.kind === "mannequin") {
        const run = huntStride(ent);
        const h = mannequinHeight * run.squash;
        const mesh = takeActor("mannequin");
        mesh.position.set(ent.x, standY(ent.x, ent.z) + h * 0.5 + run.lift, ent.z);
        mesh.scale.set(mannequinHeight * mannequinAspect * (1 + run.lean), h, 1);
      } else if (ent.kind === "portrait") {
        if (!ent.stand && !ent.showcase) {
          takeActor("portraitFloor").position.set(ent.x, standY(ent.x, ent.z) + 0.28, ent.z);
        }
        if (ent.hunting || ent.stand || ent.showcase) {
          const run = huntStride(ent);
          const h = portraitHuntHeight * run.squash;
          const px = ent.hunting ? ent.hx : ent.x;
          const pz = ent.hunting ? ent.hz : ent.z;
          const mesh = takeActor("portraitStand");
          mesh.position.set(px, standY(px, pz) + h * 0.5 + run.lift, pz);
          mesh.scale.set(portraitHuntHeight * (466 / 659) * (1 + run.lean), h, 1);
        }
      }
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
    const t = performance.now() * 0.001;
    const sh = mats.poolWater.userData.shader;
    if (sh && sh.uniforms.uTime) sh.uniforms.uTime.value = t;
    maps.caustic.offset.set(t * 0.035, t * 0.022);
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
    setFov,
    setFlash,
    setBlinkDim,
    syncProps,
    inView,
    resize,
    render,
    setGeomDebug(on) {
      geomDebug = !!on;
      for (const group of chunks.values()) disposeGroup(group);
      chunks.clear();
    },
    geomDebug: () => geomDebug,
  };
}
