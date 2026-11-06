import {
  ECONOMY,
  MAX_HOURS_PER_CALL,
  SAVE_VERSION,
  deriveTemplate,
  formatGameDate,
  saveFileSchema,
  scenarioSchema,
  type CampaignState,
  type Command,
  type CommandResult,
  type CountryDefinition,
  type DivisionTemplate,
  type ProvinceDefinition,
  type SaveFile,
  type ScenarioDefinition,
} from "@meridian/shared";
import { addHours } from "./clock.ts";
import { digIn, resolveCombat, retreatDestination } from "./combat.ts";
import { applyFrontCommand, maintainFronts } from "./fronts.ts";
import { applyEffects, checkEvents } from "./events.ts";
import { moveDivisions } from "./movement.ts";
import { nearestProvince, provincePoint } from "./geo.ts";
import { placeRoute } from "./pathfinding.ts";
import { friendlyController } from "./relations.ts";
import { normalizeSeed } from "./rng.ts";
import { buildSnapshot, type CampaignSnapshot } from "./snapshot.ts";
import { applyIndustryCommand, resolveEconomy } from "./economy.ts";
import { applyResearchCommand, resolveResearch } from "./research.ts";
import { applyTemplateCommand } from "./templates.ts";
import { recomputeSupply, startingPort, startingRail } from "./supply.ts";
import { validateScenario, validateState } from "./validate.ts";

export interface Campaign {
  scenario: ScenarioDefinition;
  state: CampaignState;
  provinces: ReadonlyMap<string, ProvinceDefinition>;
  countries: ReadonlyMap<string, CountryDefinition>;
  templates: ReadonlyMap<string, DivisionTemplate>;
}

export interface SimulationReport {
  lines: string[];
  timings: {
    movement: number;
    combat: number;
    supply: number;
    economy: number;
    events: number;
    total: number;
  };
}

export class SaveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveValidationError";
  }
}

export function indexScenario(scenario: ScenarioDefinition, state: CampaignState): Campaign {
  return {
    scenario,
    state,
    provinces: new Map(scenario.provinces.map((province) => [province.id, province])),
    countries: new Map(scenario.countries.map((country) => [country.id, country])),
    templates: new Map(state.templates.map((template) => [template.id, template])),
  };
}

