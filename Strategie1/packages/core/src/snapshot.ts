import {
  RECIPES,
  RESOURCE_IDS,
  TECHNOLOGIES,
  applyCountryCombat,
  deriveTemplate,
  formatGameDate,
  leadSpecies,
  modifiersFrom,
  round3,
  weatherAt,
  weatherLabel,
  type BattalionId,
  type DivisionState,
  type TechId,
  type MapMode,
  type ResourceId,
} from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { readiness } from "./combat.ts";
import { borderProvinces } from "./fronts.ts";
import { travelHours } from "./pathfinding.ts";
import { previewDay } from "./economy.ts";
import { atWar } from "./relations.ts";
import { availableTech, countryModifiers, treeFor } from "./research.ts";
import { supplyLinks, supplyRatioForDivision, type SupplyLink } from "./supply.ts";

export interface CampaignSnapshot {
  scenarioId: string;
  scenarioName: string;
  dateLabel: string;
  date: Campaign["state"]["date"];
  paused: boolean;
  speed: Campaign["state"]["speed"];
  tick: number;
  playerCountryId: string;
  mapModes: MapMode[];
  countries: Array<{
    id: string;
    name: string;
    color: string;
    flagRef: string;
    government: string;
    ideology: string;
    stability: number;
    warSupport: number;
    manpower: number;
    population: number;
    civilianFactories: number;
    militaryFactories: number;
    dockyards: number;
    researchSlots: number;
    stockpile: Campaign["scenario"]["countries"][number]["stockpile"];
    capitalProvinceId: string;
    alignedTo: string | null;
  }>;
  provinces: Array<{
    id: string;
    name: string;
    ownerId: string;
    controllerId: string;
    terrain: string;
    climate: string;
    infrastructure: number;
    forts: number;
    rail: number;
    port: number;
    supplyHub: boolean;
    coastal: boolean;
    victoryPointValue: number;
    resources: Campaign["scenario"]["provinces"][number]["resources"];
    strategicTags: string[];
    area: number;
    center: { lon: number; lat: number };
    supplyRatio: number;
    supplyAvailable: number;
    supplyDemand: number;
    supplyConnected: boolean;
  }>;
  divisions: Array<{
    id: string;
    name: string;
    countryId: string;
    provinceId: string;
    position: { lon: number; lat: number };
    templateName: string;
    manpower: number;
    manpowerRequired: number;
    equipment: number;
    equipmentRequired: number;
    organization: number;
    maxOrganization: number;
    readiness: number;
    softAttack: number;
    defense: number;
    breakthrough: number;
    supplyUse: number;
    entrenchment: number;
    armor: number;
    piercing: number;
    supplyRatio: number;
    battleId: string | null;
    orderText: string | null;
    orderPath: Array<{ lon: number; lat: number }> | null;
    leadSpecies: BattalionId | null;
    line: Array<{ battalion: BattalionId; count: number }>;
    support: Array<{ battalion: BattalionId; count: number }>;
  }>;
  battles: Array<{
    id: string;
    provinceId: string;
    provinceName: string;
    hours: number;
    attackers: string[];
    defenders: string[];
  }>;
  wars: Array<{ id: string; name: string; attackers: string[]; defenders: string[] }>;
  pendingEvent: null | {
    id: string;
    title: string;
    description: string;
    choices: Array<{ id: string; label: string; detail: string }>;
  };
  log: string[];
  weatherLabel: string;
  frontProvinceIds: string[];
  supplyRoutes: SupplyLink[];
  supplyHubIds: string[];
  research: {
    slots: number;
    used: number;
    modifiers: {
      softAttack: number;
      defense: number;
      breakthrough: number;
      militaryOutput: number;
      construction: number;
    };
    researched: Array<{ id: TechId; name: string; kind: string; summary: string }>;
    projects: Array<{ id: TechId; name: string; kind: string; progress: number; days: number }>;
    available: Array<{ id: TechId; name: string; kind: string; days: number; summary: string; reason: string | null }>;
    focus: { id: string; name: string; progress: number; days: number } | null;
    focuses: Array<{
      id: string;
      name: string;
      detail: string;
      days: number;
      requires: string[];
      completed: boolean;
      available: boolean;
    }>;
  };
  fronts: Array<{
    id: string;
    enemyId: string;
    enemyName: string;
    divisionIds: string[];
    line: Array<{ lon: number; lat: number }>;
    offensive: Array<{ lon: number; lat: number }> | null;
    executing: boolean;
  }>;
  templates: Array<{
    id: string;
    name: string;
    countryId: string;
    line: Array<{ battalion: BattalionId; count: number }>;
    support: Array<{ battalion: BattalionId; count: number }>;
    combatWidth: number;
    manpower: number;
    equipment: number;
    softAttack: number;
    hardAttack: number;
    defense: number;
    breakthrough: number;
    organization: number;
    supplyUse: number;
    productionSteel: number;
    armor: number;
    piercing: number;
  }>;
  industry: {
    civilianFactories: number;
    militaryFactories: number;
    dockyards: number;
    tradeFactories: number;
    buildingCivilian: number;
    idleCivilian: number;
    freeCivilian: number;
    assignedMilitary: number;
    idleMilitary: number;
    transportCapacity: number;
    transportUsed: number;
    extraction: Record<ResourceId, number>;
    stockpile: Campaign["scenario"]["countries"][number]["stockpile"];
    projects: Array<{
      id: string;
      label: string;
      progress: number;
      cost: number;
      factories: number;
      daysRemaining: number | null;
      stalled: boolean;
    }>;
    lines: Array<{
      equipment: "infantry_equipment";
      label: string;
      factories: number;
      efficiency: number;
      output: number;
      potential: number;
      short: boolean;
      recipe: string;
    }>;
    routes: Array<{
      id: string;
      partnerId: string;
      partnerName: string;
      resource: ResourceId;
      factories: number;
      delivered: number;
      ends: boolean;
    }>;
    partners: Array<{ id: string; name: string; resources: ResourceId[] }>;
  };
}

