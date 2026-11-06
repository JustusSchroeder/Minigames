import type { Command, CommandResult, MapPoint } from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { REPATH_EPS, STATION_EPS, copyPoint, geoDistance, nearestProvince, samplePolyline, simplifyPoints, slotPoints } from "./geo.ts";
import { findRoute, placeRoute } from "./pathfinding.ts";
import { atWar, friendlyController } from "./relations.ts";

function refuse(summary: string, reason: string): CommandResult {
  return { ok: false, summary, reason };
}

function haltAssigned(campaign: Campaign, front: Campaign["state"]["fronts"][number]): void {
  for (const id of front.divisionIds) {
    const division = campaign.state.divisions[id];
    if (!division || division.battleId) continue;
    division.order = null;
  }
}

function landPoints(campaign: Campaign, points: MapPoint[]): MapPoint[] {
  return simplifyPoints(
    points.filter((point) => nearestProvince(campaign, point) !== undefined),
  );
}

function assigned(campaign: Campaign, front: Campaign["state"]["fronts"][number]) {
  return front.divisionIds
    .map((id) => campaign.state.divisions[id])
    .filter((division) => division)
    .sort((left, right) => ((left?.id ?? "") < (right?.id ?? "") ? -1 : 1));
}

function orderDest(division: Campaign["state"]["divisions"][string]): MapPoint | null {
  if (!division.order) return null;
  return division.order.waypoints[division.order.waypoints.length - 1] ?? null;
}

function hostileDest(campaign: Campaign, nationId: string, dest: MapPoint): boolean {
  const destId = nearestProvince(campaign, dest);
  const destState = destId ? campaign.state.provinces[destId] : undefined;
  return (
    !!destState
    && !friendlyController(campaign, destState.controllerId, nationId)
    && atWar(campaign, nationId, destState.controllerId)
  );
}

function canRoute(campaign: Campaign, division: NonNullable<Campaign["state"]["divisions"][string]>, dest: MapPoint): boolean {
  if (sameEnough(division.position, dest, STATION_EPS)) return true;
  return findRoute(
    campaign,
    division.position,
    dest,
    division.countryId,
    division.provinceId,
    hostileDest(campaign, division.countryId, dest),
  ).ok;
}

function reachableOnLine(
  campaign: Campaign,
  division: NonNullable<Campaign["state"]["divisions"][string]>,
  line: MapPoint[],
  intendedT: number,
): MapPoint | null {
  const intended = samplePolyline(line, intendedT);
  if (canRoute(campaign, division, intended)) return intended;
  let best: MapPoint | null = null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (let step = 0; step <= 16; step += 1) {
    const t = step / 16;
    const point = samplePolyline(line, t);
    if (!canRoute(campaign, division, point)) continue;
    const gap = Math.abs(t - intendedT);
    if (gap < bestGap) {
      bestGap = gap;
      best = point;
    }
  }
  return best;
}

function sendTo(campaign: Campaign, divisionId: string, dest: MapPoint, attack = false): boolean {
  const division = campaign.state.divisions[divisionId];
  if (!division || division.battleId) return false;
  if (sameEnough(division.position, dest, STATION_EPS)) {
    if (division.order && sameEnough(orderDest(division), dest, REPATH_EPS)) return false;
    division.order = null;
    return false;
  }
  const current = orderDest(division);
  if (current && sameEnough(current, dest, REPATH_EPS) && division.order) return false;
  return placeRoute(campaign, divisionId, dest, attack || hostileDest(campaign, division.countryId, dest)).ok;
}

function sameEnough(left: MapPoint | null | undefined, right: MapPoint, eps: number): boolean {
  return !!left && geoDistance(left, right) <= eps;
}

function slotFor(
  line: MapPoint[],
  count: number,
  index: number,
): MapPoint | null {
  if (line.length < 2 || count <= 0) return null;
  const slots = slotPoints(line, count);
  return slots[index] ?? slots[slots.length - 1] ?? null;
}

