import type { ProvinceDefinition } from "@meridian/shared";
import { describe, expect, it } from "vitest";
import { createCampaign, issueCommand, snapshot } from "./index.ts";
import { recomputeSupply, supplyLinks } from "./supply.ts";
import type { Campaign } from "./campaign.ts";
import { fixtureCampaign, fixtureScenario } from "./test-fixture.ts";

function withSpur(): Campaign {
  const scenario = fixtureScenario(23);
  const charlie = scenario.provinces.find((province) => province.id === "c");
  if (!charlie) throw new Error("fixture is missing Charlie");
  const golf: ProvinceDefinition = {
    ...charlie,
    id: "g",
    name: "Golf",
    neighbors: ["c"],
    infrastructureLevel: 5,
    strategicTags: [],
    impassable: false,
  };
  charlie.neighbors = [...charlie.neighbors, "g"];
  scenario.provinces.push(golf);
  return createCampaign({ scenario, playerCountryId: "germany", seed: 7 });
}

describe("logistics", () => {
  it("lets a railway beat the weak road into a far province", () => {
    const campaign = fixtureCampaign("germany", 7, 23);
    expect(campaign.state.countrySupply.germany?.c?.ratio).toBeLessThan(1);
    const bravo = campaign.state.provinces.b;
    const charlie = campaign.state.provinces.c;
    if (!bravo || !charlie) throw new Error("missing province");
    bravo.rail = 2;
    charlie.rail = 2;
    recomputeSupply(campaign);
    expect(campaign.state.countrySupply.germany?.c?.ratio).toBe(1);
    expect(supplyLinks(campaign, "germany").some((link) => link.to === "c" && link.kind === "rail")).toBe(true);
  });

  it("extends truck range from a new hub and refuses an inland port", () => {
    const campaign = withSpur();
    recomputeSupply(campaign);
    expect(campaign.state.countrySupply.germany?.g?.connected).toBeFalsy();
    const charlie = campaign.state.provinces.c;
    if (!charlie) throw new Error("missing charlie");
    charlie.supplyHub = true;
    recomputeSupply(campaign);
    expect(campaign.state.countrySupply.germany?.g?.connected).toBe(true);

    const inland = issueCommand(campaign, { type: "queueConstruction", kind: "port", provinceId: "b" });
    expect(inland.result.ok).toBe(false);
    expect(inland.result.reason).toMatch(/coast/i);
  });

  it("carries supply across a sea lane when the land route is gone", () => {
    const campaign = withSpur();
    const charlie = campaign.provinces.get("c");
    const golf = campaign.provinces.get("g");
    const alpha = campaign.provinces.get("a");
    if (!charlie || !golf || !alpha) throw new Error("missing province");
    charlie.neighbors = charlie.neighbors.filter((id) => id !== "g");
    golf.neighbors = [];
    recomputeSupply(campaign);
    expect(campaign.state.countrySupply.germany?.g?.connected).toBeFalsy();
    alpha.strategicTags = [...alpha.strategicTags, "seaport"];
    golf.strategicTags = ["seaport"];
    const from = campaign.state.provinces.a;
    const to = campaign.state.provinces.g;
    if (!from || !to) throw new Error("missing state");
    from.port = 2;
    to.port = 2;
    recomputeSupply(campaign);
    expect(campaign.state.countrySupply.germany?.g?.connected).toBe(true);
    expect(supplyLinks(campaign, "germany").some((link) => link.to === "g" && link.kind === "sea")).toBe(true);
    const view = snapshot(campaign);
    expect(view.supplyHubIds).toContain("a");
    expect(view.supplyRoutes.some((link) => link.kind === "sea")).toBe(true);
  });
});
