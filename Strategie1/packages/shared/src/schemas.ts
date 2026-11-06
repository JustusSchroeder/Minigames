import { z } from "zod";
import {
  BATTALION_IDS,
  CLIMATE_REGIONS,
  CONSTRUCTION_KINDS,
  EQUIPMENT_IDS,
  RESOURCE_IDS,
  SAVE_VERSION,
  TEMPLATE_LIMITS,
  TERRAIN_TYPES,
} from "./constants.ts";
import { TECH_IDS } from "./research.ts";

export const gameDateSchema = z.strictObject({
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
  hour: z.number().int().min(0).max(23),
});

export const resourceAmountSchema = z.strictObject({
  resource: z.enum(RESOURCE_IDS),
  amount: z.number().int().nonnegative(),
});

export const stockpileSchema = z.strictObject({
  steel: z.number().int().nonnegative(),
  aluminum: z.number().int().nonnegative(),
  oil: z.number().int().nonnegative(),
  rubber: z.number().int().nonnegative(),
  tungsten: z.number().int().nonnegative(),
  chromium: z.number().int().nonnegative(),
  infantry_equipment: z.number().int().nonnegative(),
});

export const provinceDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  geometryRef: z.string().min(1),
  center: z.strictObject({
    lon: z.number(),
    lat: z.number(),
  }),
  countryId: z.string().min(1),
  terrain: z.enum(TERRAIN_TYPES),
  climate: z.enum(CLIMATE_REGIONS),
  area: z.number().positive(),
  neighbors: z.array(z.string().min(1)),
  infrastructureLevel: z.number().int().min(0).max(10),
  victoryPointValue: z.number().int().nonnegative(),
  resources: z.array(resourceAmountSchema),
  strategicTags: z.array(z.string()),
  impassable: z.boolean(),
});

export const countryDefinitionSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  localizationKey: z.string().min(1),
  flagRef: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  government: z.string().min(1),
  ideology: z.string().min(1),
  stability: z.number().min(0).max(100),
  warSupport: z.number().min(0).max(100),
  manpower: z.number().int().nonnegative(),
  population: z.number().int().positive(),
  civilianFactories: z.number().int().nonnegative(),
  militaryFactories: z.number().int().nonnegative(),
  dockyards: z.number().int().nonnegative(),
  researchSlots: z.number().int().nonnegative(),
  stockpile: stockpileSchema,
  capitalProvinceId: z.string().min(1),
  alignedTo: z.string().min(1).nullable(),
  startingResearch: z.array(z.enum(TECH_IDS)).default([]),
});

export const templateSlotSchema = z.strictObject({
  battalion: z.enum(BATTALION_IDS),
  count: z.number().int().positive().max(TEMPLATE_LIMITS.maxLine),
});

export const templateSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1).max(TEMPLATE_LIMITS.maxName),
  countryId: z.string().min(1),
  line: z.array(templateSlotSchema).max(BATTALION_IDS.length),
  support: z.array(templateSlotSchema).max(TEMPLATE_LIMITS.maxSupport),
});

export const divisionSpawnSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  countryId: z.string().min(1),
  templateId: z.string().min(1),
  provinceId: z.string().min(1),
  manpower: z.number().int().nonnegative(),
  equipment: z.number().int().nonnegative(),
  organization: z.number().nonnegative().optional(),
});

export const warSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  attackers: z.array(z.string().min(1)).min(1),
  defenders: z.array(z.string().min(1)).min(1),
  start: gameDateSchema,
});

export const effectSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("addManpower"),
    amount: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("addWarSupport"),
    amount: z.number(),
  }),
  z.strictObject({
    type: z.literal("addStability"),
    amount: z.number(),
  }),
  z.strictObject({
    type: z.literal("addEquipment"),
    equipment: z.literal("infantry_equipment"),
    amount: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("addCivilianFactories"),
    amount: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("addMilitaryFactories"),
    amount: z.number().int(),
  }),
  z.strictObject({
    type: z.literal("unlockTech"),
    techId: z.enum(TECH_IDS),
  }),
]);

export const focusNodeSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  detail: z.string().min(1),
  days: z.number().int().positive().max(90),
  requires: z.array(z.string().min(1)),
  effects: z.array(effectSchema),
});

export const focusTreeSchema = z.strictObject({
  countryId: z.string().min(1),
  nodes: z.array(focusNodeSchema).min(1),
});

export const eventChoiceSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  detail: z.string().min(1),
  weight: z.number().nonnegative(),
  effects: z.array(effectSchema),
});

export const eventSchema = z.strictObject({
  id: z.string().min(1),
  countryId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  trigger: gameDateSchema,
  choices: z.array(eventChoiceSchema).min(1),
});

export const scenarioSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  startDate: gameDateSchema,
  defaultSeed: z.number().int(),
  countries: z.array(countryDefinitionSchema).min(1),
  provinces: z.array(provinceDefinitionSchema).min(1),
  templates: z.array(templateSchema).min(1),
  divisions: z.array(divisionSpawnSchema),
  wars: z.array(warSchema),
  events: z.array(eventSchema),
  focusTrees: z.array(focusTreeSchema),
});

