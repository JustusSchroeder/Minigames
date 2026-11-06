import type { ProvinceDefinition } from "@meridian/shared";
import { describe, expect, it } from "vitest";
import { maintainFronts } from "./fronts.ts";
import { advanceSimulation, createCampaign, findPath, issueCommand, snapshot } from "./index.ts";
import type { Campaign } from "./campaign.ts";
import { geoDistance } from "./geo.ts";
import { fixtureCampaign, fixtureScenario, pointOf } from "./test-fixture.ts";

function germany(): Campaign {
  return fixtureCampaign("germany", 7, 23);
}

function attackPoland(campaign: Campaign, hours: number): Campaign {
  let next = issueCommand(campaign, { type: "resume" }).campaign;
  next = issueCommand(next, {
    type: "moveDivision",
    divisionId: "ger-home",
    ...pointOf(campaign, "d"),
  }).campaign;
  return advanceSimulation(next, hours).campaign;
}

function armorAttack(): Campaign {
  const campaign = germany();
  const template = campaign.state.templates.find((item) => item.id === "infantry-division");
  const division = campaign.state.divisions["ger-home"];
  if (!template || !division) throw new Error("fixture is missing the German corps");
  template.line = [{ battalion: "tyrannosaur", count: 4 }];
  template.support = [];
  division.manpower = 2000;
  division.equipment = 560;
  division.organization = 25;
  return attackPoland(campaign, 4);
}

describe("combat modifiers", () => {
  it("shows clear September weather and zero forts at the start", () => {
    const view = snapshot(germany());
    expect(view.weatherLabel).toBe("Clear");
    expect(view.provinces.every((province) => province.forts === 0)).toBe(true);
  });

  it("keeps an armored attacker above the unarmored organization loss", () => {
    const fought = armorAttack();
    const attacker = fought.state.divisions["ger-home"];
    expect(attacker?.organization).toBeGreaterThan(23);
    expect(attacker?.organization).toBeLessThan(25);
  });

  it("gives a dug-in defender more organization than one that has not entrenched", () => {
    const fresh = germany();
    const dug = germany();
    const defender = dug.state.divisions["pol-front"];
    if (!defender) throw new Error("missing defender");
    defender.entrenchment = 20;
    const freshOrg = attackPoland(fresh, 4).state.divisions["pol-front"]?.organization ?? 0;
    const dugOrg = attackPoland(dug, 4).state.divisions["pol-front"]?.organization ?? 0;
    expect(dugOrg).toBeGreaterThan(freshOrg);
  });

  it("gains entrenchment while idle and freezes it once the battle opens", () => {
    const campaign = germany();
    const template = campaign.state.templates.find((item) => item.id === "polish-infantry");
    if (!template) throw new Error("missing template");
    template.support = [{ battalion: "stegosaur", count: 1 }];
    let next = issueCommand(campaign, { type: "resume" }).campaign;
    next = advanceSimulation(next, 3).campaign;
    expect(next.state.divisions["pol-front"]?.entrenchment).toBe(6);
    next = attackPoland(germany(), 6);
    expect(next.state.divisions["pol-front"]?.entrenchment).toBe(4);
  });

  it("raises defense with forts", () => {
    const open = germany();
    const fortified = germany();
    const province = fortified.state.provinces.d;
    if (!province) throw new Error("missing province");
    province.forts = 5;
    const openOrg = attackPoland(open, 4).state.divisions["pol-front"]?.organization ?? 0;
    const fortOrg = attackPoland(fortified, 4).state.divisions["pol-front"]?.organization ?? 0;
    expect(fortOrg).toBeGreaterThan(openOrg);
  });

  it("snow reduces the attacker's damage", () => {
    const september = germany();
    const winter = germany();
    const septemberDefender = september.state.divisions["pol-front"];
    const winterDefender = winter.state.divisions["pol-front"];
    if (!septemberDefender || !winterDefender) throw new Error("missing defender");
    septemberDefender.entrenchment = 20;
    winterDefender.entrenchment = 20;
    winter.state.date.month = 1;
    const clearOrg = attackPoland(september, 4).state.divisions["pol-front"]?.organization ?? 0;
    const snowOrg = attackPoland(winter, 6).state.divisions["pol-front"]?.organization ?? 0;
    expect(snowOrg).toBeGreaterThan(clearOrg);
  });

  it("makes an encircled defender lose organization faster and shatter with no way out", () => {
    const linked = attackPoland(germany(), 4);
    const pocket = germany();
    const poland = pocket.scenario.countries.find((country) => country.id === "poland");
    if (!poland) throw new Error("missing poland");
    poland.capitalProvinceId = "f";
    const cut = attackPoland(pocket, 4);
    const linkedOrg = linked.state.divisions["pol-front"]?.organization ?? 0;
    const cutOrg = cut.state.divisions["pol-front"]?.organization ?? 0;
    expect(cutOrg).toBeLessThan(linkedOrg);

    const doomed = germany();
    const capital = doomed.scenario.countries.find((country) => country.id === "poland");
    const division = doomed.state.divisions["pol-front"];
    if (!capital || !division) throw new Error("missing defender");
    capital.capitalProvinceId = "f";
    division.organization = 1;
    const ended = attackPoland(doomed, 4);
    expect(ended.state.divisions["pol-front"]).toBeUndefined();
    expect(ended.state.log.some((line) => line.includes("shattered"))).toBe(true);
  });

  it("takes longer to march in January snow than in September", () => {
    const autumn = germany();
    const winter = germany();
    winter.state.date.month = 1;
    const clear = findPath(autumn, "a", "c", "germany");
    const snow = findPath(winter, "a", "c", "germany");
    expect(clear.ok && snow.ok).toBe(true);
    if (clear.ok && snow.ok) expect(snow.estimatedHours).toBeGreaterThan(clear.estimatedHours);
  });

  it("completes a fort on a controlled province", () => {
    let campaign = germany();
    campaign.scenario.events = [];
    campaign = issueCommand(campaign, { type: "resume" }).campaign;
    const queued = issueCommand(campaign, {
      type: "queueConstruction",
      kind: "fort",
      provinceId: "a",
    });
    expect(queued.result.ok).toBe(true);
    const built = advanceSimulation(queued.campaign, 24 * 40).campaign;
    expect(built.state.provinces.a?.forts).toBe(1);
    expect(snapshot(built).industry.projects.some((project) => project.label.startsWith("Forts"))).toBe(false);
  });
});

