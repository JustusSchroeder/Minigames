import type { MapPoint } from "@meridian/shared";
import type { Campaign } from "./campaign.ts";

export const STATION_EPS = 0.04;
export const REPATH_EPS = 0.08;
export const LAND_EPS = 3;

export function copyPoint(point: MapPoint): MapPoint {
  return { lon: point.lon, lat: point.lat };
}

export function samePoint(left: MapPoint, right: MapPoint, eps = STATION_EPS): boolean {
  return geoDistance(left, right) <= eps;
}

export function geoDistance(from: MapPoint, to: MapPoint): number {
  return Math.hypot(from.lon - to.lon, from.lat - to.lat);
}

export function lerpPoint(from: MapPoint, to: MapPoint, amount: number): MapPoint {
  const t = Math.min(1, Math.max(0, amount));
  return {
    lon: from.lon + (to.lon - from.lon) * t,
    lat: from.lat + (to.lat - from.lat) * t,
  };
}

export function polylineLength(points: MapPoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (previous && point) length += geoDistance(previous, point);
  }
  return length;
}

export function samplePolyline(points: MapPoint[], t: number): MapPoint {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first) return { lon: 0, lat: 0 };
  if (!last || points.length === 1) return copyPoint(first);
  const total = polylineLength(points);
  if (total <= 1e-9) return copyPoint(first);
  let remain = Math.min(1, Math.max(0, t)) * total;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const point = points[index];
    if (!previous || !point) continue;
    const span = geoDistance(previous, point);
    if (remain <= span || index === points.length - 1) {
      return lerpPoint(previous, point, span <= 1e-9 ? 1 : remain / span);
    }
    remain -= span;
  }
  return copyPoint(last);
}

export function slotPoints(points: MapPoint[], count: number): MapPoint[] {
  if (count <= 0 || points.length === 0) return [];
  return Array.from({ length: count }, (_, index) => samplePolyline(points, (index + 0.5) / count));
}

export function simplifyPoints(points: MapPoint[], minGap = 0.04): MapPoint[] {
  const first = points[0];
  if (!first) return [];
  const kept: MapPoint[] = [copyPoint(first)];
  for (const point of points) {
    const previous = kept[kept.length - 1];
    if (!previous || geoDistance(previous, point) < minGap) continue;
    kept.push(copyPoint(point));
  }
  const last = points[points.length - 1];
  if (last && kept[kept.length - 1] && !samePoint(last, kept[kept.length - 1] ?? last, 1e-9)) {
    kept.push(copyPoint(last));
  }
  return kept.length >= 2 ? kept : last && first ? [copyPoint(first), copyPoint(last)] : kept;
}

export function nearestProvince(campaign: Campaign, point: MapPoint): string | undefined {
  let best: string | undefined;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const province of campaign.scenario.provinces) {
    if (province.impassable) continue;
    const gap = geoDistance(point, province.center);
    if (gap < bestGap || (gap === bestGap && best && province.id < best)) {
      bestGap = gap;
      best = province.id;
    }
  }
  if (best === undefined || bestGap > LAND_EPS) return undefined;
  return best;
}

export function provincePoint(campaign: Campaign, provinceId: string): MapPoint | undefined {
  const center = campaign.provinces.get(provinceId)?.center;
  return center ? copyPoint(center) : undefined;
}
