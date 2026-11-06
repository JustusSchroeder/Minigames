export {
  BATTALIONS,
  BATTALION_IDS,
  CLIMATE_REGIONS,
  COMBAT,
  HOURS_PER_REAL_SECOND,
  MAP_MODES,
  MAX_HOURS_PER_CALL,
  MAX_HOURS_PER_FRAME,
  MOVEMENT_HOURS,
  CONSTRUCTION_KINDS,
  ECONOMY,
  EQUIPMENT_IDS,
  RECIPES,
  RESOURCE_IDS,
  RIVER_DEFENSE,
  SAVE_VERSION,
  SIMULATION_SPEEDS,
  SUPPLY,
  TEMPLATE_LIMITS,
  TERRAIN_DEFENSE,
  TERRAIN_TYPES,
  clamp,
  movementHours,
  round3,
} from "./constants.ts";
export type {
  BattalionDefinition,
  BattalionId,
  BattalionRole,
  ClimateRegion,
  ConstructionKind,
  EquipmentId,
  MapMode,
  ResourceId,
  SimulationSpeed,
  TerrainType,
} from "./constants.ts";
export { deriveTemplate, leadSpecies, templateProblems } from "./templates.ts";
export type { DerivedTemplate, TemplateComposition, TemplateSlot } from "./templates.ts";
export {
  TECHNOLOGIES,
  TECH_IDS,
  applyCountryCombat,
  doctrineBranchOf,
  emptyModifiers,
  isTechId,
  modifiersFrom,
} from "./research.ts";
export type { CountryModifiers, DoctrineBranch, TechId, TechKind, TechnologyDefinition } from "./research.ts";
export { WEATHERS, WEATHER_ATTACK, WEATHER_MOVE, weatherAt, weatherLabel } from "./weather.ts";
export type { Weather } from "./weather.ts";
export {
  battleStateSchema,
  campaignStateSchema,
  commandResultSchema,
  commandSchema,
  constructionProjectSchema,
  countryDefinitionSchema,
  eventSchema,
  gameDateSchema,
  productionLineSchema,
  provinceDefinitionSchema,
  saveFileSchema,
  scenarioSchema,
  templateSchema,
  tradeRouteSchema,
} from "./schemas.ts";
export type {
  BattleState,
  CampaignState,
  Command,
  CommandResult,
  ConstructionProject,
  CountryDefinition,
  CountryState,
  DivisionSpawn,
  DivisionState,
  DivisionTemplate,
  Effect,
  EventDefinition,
  FocusNode,
  FocusTree,
  GameDate,
  MapPoint,
  OrderState,
  ProvinceDefinition,
  ProductionLine,
  ProvinceState,
  ResourceAmount,
  SaveFile,
  ScenarioDefinition,
  Stockpile,
  SupplyStatus,
  TradeRoute,
  WarDefinition,
} from "./schemas.ts";

export function formatGameDate(date: {
  year: number;
  month: number;
  day: number;
  hour: number;
}): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months[date.month - 1] ?? "Unknown";
  const hour = String(date.hour).padStart(2, "0");
  if (date.year > 0 && date.year < 1000) {
    return `${date.day} ${month}, ${date.year} Ma, ${hour}:00`;
  }
  return `${date.day} ${month} ${date.year}, ${hour}:00`;
}
