import { existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { landSource, writeGenerated } from "./build.ts";
import { buildEurope } from "./europe.ts";

const LAND_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson";

async function ensureLand(): Promise<void> {
  if (existsSync(landSource)) return;
  const response = await fetch(LAND_URL);
  if (!response.ok) {
    throw new Error(`Could not download Natural Earth land (${response.status}). Place the file at ${landSource}.`);
  }
  const text = await response.text();
  if (!text.includes("FeatureCollection")) {
    throw new Error("Natural Earth download was not GeoJSON.");
  }
  writeFileSync(landSource, text);
}

await ensureLand();
const map = buildEurope();
writeGenerated(map);
console.log(`Wrote ${map.provinces.length} provinces across ${map.countries?.length ?? 0} countries.`);
if (map.places) console.log(`German attack ${map.places.attackFrom} -> ${map.places.attackTo} (${map.places.attackToName}).`);