export const provinceStateSchema = z.strictObject({
  ownerId: z.string().min(1),
  controllerId: z.string().min(1),
  infrastructure: z.number().int().min(0).max(10),
  forts: z.number().int().nonnegative(),
  rail: z.number().int().nonnegative(),
  port: z.number().int().nonnegative(),
  supplyHub: z.boolean(),
  damage: z.number().int().nonnegative(),
  resistance: z.number().int().nonnegative(),
});

export const supplyStatusSchema = z.strictObject({
  available: z.number().nonnegative(),
  demand: z.number().nonnegative(),
  ratio: z.number().min(0).max(1),
  connected: z.boolean(),
});

export const mapPointSchema = z.strictObject({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});

export const orderStateSchema = z.strictObject({
  waypoints: z.array(mapPointSchema).min(2),
  hops: z.array(z.string().min(1)).min(1),
  nextIndex: z.number().int().min(1),
  progressHours: z.number().int().nonnegative(),
  hoursRequired: z.number().int().positive(),
  estimatedHours: z.number().int().nonnegative(),
});

export const divisionStateSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  countryId: z.string().min(1),
  templateId: z.string().min(1),
  provinceId: z.string().min(1),
  position: mapPointSchema,
  manpower: z.number().int().nonnegative(),
  equipment: z.number().int().nonnegative(),
  organization: z.number().nonnegative(),
  attackFrom: z.string().min(1).nullable(),
  battleId: z.string().min(1).nullable(),
  order: orderStateSchema.nullable(),
  entrenchment: z.number().nonnegative(),
});

export const frontSchema = z.strictObject({
  id: z.string().min(1),
  countryId: z.string().min(1),
  enemyId: z.string().min(1),
  divisionIds: z.array(z.string().min(1)),
  line: z.array(mapPointSchema).max(80),
  offensive: z.array(mapPointSchema).max(80).nullable(),
  executing: z.boolean(),
});

export const battleStateSchema = z.strictObject({
  id: z.string().min(1),
  provinceId: z.string().min(1),
  attackerIds: z.array(z.string().min(1)),
  defenderIds: z.array(z.string().min(1)),
  hours: z.number().int().nonnegative(),
});

export const countryStateSchema = z.strictObject({
  manpower: z.number().int().nonnegative(),
  stability: z.number(),
  warSupport: z.number(),
  civilianFactories: z.number().int().nonnegative(),
  militaryFactories: z.number().int().nonnegative(),
  dockyards: z.number().int().nonnegative(),
  stockpile: stockpileSchema,
  alignedTo: z.string().min(1).nullable(),
  researched: z.array(z.enum(TECH_IDS)),
  research: z.array(
    z.strictObject({
      techId: z.enum(TECH_IDS),
      progress: z.number().int().nonnegative(),
    }),
  ),
  focusId: z.string().min(1).nullable(),
  focusProgress: z.number().int().nonnegative(),
  completedFocuses: z.array(z.string().min(1)),
});

export const constructionProjectSchema = z.strictObject({
  id: z.string().min(1),
  countryId: z.string().min(1),
  kind: z.enum(CONSTRUCTION_KINDS),
  provinceId: z.string().min(1).nullable(),
  progress: z.number().int().nonnegative(),
  cost: z.number().int().positive(),
});

export const productionLineSchema = z.strictObject({
  id: z.string().min(1),
  countryId: z.string().min(1),
  equipment: z.enum(EQUIPMENT_IDS),
  factories: z.number().int().positive(),
  efficiency: z.number().min(0).max(1),
});

export const tradeRouteSchema = z.strictObject({
  id: z.string().min(1),
  buyerId: z.string().min(1),
  sellerId: z.string().min(1),
  resource: z.enum(RESOURCE_IDS),
  factories: z.number().int().positive(),
});

export const speedSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(4),
  z.literal(8),
]);

export const campaignStateSchema = z.strictObject({
  scenarioId: z.string().min(1),
  seed: z.number().int(),
  rngState: z.number().int(),
  date: gameDateSchema,
  speed: speedSchema,
  paused: z.boolean(),
  playerCountryId: z.string().min(1),
  tick: z.number().int().nonnegative(),
  countries: z.record(z.string(), countryStateSchema),
  provinces: z.record(z.string(), provinceStateSchema),
  divisions: z.record(z.string(), divisionStateSchema),
  battles: z.record(z.string(), battleStateSchema),
  wars: z.array(warSchema),
  firedEvents: z.array(z.string()),
  pendingEvent: z
    .strictObject({
      eventId: z.string().min(1),
      countryId: z.string().min(1),
    })
    .nullable(),
  countrySupply: z.record(z.string(), z.record(z.string(), supplyStatusSchema)),
  construction: z.array(constructionProjectSchema),
  production: z.array(productionLineSchema),
  trade: z.array(tradeRouteSchema),
  economySerial: z.number().int().nonnegative(),
  templates: z.array(templateSchema).min(1),
  recruitSerial: z.number().int().nonnegative(),
  fronts: z.array(frontSchema),
  log: z.array(z.string()),
});

