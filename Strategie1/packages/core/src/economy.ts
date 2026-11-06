import {
  ECONOMY,
  RECIPES,
  RESOURCE_IDS,
  round3,
  type Command,
  type CommandResult,
  type ConstructionKind,
  type ConstructionProject,
  type ResourceId,
  type Stockpile,
} from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { atWar } from "./relations.ts";
import { countryModifiers } from "./research.ts";

export interface DayRates {
  extraction: Record<string, Record<ResourceId, number>>;
  transportCapacity: Record<string, number>;
  transportUsed: Record<string, number>;
  routes: Array<{ id: string; delivered: number; ends: boolean }>;
  projects: Array<{ id: string; factories: number; daysRemaining: number | null; stalled: boolean }>;
  lines: Array<{
    id: string;
    output: number;
    potential: number;
    short: boolean;
    missing: ResourceId[];
  }>;
}

function emptyResources(): Record<ResourceId, number> {
  return { steel: 0, aluminum: 0, oil: 0, rubber: 0, tungsten: 0, chromium: 0 };
}

function cloneStock(stock: Stockpile): Stockpile {
  return { ...stock };
}

export function constructionCost(kind: ConstructionKind): number {
  if (kind === "civilian_factory") return ECONOMY.civilianFactoryCost;
  if (kind === "military_factory") return ECONOMY.militaryFactoryCost;
  if (kind === "fort") return ECONOMY.fortCost;
  if (kind === "rail") return ECONOMY.railCost;
  if (kind === "port") return ECONOMY.portCost;
  if (kind === "supply_hub") return ECONOMY.hubCost;
  return ECONOMY.infrastructureCost;
}

function placedProject(kind: ConstructionKind): boolean {
  return kind === "infrastructure" || kind === "fort" || kind === "rail" || kind === "port" || kind === "supply_hub";
}

function transportCapacity(campaign: Campaign, countryId: string): number {
  const network = campaign.state.countrySupply[countryId] ?? {};
  let infrastructure = 0;
  for (const [provinceId, status] of Object.entries(network)) {
    if (!status.connected) continue;
    const province = campaign.state.provinces[provinceId];
    if (!province) continue;
    infrastructure += Math.max(0, province.infrastructure - province.damage);
  }
  return infrastructure * ECONOMY.transportPerInfrastructure;
}

function sellerCanOffer(campaign: Campaign, sellerId: string, resource: ResourceId): boolean {
  const stock = campaign.state.countries[sellerId]?.stockpile[resource] ?? 0;
  if (stock > 0) return true;
  return campaign.scenario.provinces.some((province) => {
    const state = campaign.state.provinces[province.id];
    return (
      state?.controllerId === sellerId &&
      province.resources.some((deposit) => deposit.resource === resource && deposit.amount > 0)
    );
  });
}

