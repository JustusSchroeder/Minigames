export const RECIPES = {
  lobby: {
    id: "lobby",
    name: "Level 0 · The Lobby",
    short: "The Lobby",
    layout: "maze",
    curved: false,
    extra: 0.28,
    ceiling: 2.46,
    fog: 0x3a3220,
    fogNear: 7,
    fogFar: 20,
    ambient: 0.11,
    light: 0xe6c878,
    lightGain: 0.88,
  },
  habitable: {
    id: "habitable",
    name: "Level 1 · Habitable Zone",
    short: "Habitable Zone",
    layout: "warehouse",
    curved: false,
    extra: 0.22,
    ceiling: 4.1,
    fog: 0x6a6a62,
    fogNear: 8,
    fogFar: 26,
    ambient: 0.1,
    light: 0xc8c4b0,
    lightGain: 0.7,
  },
  pipes: {
    id: "pipes",
    name: "Level 2 · Pipe Dreams",
    short: "Pipe Dreams",
    layout: "pipes",
    curved: false,
    extra: 0.12,
    ceiling: 2.35,
    fog: 0x1a1612,
    fogNear: 4,
    fogFar: 14,
    ambient: 0.04,
    light: 0xc45a20,
    lightGain: 0.55,
  },
  office: {
    id: "office",
    name: "Level 4 · Abandoned Office",
    short: "Abandoned Office",
    layout: "office",
    curved: false,
    extra: 0.26,
    ceiling: 2.7,
    fog: 0x2a3034,
    fogNear: 8,
    fogFar: 22,
    ambient: 0.12,
    light: 0xd8dce0,
    lightGain: 0.95,
  },
  hotel: {
    id: "hotel",
    name: "Level 5 · Terror Hotel",
    short: "Terror Hotel",
    layout: "hotel",
    curved: false,
    extra: 0.2,
    ceiling: 2.85,
    fog: 0x2a2018,
    fogNear: 6,
    fogFar: 18,
    ambient: 0.08,
    light: 0xe0b060,
    lightGain: 0.75,
  },
  caves: {
    id: "caves",
    name: "Level 8 · Cave System",
    short: "Cave System",
    layout: "caves",
    curved: true,
    extra: 0.2,
    ceiling: 3.4,
    fog: 0x12100e,
    fogNear: 3,
    fogFar: 12,
    ambient: 0.03,
    light: 0x6a5a40,
    lightGain: 0.4,
  },
  poolrooms: {
    id: "poolrooms",
    name: "Level 37 · Poolrooms",
    short: "Poolrooms",
    layout: "pools",
    curved: true,
    extra: 0.22,
    ceiling: 3.55,
    fog: 0x1a2a28,
    fogNear: 6,
    fogFar: 22,
    ambient: 0.1,
    light: 0xb8d8d4,
    lightGain: 0.95,
  },
};

export const RECIPE_ORDER = ["lobby", "habitable", "pipes", "office", "hotel", "caves", "poolrooms"];

export const EXITS = {
  lobby: [
    { to: "habitable", kind: "manila", label: "Manila Room — wooden door to Level 1" },
    { to: "habitable", kind: "fireexit", label: "Emergency fire exit — Level 1" },
    { to: "habitable", kind: "garage", label: "Flickering concrete wall — Level 1" },
    { to: "pipes", kind: "manila", label: "Manila Room — wooden door to Level 2" },
  ],
  habitable: [
    { to: "pipes", kind: "stair", label: "Maintenance stairwell — Level 2" },
    { to: "pipes", kind: "elevator", label: "Warehouse elevator — Level 2" },
    { to: "pipes", kind: "door", label: "Unlocked steel door — Level 2" },
    { to: "lobby", kind: "garage", label: "Yellow wallpaper — back to Level 0" },
  ],
  pipes: [
    { to: "office", kind: "fireexit", label: "Fire exit — Level 4" },
    { to: "habitable", kind: "door", label: "Service door — Level 1" },
  ],
  office: [
    { to: "hotel", kind: "stair", label: "Office stairway — Level 5" },
    { to: "hotel", kind: "elevator", label: "Office elevator — Level 5" },
    { to: "poolrooms", kind: "dry", label: "Flooded carpet — Level 37" },
  ],
  hotel: [
    { to: "office", kind: "stair", label: "Hotel staircase — Level 4" },
    { to: "caves", kind: "boiler", label: "Boiler-room stairs — Level 8" },
  ],
  caves: [
    { to: "poolrooms", kind: "cave", label: "Flooded cave mouth — Level 37" },
    { to: "lobby", kind: "garage", label: "Yellow tear in the rock — Level 0" },
  ],
  poolrooms: [
    { to: "office", kind: "dry", label: "Dry beige corridor — Level 4" },
  ],
};

export function nextRecipe(id) {
  const list = EXITS[id] || EXITS.lobby;
  return list[0].to;
}

export function getRecipe(id) {
  return RECIPES[id] || RECIPES.lobby;
}

export function pickExit(id, seed, tx, tz, kind) {
  let list = EXITS[id] || EXITS.lobby;
  if (kind) {
    const filtered = list.filter((e) => (Array.isArray(kind) ? kind.includes(e.kind) : e.kind === kind));
    if (filtered.length) list = filtered;
  }
  const h = Math.abs((Math.imul(seed ^ tx, 1103515245) + tz) | 0);
  return { ...list[h % list.length] };
}
