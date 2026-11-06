import type { CampaignSnapshot } from "@meridian/core";
import type { MapMode } from "@meridian/shared";

const TERRAIN: Record<string, number> = {
  plains: 0xc8bf88,
  forest: 0x6e8746,
  hills: 0xb39258,
  mountains: 0x8b847c,
  urban: 0xd0c098,
  marsh: 0x87936c,
};

export function terrainBase(terrain: string): number {
  return TERRAIN[terrain] ?? 0xc8bf88;
}

const RESOURCE: Record<string, number> = {
  steel: 0x8d9398,
  aluminum: 0xd5dbe0,
  oil: 0x2a241c,
  rubber: 0x6b4a32,
  tungsten: 0x6e7c8a,
  chromium: 0x7d8a55,
};

function parseHex(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

function mix(from: number, to: number, t: number): number {
  const amount = Math.min(1, Math.max(0, t));
  const fr = (from >> 16) & 255;
  const fg = (from >> 8) & 255;
  const fb = from & 255;
  const tr = (to >> 16) & 255;
  const tg = (to >> 8) & 255;
  const tb = to & 255;
  const r = Math.round(fr + (tr - fr) * amount);
  const g = Math.round(fg + (tg - fg) * amount);
  const b = Math.round(fb + (tb - fb) * amount);
  return (r << 16) | (g << 8) | b;
}

export function provinceFill(
  mode: MapMode,
  province: CampaignSnapshot["provinces"][number],
  ownerColor: string,
  controllerColor: string,
): number {
  if (mode === "political") return parseHex(ownerColor);
  if (mode === "terrain") return TERRAIN[province.terrain] ?? 0x888888;
  if (mode === "infrastructure") return mix(0x3a2f28, 0xe6d7a8, (province.infrastructure - 1) / 4);
  if (mode === "resources") {
    const dominant = [...province.resources].sort((a, b) => b.amount - a.amount)[0];
    return dominant ? (RESOURCE[dominant.resource] ?? 0x3e463c) : 0x3e463c;
  }
  if (mode === "supply") {
    if (!province.supplyConnected) return 0x3a3f44;
    return mix(0x8a3030, 0x3f6b45, province.supplyRatio);
  }
  if (mode === "control") {
    const color = parseHex(controllerColor);
    return province.controllerId === province.ownerId ? color : mix(color, 0x111111, 0.45);
  }
  return mix(parseHex(ownerColor), 0x141814, 0.35);
}

export function resourceLabel(resources: CampaignSnapshot["provinces"][number]["resources"]): string {
  if (resources.length === 0) return "No mapped deposit";
  return resources.map((item) => `${item.resource} ${item.amount}`).join(", ");
}