function projectDay(campaign: Campaign): {
  rates: DayRates;
  logs: string[];
  supplyChanged: boolean;
  stock: Record<string, Stockpile>;
  civilian: Record<string, number>;
  military: Record<string, number>;
  infrastructure: Record<string, number>;
  forts: Record<string, number>;
  rails: Record<string, number>;
  ports: Record<string, number>;
  hubs: Record<string, boolean>;
  construction: ConstructionProject[];
  production: Campaign["state"]["production"];
  trade: Campaign["state"]["trade"];
} {
  const countryIds = Object.keys(campaign.state.countries).sort();
  const stock: Record<string, Stockpile> = {};
  const civilian: Record<string, number> = {};
  const military: Record<string, number> = {};
  const militaryAtStart: Record<string, number> = {};
  for (const id of countryIds) {
    const country = campaign.state.countries[id];
    if (!country) continue;
    stock[id] = cloneStock(country.stockpile);
    civilian[id] = country.civilianFactories;
    military[id] = country.militaryFactories;
    militaryAtStart[id] = country.militaryFactories;
  }
  const infrastructure: Record<string, number> = {};
  const forts: Record<string, number> = {};
  const rails: Record<string, number> = {};
  const ports: Record<string, number> = {};
  const hubs: Record<string, boolean> = {};
  for (const [id, province] of Object.entries(campaign.state.provinces)) {
    infrastructure[id] = province.infrastructure;
    forts[id] = province.forts;
    rails[id] = province.rail;
    ports[id] = province.port;
    hubs[id] = province.supplyHub;
  }

  const extraction: Record<string, Record<ResourceId, number>> = {};
  for (const id of countryIds) extraction[id] = emptyResources();
  for (const province of campaign.scenario.provinces) {
    const state = campaign.state.provinces[province.id];
    const pile = state ? stock[state.controllerId] : undefined;
    const yielded = state ? extraction[state.controllerId] : undefined;
    if (!state || !pile || !yielded) continue;
    for (const deposit of province.resources) {
      yielded[deposit.resource] += deposit.amount;
      pile[deposit.resource] += deposit.amount;
    }
  }

  const logs: string[] = [];
  const keptTrade = [];
  const ended = new Set<string>();
  for (const route of campaign.state.trade) {
    if (!atWar(campaign, route.buyerId, route.sellerId)) {
      keptTrade.push({ ...route });
      continue;
    }
    ended.add(route.id);
    const seller = campaign.countries.get(route.sellerId)?.name ?? route.sellerId;
    logs.push(`Trade with ${seller} for ${route.resource} ended. The countries are at war.`);
  }

  const capacity: Record<string, number> = {};
  const transportLeft: Record<string, number> = {};
  for (const id of countryIds) {
    capacity[id] = transportCapacity(campaign, id);
    transportLeft[id] = capacity[id];
  }
  const delivered = new Map<string, number>();
  for (const route of keptTrade) {
    const seller = stock[route.sellerId];
    const buyer = stock[route.buyerId];
    const left = transportLeft[route.buyerId] ?? 0;
    if (!seller || !buyer) {
      delivered.set(route.id, 0);
      continue;
    }
    const amount = Math.max(
      0,
      Math.min(route.factories * ECONOMY.unitsPerTradeFactory, seller[route.resource], left),
    );
    seller[route.resource] -= amount;
    buyer[route.resource] += amount;
    transportLeft[route.buyerId] = left - amount;
    delivered.set(route.id, amount);
  }

  const construction = campaign.state.construction.map((project) => ({ ...project }));
  const assigned = new Map<string, number>();
  for (const id of countryIds) {
    const reserved = keptTrade
      .filter((route) => route.buyerId === id)
      .reduce((sum, route) => sum + route.factories, 0);
    let free = Math.max(0, (civilian[id] ?? 0) - reserved);
    for (const project of construction) {
      if (project.countryId !== id) continue;
      let stalled = false;
      if (placedProject(project.kind)) {
        const province = project.provinceId ? campaign.state.provinces[project.provinceId] : undefined;
        const provinceId = project.provinceId;
        const level = !provinceId
          ? undefined
          : project.kind === "fort"
            ? forts[provinceId]
            : project.kind === "rail"
              ? rails[provinceId]
              : project.kind === "port"
                ? ports[provinceId]
                : project.kind === "supply_hub"
                  ? hubs[provinceId]
                    ? 1
                    : 0
                  : infrastructure[provinceId];
        const cap =
          project.kind === "fort"
            ? ECONOMY.maxForts
            : project.kind === "rail"
              ? ECONOMY.maxRail
              : project.kind === "port"
                ? ECONOMY.maxPort
                : project.kind === "supply_hub"
                  ? 1
                  : ECONOMY.maxInfrastructure;
        stalled =
          !province ||
          province.controllerId !== project.countryId ||
          level === undefined ||
          level >= cap;
      }
      const room = project.cost - project.progress;
      const factories = stalled ? 0 : Math.max(0, Math.min(ECONOMY.maxFactoriesPerProject, free, room));
      assigned.set(project.id, factories);
      free -= factories;
    }
  }

  const projectRates = construction.map((project) => {
    const factories = assigned.get(project.id) ?? 0;
    const build = 1 + countryModifiers(campaign, project.countryId).construction;
    const effective = Math.max(0, Math.round(factories * build));
    const room = project.cost - project.progress;
    return {
      id: project.id,
      factories,
      daysRemaining: effective > 0 ? Math.ceil(room / effective) : null,
      stalled: factories === 0,
    };
  });

  let supplyChanged = false;
  const openProjects: ConstructionProject[] = [];
  for (const project of construction) {
    const build = 1 + countryModifiers(campaign, project.countryId).construction;
    project.progress += Math.max(0, Math.round((assigned.get(project.id) ?? 0) * build));
    if (project.progress < project.cost) {
      openProjects.push(project);
      continue;
    }
    const owner = campaign.countries.get(project.countryId)?.name ?? project.countryId;
    if (project.kind === "civilian_factory") {
      civilian[project.countryId] = (civilian[project.countryId] ?? 0) + 1;
      logs.push(`${owner} completed a civilian factory.`);
      continue;
    }
    if (project.kind === "military_factory") {
      military[project.countryId] = (military[project.countryId] ?? 0) + 1;
      logs.push(`${owner} completed a military factory.`);
      continue;
    }
    if (!project.provinceId) continue;
    const name = campaign.provinces.get(project.provinceId)?.name ?? project.provinceId;
    if (project.kind === "fort") {
      const level = forts[project.provinceId] ?? 0;
      if (level >= ECONOMY.maxForts) continue;
      forts[project.provinceId] = level + 1;
      logs.push(`Forts in ${name} reached level ${level + 1}.`);
      continue;
    }
    if (project.kind === "rail") {
      const level = rails[project.provinceId] ?? 0;
      if (level >= ECONOMY.maxRail) continue;
      rails[project.provinceId] = level + 1;
      supplyChanged = true;
      logs.push(`Railway in ${name} reached level ${level + 1}.`);
      continue;
    }
    if (project.kind === "port") {
      const level = ports[project.provinceId] ?? 0;
      if (level >= ECONOMY.maxPort) continue;
      ports[project.provinceId] = level + 1;
      supplyChanged = true;
      logs.push(`Port in ${name} reached level ${level + 1}.`);
      continue;
    }
    if (project.kind === "supply_hub") {
      if (hubs[project.provinceId]) continue;
      hubs[project.provinceId] = true;
      supplyChanged = true;
      logs.push(`${name} is now a supply hub.`);
      continue;
    }
    const level = infrastructure[project.provinceId] ?? 0;
    if (level >= ECONOMY.maxInfrastructure) continue;
    infrastructure[project.provinceId] = level + 1;
    supplyChanged = true;
    logs.push(`Infrastructure in ${name} reached ${level + 1}.`);
  }

  const production = campaign.state.production.map((line) => ({ ...line }));
  const militaryLeft = { ...militaryAtStart };
  const lineRates = [];
  for (const line of production) {
    const available = militaryLeft[line.countryId] ?? 0;
    const factories = Math.min(line.factories, available);
    militaryLeft[line.countryId] = available - factories;
    const outputMod = 1 + countryModifiers(campaign, line.countryId).militaryOutput;
    const potential = Math.floor(factories * ECONOMY.outputPerMilitaryFactory * line.efficiency * outputMod);
    const pile = stock[line.countryId];
    const recipe = RECIPES[line.equipment];
    let output = potential;
    const missing: ResourceId[] = [];
    if (pile) {
      for (const resource of RESOURCE_IDS) {
        const each = recipe[resource] ?? 0;
        if (each <= 0) continue;
        output = Math.min(output, Math.floor(pile[resource] / each));
        if (pile[resource] < potential * each) missing.push(resource);
      }
      for (const resource of RESOURCE_IDS) {
        const each = recipe[resource] ?? 0;
        pile[resource] -= output * each;
      }
      pile[line.equipment] += output;
    } else {
      output = 0;
    }
    const short = output < potential;
    if (!short && factories > 0) {
      line.efficiency = round3(Math.min(1, line.efficiency + ECONOMY.efficiencyGain));
    }
    lineRates.push({ id: line.id, output, potential, short, missing });
  }

  const transportUsed: Record<string, number> = {};
  for (const id of countryIds) transportUsed[id] = (capacity[id] ?? 0) - (transportLeft[id] ?? 0);

  return {
    rates: {
      extraction,
      transportCapacity: capacity,
      transportUsed,
      routes: campaign.state.trade.map((route) => ({
        id: route.id,
        delivered: delivered.get(route.id) ?? 0,
        ends: ended.has(route.id),
      })),
      projects: projectRates,
      lines: lineRates,
    },
    logs,
    supplyChanged,
    rails,
    ports,
    hubs,
    stock,
    civilian,
    military,
    infrastructure,
    forts,
    construction: openProjects,
    production,
    trade: keptTrade,
  };
}

