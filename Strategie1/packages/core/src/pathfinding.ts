import { WEATHER_MOVE, movementHours, weatherAt, type MapPoint, type ProvinceDefinition } from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { copyPoint, geoDistance, nearestProvince } from "./geo.ts";
import { atWar, friendlyController } from "./relations.ts";

export type PathResult =
  | { ok: true; path: string[]; estimatedHours: number }
  | { ok: false; reason: string };

function province(campaign: Campaign, id: string): ProvinceDefinition | undefined {
  return campaign.provinces.get(id);
}

export function travelHours(campaign: Campaign, provinceId: string): number {
  const def = province(campaign, provinceId);
  const state = campaign.state.provinces[provinceId];
  if (!def || !state) return 1;
  const infra = Math.max(0, state.infrastructure - state.damage);
  const weather = weatherAt(campaign.state.date.month, def.climate);
  return Math.max(1, Math.round(movementHours(def.terrain, infra) * WEATHER_MOVE[weather]));
}

function entryCost(campaign: Campaign, id: string): number {
  return travelHours(campaign, id);
}

function canEnter(
  campaign: Campaign,
  id: string,
  destination: string,
  nationId: string,
  attack = false,
): { ok: true } | { ok: false; reason: string } {
  const def = province(campaign, id);
  const state = campaign.state.provinces[id];
  if (!def || !state) return { ok: false, reason: "That province is not on the map." };
  if (def.impassable) return { ok: false, reason: "That province is impassable." };
  const friendly = friendlyController(campaign, state.controllerId, nationId);
  if (friendly) return { ok: true };
  if (!attack && id !== destination) {
    return {
      ok: false,
      reason: "No open route. Hostile or neutral territory blocks the interior of the march.",
    };
  }
  if (atWar(campaign, nationId, state.controllerId)) return { ok: true };
  return { ok: false, reason: "No military access into neutral territory." };
}

export function findPath(
  campaign: Campaign,
  fromId: string,
  toId: string,
  nationId: string,
  attack = false,
): PathResult {
  if (fromId === toId) {
    return { ok: false, reason: "The formation is already in that province." };
  }
  const destinationCheck = canEnter(campaign, toId, toId, nationId);
  if (!destinationCheck.ok && destinationCheck.reason === "No military access into neutral territory.") {
    return destinationCheck;
  }
  if (!destinationCheck.ok && destinationCheck.reason === "That province is impassable.") {
    return destinationCheck;
  }
  if (!province(campaign, fromId) || !province(campaign, toId)) {
    return { ok: false, reason: "That province is not on the map." };
  }

  const start = province(campaign, fromId);
  const goal = province(campaign, toId);
  if (!start || !goal) return { ok: false, reason: "That province is not on the map." };

  const open = new Set<string>([fromId]);
  const cameFrom = new Map<string, string | null>([[fromId, null]]);
  const cost = new Map<string, number>([[fromId, 0]]);

  const heuristic = (id: string): number => {
    const node = province(campaign, id);
    if (!node) return 0;
    const dx = node.center.lon - goal.center.lon;
    const dy = node.center.lat - goal.center.lat;
    return Math.hypot(dx, dy) * 4;
  };

  while (open.size > 0) {
    let current = "";
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of open) {
      const score = (cost.get(candidate) ?? 0) + heuristic(candidate);
      if (score < best || (score === best && candidate < current)) {
        best = score;
        current = candidate;
      }
    }
    open.delete(current);
    if (current === toId) {
      const path: string[] = [];
      let cursor: string | null = current;
      while (cursor) {
        path.push(cursor);
        cursor = cameFrom.get(cursor) ?? null;
      }
      path.reverse();
      return { ok: true, path, estimatedHours: cost.get(toId) ?? 0 };
    }

    const currentDef = province(campaign, current);
    if (!currentDef) continue;
    for (const neighbor of currentDef.neighbors) {
      const gate = canEnter(campaign, neighbor, toId, nationId, attack);
      if (!gate.ok) continue;
      const nextCost = (cost.get(current) ?? 0) + entryCost(campaign, neighbor);
      if (nextCost < (cost.get(neighbor) ?? Number.POSITIVE_INFINITY)) {
        cost.set(neighbor, nextCost);
        cameFrom.set(neighbor, current);
        open.add(neighbor);
      }
    }
  }

  return {
    ok: false,
    reason: "No open route. Hostile or neutral territory blocks the interior of the march.",
  };
}

export type RouteResult =
  | { ok: true; waypoints: MapPoint[]; hops: string[]; estimatedHours: number }
  | { ok: false; reason: string };

export function findRoute(
  campaign: Campaign,
  from: MapPoint,
  to: MapPoint,
  nationId: string,
  fromProvinceId?: string,
  attack = false,
): RouteResult {
  const startId = fromProvinceId && campaign.provinces.has(fromProvinceId)
    ? fromProvinceId
    : nearestProvince(campaign, from);
  const destId = nearestProvince(campaign, to);
  if (!startId || !destId) {
    return { ok: false, reason: "That point is not on valid land." };
  }
  const destCheck = canEnter(campaign, destId, destId, nationId);
  if (!destCheck.ok) return destCheck;

  if (startId === destId) {
    if (geoDistance(from, to) < 1e-6) {
      return { ok: false, reason: "The formation is already at that point." };
    }
    return {
      ok: true,
      waypoints: [copyPoint(from), copyPoint(to)],
      hops: [destId],
      estimatedHours: travelHours(campaign, destId),
    };
  }

  const graph = findPath(campaign, startId, destId, nationId, attack);
  if (!graph.ok) return graph;
  const hops = graph.path.slice(1);
  if (hops.length === 0) {
    return { ok: false, reason: "The route could not be started." };
  }
  const waypoints: MapPoint[] = [copyPoint(from)];
  for (let index = 1; index < graph.path.length - 1; index += 1) {
    const id = graph.path[index];
    const center = id ? campaign.provinces.get(id)?.center : undefined;
    if (center) waypoints.push(copyPoint(center));
  }
  waypoints.push(copyPoint(to));
  if (waypoints.length !== hops.length + 1) {
    return { ok: false, reason: "The route could not be started." };
  }
  return { ok: true, waypoints, hops, estimatedHours: graph.estimatedHours };
}

export function placeRoute(
  campaign: Campaign,
  divisionId: string,
  to: MapPoint,
  attack = false,
): { ok: true; hours: number } | { ok: false; reason: string } {
  const division = campaign.state.divisions[divisionId];
  if (!division || division.battleId) return { ok: false, reason: "This formation cannot take a new march order." };
  const route = findRoute(campaign, division.position, to, division.countryId, division.provinceId, attack);
  if (!route.ok) return route;
  const firstHop = route.hops[0];
  if (!firstHop) return { ok: false, reason: "The route could not be started." };
  division.entrenchment = 0;
  division.order = {
    waypoints: route.waypoints,
    hops: route.hops,
    nextIndex: 1,
    progressHours: 0,
    hoursRequired: travelHours(campaign, firstHop),
    estimatedHours: route.estimatedHours,
  };
  return { ok: true, hours: route.estimatedHours };
}
