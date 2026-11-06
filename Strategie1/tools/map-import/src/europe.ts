import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { geoArea } from "d3-geo";
import { feature, neighbors } from "topojson-client";
import { topology } from "topojson-server";
import {
  countryDefinitionSchema,
  provinceDefinitionSchema,
  type ClimateRegion,
  type CountryDefinition,
  type ProvinceDefinition,
  type Stockpile,
  type TerrainType,
} from "@meridian/shared";
import { repoRoot, type BuiltMap } from "./build.ts";
import { validateProvinces } from "./validate.ts";

export const europeSource = resolve(repoRoot, "packages/map-data/source/europe-admin1.geojson");

interface SourceFeature {
  type: "Feature";
  properties: {
    adm0_a3: string;
    admin: string;
    iso: string;
    name: string;
    lon: number;
    lat: number;
  };
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}

interface TopologyGeometry {
  type: string;
  arcs?: unknown;
  properties?: { id?: string };
}

interface EuropeTopology {
  objects: { provinces: { geometries: TopologyGeometry[] } };
}

const COUNTRY_IDS: Record<string, string> = {
  "United Kingdom": "britain",
  "Republic of Serbia": "serbia",
  "Bosnia and Herzegovina": "bosnia",
  "Czech Republic": "czechia",
  Macedonia: "macedonia",
};

const COUNTRY_COLOR: Record<string, string> = {
  germany: "#62743c",
  poland: "#b1845c",
  france: "#3e6294",
  britain: "#8d3c3c",
  italy: "#4f8a45",
  spain: "#c4a04a",
  russia: "#7a3030",
  slovakia: "#4d6a75",
  turkey: "#8a6a3a",
  ukraine: "#c4b15a",
  austria: "#8f4a4a",
  hungary: "#6a7a3e",
  romania: "#a8843c",
  sweden: "#3f6f8a",
  norway: "#3f5f6a",
  finland: "#6a8fa3",
  greece: "#3f6a8a",
  portugal: "#6a8f4a",
  ireland: "#3f7a4a",
  netherlands: "#c47a3a",
  belgium: "#c4a15a",
  denmark: "#8a3f3f",
  switzerland: "#8a3030",
  czechia: "#4a6a8f",
};

const CAPITAL_POINT: Record<string, [number, number]> = {
  germany: [13.405, 52.52],
  poland: [21.012, 52.23],
  france: [2.352, 48.856],
  britain: [-0.127, 51.507],
  italy: [12.496, 41.902],
  spain: [-3.703, 40.416],
  russia: [37.618, 55.751],
  turkey: [32.854, 39.92],
  ukraine: [30.524, 50.45],
  austria: [16.373, 48.208],
  hungary: [19.04, 47.497],
  romania: [26.102, 44.426],
  sweden: [18.068, 59.329],
  norway: [10.752, 59.913],
  finland: [24.938, 60.17],
  greece: [23.727, 37.984],
  portugal: [-9.139, 38.722],
  ireland: [-6.26, 53.35],
  denmark: [12.568, 55.676],
  netherlands: [4.904, 52.368],
  belgium: [4.351, 50.847],
  switzerland: [7.447, 46.948],
  czechia: [14.437, 50.075],
  slovakia: [17.107, 48.148],
};

const CAPITAL_LABEL: Record<string, string> = {
  germany: "Berlin",
  poland: "Warsaw",
  france: "Paris",
  britain: "London",
  italy: "Rome",
  spain: "Madrid",
  russia: "Moscow",
  turkey: "Ankara",
  ukraine: "Kyiv",
  austria: "Vienna",
  hungary: "Budapest",
  romania: "Bucharest",
  sweden: "Stockholm",
  norway: "Oslo",
  finland: "Helsinki",
  greece: "Athens",
  portugal: "Lisbon",
  ireland: "Dublin",
  denmark: "Copenhagen",
  netherlands: "Amsterdam",
  belgium: "Brussels",
  switzerland: "Bern",
  czechia: "Prague",
  slovakia: "Bratislava",
};

