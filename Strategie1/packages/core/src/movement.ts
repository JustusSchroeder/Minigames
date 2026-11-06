import type { MapPoint } from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { copyPoint, lerpPoint } from "./geo.ts";
import { travelHours } from "./pathfinding.ts";
import { atWar, friendlyController } from "./relations.ts";

function provinceName(campaign: Campaign, id: string): string {
  return campaign.provinces.get(id)?.name ?? id;
}

function openBattle(campaign: Campaign, provinceId: string): string {
  const existing = Object.values(campaign.state.battles).find((battle) => battle.provinceId === provinceId);
  if (existing) return existing.id;
  const id = `battle-${provinceId}-${campaign.state.tick}`;
  campaign.state.battles[id] = {
    id,
    provinceId,
    attackerIds: [],
    defenderIds: [],
    hours: 0,
  };
  return id;
}

function defendersPresent(campaign: Campaign, provinceId: string, controllerId: string): boolean {
  return Object.values(campaign.state.divisions).some(
    (division) =>
      division.provinceId === provinceId &&
      division.battleId === null &&
      friendlyController(campaign, controllerId, division.countryId),
  );
}

function segmentEnds(order: NonNullable<Campaign["state"]["divisions"][string]["order"]>): {
  from: MapPoint;
  to: MapPoint;
} | null {
  const to = order.waypoints[order.nextIndex];
  const from = order.waypoints[order.nextIndex - 1];
  if (!from || !to) return null;
  return { from, to };
}

export function completeHop(campaign: Campaign, divisionId: string): void {
  const division = campaign.state.divisions[divisionId];
  const order = division?.order;
  if (!division || !order) return;
  const arrived = order.waypoints[order.nextIndex];
  const hop = order.hops[order.nextIndex - 1];
  if (arrived) division.position = copyPoint(arrived);
  if (hop) division.provinceId = hop;
  order.nextIndex += 1;
  order.progressHours = 0;
  if (order.nextIndex >= order.waypoints.length) {
    division.order = null;
    return;
  }
  const upcoming = order.hops[order.nextIndex - 1];
  if (!upcoming) {
    division.order = null;
    return;
  }
  order.hoursRequired = travelHours(campaign, upcoming);
}

export function moveDivisions(campaign: Campaign, log: string[]): boolean {
  let dirty = false;
  const divisions = Object.values(campaign.state.divisions).sort((a, b) => (a.id < b.id ? -1 : 1));

  for (const division of divisions) {
    if (!campaign.state.divisions[division.id]) continue;
    if (division.battleId || !division.order) continue;
    const order = division.order;
    const segment = segmentEnds(order);
    if (!segment) {
      division.order = null;
      continue;
    }
    order.progressHours += 1;
    const amount = order.hoursRequired <= 0 ? 1 : Math.min(1, order.progressHours / order.hoursRequired);
    division.position = lerpPoint(segment.from, segment.to, amount);
    if (order.progressHours < order.hoursRequired) continue;

    const nextId = order.hops[order.nextIndex - 1];
    if (!nextId) {
      division.order = null;
      continue;
    }
    const next = campaign.state.provinces[nextId];
    const nextDef = campaign.provinces.get(nextId);
    if (!next || !nextDef || nextDef.impassable) {
      division.order = null;
      log.push(`${division.name} halted. The next province is impassable.`);
      continue;
    }

    const friendly = friendlyController(campaign, next.controllerId, division.countryId);
    if (friendly) {
      completeHop(campaign, division.id);
      if (!division.order) {
        log.push(`${division.name} arrived at the ordered point.`);
      }
      continue;
    }

    if (!atWar(campaign, division.countryId, next.controllerId)) {
      division.order = null;
      log.push(`${division.name} halted. No military access into ${provinceName(campaign, nextId)}.`);
      continue;
    }

    if (defendersPresent(campaign, nextId, next.controllerId)) {
      const battleId = openBattle(campaign, nextId);
      division.attackFrom = division.provinceId;
      division.battleId = battleId;
      const battle = campaign.state.battles[battleId];
      if (battle && !battle.attackerIds.includes(division.id)) battle.attackerIds.push(division.id);
      log.push(`${division.name} attacked ${provinceName(campaign, nextId)}.`);
      continue;
    }

    next.controllerId = division.countryId;
    dirty = true;
    completeHop(campaign, division.id);
    log.push(`${division.name} occupied empty ${provinceName(campaign, nextId)}. The owner is unchanged.`);
  }

  return dirty;
}