describe("fronts", () => {
  it("keeps a drawn line at the player's coordinates and spreads corps along it", () => {
    let campaign = germany();
    const opened = issueCommand(campaign, { type: "createFront", enemyId: "poland" });
    expect(opened.result.ok).toBe(true);
    campaign = opened.campaign;
    const line = [
      { lon: 0.05, lat: 52.1 },
      { lon: 0.2, lat: 52.05 },
      { lon: 0.35, lat: 52 },
    ];
    campaign = issueCommand(campaign, {
      type: "drawFront",
      frontId: "germany-front-poland",
      points: line,
    }).campaign;
    expect(campaign.state.fronts[0]?.line).toEqual(line);

    campaign = issueCommand(campaign, {
      type: "assignFront",
      frontId: "germany-front-poland",
      divisionId: "ger-home",
    }).campaign;
    campaign = issueCommand(campaign, {
      type: "assignFront",
      frontId: "germany-front-poland",
      divisionId: "ger-far",
    }).campaign;
    const homeDest = campaign.state.divisions["ger-home"]?.order?.waypoints.at(-1);
    const farDest = campaign.state.divisions["ger-far"]?.order?.waypoints.at(-1);
    expect(homeDest).toBeTruthy();
    expect(farDest).toBeTruthy();
    if (homeDest && farDest) expect(geoDistance(homeDest, farDest)).toBeGreaterThan(0.05);
    expect(homeDest).not.toEqual(farDest);

    const shifted = [
      { lon: 0.1, lat: 51.95 },
      { lon: 0.3, lat: 51.9 },
    ];
    campaign = issueCommand(campaign, {
      type: "drawFront",
      frontId: "germany-front-poland",
      points: shifted,
    }).campaign;
    expect(campaign.state.fronts[0]?.line).toEqual(shifted);
    const nextHome = campaign.state.divisions["ger-home"]?.order?.waypoints.at(-1);
    expect(nextHome).toBeTruthy();
    if (homeDest && nextHome) expect(geoDistance(homeDest, nextHome)).toBeGreaterThan(0.04);
  });

  it("advances assigned corps to different points on a coordinate arrow", () => {
    let campaign = germany();
    campaign = issueCommand(campaign, { type: "createFront", enemyId: "poland" }).campaign;
    campaign = issueCommand(campaign, {
      type: "drawFront",
      frontId: "germany-front-poland",
      points: [
        { lon: 0, lat: 52 },
        { lon: 0.2, lat: 52 },
      ],
    }).campaign;
    campaign = issueCommand(campaign, {
      type: "assignFront",
      frontId: "germany-front-poland",
      divisionId: "ger-home",
    }).campaign;
    const drawn = issueCommand(campaign, {
      type: "drawOffensive",
      frontId: "germany-front-poland",
      points: [
        { lon: 0.35, lat: 52 },
        { lon: 0.55, lat: 52 },
      ],
    });
    expect(drawn.result.ok).toBe(true);
    expect(drawn.campaign.state.fronts[0]?.offensive?.[1]).toEqual({ lon: 0.55, lat: 52 });
    expect(drawn.campaign.state.fronts[0]?.executing).toBe(false);

    const early = issueCommand(campaign, { type: "executeFront", frontId: "germany-front-poland" });
    expect(early.result.ok).toBe(false);

    const attack = issueCommand(drawn.campaign, { type: "executeFront", frontId: "germany-front-poland" });
    expect(attack.result.ok).toBe(true);
    const dest = attack.campaign.state.divisions["ger-home"]?.order?.waypoints.at(-1);
    expect(dest).toEqual({ lon: 0.45, lat: 52 });
    expect(attack.campaign.state.divisions["ger-home"]?.order?.hops.at(-1)).toBe("d");

    const standing = attack.campaign;
    const division = standing.state.divisions["ger-home"];
    if (!division || !dest) throw new Error("missing the attack step");
    division.position = { ...dest };
    division.provinceId = "d";
    division.order = null;
    const delta = standing.state.provinces.d;
    if (delta) delta.controllerId = "germany";
    maintainFronts(standing);
    expect(standing.state.fronts[0]?.executing).toBe(false);

    const neutral = issueCommand(germany(), { type: "createFront", enemyId: "slovakia" });
    expect(neutral.result.ok).toBe(false);
  });

  it("routes a distant corps through friendly land instead of a side invasion", () => {
    const scenario = fixtureScenario(23);
    const charlie = scenario.provinces.find((province) => province.id === "c");
    const echo = scenario.provinces.find((province) => province.id === "e");
    if (!charlie || !echo) throw new Error("fixture is missing a province");
    const golf: ProvinceDefinition = {
      ...charlie,
      id: "g",
      name: "Golf",
      neighbors: ["c", "h"],
      center: { lon: 2, lat: 52.6 },
      impassable: false,
    };
    const hotel: ProvinceDefinition = {
      ...echo,
      id: "h",
      name: "Hotel",
      countryId: "poland",
      neighbors: ["g"],
      center: { lon: 2.2, lat: 52.6 },
      impassable: false,
      victoryPointValue: 0,
    };
    charlie.neighbors = [...charlie.neighbors, "g"];
    scenario.provinces.push(golf, hotel);
    let campaign = createCampaign({ scenario, playerCountryId: "germany", seed: 7 });
    campaign = issueCommand(campaign, { type: "createFront", enemyId: "poland" }).campaign;
    campaign = issueCommand(campaign, {
      type: "assignFront",
      frontId: "germany-front-poland",
      divisionId: "ger-far",
    }).campaign;
    campaign = issueCommand(campaign, {
      type: "drawOffensive",
      frontId: "germany-front-poland",
      points: [
        { lon: 0.35, lat: 52 },
        { lon: 0.5, lat: 52 },
      ],
    }).campaign;
    const attack = issueCommand(campaign, { type: "executeFront", frontId: "germany-front-poland" });
    expect(attack.result.ok).toBe(true);
    const hops = attack.campaign.state.divisions["ger-far"]?.order?.hops ?? [];
    expect(hops.at(-1)).toBe("d");
    expect(hops).not.toContain("h");
  });

  it("accepts a march to a point that is not a province center", () => {
    const campaign = germany();
    const dest = { lon: 0.12, lat: 52.04 };
    const moved = issueCommand(campaign, {
      type: "moveDivision",
      divisionId: "ger-home",
      ...dest,
    });
    expect(moved.result.ok).toBe(true);
    expect(moved.campaign.state.divisions["ger-home"]?.order?.waypoints.at(-1)).toEqual(dest);
    expect(moved.campaign.state.divisions["ger-home"]?.order?.hops.at(-1)).not.toBeUndefined();
  });
});
