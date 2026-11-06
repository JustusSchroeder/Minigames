/** Game-hour speeds offered in the command bar. Pause is a separate flag. */
export const SIMULATION_SPEEDS = [1, 2, 4, 8] as const;
export type SimulationSpeed = (typeof SIMULATION_SPEEDS)[number];

/** Game hours advanced per real second at each speed. */
export const HOURS_PER_REAL_SECOND: Record<SimulationSpeed, number> = {
  1: 1,
  2: 2,
  4: 4,
  8: 8,
};

/** Upper bound on game hours processed in one animation frame. */
export const MAX_HOURS_PER_FRAME = 6;

/** Reject absurd single calls so a bad client cannot lock the engine. */
export const MAX_HOURS_PER_CALL = 24 * 90;

export const SAVE_VERSION = 10;

export const TERRAIN_TYPES = [
  "plains",
  "forest",
  "hills",
  "mountains",
  "urban",
  "marsh",
] as const;
export type TerrainType = (typeof TERRAIN_TYPES)[number];

export const CLIMATE_REGIONS = ["oceanic", "continental", "alpine"] as const;
export type ClimateRegion = (typeof CLIMATE_REGIONS)[number];

export const RESOURCE_IDS = [
  "steel",
  "aluminum",
  "oil",
  "rubber",
  "tungsten",
  "chromium",
] as const;
export type ResourceId = (typeof RESOURCE_IDS)[number];

export const EQUIPMENT_IDS = ["infantry_equipment"] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

export const BATTALION_IDS = [
  "hadrosaur",
  "raptor",
  "ceratops",
  "tyrannosaur",
  "ankylosaur",
  "stegosaur",
  "pterosaur",
  "spinosaur",
] as const;
export type BattalionId = (typeof BATTALION_IDS)[number];
export type BattalionRole = "line" | "support";

export interface BattalionDefinition {
  name: string;
  role: BattalionRole;
  combatWidth: number;
  manpower: number;
  equipment: number;
  softAttack: number;
  hardAttack: number;
  defense: number;
  breakthrough: number;
  organization: number;
  supplyUse: number;
  armor: number;
  piercing: number;
  /** Support that speeds digging in. */
  digsIn: boolean;
}

/** Line species fight for combat width. Support species do not, and each type is added once. */
export const BATTALIONS: Record<BattalionId, BattalionDefinition> = {
  hadrosaur: {
    name: "Hadrosaur",
    role: "line",
    combatWidth: 2,
    manpower: 1000,
    equipment: 80,
    softAttack: 2,
    hardAttack: 0.2,
    defense: 3,
    breakthrough: 0.6,
    organization: 60,
    supplyUse: 1,
    armor: 0,
    piercing: 4,
    digsIn: false,
  },
  raptor: {
    name: "Raptor",
    role: "line",
    combatWidth: 2,
    manpower: 600,
    equipment: 50,
    softAttack: 3.5,
    hardAttack: 1.2,
    defense: 1.2,
    breakthrough: 5,
    organization: 42,
    supplyUse: 1,
    armor: 0,
    piercing: 8,
    digsIn: false,
  },
  ceratops: {
    name: "Ceratops",
    role: "line",
    combatWidth: 3,
    manpower: 500,
    equipment: 60,
    softAttack: 7,
    hardAttack: 0.5,
    defense: 2,
    breakthrough: 1,
    organization: 35,
    supplyUse: 2,
    armor: 4,
    piercing: 12,
    digsIn: false,
  },
  tyrannosaur: {
    name: "Tyrannosaur",
    role: "line",
    combatWidth: 2,
    manpower: 500,
    equipment: 140,
    softAttack: 4,
    hardAttack: 10,
    defense: 4,
    breakthrough: 12,
    organization: 25,
    supplyUse: 3,
    armor: 30,
    piercing: 15,
    digsIn: false,
  },
  ankylosaur: {
    name: "Ankylosaur",
    role: "line",
    combatWidth: 2,
    manpower: 800,
    equipment: 90,
    softAttack: 1.5,
    hardAttack: 2,
    defense: 7,
    breakthrough: 0.4,
    organization: 50,
    supplyUse: 2,
    armor: 22,
    piercing: 6,
    digsIn: false,
  },
  stegosaur: {
    name: "Stegosaur",
    role: "support",
    combatWidth: 0,
    manpower: 300,
    equipment: 40,
    softAttack: 0.4,
    hardAttack: 0.2,
    defense: 5,
    breakthrough: 2,
    organization: 60,
    supplyUse: 1,
    armor: 8,
    piercing: 4,
    digsIn: true,
  },
  pterosaur: {
    name: "Pterosaur",
    role: "support",
    combatWidth: 0,
    manpower: 200,
    equipment: 30,
    softAttack: 0.5,
    hardAttack: 0.4,
    defense: 1,
    breakthrough: 3,
    organization: 60,
    supplyUse: 1,
    armor: 2,
    piercing: 6,
    digsIn: false,
  },
  spinosaur: {
    name: "Spinosaur",
    role: "support",
    combatWidth: 0,
    manpower: 300,
    equipment: 40,
    softAttack: 1,
    hardAttack: 1.5,
    defense: 2,
    breakthrough: 0.4,
    organization: 45,
    supplyUse: 1,
    armor: 0,
    piercing: 20,
    digsIn: false,
  },
};

