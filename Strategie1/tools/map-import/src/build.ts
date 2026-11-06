import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoArea } from "d3-geo";
import {
  provinceDefinitionSchema,
  type CountryDefinition,
  type ProvinceDefinition,
} from "@meridian/shared";
import { GRID, KNOWN_OWNERS, theaterCells, type TheaterCell } from "../../../packages/map-data/source/theater.ts";
import { topology } from "topojson-server";
import { validateProvinces, type MapIssue } from "./validate.ts";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "../../..");
export const generatedDir = resolve(repoRoot, "packages/map-data/generated");
export const landSource = resolve(repoRoot, "packages/map-data/source/ne_110m_land.geojson");

export interface BuiltMap {
  provinces: ProvinceDefinition[];
  rings: Record<string, number[][]>;
  issues: MapIssue[];
  featureCollection: {
    type: "FeatureCollection";
    features: Array<{
      type: "Feature";
      properties: { id: string; name: string };
      geometry:
        | { type: "Polygon"; coordinates: number[][][] }
        | { type: "MultiPolygon"; coordinates: number[][][][] };
    }>;
  };
  topologyJson?: unknown;
  countries?: CountryDefinition[];
  places?: Record<string, string>;
}

function hashUnit(a: number, b: number, salt: number): number {
  let n = Math.imul(a + 17, 374761393) ^ Math.imul(b + 91, 668265263) ^ Math.imul(salt + 3, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function corner(col: number, row: number): [number, number] {
  let x = GRID.originLon + col * GRID.dLon;
  let y = GRID.originLat + row * GRID.dLat;
  const onX = col === 0 || col === GRID.cols;
  const onY = row === 0 || row === GRID.rows;
  x += (hashUnit(col, row, 1) - 0.5) * GRID.dLon * (onX ? 0.04 : 0.34);
  y += (hashUnit(col, row, 2) - 0.5) * GRID.dLat * (onY ? 0.04 : 0.34);
  if (row === GRID.rows) y += Math.sin(col * 1.15) * GRID.dLat * 0.22;
  if (row === 0) y -= Math.sin(col * 0.85) * GRID.dLat * 0.1;
  if (col === 0) x += Math.sin(row * 0.9) * GRID.dLon * 0.08;
  if (col === GRID.cols) x -= Math.sin(row * 1.05) * GRID.dLon * 0.08;
  return [x, y];
}

function sharedEdge(col0: number, row0: number, col1: number, row1: number): [number, number][] {
  const forward = col0 < col1 || (col0 === col1 && row0 < row1);
  const start = forward ? corner(col0, row0) : corner(col1, row1);
  const end = forward ? corner(col1, row1) : corner(col0, row0);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const keyA = Math.min(col0, col1) * 16 + Math.max(col0, col1);
  const keyB = Math.min(row0, row1) * 16 + Math.max(row0, row1);
  const steps = 3;
  const points: [number, number][] = [start];
  for (let step = 1; step < steps; step += 1) {
    const t = step / steps;
    const bulge =
      Math.sin(Math.PI * t) *
      (hashUnit(keyA, keyB, 10 + step) - 0.5) *
      Math.min(GRID.dLon, GRID.dLat) *
      0.42;
    points.push([start[0] + dx * t + nx * bulge, start[1] + dy * t + ny * bulge]);
  }
  points.push(end);
  return forward ? points : points.reverse();
}

function cellRing(col: number, row: number): number[][] {
  const south = sharedEdge(col, row, col + 1, row);
  const east = sharedEdge(col + 1, row, col + 1, row + 1).slice(1);
  const north = sharedEdge(col + 1, row + 1, col, row + 1).slice(1);
  const west = sharedEdge(col, row + 1, col, row).slice(1);
  const ring = [...south, ...east, ...north, ...west];
  const first = ring[0];
  if (first) ring.push([first[0], first[1]]);
  return ring;
}

function areaKm2(ring: number[][]): number {
  const steradians = geoArea({ type: "Polygon", coordinates: [ring] });
  const sphere = 4 * Math.PI;
  const small = Math.min(steradians, sphere - steradians);
  return Math.round(small * 6371 * 6371);
}

export function buildTheater(cells: TheaterCell[] = theaterCells()): BuiltMap {
  const present = new Set(cells.map((cell) => `${cell.col},${cell.row}`));
  const rings: Record<string, number[][]> = {};
  const provinces: ProvinceDefinition[] = cells.map((cell) => {
    const ring = cellRing(cell.col, cell.row);
    rings[cell.id] = ring;
    const neighbors: string[] = [];
    const steps = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    for (const [dx, dy] of steps) {
      const key = `${cell.col + dx},${cell.row + dy}`;
      if (!present.has(key)) continue;
      neighbors.push(`c${cell.col + dx}r${cell.row + dy}`);
    }
    neighbors.sort();
    const tags = cell.strategicTags.filter((tag) => tag !== "coast" || neighbors.length < 4);
    if (cell.strategicTags.includes("coast") && neighbors.length < 4 && !tags.includes("coast")) {
      tags.push("coast");
    }
    const center = {
      lon: GRID.originLon + (cell.col + 0.5) * GRID.dLon,
      lat: GRID.originLat + (cell.row + 0.5) * GRID.dLat,
    };
    const province = {
      id: cell.id,
      name: cell.name,
      geometryRef: cell.id,
      center,
      countryId: cell.countryId,
      terrain: cell.terrain,
      climate: cell.climate,
      area: Math.max(1, areaKm2(ring)),
      neighbors,
      infrastructureLevel: cell.infrastructureLevel,
      victoryPointValue: cell.victoryPointValue,
      resources: cell.resources,
      strategicTags: tags,
      impassable: false,
    };
    return provinceDefinitionSchema.parse(province);
  });

  const features = provinces.map((province) => ({
    type: "Feature" as const,
    properties: { id: province.id, name: province.name },
    geometry: {
      type: "Polygon" as const,
      coordinates: [rings[province.id] ?? []],
    },
  }));

  return {
    provinces,
    rings,
    issues: validateProvinces(provinces, rings, KNOWN_OWNERS),
    featureCollection: { type: "FeatureCollection", features },
  };
}

export function writeGenerated(map: BuiltMap): void {
  if (map.issues.length > 0) {
    throw new Error(map.issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n"));
  }
  mkdirSync(generatedDir, { recursive: true });
  writeFileSync(resolve(generatedDir, "provinces.json"), JSON.stringify(map.provinces));
  const topo = map.topologyJson ?? topology({ provinces: map.featureCollection }, 1e5);
  writeFileSync(resolve(generatedDir, "provinces.topojson"), JSON.stringify(topo));
  writeFileSync(resolve(generatedDir, "provinces.topology.json"), JSON.stringify(topo));
  const index = map.provinces.map((province) => {
    const ring = map.rings[province.id] ?? [];
    const lons = ring.map((point) => point[0] ?? 0);
    const lats = ring.map((point) => point[1] ?? 0);
    return {
      id: province.id,
      minLon: Math.min(...lons),
      minLat: Math.min(...lats),
      maxLon: Math.max(...lons),
      maxLat: Math.max(...lats),
    };
  });
  writeFileSync(resolve(generatedDir, "spatial-index.json"), JSON.stringify(index));
  if (map.countries) {
    writeFileSync(resolve(generatedDir, "countries.json"), JSON.stringify(map.countries));
  }
  if (map.places) {
    writeFileSync(resolve(generatedDir, "places.json"), JSON.stringify(map.places, null, 2));
  }
  const land = readFileSync(landSource, "utf8");
  writeFileSync(resolve(generatedDir, "land.geojson"), land);
  writeFileSync(resolve(generatedDir, "land.json"), land);
}