function orderText(campaign: Campaign, division: DivisionState): string | null {
  if (division.battleId) {
    const battle = campaign.state.battles[division.battleId];
    const name = battle ? campaign.provinces.get(battle.provinceId)?.name : undefined;
    return name ? `Attacking ${name}` : "In battle";
  }
  if (!division.order) return null;
  const remaining = division.order.hops.slice(division.order.nextIndex - 1);
  let hours = Math.max(0, division.order.hoursRequired - division.order.progressHours);
  for (const id of remaining.slice(1)) {
    hours += travelHours(campaign, id);
  }
  return `Marching to the ordered point. About ${hours} hours remaining.`;
}

export function buildSnapshot(campaign: Campaign): CampaignSnapshot {
  const playerSupply = campaign.state.countrySupply[campaign.state.playerCountryId] ?? {};
  return {
    scenarioId: campaign.scenario.id,
    scenarioName: campaign.scenario.name,
    dateLabel: formatGameDate(campaign.state.date),
    date: campaign.state.date,
    paused: campaign.state.paused,
    speed: campaign.state.speed,
    tick: campaign.state.tick,
    playerCountryId: campaign.state.playerCountryId,
    mapModes: ["political", "terrain", "infrastructure", "resources", "supply", "control", "victory"],
    countries: campaign.scenario.countries.map((country) => {
      const state = campaign.state.countries[country.id];
      return {
        id: country.id,
        name: country.name,
        color: country.color,
        flagRef: country.flagRef,
        government: country.government,
        ideology: country.ideology,
        stability: state?.stability ?? country.stability,
        warSupport: state?.warSupport ?? country.warSupport,
        manpower: state?.manpower ?? country.manpower,
        population: country.population,
        civilianFactories: state?.civilianFactories ?? country.civilianFactories,
        militaryFactories: state?.militaryFactories ?? country.militaryFactories,
        dockyards: state?.dockyards ?? country.dockyards,
        researchSlots: country.researchSlots,
        stockpile: state?.stockpile ?? country.stockpile,
        capitalProvinceId: country.capitalProvinceId,
        alignedTo: state?.alignedTo ?? country.alignedTo,
      };
    }),
    provinces: campaign.scenario.provinces.map((province) => {
      const state = campaign.state.provinces[province.id];
      const controllerSupply = state
        ? campaign.state.countrySupply[state.controllerId]?.[province.id]
        : undefined;
      const shown = playerSupply[province.id] ?? controllerSupply;
      return {
        id: province.id,
        name: province.name,
        ownerId: state?.ownerId ?? province.countryId,
        controllerId: state?.controllerId ?? province.countryId,
        terrain: province.terrain,
        climate: province.climate,
        infrastructure: state?.infrastructure ?? province.infrastructureLevel,
        forts: state?.forts ?? 0,
        rail: state?.rail ?? 0,
        port: state?.port ?? 0,
        supplyHub: state?.supplyHub ?? false,
        coastal: province.strategicTags.includes("seaport"),
        victoryPointValue: province.victoryPointValue,
        resources: province.resources,
        strategicTags: province.strategicTags,
        area: province.area,
        center: province.center,
        supplyRatio: shown?.ratio ?? 0,
        supplyAvailable: shown?.available ?? 0,
        supplyDemand: shown?.demand ?? 0,
        supplyConnected: shown?.connected ?? false,
      };
    }),
    divisions: Object.values(campaign.state.divisions)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((division) => {
        const template = campaign.templates.get(division.templateId);
        const raw = template ? deriveTemplate(template) : null;
        const stats = raw ? applyCountryCombat(raw, countryModifiers(campaign, division.countryId)) : null;
        const ready = template ? readiness(division, template) : 0;
        return {
          id: division.id,
          name: division.name,
          countryId: division.countryId,
          provinceId: division.provinceId,
          position: { lon: division.position.lon, lat: division.position.lat },
          templateName: template?.name ?? division.templateId,
          manpower: division.manpower,
          manpowerRequired: stats?.manpower ?? 0,
          equipment: division.equipment,
          equipmentRequired: stats?.equipment ?? 0,
          organization: division.organization,
          maxOrganization: stats?.organization ?? 0,
          readiness: round3(ready),
          softAttack: round3((stats?.softAttack ?? 0) * ready),
          defense: round3((stats?.defense ?? 0) * ready),
          breakthrough: round3((stats?.breakthrough ?? 0) * ready),
          supplyUse: stats?.supplyUse ?? 0,
          entrenchment: division.entrenchment,
          armor: round3((stats?.armor ?? 0) * ready),
          piercing: round3((stats?.piercing ?? 0) * ready),
          supplyRatio: supplyRatioForDivision(campaign, division.id),
          battleId: division.battleId,
          orderText: orderText(campaign, division),
          orderPath: division.order
            ? division.order.waypoints.slice(division.order.nextIndex - 1).map((point) => ({
                lon: point.lon,
                lat: point.lat,
              }))
            : null,
          leadSpecies: template ? leadSpecies(template) : null,
          line: template ? template.line.map((slot) => ({ battalion: slot.battalion, count: slot.count })) : [],
          support: template ? template.support.map((slot) => ({ battalion: slot.battalion, count: slot.count })) : [],
        };
      }),
    battles: Object.values(campaign.state.battles)
      .sort((a, b) => (a.id < b.id ? -1 : 1))
      .map((battle) => ({
        id: battle.id,
        provinceId: battle.provinceId,
        provinceName: campaign.provinces.get(battle.provinceId)?.name ?? battle.provinceId,
        hours: battle.hours,
        attackers: battle.attackerIds,
        defenders: battle.defenderIds,
      })),
    wars: campaign.state.wars.map((war) => ({
      id: war.id,
      name: war.name,
      attackers: war.attackers,
      defenders: war.defenders,
    })),
    pendingEvent: (() => {
      const pending = campaign.state.pendingEvent;
      if (!pending) return null;
      const event = campaign.scenario.events.find((item) => item.id === pending.eventId);
      if (!event) return null;
      return {
        id: event.id,
        title: event.title,
        description: event.description,
        choices: event.choices.map((choice) => ({
          id: choice.id,
          label: choice.label,
          detail: choice.detail,
        })),
      };
    })(),
    log: [...campaign.state.log],
    weatherLabel: weatherLabel(playerWeather(campaign)),
    ...frontSnapshot(campaign),
    ...supplySnapshot(campaign),
    research: researchSnapshot(campaign),
    templates: campaign.state.templates
      .filter((template) => template.countryId === campaign.state.playerCountryId)
      .map((template) => {
        const stats = deriveTemplate(template);
        return {
          id: template.id,
          name: template.name,
          countryId: template.countryId,
          line: template.line.map((slot) => ({ battalion: slot.battalion, count: slot.count })),
          support: template.support.map((slot) => ({ battalion: slot.battalion, count: slot.count })),
          combatWidth: stats.combatWidth,
          manpower: stats.manpower,
          equipment: stats.equipment,
          softAttack: stats.softAttack,
          hardAttack: stats.hardAttack,
          defense: stats.defense,
          breakthrough: stats.breakthrough,
          organization: stats.organization,
          supplyUse: stats.supplyUse,
          productionSteel: stats.productionSteel,
          armor: stats.armor,
          piercing: stats.piercing,
        };
      }),
    industry: industrySnapshot(campaign),
  };
}