export function previewDay(campaign: Campaign): DayRates {
  return projectDay(campaign).rates;
}

export function resolveEconomy(campaign: Campaign, log: string[]): boolean {
  const day = projectDay(campaign);
  for (const [id, pile] of Object.entries(day.stock)) {
    const country = campaign.state.countries[id];
    if (!country) continue;
    country.stockpile = pile;
    country.civilianFactories = day.civilian[id] ?? country.civilianFactories;
    country.militaryFactories = day.military[id] ?? country.militaryFactories;
  }
  for (const [id, level] of Object.entries(day.infrastructure)) {
    const province = campaign.state.provinces[id];
    if (province) province.infrastructure = level;
  }
  for (const [id, level] of Object.entries(day.forts)) {
    const province = campaign.state.provinces[id];
    if (province) province.forts = level;
  }
  for (const [id, level] of Object.entries(day.rails)) {
    const province = campaign.state.provinces[id];
    if (province) province.rail = level;
  }
  for (const [id, level] of Object.entries(day.ports)) {
    const province = campaign.state.provinces[id];
    if (province) province.port = level;
  }
  for (const [id, hub] of Object.entries(day.hubs)) {
    const province = campaign.state.provinces[id];
    if (province) province.supplyHub = hub;
  }
  campaign.state.construction = day.construction;
  campaign.state.production = day.production;
  campaign.state.trade = day.trade;
  log.push(...day.logs);
  return day.supplyChanged;
}