const MAJOR = new Set(["germany", "poland", "france", "britain", "italy", "spain", "russia", "turkey"]);

const FLAGS: Record<string, string> = {
  germany: "flags/germany.svg",
  poland: "flags/poland.svg",
  slovakia: "flags/slovakia.svg",
};

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function countryIdFor(admin: string): string {
  return COUNTRY_IDS[admin] ?? slug(admin);
}

function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function colorFor(id: string, index: number): string {
  return COUNTRY_COLOR[id] ?? hsl((index * 137.508) % 360, 0.42, 0.42);
}

function cleanName(name: string): string {
  return name.replace(/ (Voivodeship|Oblast|Region)$/i, "").trim() || name;
}

function terrainFor(name: string, lat: number): TerrainType {
  const n = name.toLowerCase();
  if (/alp|tirol|pyrene|carpath|highland|mountain|caucas|kaukas/.test(n)) return "mountains";
  if (/marsh|fenland|delta/.test(n)) return "marsh";
  if (lat > 65) return "forest";
  if (/hill|upland|massif/.test(n)) return "hills";
  return "plains";
}

function climateFor(terrain: TerrainType, lon: number): ClimateRegion {
  if (terrain === "mountains") return "alpine";
  if (lon < 5) return "oceanic";
  return "continental";
}

function areaKm2(geometry: SourceFeature["geometry"]): number {
  const steradians = geoArea(geometry);
  const sphere = 4 * Math.PI;
  const small = Math.min(Math.abs(steradians), sphere - Math.abs(steradians));
  return Math.max(1, Math.round(small * 6371 * 6371));
}

function outerRings(geometry: SourceFeature["geometry"]): number[][][] {
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    return ring ? [ring] : [];
  }
  return geometry.coordinates.flatMap((polygon) => {
    const ring = polygon[0];
    return ring ? [ring] : [];
  });
}

function largestRing(geometry: SourceFeature["geometry"]): number[][] {
  const rings = outerRings(geometry);
  return rings.reduce((best, ring) => (ring.length > best.length ? ring : best), rings[0] ?? []);
}

function emptyStock(): Stockpile {
  return {
    steel: 0,
    aluminum: 0,
    oil: 0,
    rubber: 0,
    tungsten: 0,
    chromium: 0,
    infantry_equipment: 0,
  };
}

function resourcesFor(id: string): ProvinceDefinition["resources"] {
  if (id === "de-nw") return [{ resource: "steel", amount: 16 }];
  if (id === "pl-sl") return [{ resource: "steel", amount: 10 }];
  if (id === "pl-pk") return [{ resource: "oil", amount: 6 }];
  return [];
}

function infrastructureFor(countryId: string, id: string): number {
  if (id === "pl-pk") return 1;
  if (id === "de-be" || id === "pl-mz") return 5;
  if (countryId === "germany") return 4;
  return 3;
}

function arcIndexes(node: unknown, into: number[]): void {
  if (typeof node === "number") {
    into.push(node < 0 ? -node - 1 : node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) arcIndexes(child, into);
  }
}

/** A province on the outer edge of the land mesh can hold a port. */
function tagSeaports(topo: EuropeTopology, provinces: ProvinceDefinition[]): void {
  const counts = new Map<number, number>();
  const perProvince = topo.objects.provinces.geometries.map((geometry) => {
    const indexes: number[] = [];
    arcIndexes(geometry.arcs, indexes);
    for (const index of indexes) counts.set(index, (counts.get(index) ?? 0) + 1);
    return indexes;
  });
  provinces.forEach((province, index) => {
    const onEdge = (perProvince[index] ?? []).some((arc) => counts.get(arc) === 1);
    if (onEdge && !province.strategicTags.includes("seaport")) province.strategicTags.push("seaport");
  });
}