function recipeText(equipment: "infantry_equipment"): string {
  const parts = RESOURCE_IDS.flatMap((resource) => {
    const amount = RECIPES[equipment][resource] ?? 0;
    return amount > 0 ? [`${amount} ${resource}`] : [];
  });
  return parts.join(", ");
}

function playerWeather(campaign: Campaign) {
  const country = campaign.scenario.countries.find((item) => item.id === campaign.state.playerCountryId);
  const province = country ? campaign.provinces.get(country.capitalProvinceId) : undefined;
  return weatherAt(campaign.state.date.month, province?.climate ?? "continental");
}

function frontSnapshot(campaign: Campaign): Pick<CampaignSnapshot, "fronts" | "frontProvinceIds"> {
  const playerId = campaign.state.playerCountryId;
  const fronts = campaign.state.fronts
    .filter((front) => front.countryId === playerId)
    .map((front) => ({
      id: front.id,
      enemyId: front.enemyId,
      enemyName: campaign.countries.get(front.enemyId)?.name ?? front.enemyId,
      divisionIds: [...front.divisionIds],
      line: front.line.map((point) => ({ lon: point.lon, lat: point.lat })),
      offensive: front.offensive ? front.offensive.map((point) => ({ lon: point.lon, lat: point.lat })) : null,
      executing: front.executing,
    }));
  return {
    fronts,
    frontProvinceIds: borderProvinces(campaign, playerId, fronts[0]?.enemyId ?? ""),
  };
}