function pushLog(state: CampaignState, lines: string[]): void {
  for (const line of lines) state.log.push(line);
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

function requireCampaign(scenario: ScenarioDefinition, state: CampaignState): Campaign {
  const scenarioErrors = validateScenario(scenario);
  if (scenarioErrors.length > 0) {
    throw new Error(`Scenario failed validation:\n${scenarioErrors.join("\n")}`);
  }
  const stateErrors = validateState(scenario, state);
  if (stateErrors.length > 0) {
    throw new SaveValidationError(stateErrors.join("\n"));
  }
  return indexScenario(scenario, state);
}

export function createCampaign(config: {
  scenario: ScenarioDefinition;
  playerCountryId: string;
  seed?: number;
}): Campaign {
  const scenario = scenarioSchema.parse(config.scenario);
  const scenarioErrors = validateScenario(scenario);
  if (scenarioErrors.length > 0) {
    throw new Error(`Scenario failed validation:\n${scenarioErrors.join("\n")}`);
  }
  if (!scenario.countries.some((country) => country.id === config.playerCountryId)) {
    throw new Error(`Unknown player country ${config.playerCountryId}`);
  }
  const seed = normalizeSeed(config.seed ?? scenario.defaultSeed);
  const state: CampaignState = {
    scenarioId: scenario.id,
    seed,
    rngState: seed,
    date: { ...scenario.startDate },
    speed: 1,
    paused: true,
    playerCountryId: config.playerCountryId,
    tick: 0,
    countries: {},
    provinces: {},
    divisions: {},
    battles: {},
    wars: scenario.wars.map((war) => ({
      ...war,
      attackers: [...war.attackers],
      defenders: [...war.defenders],
      start: { ...war.start },
    })),
    firedEvents: [],
    pendingEvent: null,
    countrySupply: {},
    construction: [],
    production: [],
    trade: [],
    economySerial: 1,
    fronts: [],
    templates: scenario.templates.map((template) => ({
      id: template.id,
      name: template.name,
      countryId: template.countryId,
      line: template.line.map((slot) => ({ ...slot })),
      support: template.support.map((slot) => ({ ...slot })),
    })),
    recruitSerial: 1,
    log: [`Campaign opened. ${formatGameDate(scenario.startDate)}.`],
  };

  for (const country of scenario.countries) {
    state.countries[country.id] = {
      manpower: country.manpower,
      stability: country.stability,
      warSupport: country.warSupport,
      civilianFactories: country.civilianFactories,
      militaryFactories: country.militaryFactories,
      dockyards: country.dockyards,
      stockpile: { ...country.stockpile },
      alignedTo: country.alignedTo,
      researched: [...country.startingResearch],
      research: [],
      focusId: null,
      focusProgress: 0,
      completedFocuses: [],
    };
    if (country.militaryFactories > 0) {
      state.production.push({
        id: `${country.id}:infantry_equipment`,
        countryId: country.id,
        equipment: "infantry_equipment",
        factories: country.militaryFactories,
        efficiency: ECONOMY.startingEfficiency,
      });
    }
  }
  for (const province of scenario.provinces) {
    const capital = scenario.countries.find((country) => country.capitalProvinceId === province.id);
    state.provinces[province.id] = {
      ownerId: province.countryId,
      controllerId: province.countryId,
      infrastructure: province.infrastructureLevel,
      forts: 0,
      rail: startingRail(province.infrastructureLevel),
      port: startingPort(province.strategicTags),
      supplyHub: capital !== undefined,
      damage: 0,
      resistance: 0,
    };
  }
  for (const spawn of scenario.divisions) {
    const template = scenario.templates.find((item) => item.id === spawn.templateId);
    const stats = template ? deriveTemplate(template) : null;
    const home = scenario.provinces.find((province) => province.id === spawn.provinceId)?.center;
    state.divisions[spawn.id] = {
      id: spawn.id,
      name: spawn.name,
      countryId: spawn.countryId,
      templateId: spawn.templateId,
      provinceId: spawn.provinceId,
      position: home ? { lon: home.lon, lat: home.lat } : { lon: 0, lat: 0 },
      manpower: spawn.manpower,
      equipment: spawn.equipment,
      organization: spawn.organization ?? stats?.organization ?? 0,
      attackFrom: null,
      battleId: null,
      order: null,
      entrenchment: 0,
    };
  }

  const campaign = indexScenario(scenario, state);
  recomputeSupply(campaign);
  return campaign;
}

export function advanceSimulation(
  campaign: Campaign,
  elapsedGameHours: number,
): { campaign: Campaign; report: SimulationReport } {
  if (!Number.isInteger(elapsedGameHours) || elapsedGameHours < 0) {
    throw new Error("elapsedGameHours must be a non-negative integer");
  }
  if (elapsedGameHours > MAX_HOURS_PER_CALL) {
    throw new Error(`Refusing to advance ${elapsedGameHours} hours in one call`);
  }
  const next = indexScenario(campaign.scenario, structuredClone(campaign.state));
  const lines: string[] = [];
  const timings = { movement: 0, combat: 0, supply: 0, economy: 0, events: 0, total: 0 };
  const started = performance.now();
  if (next.state.paused || elapsedGameHours === 0) {
    timings.total = performance.now() - started;
    return { campaign: next, report: { lines, timings } };
  }

  for (let hour = 0; hour < elapsedGameHours; hour += 1) {
    if (next.state.paused) break;
    next.state.tick += 1;
    next.state.date = addHours(next.state.date, 1);
    digIn(next);

    if (next.state.date.hour === 0) {
      const supplyStarted = performance.now();
      recomputeSupply(next);
      timings.supply += performance.now() - supplyStarted;
      const economyStarted = performance.now();
      const economyLines: string[] = [];
      const infrastructureChanged = resolveEconomy(next, economyLines);
      lines.push(...economyLines);
      if (infrastructureChanged) recomputeSupply(next);
      timings.economy += performance.now() - economyStarted;
      resolveResearch(next, lines);
    }

    const eventStarted = performance.now();
    checkEvents(next, lines);
    timings.events += performance.now() - eventStarted;
    if (next.state.paused) break;

    const moveStarted = performance.now();
    const moveDirty = moveDivisions(next, lines);
    timings.movement += performance.now() - moveStarted;

    const combatStarted = performance.now();
    const combatDirty = resolveCombat(next, lines);
    timings.combat += performance.now() - combatStarted;
    maintainFronts(next);

    if (moveDirty || combatDirty) {
      const supplyStarted = performance.now();
      recomputeSupply(next);
      timings.supply += performance.now() - supplyStarted;
    }
  }

  pushLog(next.state, lines);
  timings.total = performance.now() - started;
  return { campaign: next, report: { lines, timings } };
}

export function issueCommand(
  campaign: Campaign,
  command: Command,
): { campaign: Campaign; result: CommandResult } {
  const next = indexScenario(campaign.scenario, structuredClone(campaign.state));
  const result = applyCommand(next, command);
  if (result.ok) pushLog(next.state, [result.summary]);
  return { campaign: next, result };
}

function applyCommand(campaign: Campaign, command: Command): CommandResult {
  if (command.type === "pause") {
    campaign.state.paused = true;
    return { ok: true, summary: "Simulation paused." };
  }
  if (command.type === "resume") {
    if (campaign.state.pendingEvent) {
      return {
        ok: false,
        summary: "The simulation stays paused.",
        reason: "Resolve the open decision before resuming.",
      };
    }
    campaign.state.paused = false;
    return { ok: true, summary: `Simulation resumed at ${campaign.state.speed}x.` };
  }
  if (command.type === "setSpeed") {
    campaign.state.speed = command.speed;
    if (!campaign.state.pendingEvent) campaign.state.paused = false;
    return {
      ok: true,
      summary: campaign.state.paused
        ? `Speed set to ${command.speed}x. Still paused for a decision.`
        : `Speed set to ${command.speed}x.`,
    };
  }
  if (
    command.type === "queueConstruction" ||
    command.type === "cancelConstruction" ||
    command.type === "setProduction" ||
    command.type === "openTrade" ||
    command.type === "closeTrade"
  ) {
    return applyIndustryCommand(campaign, command) ?? {
      ok: false,
      summary: "Order refused.",
      reason: "That industry order could not be applied.",
    };
  }
  if (
    command.type === "createTemplate" ||
    command.type === "renameTemplate" ||
    command.type === "setBattalion" ||
    command.type === "recruitDivision"
  ) {
    return applyTemplateCommand(campaign, command);
  }
    if (
      command.type === "createFront" ||
      command.type === "assignFront" ||
      command.type === "drawFront" ||
      command.type === "drawOffensive" ||
      command.type === "deleteFront" ||
      command.type === "executeFront" ||
      command.type === "cancelOffensive"
    ) {
    return applyFrontCommand(campaign, command);
  }
  if (
    command.type === "startResearch" ||
    command.type === "cancelResearch" ||
    command.type === "startFocus" ||
    command.type === "cancelFocus"
  ) {
    return applyResearchCommand(campaign, command);
  }
  if (command.type === "resolveEvent") {
    const pending = campaign.state.pendingEvent;
    if (!pending || pending.eventId !== command.eventId) {
      return { ok: false, summary: "No matching decision is waiting.", reason: "That event is not pending." };
    }
    const event = campaign.scenario.events.find((item) => item.id === command.eventId);
    const choice = event?.choices.find((item) => item.id === command.choiceId);
    if (!event || !choice) {
      return { ok: false, summary: "That choice is not available.", reason: "Unknown event choice." };
    }
    applyEffects(campaign, event.countryId, choice.effects);
    campaign.state.pendingEvent = null;
    return { ok: true, summary: `${choice.label}. ${choice.detail}` };
  }

  const division = campaign.state.divisions[command.divisionId];
  if (!division) {
    return { ok: false, summary: "Formation not found.", reason: "Unknown division." };
  }
  if (division.countryId !== campaign.state.playerCountryId) {
    return {
      ok: false,
      summary: "Order refused.",
      reason: "That formation is not under your command.",
    };
  }
  if (command.type === "cancelMove") {
    if (division.battleId && division.attackFrom) {
      const destination = division.attackFrom;
      division.organization = Math.max(division.organization, 12);
      division.provinceId = destination;
      division.position = provincePoint(campaign, destination) ?? division.position;
      division.battleId = null;
      division.attackFrom = null;
      division.order = null;
      return { ok: true, summary: `${division.name} broke off the attack.` };
    }
    if (!division.order) {
      return { ok: false, summary: "There is no march order to cancel.", reason: "The formation is idle." };
    }
    division.order = null;
    return { ok: true, summary: `${division.name} halted.` };
  }

  if (command.type !== "moveDivision") {
    return { ok: false, summary: "Order refused.", reason: "That order could not be applied." };
  }

  if (division.battleId) {
    return {
      ok: false,
      summary: "Order refused.",
      reason: "This formation is engaged and cannot take a new march order.",
    };
  }
  const dest = { lon: command.lon, lat: command.lat };
  const destId = nearestProvince(campaign, dest);
  if (!destId) return { ok: false, summary: "Order refused.", reason: "That point is not on valid land." };
  const destState = campaign.state.provinces[destId];
  const friendlyDestination =
    destState !== undefined && friendlyController(campaign, destState.controllerId, division.countryId);
  const placed = placeRoute(campaign, division.id, dest, !friendlyDestination);
  if (!placed.ok) return { ok: false, summary: "Order refused.", reason: placed.reason };
  const kind = friendlyDestination ? "March" : "Attack";
  const place = campaign.provinces.get(destId)?.name ?? "the ordered point";
  return {
    ok: true,
    summary: `${kind} order accepted for ${division.name} toward ${place}. Estimated arrival ${placed.hours} hours.`,
    estimatedHours: placed.hours,
  };
}

export function queryCountry(campaign: Campaign, countryId: string) {
  const definition = campaign.countries.get(countryId);
  const state = campaign.state.countries[countryId];
  if (!definition || !state) throw new Error(`Unknown country ${countryId}`);
  const divisions = Object.values(campaign.state.divisions).filter(
    (division) => division.countryId === countryId,
  );
  const owned = Object.entries(campaign.state.provinces)
    .filter(([, province]) => province.ownerId === countryId)
    .map(([id]) => id);
  const controlled = Object.entries(campaign.state.provinces)
    .filter(([, province]) => province.controllerId === countryId)
    .map(([id]) => id);
  return { ...definition, ...state, divisions, ownedProvinceIds: owned, controlledProvinceIds: controlled };
}

export function queryProvince(campaign: Campaign, provinceId: string) {
  const definition = campaign.provinces.get(provinceId);
  const state = campaign.state.provinces[provinceId];
  if (!definition || !state) throw new Error(`Unknown province ${provinceId}`);
  const divisions = Object.values(campaign.state.divisions).filter(
    (division) => division.provinceId === provinceId || division.attackFrom === provinceId,
  );
  const supply = campaign.state.countrySupply[state.controllerId]?.[provinceId] ?? null;
  return { ...definition, ...state, divisions, supply };
}

export function createSave(campaign: Campaign, name?: string, savedAt = new Date().toISOString()): SaveFile {
  return {
    version: SAVE_VERSION,
    name: name ?? `${campaign.scenario.name} — ${formatGameDate(campaign.state.date)}`,
    savedAt,
    state: structuredClone(campaign.state),
  };
}

export function loadSave(saveData: unknown, scenario: ScenarioDefinition): Campaign {
  const parsed = saveFileSchema.safeParse(saveData);
  if (!parsed.success) {
    throw new SaveValidationError(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  const campaign = requireCampaign(scenario, structuredClone(parsed.data.state));
  recomputeSupply(campaign);
  return campaign;
}

export function snapshot(campaign: Campaign): CampaignSnapshot {
  return buildSnapshot(campaign);
}

export { retreatDestination };