export const saveFileSchema = z.strictObject({
  version: z.literal(SAVE_VERSION),
  name: z.string().min(1),
  savedAt: z.string().min(1),
  state: campaignStateSchema,
});

export const commandSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("pause") }),
  z.strictObject({ type: z.literal("resume") }),
  z.strictObject({ type: z.literal("setSpeed"), speed: speedSchema }),
  z.strictObject({
    type: z.literal("moveDivision"),
    divisionId: z.string().min(1),
    lon: z.number().min(-180).max(180),
    lat: z.number().min(-90).max(90),
  }),
  z.strictObject({
    type: z.literal("cancelMove"),
    divisionId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("resolveEvent"),
    eventId: z.string().min(1),
    choiceId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("queueConstruction"),
    kind: z.enum(CONSTRUCTION_KINDS),
    provinceId: z.string().min(1).nullable(),
  }),
  z.strictObject({
    type: z.literal("cancelConstruction"),
    projectId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("setProduction"),
    equipment: z.enum(EQUIPMENT_IDS),
    factories: z.number().int().nonnegative(),
  }),
  z.strictObject({
    type: z.literal("openTrade"),
    partnerId: z.string().min(1),
    resource: z.enum(RESOURCE_IDS),
    factories: z.number().int().positive(),
  }),
  z.strictObject({
    type: z.literal("closeTrade"),
    tradeId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("createTemplate"),
    name: z.string().min(1).max(TEMPLATE_LIMITS.maxName),
  }),
  z.strictObject({
    type: z.literal("renameTemplate"),
    templateId: z.string().min(1),
    name: z.string().min(1).max(TEMPLATE_LIMITS.maxName),
  }),
  z.strictObject({
    type: z.literal("setBattalion"),
    templateId: z.string().min(1),
    role: z.enum(["line", "support"]),
    battalion: z.enum(BATTALION_IDS),
    count: z.number().int().nonnegative().max(TEMPLATE_LIMITS.maxLine),
  }),
  z.strictObject({
    type: z.literal("recruitDivision"),
    templateId: z.string().min(1),
    provinceId: z.string().min(1),
    name: z.string().min(1).max(TEMPLATE_LIMITS.maxName),
  }),
  z.strictObject({
    type: z.literal("createFront"),
    enemyId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("assignFront"),
    frontId: z.string().min(1),
    divisionId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("drawFront"),
    frontId: z.string().min(1),
    points: z.array(mapPointSchema).min(2).max(80),
  }),
  z.strictObject({
    type: z.literal("drawOffensive"),
    frontId: z.string().min(1),
    points: z.array(mapPointSchema).min(2).max(80),
  }),
  z.strictObject({
    type: z.literal("deleteFront"),
    frontId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("executeFront"),
    frontId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("cancelOffensive"),
    frontId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("startResearch"),
    techId: z.enum(TECH_IDS),
  }),
  z.strictObject({
    type: z.literal("cancelResearch"),
    techId: z.enum(TECH_IDS),
  }),
  z.strictObject({
    type: z.literal("startFocus"),
    focusId: z.string().min(1),
  }),
  z.strictObject({
    type: z.literal("cancelFocus"),
  }),
]);

export const commandResultSchema = z.strictObject({
  ok: z.boolean(),
  summary: z.string(),
  reason: z.string().optional(),
  estimatedHours: z.number().int().nonnegative().optional(),
});

export type MapPoint = z.infer<typeof mapPointSchema>;
export type GameDate = z.infer<typeof gameDateSchema>;
export type ResourceAmount = z.infer<typeof resourceAmountSchema>;
export type Stockpile = z.infer<typeof stockpileSchema>;
export type ProvinceDefinition = z.infer<typeof provinceDefinitionSchema>;
export type CountryDefinition = z.infer<typeof countryDefinitionSchema>;
export type DivisionTemplate = z.infer<typeof templateSchema>;
export type DivisionSpawn = z.infer<typeof divisionSpawnSchema>;
export type WarDefinition = z.infer<typeof warSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type EventChoice = z.infer<typeof eventChoiceSchema>;
export type EventDefinition = z.infer<typeof eventSchema>;
export type FocusNode = z.infer<typeof focusNodeSchema>;
export type FocusTree = z.infer<typeof focusTreeSchema>;
export type ScenarioDefinition = z.infer<typeof scenarioSchema>;
export type ProvinceState = z.infer<typeof provinceStateSchema>;
export type SupplyStatus = z.infer<typeof supplyStatusSchema>;
export type OrderState = z.infer<typeof orderStateSchema>;
export type DivisionState = z.infer<typeof divisionStateSchema>;
export type BattleState = z.infer<typeof battleStateSchema>;
export type CountryState = z.infer<typeof countryStateSchema>;
export type ConstructionProject = z.infer<typeof constructionProjectSchema>;
export type ProductionLine = z.infer<typeof productionLineSchema>;
export type TradeRoute = z.infer<typeof tradeRouteSchema>;
export type CampaignState = z.infer<typeof campaignStateSchema>;
export type SaveFile = z.infer<typeof saveFileSchema>;
export type Command = z.infer<typeof commandSchema>;
export type CommandResult = z.infer<typeof commandResultSchema>;