function supplySnapshot(campaign: Campaign): Pick<CampaignSnapshot, "supplyRoutes" | "supplyHubIds"> {
  const playerId = campaign.state.playerCountryId;
  const network = campaign.state.countrySupply[playerId] ?? {};
  const links = supplyLinks(campaign, playerId).filter((link) => network[link.to]?.connected && network[link.from]?.connected);
  const supplyHubIds = Object.entries(campaign.state.provinces)
    .filter(([id, province]) => province.supplyHub && network[id]?.connected && province.controllerId === playerId)
    .map(([id]) => id)
    .sort();
  return { supplyRoutes: links, supplyHubIds };
}

function researchSnapshot(campaign: Campaign): CampaignSnapshot["research"] {
  const playerId = campaign.state.playerCountryId;
  const country = campaign.state.countries[playerId];
  const definition = campaign.scenario.countries.find((item) => item.id === playerId);
  const researched = country?.researched ?? [];
  const tree = treeFor(campaign, playerId);
  const completed = new Set(country?.completedFocuses ?? []);
  const running = country?.focusId ?? null;
  return {
    slots: definition?.researchSlots ?? 0,
    used: country?.research.length ?? 0,
    modifiers: modifiersFrom(researched),
    researched: researched.map((id) => {
      const tech = TECHNOLOGIES[id];
      return { id, name: tech.name, kind: tech.kind, summary: tech.summary };
    }),
    projects: (country?.research ?? []).map((item) => {
      const tech = TECHNOLOGIES[item.techId];
      return { id: item.techId, name: tech.name, kind: tech.kind, progress: item.progress, days: tech.days };
    }),
    available: Object.values(TECHNOLOGIES)
      .filter((tech) => !researched.includes(tech.id) && !(country?.research.some((item) => item.techId === tech.id) ?? false))
      .map((tech) => ({
        id: tech.id,
        name: tech.name,
        kind: tech.kind,
        days: tech.days,
        summary: tech.summary,
        reason: availableTech(campaign, playerId, tech.id),
      })),
    focus: running
      ? (() => {
          const node = tree?.nodes.find((item) => item.id === running);
          return node
            ? { id: node.id, name: node.name, progress: country?.focusProgress ?? 0, days: node.days }
            : null;
        })()
      : null,
    focuses: (tree?.nodes ?? []).map((node) => ({
      id: node.id,
      name: node.name,
      detail: node.detail,
      days: node.days,
      requires: [...node.requires],
      completed: completed.has(node.id),
      available: !completed.has(node.id) && !running && node.requires.every((need) => completed.has(need)),
    })),
  };
}

