import { createCampaign, advanceSimulation, issueCommand, snapshot, validateScenario } from "@meridian/core";
import { september1939 } from "@meridian/content";
import places from "../packages/map-data/generated/places.json" with { type: "json" };
import { describe, expect, it } from "vitest";

describe("Late Cretaceous scenario", () => {
  it("is internally consistent", () => {
    expect(validateScenario(september1939)).toEqual([]);
    const germany = createCampaign({ scenario: september1939, playerCountryId: "germany" });
    const poland = createCampaign({ scenario: september1939, playerCountryId: "poland" });
    expect(germany.state.date).toEqual({ year: 68, month: 9, day: 1, hour: 4 });
    expect(germany.scenario.countries.find((country) => country.id === "germany")?.name).toBe("Rhenish Massif");
    expect(poland.scenario.countries.find((country) => country.id === "poland")?.name).toBe("Holy Cross Island");
    expect(poland.state.provinces[places.warsaw]?.ownerId).toBe("poland");
    expect(germany.state.countries.slovakia).toBeTruthy();
    expect(germany.scenario.provinces.length).toBeGreaterThan(800);
  });

  it("shows a real supply deficit on the Galician detachment", () => {
    const campaign = createCampaign({ scenario: september1939, playerCountryId: "poland" });
    const east = campaign.state.countrySupply.poland?.[places.galicia];
    const warsaw = campaign.state.countrySupply.poland?.[places.warsaw];
    expect(east?.connected).toBe(true);
    expect(east?.ratio).toBeLessThan(1);
    expect(warsaw?.ratio).toBe(1);
  });

  it("starts Germany with beast handling already known", () => {
    const campaign = createCampaign({ scenario: september1939, playerCountryId: "germany" });
    const view = snapshot(campaign);
    expect(campaign.state.countries.germany?.researched).toContain("infantry_weapons");
    expect(view.research.modifiers.softAttack).toBe(0.1);
    expect(view.research.focuses.some((item) => item.id === "industry_drive")).toBe(true);
  });

  it("starts Germany on a railway network with a capital hub and a port", () => {
    const campaign = createCampaign({ scenario: september1939, playerCountryId: "germany" });
    const view = snapshot(campaign);
    expect(view.supplyHubIds).toContain(places.berlin);
    expect(campaign.state.provinces[places.berlin]?.rail).toBeGreaterThan(0);
    expect(view.supplyRoutes.some((link) => link.kind === "rail")).toBe(true);
    expect(
      Object.values(campaign.state.provinces).some(
        (province) => province.ownerId === "germany" && province.port > 0,
      ),
    ).toBe(true);
  });

  it("spreads assigned corps to different points on a drawn frontline", () => {
    let campaign = createCampaign({ scenario: september1939, playerCountryId: "germany" });
    campaign = issueCommand(campaign, { type: "createFront", enemyId: "poland" }).campaign;
    campaign = issueCommand(campaign, {
      type: "drawFront",
      frontId: "germany-front-poland",
      points: [
        { lon: 14.2, lat: 53.4 },
        { lon: 14.5, lat: 52.4 },
        { lon: 14.8, lat: 51.2 },
      ],
    }).campaign;
    expect(campaign.state.fronts[0]?.line).toHaveLength(3);
    campaign = issueCommand(campaign, {
      type: "assignFront",
      frontId: "germany-front-poland",
      divisionId: "ger-prussia",
    }).campaign;
    campaign = issueCommand(campaign, {
      type: "assignFront",
      frontId: "germany-front-poland",
      divisionId: "ger-silesia",
    }).campaign;
    const prussia = campaign.state.divisions["ger-prussia"]?.order?.waypoints.at(-1);
    const silesia = campaign.state.divisions["ger-silesia"]?.order?.waypoints.at(-1);
    expect(prussia).toBeTruthy();
    expect(silesia).toBeTruthy();
    expect(prussia).not.toEqual(silesia);
    const brandenburg = campaign.provinces.get(places.gerPrussia)?.center;
    expect(prussia).not.toEqual(brandenburg);
  });

  it("accepts a march to a point that is not a province center", () => {
    const campaign = createCampaign({ scenario: september1939, playerCountryId: "germany" });
    const center = campaign.provinces.get(places.gerPrussia)?.center;
    const dest = { lon: (center?.lon ?? 13) + 0.18, lat: (center?.lat ?? 52.8) - 0.12 };
    const moved = issueCommand(campaign, { type: "moveDivision", divisionId: "ger-prussia", ...dest });
    expect(moved.result.ok).toBe(true);
    expect(moved.campaign.state.divisions["ger-prussia"]?.order?.waypoints.at(-1)).toEqual(dest);
  });

  it("accepts an attack from Silesia into Częstochowa", () => {
    const campaign = createCampaign({ scenario: september1939, playerCountryId: "germany" });
    const dest = campaign.provinces.get(places.attackTo)?.center;
    const result = issueCommand(campaign, {
      type: "moveDivision",
      divisionId: "ger-silesia",
      lon: dest?.lon ?? 0,
      lat: dest?.lat ?? 0,
    }).result;
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/Attack order accepted/);
  });

  it("lets Germany's cabinet resolve the reserve call", () => {
    let campaign = createCampaign({ scenario: september1939, playerCountryId: "germany", seed: 5 });
    campaign = issueCommand(campaign, { type: "resume" }).campaign;
    campaign = advanceSimulation(campaign, 20).campaign;
    expect(campaign.state.pendingEvent?.eventId).toBe("ger-reserve-call");
    expect(campaign.state.paused).toBe(true);
    const before = campaign.state.countries.germany?.manpower ?? 0;
    campaign = issueCommand(campaign, {
      type: "resolveEvent",
      eventId: "ger-reserve-call",
      choiceId: "levy",
    }).campaign;
    expect(campaign.state.countries.germany?.manpower).toBe(before + 15000);
  });
});
