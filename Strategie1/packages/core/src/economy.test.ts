import type { ScenarioDefinition } from "@meridian/shared";
import { describe, expect, it } from "vitest";
import { advanceSimulation, createCampaign, issueCommand, type Campaign } from "./index.ts";
import { fixtureScenario } from "./test-fixture.ts";

function economyScenario(): ScenarioDefinition {
  const scenario = fixtureScenario();
  scenario.events = [];
  const germany = scenario.countries[0];
  const alpha = scenario.provinces.find((province) => province.id === "a");
  const foxtrot = scenario.provinces.find((province) => province.id === "f");
  const delta = scenario.provinces.find((province) => province.id === "d");
  if (!germany || !alpha || !foxtrot || !delta) throw new Error("fixture is missing economy provinces");
  germany.stockpile = { ...germany.stockpile, steel: 100 };
  alpha.resources = [{ resource: "steel", amount: 6 }];
  foxtrot.resources = [{ resource: "oil", amount: 40 }];
  delta.resources = [{ resource: "oil", amount: 8 }];
  return scenario;
}

function run(hours: number, prepare?: (campaign: Campaign) => Campaign): Campaign {
  let campaign = createCampaign({ scenario: economyScenario(), playerCountryId: "germany" });
  if (prepare) campaign = prepare(campaign);
  campaign = issueCommand(campaign, { type: "resume" }).campaign;
  return advanceSimulation(campaign, hours).campaign;
}

describe("economy", () => {
  it("extracts controlled deposits and delivers equipment into the stockpile", () => {
    const campaign = run(24);
    const germany = campaign.state.countries.germany;
    const division = campaign.state.divisions["ger-home"];
    expect(germany?.stockpile.steel).toBe(86);
    expect(germany?.stockpile.infantry_equipment).toBe(60);
    expect(campaign.state.production.find((line) => line.countryId === "germany")?.efficiency).toBe(0.52);
    expect(division?.equipment).toBe(880);
  });

  it("cuts output and holds efficiency when steel is short", () => {
    const scenario = economyScenario();
    const germany = scenario.countries[0];
    const alpha = scenario.provinces.find((province) => province.id === "a");
    if (!germany || !alpha) throw new Error("fixture is missing germany");
    germany.stockpile = { ...germany.stockpile, steel: 10 };
    alpha.resources = [];
    let campaign = createCampaign({ scenario, playerCountryId: "germany" });
    campaign = issueCommand(campaign, { type: "resume" }).campaign;
    campaign = advanceSimulation(campaign, 24).campaign;
    expect(campaign.state.countries.germany?.stockpile.steel).toBe(0);
    expect(campaign.state.countries.germany?.stockpile.infantry_equipment).toBe(55);
    expect(campaign.state.production.find((line) => line.countryId === "germany")?.efficiency).toBe(0.5);
  });

  it("gives a captured deposit to the new controller", () => {
    const campaign = run(24, (current) => {
      const alpha = current.state.provinces.a;
      if (!alpha) throw new Error("missing alpha");
      alpha.controllerId = "poland";
      return current;
    });
    expect(campaign.state.countries.germany?.stockpile.steel).toBe(80);
    expect(campaign.state.countries.poland?.stockpile.steel).toBe(0);
  });

  it("imports up to the seller reserve and the buyer's transport", () => {
    let campaign = createCampaign({ scenario: economyScenario(), playerCountryId: "germany" });
    const opened = issueCommand(campaign, {
      type: "openTrade",
      partnerId: "slovakia",
      resource: "oil",
      factories: 4,
    });
    expect(opened.result.ok).toBe(true);
    campaign = issueCommand(opened.campaign, { type: "resume" }).campaign;
    campaign = advanceSimulation(campaign, 24).campaign;
    expect(campaign.state.countries.germany?.stockpile.oil).toBe(33);
    expect(campaign.state.countries.slovakia?.stockpile.oil).toBe(12);
    const wartime = issueCommand(campaign, {
      type: "openTrade",
      partnerId: "poland",
      resource: "oil",
      factories: 1,
    });
    expect(wartime.result.ok).toBe(false);
    expect(wartime.result.reason).toMatch(/wartime/i);
  });

  it("keeps traded civilian factories off the construction queue", () => {
    let campaign = createCampaign({ scenario: economyScenario(), playerCountryId: "germany" });
    campaign = issueCommand(campaign, {
      type: "openTrade",
      partnerId: "slovakia",
      resource: "oil",
      factories: 2,
    }).campaign;
    campaign = issueCommand(campaign, {
      type: "queueConstruction",
      kind: "infrastructure",
      provinceId: "b",
    }).campaign;
    campaign = issueCommand(campaign, { type: "resume" }).campaign;
    campaign = advanceSimulation(campaign, 24).campaign;
    expect(campaign.state.construction[0]?.progress).toBe(2);
  });

  it("raises infrastructure and the supply that depends on it", () => {
    const campaign = run(24 * 20, (current) => {
      const charlie = current.state.provinces.c;
      if (!charlie) throw new Error("missing charlie");
      charlie.infrastructure = 5;
      return issueCommand(current, {
        type: "queueConstruction",
        kind: "infrastructure",
        provinceId: "b",
      }).campaign;
    });
    expect(campaign.state.provinces.b?.infrastructure).toBe(2);
    expect(campaign.state.construction).toHaveLength(0);
    expect(campaign.state.countrySupply.germany?.c?.ratio).toBe(1);
    expect(campaign.state.log.some((line) => line.includes("Bravo"))).toBe(true);
  });

  it("refuses construction outside friendly control", () => {
    const campaign = createCampaign({ scenario: economyScenario(), playerCountryId: "germany" });
    const result = issueCommand(campaign, {
      type: "queueConstruction",
      kind: "infrastructure",
      provinceId: "d",
    }).result;
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/control/i);
  });

  it("repeats production and trade from the same commands", () => {
    const once = () => {
      let campaign = createCampaign({ scenario: economyScenario(), playerCountryId: "germany", seed: 3 });
      campaign = issueCommand(campaign, {
        type: "openTrade",
        partnerId: "slovakia",
        resource: "oil",
        factories: 1,
      }).campaign;
      campaign = issueCommand(campaign, {
        type: "queueConstruction",
        kind: "military_factory",
        provinceId: null,
      }).campaign;
      campaign = issueCommand(campaign, { type: "resume" }).campaign;
      return advanceSimulation(campaign, 48).campaign.state;
    };
    expect(JSON.stringify(once())).toBe(JSON.stringify(once()));
  });
});
