import { describe, expect, it } from "vitest";
import { advanceSimulation, createCampaign, issueCommand } from "./index.ts";
import { fixtureCampaign, fixtureScenario, pointOf } from "./test-fixture.ts";

function germany() {
  const campaign = fixtureCampaign("germany", 7, 23);
  campaign.scenario.events = [];
  return campaign;
}

function shops() {
  const scenario = fixtureScenario(23);
  scenario.events = [];
  const country = scenario.countries[0];
  if (!country) throw new Error("missing germany");
  country.stockpile = { ...country.stockpile, steel: 100 };
  return createCampaign({ scenario, playerCountryId: "germany", seed: 7 });
}

describe("research", () => {
  it("raises factory output once machine tools are known", () => {
    const plain = shops();
    const boosted = shops();
    const country = boosted.state.countries.germany;
    if (!country) throw new Error("missing germany");
    country.researched = ["machine_tools"];
    const afterPlain = advanceSimulation(issueCommand(plain, { type: "resume" }).campaign, 24).campaign;
    const afterBoost = advanceSimulation(issueCommand(boosted, { type: "resume" }).campaign, 24).campaign;
    expect(afterBoost.state.countries.germany?.stockpile.infantry_equipment).toBeGreaterThan(
      afterPlain.state.countries.germany?.stockpile.infantry_equipment ?? 0,
    );
  });

  it("makes an armed attacker deal more organization loss", () => {
    const fresh = germany();
    const armed = germany();
    const country = armed.state.countries.germany;
    if (!country) throw new Error("missing germany");
    country.researched = ["infantry_weapons"];
    const fight = (campaign: ReturnType<typeof germany>) => {
      let next = issueCommand(campaign, { type: "resume" }).campaign;
      next = issueCommand(next, { type: "moveDivision", divisionId: "ger-home", ...pointOf(next, "d") }).campaign;
      return advanceSimulation(next, 4).campaign.state.divisions["pol-front"]?.organization ?? 0;
    };
    expect(fight(armed)).toBeLessThan(fight(fresh));
  });

  it("closes the other doctrine school", () => {
    const campaign = germany();
    const mobile = issueCommand(campaign, { type: "startResearch", techId: "mobile_warfare" });
    expect(mobile.result.ok).toBe(true);
    const other = issueCommand(mobile.campaign, { type: "startResearch", techId: "grand_battleplan" });
    expect(other.result.ok).toBe(false);
    expect(other.result.reason).toMatch(/school/i);
  });

  it("refuses a fourth project and a locked prerequisite", () => {
    let campaign = germany();
    for (const techId of ["construction_engineering", "field_artillery", "infantry_weapons"] as const) {
      const started = issueCommand(campaign, { type: "startResearch", techId });
      expect(started.result.ok).toBe(true);
      campaign = started.campaign;
    }
    const extra = issueCommand(campaign, { type: "startResearch", techId: "machine_tools" });
    expect(extra.result.ok).toBe(false);
    const locked = issueCommand(germany(), { type: "startResearch", techId: "support_weapons" });
    expect(locked.result.ok).toBe(false);
  });

  it("completes a focus and adds the civilian factories", () => {
    const scenario = fixtureScenario(23);
    scenario.events = [];
    scenario.focusTrees = [
      {
        countryId: "germany",
        nodes: [
          {
            id: "industry_drive",
            name: "Four-Year Industrial Drive",
            detail: "New plants.",
            days: 21,
            requires: [],
            effects: [{ type: "addCivilianFactories", amount: 2 }],
          },
          {
            id: "army_expansion",
            name: "Army Expansion",
            detail: "Rifles.",
            days: 21,
            requires: ["industry_drive"],
            effects: [{ type: "addMilitaryFactories", amount: 2 }],
          },
        ],
      },
    ];
    let campaign = createCampaign({ scenario, playerCountryId: "germany", seed: 7 });
    const early = issueCommand(campaign, { type: "startFocus", focusId: "army_expansion" });
    expect(early.result.ok).toBe(false);
    campaign = issueCommand(campaign, { type: "startFocus", focusId: "industry_drive" }).campaign;
    campaign = issueCommand(campaign, { type: "resume" }).campaign;
    campaign = advanceSimulation(campaign, 24 * 21).campaign;
    expect(campaign.state.countries.germany?.civilianFactories).toBe(6);
    expect(campaign.state.countries.germany?.completedFocuses).toContain("industry_drive");
  });

  it("lets a computer-controlled country fill its labs at midnight", () => {
    let campaign = fixtureCampaign("poland", 7, 23);
    campaign.scenario.events = [];
    campaign = issueCommand(campaign, { type: "resume" }).campaign;
    campaign = advanceSimulation(campaign, 24).campaign;
    expect(campaign.state.countries.germany?.research.map((item) => item.techId)).toEqual([
      "construction_engineering",
      "field_artillery",
      "infantry_weapons",
    ]);
  });
});
