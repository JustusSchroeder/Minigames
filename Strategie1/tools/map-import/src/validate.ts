import type { ProvinceDefinition } from "@meridian/shared";

export interface MapIssue {
  code: string;
  message: string;
}

interface RingPoint {
  x: number;
  y: number;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function properIntersection(a: RingPoint, b: RingPoint, c: RingPoint, d: RingPoint): boolean {
  const d1 = cross(b.x - a.x, b.y - a.y, c.x - a.x, c.y - a.y);
  const d2 = cross(b.x - a.x, b.y - a.y, d.x - a.x, d.y - a.y);
  const d3 = cross(d.x - c.x, d.y - c.y, a.x - c.x, a.y - c.y);
  const d4 = cross(d.x - c.x, d.y - c.y, b.x - c.x, b.y - c.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function ringPoints(ring: number[][]): RingPoint[] {
  const points = ring.map((pair) => ({ x: pair[0] ?? 0, y: pair[1] ?? 0 }));
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && first.x === last.x && first.y === last.y) points.pop();
  return points;
}

export function validateProvinces(
  provinces: ProvinceDefinition[],
  rings: Record<string, number[][]>,
  knownCountries: readonly string[],
  options?: { maxSelfCheckPoints?: number },
): MapIssue[] {
  const maxSelfCheckPoints = options?.maxSelfCheckPoints ?? Number.POSITIVE_INFINITY;
  const issues: MapIssue[] = [];
  const seen = new Set<string>();
  for (const province of provinces) {
    if (seen.has(province.id)) issues.push({ code: "duplicate-id", message: `Duplicate id ${province.id}` });
    seen.add(province.id);
    if (!knownCountries.includes(province.countryId)) {
      issues.push({
        code: "missing-country",
        message: `${province.id} references missing country ${province.countryId}`,
      });
    }
    const ring = rings[province.id];
    if (!ring || ring.length < 4) {
      issues.push({ code: "invalid-polygon", message: `${province.id} polygon is invalid` });
      continue;
    }
    const points = ringPoints(ring);
    if (points.length < 3) {
      issues.push({ code: "invalid-polygon", message: `${province.id} has too few corners` });
      continue;
    }
    if (points.length > maxSelfCheckPoints) continue;
    let crossed = false;
    for (let i = 0; i < points.length && !crossed; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if (!a || !b) continue;
      for (let j = i + 1; j < points.length; j += 1) {
        if (Math.abs(i - j) <= 1 || (i === 0 && j === points.length - 1)) continue;
        const c = points[j];
        const d = points[(j + 1) % points.length];
        if (!c || !d) continue;
        if (properIntersection(a, b, c, d)) {
          issues.push({ code: "self-intersection", message: `${province.id} ring crosses itself` });
          crossed = true;
          break;
        }
      }
    }
  }

  const byId = new Map(provinces.map((province) => [province.id, province]));
  for (const province of provinces) {
    const neighbors = new Set(province.neighbors);
    if (neighbors.size !== province.neighbors.length) {
      issues.push({ code: "duplicate-edge", message: `${province.id} repeats a neighbor` });
    }
    for (const neighbor of province.neighbors) {
      const other = byId.get(neighbor);
      if (!other) {
        issues.push({ code: "missing-neighbor", message: `${province.id} neighbors missing ${neighbor}` });
        continue;
      }
      if (!other.neighbors.includes(province.id)) {
        issues.push({
          code: "asymmetric-edge",
          message: `${province.id} -> ${neighbor} is not returned`,
        });
      }
    }
    if (province.strategicTags.includes("coast") && province.neighbors.length >= 4) {
      issues.push({
        code: "impossible-coast",
        message: `${province.id} is marked as coast but every side touches land`,
      });
    }
  }

  const land = provinces.filter(
    (province) => !province.impassable && !province.strategicTags.includes("island"),
  );
  if (land[0]) {
    const seenLand = new Set<string>();
    const queue = [land[0].id];
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id || seenLand.has(id)) continue;
      seenLand.add(id);
      const province = byId.get(id);
      if (!province) continue;
      for (const neighbor of province.neighbors) {
        const other = byId.get(neighbor);
        if (other && !other.impassable) queue.push(neighbor);
      }
    }
    if (seenLand.size !== land.length) {
      issues.push({
        code: "isolated",
        message: `${land.length - seenLand.size} land provinces are isolated`,
      });
    }
  }
  return issues;
}