function refuse(summary: string, reason: string): CommandResult {
  return { ok: false, summary, reason };
}

function takeSerial(campaign: Campaign, prefix: string): string {
  let id = `${prefix}-${campaign.state.economySerial}`;
  campaign.state.economySerial += 1;
  const taken = () =>
    campaign.state.construction.some((project) => project.id === id) ||
    campaign.state.trade.some((route) => route.id === id);
  while (taken()) {
    id = `${prefix}-${campaign.state.economySerial}`;
    campaign.state.economySerial += 1;
  }
  return id;
}

export function applyIndustryCommand(campaign: Campaign, command: Command): CommandResult | null {
  const player = campaign.state.playerCountryId;
  const country = campaign.state.countries[player];
  if (!country) return refuse("Order refused.", "Your country is missing from the campaign.");

  if (command.type === "queueConstruction") {
    const queued = campaign.state.construction.filter((project) => project.countryId === player);
    if (queued.length >= ECONOMY.maxProjects) {
      return refuse("Construction refused.", `The queue already holds ${ECONOMY.maxProjects} projects.`);
    }
    if (placedProject(command.kind)) {
      if (!command.provinceId) {
        return refuse("Construction refused.", "That project needs a province.");
      }
      const province = campaign.state.provinces[command.provinceId];
      const definition = campaign.provinces.get(command.provinceId);
      if (!province || !definition) return refuse("Construction refused.", "That province is not on the map.");
      if (province.controllerId !== player) {
        return refuse("Construction refused.", "You do not control that province.");
      }
      if (command.kind === "port" && !definition.strategicTags.includes("seaport")) {
        return refuse("Construction refused.", "A port has to sit on the coast.");
      }
      const pending = queued.filter(
        (project) => project.kind === command.kind && project.provinceId === command.provinceId,
      ).length;
      const level =
        command.kind === "fort"
          ? province.forts
          : command.kind === "rail"
            ? province.rail
            : command.kind === "port"
              ? province.port
              : command.kind === "supply_hub"
                ? province.supplyHub
                  ? 1
                  : 0
                : province.infrastructure;
      const cap =
        command.kind === "fort"
          ? ECONOMY.maxForts
          : command.kind === "rail"
            ? ECONOMY.maxRail
            : command.kind === "port"
              ? ECONOMY.maxPort
              : command.kind === "supply_hub"
                ? 1
                : ECONOMY.maxInfrastructure;
      if (level + pending >= cap) {
        return refuse(
          "Construction refused.",
          command.kind === "supply_hub"
            ? "That province is already a supply hub."
            : "That project cannot be raised further there.",
        );
      }
    } else if (command.provinceId) {
      return refuse("Construction refused.", "Factories are national projects and do not take a province.");
    }
    const place = campaign.provinces.get(command.provinceId ?? "")?.name ?? "the province";
    const name =
      command.kind === "civilian_factory"
        ? "Civilian factory"
        : command.kind === "military_factory"
          ? "Military factory"
          : command.kind === "fort"
            ? `Forts in ${place}`
            : command.kind === "rail"
              ? `Railway in ${place}`
              : command.kind === "port"
                ? `Port in ${place}`
                : command.kind === "supply_hub"
                  ? `Supply hub in ${place}`
                  : `Infrastructure in ${place}`;
    campaign.state.construction.push({
      id: takeSerial(campaign, "build"),
      countryId: player,
      kind: command.kind,
      provinceId: placedProject(command.kind) ? command.provinceId : null,
      progress: 0,
      cost: constructionCost(command.kind),
    });
    return { ok: true, summary: `${name} added to the construction queue.` };
  }

  if (command.type === "cancelConstruction") {
    const project = campaign.state.construction.find((item) => item.id === command.projectId);
    if (!project || project.countryId !== player) {
      return refuse("Cancellation refused.", "That project is not in your queue.");
    }
    campaign.state.construction = campaign.state.construction.filter((item) => item.id !== project.id);
    return { ok: true, summary: "Construction project cancelled. Spent progress is lost." };
  }

  if (command.type === "setProduction") {
    const others = campaign.state.production.filter(
      (line) => line.countryId === player && line.equipment !== command.equipment,
    );
    const used = others.reduce((sum, line) => sum + line.factories, 0);
    if (used + command.factories > country.militaryFactories) {
      const free = country.militaryFactories - used;
      return refuse("Production refused.", `Only ${free} military factories are free.`);
    }
    const existing = campaign.state.production.find(
      (line) => line.countryId === player && line.equipment === command.equipment,
    );
    if (command.factories === 0) {
      if (!existing) return refuse("Production refused.", "Harness is not being produced.");
      campaign.state.production = campaign.state.production.filter((line) => line !== existing);
      return { ok: true, summary: "Harness production stopped." };
    }
    if (existing) {
      existing.factories = command.factories;
    } else {
      campaign.state.production.push({
        id: `${player}:${command.equipment}`,
        countryId: player,
        equipment: command.equipment,
        factories: command.factories,
        efficiency: ECONOMY.startingEfficiency,
      });
    }
    return {
      ok: true,
      summary: `${command.factories} military factories assigned to harness.`,
    };
  }

  if (command.type === "openTrade") {
    if (command.partnerId === player) {
      return refuse("Trade refused.", "A country cannot import from itself.");
    }
    if (!campaign.state.countries[command.partnerId]) {
      return refuse("Trade refused.", "That country is not in the campaign.");
    }
    if (atWar(campaign, player, command.partnerId)) {
      return refuse("Trade refused.", "Wartime trade between these countries is closed.");
    }
    if (!sellerCanOffer(campaign, command.partnerId, command.resource)) {
      const partner = campaign.countries.get(command.partnerId)?.name ?? command.partnerId;
      return refuse(
        "Trade refused.",
        `${partner} has no ${command.resource} deposit under its control and no reserve to sell.`,
      );
    }
    const used = campaign.state.trade
      .filter((route) => route.buyerId === player)
      .reduce((sum, route) => sum + route.factories, 0);
    if (used + command.factories > country.civilianFactories) {
      return refuse(
        "Trade refused.",
        `Only ${country.civilianFactories - used} civilian factories are free for trade.`,
      );
    }
    const duplicate = campaign.state.trade.some(
      (route) =>
        route.buyerId === player &&
        route.sellerId === command.partnerId &&
        route.resource === command.resource,
    );
    if (duplicate) return refuse("Trade refused.", "That import is already open.");
    campaign.state.trade.push({
      id: takeSerial(campaign, "trade"),
      buyerId: player,
      sellerId: command.partnerId,
      resource: command.resource,
      factories: command.factories,
    });
    const partner = campaign.countries.get(command.partnerId)?.name ?? command.partnerId;
    const factoryWord = command.factories === 1 ? "factory" : "factories";
    return {
      ok: true,
      summary: `Importing ${command.resource} from ${partner} with ${command.factories} civilian ${factoryWord}. ${command.factories === 1 ? "That factory will" : "Those factories will"} not build.`,
    };
  }

  if (command.type === "closeTrade") {
    const route = campaign.state.trade.find((item) => item.id === command.tradeId);
    if (!route || route.buyerId !== player) {
      return refuse("Trade refused.", "That import is not yours.");
    }
    campaign.state.trade = campaign.state.trade.filter((item) => item.id !== route.id);
    const partner = campaign.countries.get(route.sellerId)?.name ?? route.sellerId;
    return { ok: true, summary: `Import of ${route.resource} from ${partner} closed.` };
  }

  return null;
}
