import { SUPPLY, deriveTemplate, round3 } from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { friendlyController } from "./relations.ts";

export interface SupplyLink {
  from: string;
  to: string;
  kind: "rail" | "sea" | "road";
}

interface Reach {
  available: number;
  hops: number;
  from: string | null;
  kind: SupplyLink["kind"] | "hub";
}

function roadThroughput(infrastructure: number, damage: number): number {
  return Math.max(0, infrastructure - damage) * SUPPLY.throughputPerInfrastructure;
}

export function startingRail(infrastructure: number): number {
  if (infrastructure >= 5) return 2;
  if (infrastructure >= 3) return 1;
  return 0;
}

export function startingPort(tags: readonly string[]): number {
  return tags.includes("seaport") ? 1 : 0;
}

function traceCountry(campaign: Campaign, countryId: string): { reached: Map<string, Reach> } {
  const country = campaign.scenario.countries.find((item) => item.id === countryId);
  const reached = new Map<string, Reach>();
  if (!country) return { reached };
  const capitalId = country.capitalProvinceId;
  const capital = campaign.state.provinces[capitalId];
  const capitalMeta = campaign.provinces.get(capitalId);
  if (!capital || !capitalMeta || capitalMeta.impassable) return { reached };
  if (!friendlyController(campaign, capital.controllerId, countryId)) return { reached };

  reached.set(capitalId, {
    available: roadThroughput(capital.infrastructure, capital.damage),
    hops: 0,
    from: null,
    kind: "hub",
  });

  const ports = campaign.scenario.provinces
    .filter((province) => (campaign.state.provinces[province.id]?.port ?? 0) > 0)
    .map((province) => province.id)
    .sort();

  const consider = (from: string, to: string, capacity: number, kind: SupplyLink["kind"], hops: number): boolean => {
    if (capacity <= 0 || to === from) return false;
    const source = reached.get(from);
    const destination = campaign.state.provinces[to];
    const meta = campaign.provinces.get(to);
    if (!source || !destination || !meta || meta.impassable) return false;
    if (!friendlyController(campaign, destination.controllerId, countryId)) return false;
    const offered = Math.min(source.available, capacity);
    const nextHops = destination.supplyHub ? 0 : hops;
    const previous = reached.get(to);
    if (
      previous &&
      (offered < previous.available || (offered === previous.available && nextHops >= previous.hops))
    ) {
      return false;
    }
    reached.set(to, { available: offered, hops: nextHops, from, kind });
    return true;
  };

  let guard = campaign.scenario.provinces.length * 3;
  let changed = true;
  while (changed) {
    changed = false;
    guard -= 1;
    if (guard < 0) throw new Error("Supply trace did not settle");
    const ids = [...reached.keys()].sort();
    for (const current of ids) {
      const here = reached.get(current);
      const state = campaign.state.provinces[current];
      const meta = campaign.provinces.get(current);
      if (!here || !state || !meta) continue;
      const hopsHere = state.supplyHub ? 0 : here.hops;
      for (const neighbor of [...meta.neighbors].sort()) {
        const other = campaign.state.provinces[neighbor];
        if (!other) continue;
        const rail =
          state.rail > 0 && other.rail > 0
            ? Math.min(state.rail, other.rail) * SUPPLY.railPerLevel
            : 0;
        if (rail > 0 && consider(current, neighbor, rail, "rail", hopsHere)) changed = true;
        const road = roadThroughput(other.infrastructure, other.damage);
        if (hopsHere < SUPPLY.hubRange && road > 0 && consider(current, neighbor, road, "road", hopsHere + 1)) {
          changed = true;
        }
      }
      if (state.port > 0) {
        for (const otherId of ports) {
          const other = campaign.state.provinces[otherId];
          if (!other || other.port <= 0) continue;
          const capacity = Math.min(state.port, other.port) * SUPPLY.portPerLevel;
          if (consider(current, otherId, capacity, "sea", hopsHere)) changed = true;
        }
      }
    }
  }

  return { reached };
}

export function supplyLinks(campaign: Campaign, countryId: string): SupplyLink[] {
  const { reached } = traceCountry(campaign, countryId);
  const links: SupplyLink[] = [];
  for (const [id, reach] of reached) {
    if (!reach.from || reach.kind === "hub") continue;
    links.push({ from: reach.from, to: id, kind: reach.kind });
  }
  links.sort((left, right) => (left.from === right.from ? (left.to < right.to ? -1 : 1) : left.from < right.from ? -1 : 1));
  return links;
}

export function recomputeSupply(campaign: Campaign): void {
  const supply: Campaign["state"]["countrySupply"] = {};
  const divisions = Object.values(campaign.state.divisions).sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const country of campaign.scenario.countries) {
    const { reached } = traceCountry(campaign, country.id);
    const network: Record<string, { available: number; demand: number; ratio: number; connected: boolean }> = {};
    for (const [id, reach] of reached) {
      network[id] = { available: round3(reach.available), demand: 0, ratio: 1, connected: true };
    }
    for (const division of divisions) {
      if (division.countryId !== country.id) continue;
      const where = division.attackFrom ?? division.provinceId;
      const slot = network[where];
      const template = campaign.templates.get(division.templateId);
      if (!slot || !template) continue;
      slot.demand = round3(slot.demand + deriveTemplate(template).supplyUse);
    }
    for (const slot of Object.values(network)) {
      slot.ratio = slot.demand <= 0 ? 1 : round3(Math.min(1, slot.available / slot.demand));
    }
    supply[country.id] = network;
  }

  campaign.state.countrySupply = supply;
}

export function supplyRatioForDivision(campaign: Campaign, divisionId: string): number {
  const division = campaign.state.divisions[divisionId];
  if (!division) return 0;
  const where = division.attackFrom ?? division.provinceId;
  const slot = campaign.state.countrySupply[division.countryId]?.[where];
  if (!slot?.connected) return 0;
  return slot.ratio;
}