function tagIslands(provinces: ProvinceDefinition[]): void {
  const byId = new Map(provinces.map((province) => [province.id, province]));
  const seen = new Set<string>();
  const components: string[][] = [];
  for (const province of provinces) {
    if (province.impassable || seen.has(province.id)) continue;
    const group: string[] = [];
    const queue = [province.id];
    while (queue.length > 0) {
      const id = queue.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      group.push(id);
      const node = byId.get(id);
      if (!node) continue;
      for (const neighbor of node.neighbors) {
        const other = byId.get(neighbor);
        if (other && !other.impassable && !seen.has(neighbor)) queue.push(neighbor);
      }
    }
    components.push(group);
  }
  components.sort((a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? ""));
  const mainland = new Set(components[0] ?? []);
  for (const province of provinces) {
    if (!province.impassable && !mainland.has(province.id)) province.strategicTags.push("island");
  }
}

function nearestOwned(provinces: ProvinceDefinition[], countryId: string, point: [number, number] | undefined): string {
  const owned = provinces.filter((province) => province.countryId === countryId);
  const first = owned[0];
  if (!first) throw new Error(`No provinces for ${countryId}`);
  if (!point) return owned.reduce((best, province) => (province.area > best.area ? province : best), first).id;
  let best = first;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const province of owned) {
    const distance = (province.center.lon - point[0]) ** 2 + (province.center.lat - point[1]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = province;
    }
  }
  return best.id;
}