function projectLabel(campaign: Campaign, project: Campaign["state"]["construction"][number]): string {
  if (project.kind === "civilian_factory") return "Civilian factory";
  if (project.kind === "military_factory") return "Military factory";
  const name = project.provinceId
    ? campaign.provinces.get(project.provinceId)?.name ?? project.provinceId
    : "the province";
  if (project.kind === "fort") return `Forts in ${name}`;
  if (project.kind === "rail") return `Railway in ${name}`;
  if (project.kind === "port") return `Port in ${name}`;
  if (project.kind === "supply_hub") return `Supply hub in ${name}`;
  return `Infrastructure in ${name}`;
}

function industrySnapshot(campaign: Campaign): CampaignSnapshot["industry"] {
  const playerId = campaign.state.playerCountryId;
  const country = campaign.state.countries[playerId];
  const rates = previewDay(campaign);
  const empty = { steel: 0, aluminum: 0, oil: 0, rubber: 0, tungsten: 0, chromium: 0 };
  const projects = campaign.state.construction.filter((project) => project.countryId === playerId);
  const lines = campaign.state.production.filter((line) => line.countryId === playerId);
  const routes = campaign.state.trade.filter((route) => route.buyerId === playerId);
  const tradeFactories = routes.reduce((sum, route) => sum + route.factories, 0);
  const assignedMilitary = lines.reduce((sum, line) => sum + line.factories, 0);
  const buildingCivilian = projects.reduce((sum, project) => {
    const rate = rates.projects.find((item) => item.id === project.id);
    return sum + (rate?.factories ?? 0);
  }, 0);
  const freeCivilian = Math.max(0, (country?.civilianFactories ?? 0) - tradeFactories);
  const partners = campaign.scenario.countries
    .filter((candidate) => candidate.id !== playerId && !atWar(campaign, playerId, candidate.id))
    .map((candidate) => {
      const resources = new Set<ResourceId>();
      const pile = campaign.state.countries[candidate.id]?.stockpile;
      for (const resource of RESOURCE_IDS) {
        if ((pile?.[resource] ?? 0) > 0) resources.add(resource);
      }
      for (const province of campaign.scenario.provinces) {
        if (campaign.state.provinces[province.id]?.controllerId !== candidate.id) continue;
        for (const deposit of province.resources) {
          if (deposit.amount > 0) resources.add(deposit.resource);
        }
      }
      return {
        id: candidate.id,
        name: candidate.name,
        resources: RESOURCE_IDS.filter((resource) => resources.has(resource)),
      };
    })
    .filter((candidate) => candidate.resources.length > 0);

  return {
    civilianFactories: country?.civilianFactories ?? 0,
    militaryFactories: country?.militaryFactories ?? 0,
    dockyards: country?.dockyards ?? 0,
    tradeFactories,
    buildingCivilian,
    idleCivilian: Math.max(0, freeCivilian - buildingCivilian),
    freeCivilian,
    assignedMilitary,
    idleMilitary: Math.max(0, (country?.militaryFactories ?? 0) - assignedMilitary),
    transportCapacity: rates.transportCapacity[playerId] ?? 0,
    transportUsed: rates.transportUsed[playerId] ?? 0,
    extraction: rates.extraction[playerId] ?? empty,
    stockpile: country?.stockpile ?? {
      ...empty,
      infantry_equipment: 0,
    },
    projects: projects.map((project) => {
      const rate = rates.projects.find((item) => item.id === project.id);
      return {
        id: project.id,
        label: projectLabel(campaign, project),
        progress: project.progress,
        cost: project.cost,
        factories: rate?.factories ?? 0,
        daysRemaining: rate?.daysRemaining ?? null,
        stalled: rate?.stalled ?? true,
      };
    }),
    lines: lines.flatMap((line) => {
      if (line.equipment !== "infantry_equipment") return [];
      const rate = rates.lines.find((item) => item.id === line.id);
      return [
        {
          equipment: line.equipment,
          label: "Harness",
          factories: line.factories,
          efficiency: line.efficiency,
          output: rate?.output ?? 0,
          potential: rate?.potential ?? 0,
          short: rate?.short ?? false,
          recipe: recipeText(line.equipment),
        },
      ];
    }),
    routes: routes.map((route) => {
      const rate = rates.routes.find((item) => item.id === route.id);
      return {
        id: route.id,
        partnerId: route.sellerId,
        partnerName: campaign.countries.get(route.sellerId)?.name ?? route.sellerId,
        resource: route.resource,
        factories: route.factories,
        delivered: rate?.delivered ?? 0,
        ends: rate?.ends ?? false,
      };
    }),
    partners,
  };
}