function deployLine(campaign: Campaign, front: Campaign["state"]["fronts"][number]): number {
  if (front.executing) return 0;
  if (front.line.length < 2) return 0;
  const units = assigned(campaign, front).filter((division) => division && !division.battleId);
  let marches = 0;
  units.forEach((division, index) => {
    if (!division) return;
    const dest = reachableOnLine(campaign, division, front.line, (index + 0.5) / units.length);
    if (!dest) return;
    if (sendTo(campaign, division.id, dest)) marches += 1;
  });
  return marches;
}

function stepOffensive(campaign: Campaign, front: Campaign["state"]["fronts"][number]): number {
  const arrow = front.offensive;
  if (!arrow || arrow.length < 2) return 0;
  const units = assigned(campaign, front).filter((division) => division && !division.battleId);
  let stepped = 0;
  units.forEach((division, index) => {
    if (!division) return;
    const dest = reachableOnLine(campaign, division, arrow, (index + 0.5) / units.length);
    if (!dest) return;
    if (sendTo(campaign, division.id, dest, true)) stepped += 1;
  });
  return stepped;
}

function offensiveDone(campaign: Campaign, front: Campaign["state"]["fronts"][number]): boolean {
  const arrow = front.offensive;
  if (!arrow || arrow.length < 2) return false;
  const units = assigned(campaign, front);
  if (units.length === 0) return true;
  return units.every((division, index) => {
    if (!division) return true;
    const dest = slotFor(arrow, units.length, index);
    return dest ? sameEnough(division.position, dest, STATION_EPS) : true;
  });
}