export function buildEurope(): BuiltMap {
  const raw = JSON.parse(readFileSync(europeSource, "utf8")) as { features: SourceFeature[] };
  const used = new Set<string>();
  const prepared = raw.features.map((item) => {
    const countryId = countryIdFor(item.properties.admin);
    const base = (item.properties.iso || `${countryId}-${slug(item.properties.name)}`).toLowerCase();
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(id);
    const name = cleanName(item.properties.name);
    return {
      id,
      name,
      countryId,
      admin: item.properties.admin,
      lon: item.properties.lon,
      lat: item.properties.lat,
      geometry: item.geometry,
    };
  });

  const featureCollection = {
    type: "FeatureCollection" as const,
    features: prepared.map((item) => ({
      type: "Feature" as const,
      properties: { id: item.id, name: item.name },
      geometry: item.geometry,
    })),
  };
  const topo = topology({ provinces: featureCollection }, 1e5) as EuropeTopology;
  const decoded = feature(topo, topo.objects.provinces) as { features: SourceFeature[] };
  const adjacency = neighbors(topo.objects.provinces.geometries);
  const ids = prepared.map((item) => item.id);

  const provinces: ProvinceDefinition[] = prepared.map((item, index) => {
    const geometry = decoded.features[index]?.geometry ?? item.geometry;
    const neighborIds = [...new Set((adjacency[index] ?? []).map((other) => ids[other]).filter((id) => id && id !== item.id))].sort();
    const terrain = terrainFor(item.name, item.lat);
    return provinceDefinitionSchema.parse({
      id: item.id,
      name: item.name,
      geometryRef: item.id,
      center: { lon: item.lon, lat: item.lat },
      countryId: item.countryId,
      terrain,
      climate: climateFor(terrain, item.lon),
      area: areaKm2(geometry),
      neighbors: neighborIds,
      infrastructureLevel: infrastructureFor(item.countryId, item.id),
      victoryPointValue: 0,
      resources: resourcesFor(item.id),
      strategicTags: [],
      impassable: false,
    });
  });

  tagIslands(provinces);
  tagSeaports(topo, provinces);

  const countryIds = [...new Set(provinces.map((province) => province.countryId))].sort();
  const capitalOf = new Map<string, string>();
  for (const countryId of countryIds) {
    capitalOf.set(countryId, nearestOwned(provinces, countryId, CAPITAL_POINT[countryId]));
  }
  for (const province of provinces) {
    if (capitalOf.get(province.countryId) !== province.id) continue;
    const label = CAPITAL_LABEL[province.countryId];
    if (label) province.name = label;
    province.victoryPointValue = MAJOR.has(province.countryId) ? 25 : 12;
    if (province.terrain === "plains") province.terrain = "urban";
  }

  const byId = new Map(provinces.map((province) => [province.id, province]));
  const requireProvince = (id: string) => {
    const province = byId.get(id);
    if (!province) throw new Error(`Europe extract is missing ${id}`);
    return province;
  };
  requireProvince("de-be");
  requireProvince("pl-mz");
  requireProvince("pl-pk");
  requireProvince("sk-bl");
  if (requireProvince("de-be").countryId !== "germany") throw new Error("Berlin is not German");
  if (requireProvince("pl-mz").countryId !== "poland") throw new Error("Warsaw's province is not Polish");

  const attackPairs: Array<[string, string]> = [
    ["de-sn", "pl-ds"],
    ["de-sn", "pl-op"],
    ["de-bb", "pl-lb"],
    ["de-mv", "pl-zp"],
  ];
  const fallback = provinces
    .filter((province) => province.countryId === "germany")
    .flatMap((province) =>
      province.neighbors
        .filter((neighbor) => byId.get(neighbor)?.countryId === "poland")
        .map((neighbor): [string, string] => [province.id, neighbor]),
    )[0];
  const attack = attackPairs.find(([from, to]) => byId.get(from)?.neighbors.includes(to)) ?? fallback;
  if (!attack) throw new Error("No German province shares a border with Poland");
  const germanHomes = ["de-mv", "de-bb", "de-sn", "de-st", "de-sh", "de-ni"].filter((id) => byId.has(id));
  const gerSilesia = attack[0];
  const gerPomerania = germanHomes.find((id) => id !== gerSilesia) ?? gerSilesia;
  const gerPrussia = germanHomes.find((id) => id !== gerSilesia && id !== gerPomerania) ?? gerPomerania;

  const places: Record<string, string> = {
    berlin: "de-be",
    warsaw: "pl-mz",
    krakow: "pl-ma",
    lodz: "pl-ld",
    poznan: "pl-wp",
    galicia: "pl-pk",
    bratislava: "sk-bl",
    gerPomerania,
    gerSilesia,
    gerPrussia,
    attackFrom: attack[0],
    attackTo: attack[1],
    attackToName: byId.get(attack[1])?.name ?? attack[1],
  };

  const counts = new Map<string, number>();
  for (const province of provinces) counts.set(province.countryId, (counts.get(province.countryId) ?? 0) + 1);
  const adminName = new Map(prepared.map((item) => [item.countryId, item.admin]));
  const countries: CountryDefinition[] = countryIds.map((id, index) => {
    const count = counts.get(id) ?? 1;
    const population = Math.max(200_000, count * 400_000);
    return countryDefinitionSchema.parse({
      id,
      name: CAPITAL_LABEL[id] ? adminName.get(id) ?? id : adminName.get(id) ?? id,
      localizationKey: `country.${id}`,
      flagRef: FLAGS[id] ?? "flags/neutral.svg",
      color: colorFor(id, index),
      government: "Republic",
      ideology: "Neutral",
      stability: 50,
      warSupport: 20,
      manpower: Math.round(population * 0.02),
      population,
      civilianFactories: Math.min(12, Math.max(1, Math.round(count / 10))),
      militaryFactories: Math.min(8, Math.max(0, Math.round(count / 16))),
      dockyards: 0,
      researchSlots: 1,
      stockpile: emptyStock(),
      capitalProvinceId: capitalOf.get(id) ?? "",
      alignedTo: null,
    });
  });

  const rings: Record<string, number[][]> = {};
  const storedFeatures = decoded.features.map((item, index) => {
    const source = prepared[index];
    const geometry = item.geometry ?? source?.geometry;
    const id = source?.id ?? "";
    if (id && geometry) rings[id] = largestRing(geometry);
    return {
      type: "Feature" as const,
      properties: { id, name: byId.get(id)?.name ?? source?.name ?? id },
      geometry,
    };
  });

  return {
    provinces,
    rings,
    // Natural Earth rings already share surveyed borders. One compact Slovenian
    // ring self-touches, so the import does not re-run the bowtie test.
    issues: validateProvinces(provinces, rings, countryIds, { maxSelfCheckPoints: 0 }),
    featureCollection: { type: "FeatureCollection", features: storedFeatures },
    topologyJson: topo,
    countries,
    places,
  };
}
