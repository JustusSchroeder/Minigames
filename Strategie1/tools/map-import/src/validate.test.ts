import { describe, expect, it } from "vitest";
import type { ProvinceDefinition } from "@meridian/shared";
import { buildEurope } from "./europe.ts";
import { validateProvinces } from "./validate.ts";

describe("map validation", () => {
  it("accepts the September 1939 theater", () => {
    const map = buildEurope();
    expect(map.issues).toEqual([]);
    expect(map.provinces.length).toBeGreaterThan(800);
    const berlin = map.provinces.find((province) => province.id === "de-be");
    const warsaw = map.provinces.find((province) => province.id === "pl-mz");
    expect(berlin?.countryId).toBe("germany");
    expect(berlin?.name).toBe("Berlin");
    expect(warsaw?.countryId).toBe("poland");
    expect(warsaw?.name).toBe("Warsaw");
    expect(map.provinces.some((province) => province.countryId === "slovakia")).toBe(true);
    expect(map.provinces.some((province) => province.strategicTags.includes("island"))).toBe(true);
    expect(map.provinces.some((province) => province.strategicTags.includes("seaport"))).toBe(true);
    expect(map.places?.attackFrom && map.provinces.find((province) => province.id === map.places?.attackFrom)?.neighbors.includes(map.places?.attackTo ?? "")).toBe(true);
  });

  it("reports duplicate ids, bad owners, broken adjacency, and isolated land", () => {
    const base = (id: string, neighbors: string[], countryId = "germany"): ProvinceDefinition => ({
      id,
      name: id,
      geometryRef: id,
      center: { lon: 10, lat: 50 },
      countryId,
      terrain: "plains",
      climate: "continental",
      area: 10,
      neighbors,
      infrastructureLevel: 1,
      victoryPointValue: 0,
      resources: [],
      strategicTags: id === "coast" ? ["coast"] : [],
      impassable: false,
    });
    const square = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    const bowtie = [
      [0, 0],
      [1, 1],
      [0, 1],
      [1, 0],
      [0, 0],
    ];
    const provinces = [
      base("a", ["a"]),
      base("a", ["b"]),
      base("b", []),
      base("c", ["missing"], "atlantis"),
      base("alone", []),
      { ...base("coast", ["n", "s", "e", "w"]), strategicTags: ["coast"] },
      base("n", ["coast"]),
      base("s", ["coast"]),
      base("e", ["coast"]),
      base("w", ["coast"]),
    ];
    const rings: Record<string, number[][]> = {};
    for (const province of provinces) rings[province.id] = square;
    rings.a = bowtie;
    const issues = validateProvinces(provinces, rings, ["germany"]);
    const codes = new Set(issues.map((issue) => issue.code));
    expect(codes.has("duplicate-id")).toBe(true);
    expect(codes.has("missing-country")).toBe(true);
    expect(codes.has("asymmetric-edge") || codes.has("missing-neighbor")).toBe(true);
    expect(codes.has("isolated")).toBe(true);
    expect(codes.has("self-intersection")).toBe(true);
    expect(codes.has("impossible-coast")).toBe(true);
  });
});