export const TEMPLATE_LIMITS = {
  maxLine: 25,
  maxSupport: 5,
  maxTemplates: 12,
  maxName: 40,
} as const;

export const CONSTRUCTION_KINDS = [
  "civilian_factory",
  "military_factory",
  "infrastructure",
  "fort",
  "rail",
  "port",
  "supply_hub",
] as const;
export type ConstructionKind = (typeof CONSTRUCTION_KINDS)[number];

/** One industrial point per civilian factory per day. Costs are in those points. */
export const ECONOMY = {
  maxFactoriesPerProject: 15,
  maxProjects: 8,
  maxInfrastructure: 10,
  civilianFactoryCost: 360,
  militaryFactoryCost: 240,
  infrastructureCost: 80,
  fortCost: 160,
  maxForts: 5,
  railCost: 120,
  maxRail: 5,
  portCost: 200,
  maxPort: 3,
  hubCost: 240,
  outputPerMilitaryFactory: 5,
  startingEfficiency: 0.5,
  efficiencyGain: 0.02,
  unitsPerTradeFactory: 8,
  transportPerInfrastructure: 4,
} as const;

/** Resource units consumed for each item delivered to the stockpile. */
export const RECIPES: Record<EquipmentId, Partial<Record<ResourceId, number>>> = {
  infantry_equipment: { steel: 2 },
};

export const MAP_MODES = [
  "political",
  "terrain",
  "infrastructure",
  "resources",
  "supply",
  "control",
  "victory",
] as const;
export type MapMode = (typeof MAP_MODES)[number];

export const MOVEMENT_HOURS: Record<TerrainType, number> = {
  plains: 5,
  forest: 8,
  hills: 7,
  mountains: 14,
  urban: 6,
  marsh: 12,
};

export const COMBAT = {
  /** Pool of organization loss applied to the side that is hit. */
  orgFactor: 0.35,
  attackerOrgFactor: 0.28,
  minOrgLoss: 0.2,
  /** Share of a side's organization loss that becomes manpower and equipment loss. */
  strengthFromOrg: 0.04,
  combatWidth: 80,
  retreatOrganization: 12,
  supplyFloor: 0.25,
  /** Extra attack when this side's armor exceeds the other's piercing. */
  armorBonus: 0.4,
  /** Organization loss taken by a side whose armor exceeds the other's piercing. */
  armorDamageTaken: 0.5,
  fortDefense: 0.15,
  entrenchmentPerHour: 1,
  entrenchmentEngineer: 2,
  maxEntrenchment: 20,
  entrenchmentDefense: 0.03,
  encirclementDamage: 1.75,
} as const;

export const SUPPLY = {
  throughputPerInfrastructure: 8,
  /** Added on a border where both provinces have a railway. This can beat a weak road. */
  railPerLevel: 12,
  /** Sea lane between two friendly ports. Blockade is not simulated. */
  portPerLevel: 16,
  /** Road hops trucks can travel from a hub, or from a province reached by rail or sea. */
  hubRange: 2,
} as const;

export const TERRAIN_DEFENSE: Record<TerrainType, number> = {
  plains: 1,
  forest: 1.1,
  hills: 1.15,
  mountains: 1.4,
  urban: 1.2,
  marsh: 1.15,
};

export const RIVER_DEFENSE = 1.2;

export function movementHours(terrain: TerrainType, infrastructure: number): number {
  const base = MOVEMENT_HOURS[terrain];
  const factor = 1 - Math.min(0.4, Math.max(0, infrastructure - 1) * 0.08);
  return Math.max(1, Math.round(base * factor));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
