import {
  createCampaign,
  type Campaign,
} from "./index.ts";
import type { ScenarioDefinition } from "@meridian/shared";

const germanTemplate = {
  id: "infantry-division",
  name: "Hadrosaur pack",
  countryId: "germany",
  line: [
    { battalion: "hadrosaur" as const, count: 8 },
    { battalion: "ceratops" as const, count: 4 },
  ],
  support: [],
};

const polishTemplate = {
  id: "polish-infantry",
  name: "Hadrosaur pack",
  countryId: "poland",
  line: [{ battalion: "hadrosaur" as const, count: 6 }],
  support: [],
};

function province(
  id: string,
  name: string,
  countryId: string,
  neighbors: string[],
  infrastructureLevel: number,
  lon: number,
): ScenarioDefinition["provinces"][number] {
  return {
    id,
    name,
    geometryRef: id,
    center: { lon, lat: 52 },
    countryId,
    terrain: "plains",
    climate: "continental",
    area: 1000,
    neighbors,
    infrastructureLevel,
    victoryPointValue: id === "a" || id === "d" ? 5 : 0,
    resources: [],
    strategicTags: [],
    impassable: id === "blocked",
  };
}

export function fixtureScenario(eventHour = 2): ScenarioDefinition {
  return {
    id: "fixture",
    name: "Fixture",
    startDate: { year: 1939, month: 9, day: 1, hour: 0 },
    defaultSeed: 7,
    countries: [
      {
        id: "germany",
        name: "Germany",
        localizationKey: "country.germany",
        flagRef: "flags/germany.svg",
        color: "#5c6b4a",
        government: "Cabinet",
        ideology: "Authoritarian",
        stability: 60,
        warSupport: 70,
        manpower: 100000,
        population: 1000000,
        civilianFactories: 4,
        militaryFactories: 4,
        dockyards: 0,
        researchSlots: 3,
        stockpile: {
          steel: 10,
          aluminum: 0,
          oil: 5,
          rubber: 1,
          tungsten: 0,
          chromium: 0,
          infantry_equipment: 50,
        },
        capitalProvinceId: "a",
        alignedTo: null,
        startingResearch: [],
      },
      {
        id: "poland",
        name: "Poland",
        localizationKey: "country.poland",
        flagRef: "flags/poland.svg",
        color: "#8d6b4a",
        government: "Republic",
        ideology: "Democratic",
        stability: 55,
        warSupport: 80,
        manpower: 50000,
        population: 500000,
        civilianFactories: 2,
        militaryFactories: 2,
        dockyards: 0,
        researchSlots: 2,
        stockpile: {
          steel: 4,
          aluminum: 0,
          oil: 1,
          rubber: 0,
          tungsten: 0,
          chromium: 0,
          infantry_equipment: 20,
        },
        capitalProvinceId: "d",
        alignedTo: null,
        startingResearch: [],
      },
      {
        id: "slovakia",
        name: "Slovakia",
        localizationKey: "country.slovakia",
        flagRef: "flags/slovakia.svg",
        color: "#4d6a75",
        government: "Republic",
        ideology: "Authoritarian",
        stability: 50,
        warSupport: 40,
        manpower: 10000,
        population: 100000,
        civilianFactories: 1,
        militaryFactories: 1,
        dockyards: 0,
        researchSlots: 1,
        stockpile: {
          steel: 1,
          aluminum: 0,
          oil: 0,
          rubber: 0,
          tungsten: 0,
          chromium: 0,
          infantry_equipment: 5,
        },
        capitalProvinceId: "f",
        alignedTo: null,
        startingResearch: [],
      },
    ],
    provinces: [
      province("a", "Alpha", "germany", ["b", "d", "f", "blocked"], 5, 0),
      province("b", "Bravo", "germany", ["a", "c"], 1, 1),
      province("c", "Charlie", "germany", ["b"], 1, 2),
      province("d", "Delta", "poland", ["a", "e"], 3, 0.4),
      province("e", "Echo", "poland", ["d"], 1, 1.4),
      province("f", "Foxtrot", "slovakia", ["a"], 2, -1),
      province("blocked", "Impassable", "germany", ["a"], 1, -0.25),
    ],
    templates: [germanTemplate, polishTemplate],
    divisions: [
      {
        id: "ger-home",
        name: "Home Corps",
        countryId: "germany",
        templateId: "infantry-division",
        provinceId: "a",
        manpower: 10000,
        equipment: 880,
      },
      {
        id: "ger-far",
        name: "Far Corps",
        countryId: "germany",
        templateId: "infantry-division",
        provinceId: "c",
        manpower: 10000,
        equipment: 880,
      },
      {
        id: "pol-front",
        name: "Front Group",
        countryId: "poland",
        templateId: "polish-infantry",
        provinceId: "d",
        manpower: 6000,
        equipment: 480,
      },
    ],
    wars: [
      {
        id: "war-fixture",
        name: "Fixture war",
        attackers: ["germany"],
        defenders: ["poland"],
        start: { year: 1939, month: 9, day: 1, hour: 0 },
      },
    ],
    events: [
      {
        id: "levy",
        countryId: "germany",
        title: "Call the reserve classes",
        description: "The cabinet can summon trained reservists.",
        trigger: { year: 1939, month: 9, day: 1, hour: eventHour },
        choices: [
          {
            id: "levy",
            label: "Summon the reserves",
            detail: "Manpower increases.",
            weight: 100,
            effects: [{ type: "addManpower", amount: 15000 }],
          },
          {
            id: "hold",
            label: "Keep the depots intact",
            detail: "Stability rises slightly.",
            weight: 0,
            effects: [{ type: "addStability", amount: 2 }],
          },
        ],
      },
    ],
    focusTrees: [],
  };
}

export function fixtureCampaign(playerCountryId = "poland", seed = 7, eventHour = 2): Campaign {
  return createCampaign({ scenario: fixtureScenario(eventHour), playerCountryId, seed });
}

export function pointOf(campaign: Campaign, provinceId: string): { lon: number; lat: number } {
  const center = campaign.provinces.get(provinceId)?.center;
  if (!center) throw new Error(`missing province ${provinceId}`);
  return { lon: center.lon, lat: center.lat };
}