export function applyFrontCommand(campaign: Campaign, command: Command): CommandResult {
  const playerId = campaign.state.playerCountryId;

  if (command.type === "createFront") {
    const enemy = campaign.countries.get(command.enemyId);
    if (!enemy) return refuse("Front refused.", "That country is not in the campaign.");
    if (!atWar(campaign, playerId, command.enemyId)) {
      return refuse("Front refused.", `You are not at war with ${enemy.name}.`);
    }
    if (campaign.state.fronts.some((front) => front.countryId === playerId && front.enemyId === command.enemyId)) {
      return refuse("Front refused.", `A front against ${enemy.name} is already open.`);
    }
    campaign.state.fronts.push({
      id: `${playerId}-front-${command.enemyId}`,
      countryId: playerId,
      enemyId: command.enemyId,
      divisionIds: [],
      line: [],
      offensive: null,
      executing: false,
    });
    return {
      ok: true,
      summary: `Opened a front against ${enemy.name}. Draw the line on the map, then assign a corps.`,
    };
  }

  if (command.type === "assignFront") {
    const front = campaign.state.fronts.find((item) => item.id === command.frontId);
    if (!front || front.countryId !== playerId) return refuse("Front refused.", "That front is not yours.");
    const division = campaign.state.divisions[command.divisionId];
    if (!division || division.countryId !== playerId) {
      return refuse("Front refused.", "That formation is not under your command.");
    }
    for (const other of campaign.state.fronts) {
      other.divisionIds = other.divisionIds.filter((id) => id !== division.id);
    }
    front.divisionIds.push(division.id);
    front.divisionIds.sort();
    const enemy = campaign.countries.get(front.enemyId)?.name ?? front.enemyId;
    const marched = deployLine(campaign, front);
    return {
      ok: true,
      summary:
        marched > 0
          ? `${division.name} assigned to the front against ${enemy} and is moving onto the line.`
          : front.line.length < 2
            ? `${division.name} assigned to the front against ${enemy}. Draw the line on the map.`
            : `${division.name} assigned to the front against ${enemy}.`,
    };
  }

  if (command.type === "drawFront") {
    const front = campaign.state.fronts.find((item) => item.id === command.frontId);
    if (!front || front.countryId !== playerId) return refuse("Line refused.", "That front is not yours.");
    const line = landPoints(campaign, command.points);
    if (line.length < 2) {
      return refuse("Line refused.", "Draw the frontline across land.");
    }
    front.line = line.map(copyPoint);
    front.executing = false;
    const marched = deployLine(campaign, front);
    const enemy = campaign.countries.get(front.enemyId)?.name ?? front.enemyId;
    return {
      ok: true,
      summary:
        marched > 0
          ? `Frontline against ${enemy} set. ${marched} corps moving onto it.`
          : `Frontline against ${enemy} set.`,
    };
  }

  if (command.type === "drawOffensive") {
    const front = campaign.state.fronts.find((item) => item.id === command.frontId);
    if (!front || front.countryId !== playerId) return refuse("Arrow refused.", "That front is not yours.");
    const enemy = campaign.countries.get(front.enemyId)?.name ?? front.enemyId;
    const arrow = landPoints(campaign, command.points);
    if (arrow.length < 2) {
      return refuse("Arrow refused.", `Draw the attack across land toward ${enemy}.`);
    }
    front.offensive = arrow.map(copyPoint);
    front.executing = false;
    haltAssigned(campaign, front);
    deployLine(campaign, front);
    return {
      ok: true,
      summary: `Attack arrow set against ${enemy}. Assigned corps stay on the line until you execute.`,
    };
  }

  if (command.type === "executeFront") {
    const front = campaign.state.fronts.find((item) => item.id === command.frontId);
    if (!front || front.countryId !== playerId) return refuse("Front refused.", "That front is not yours.");
    const enemy = campaign.countries.get(front.enemyId)?.name ?? front.enemyId;
    if (!front.offensive || front.offensive.length < 2) {
      return refuse("Front refused.", "Draw an attack arrow, then execute.");
    }
    if (front.divisionIds.length === 0) return refuse("Front refused.", "Assign a corps to the front first.");
    front.executing = true;
    haltAssigned(campaign, front);
    const stepped = stepOffensive(campaign, front);
    if (stepped === 0) {
      return {
        ok: true,
        summary: `The arrow against ${enemy} is active. Assigned corps are already on it or engaged.`,
      };
    }
    return { ok: true, summary: `Advance against ${enemy}. ${stepped} corps following the arrow.` };
  }

  if (command.type === "cancelOffensive") {
    const front = campaign.state.fronts.find((item) => item.id === command.frontId);
    if (!front || front.countryId !== playerId) return refuse("Front refused.", "That front is not yours.");
    front.offensive = null;
    front.executing = false;
    haltAssigned(campaign, front);
    deployLine(campaign, front);
    const enemy = campaign.countries.get(front.enemyId)?.name ?? front.enemyId;
    return { ok: true, summary: `The arrow against ${enemy} is cleared. Assigned corps return to the line.` };
  }

  if (command.type === "deleteFront") {
    const index = campaign.state.fronts.findIndex((item) => item.id === command.frontId && item.countryId === playerId);
    const front = index >= 0 ? campaign.state.fronts[index] : undefined;
    if (!front) return refuse("Front refused.", "That front is not yours.");
    haltAssigned(campaign, front);
    campaign.state.fronts.splice(index, 1);
    const enemy = campaign.countries.get(front.enemyId)?.name ?? front.enemyId;
    return { ok: true, summary: `The front against ${enemy} is closed.` };
  }

  return refuse("Order refused.", "That front order could not be applied.");
}

export function maintainFronts(campaign: Campaign): void {
  for (const front of campaign.state.fronts) {
    if (front.executing && offensiveDone(campaign, front)) front.executing = false;
    if (front.executing && front.offensive && front.offensive.length >= 2) stepOffensive(campaign, front);
    else deployLine(campaign, front);
  }
}

export function borderProvinces(campaign: Campaign, countryId: string, enemyId: string): string[] {
  const border: string[] = [];
  for (const province of campaign.scenario.provinces) {
    const state = campaign.state.provinces[province.id];
    if (!state || state.controllerId !== countryId) continue;
    const hostile = province.neighbors.some((neighbor) => {
      const other = campaign.state.provinces[neighbor];
      return other?.controllerId === enemyId;
    });
    if (hostile) border.push(province.id);
  }
  border.sort();
  return border;
}

export { samplePolyline };
