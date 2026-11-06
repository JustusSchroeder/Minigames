import { describe, expect, it } from "vitest";
import { deriveTemplate, round3 } from "@meridian/shared";
import { issueCommand, snapshot } from "./index.ts";
import { fixtureCampaign } from "./test-fixture.ts";

describe("division templates", () => {
  it("derives combat statistics from the battalions", () => {
    const stats = deriveTemplate({
      line: [
        { battalion: "hadrosaur", count: 8 },
        { battalion: "ceratops", count: 4 },
      ],
      support: [{ battalion: "stegosaur", count: 1 }],
    });
    expect(stats).toMatchObject({
      combatWidth: 28,
      manpower: 10300,
      equipment: 920,
      softAttack: 44.4,
      hardAttack: 3.8,
      defense: 37,
      breakthrough: 10.8,
      organization: 52,
      supplyUse: 17,
      productionSteel: 1840,
      lineCount: 12,
      supportCount: 1,
    });
  });

  it("changes a field division when its template changes, scaled by what it already has", () => {
    const campaign = fixtureCampaign("germany");
    const before = snapshot(campaign);
    const template = before.templates.find((item) => item.id === "infantry-division");
    const division = before.divisions.find((item) => item.id === "ger-home");
    expect(template?.softAttack).toBe(44);
    expect(division?.readiness).toBe(1);

    const added = issueCommand(campaign, {
      type: "setBattalion",
      templateId: "infantry-division",
      role: "line",
      battalion: "tyrannosaur",
      count: 1,
    });
    expect(added.result.ok).toBe(true);
    const after = snapshot(added.campaign);
    const nextTemplate = after.templates.find((item) => item.id === "infantry-division");
    const nextDivision = after.divisions.find((item) => item.id === "ger-home");
    expect(nextTemplate?.softAttack).toBe(48);
    expect(nextDivision?.manpower).toBe(10000);
    expect(nextDivision?.equipment).toBe(880);
    expect(nextDivision?.readiness).toBeLessThan(1);
    expect(nextDivision?.organization).toBe(nextTemplate?.organization);
    expect(nextDivision?.organization).toBeLessThan(division?.organization ?? 0);
    const required = nextTemplate?.equipment ?? 1;
    const ready = Math.min(10000 / (nextTemplate?.manpower ?? 1), 880 / required);
    expect(nextDivision?.softAttack).toBe(round3((nextTemplate?.softAttack ?? 0) * ready));
  });

  it("refuses another country's template and an illegal battalion", () => {
    const campaign = fixtureCampaign("germany");
    const foreign = issueCommand(campaign, {
      type: "setBattalion",
      templateId: "polish-infantry",
      role: "line",
      battalion: "hadrosaur",
      count: 9,
    });
    expect(foreign.result.ok).toBe(false);
    expect(foreign.campaign.state.templates.find((item) => item.id === "polish-infantry")?.line[0]?.count).toBe(6);

    const support = issueCommand(campaign, {
      type: "setBattalion",
      templateId: "infantry-division",
      role: "line",
      battalion: "stegosaur",
      count: 1,
    });
    expect(support.result.ok).toBe(false);
    expect(support.result.reason).toMatch(/line/i);

    const crowded = issueCommand(campaign, {
      type: "setBattalion",
      templateId: "infantry-division",
      role: "line",
      battalion: "hadrosaur",
      count: 26,
    });
    expect(crowded.result.ok).toBe(false);
    expect(crowded.campaign.state.templates.find((item) => item.id === "infantry-division")?.line).toEqual([
      { battalion: "hadrosaur", count: 8 },
      { battalion: "ceratops", count: 4 },
    ]);
  });

  it("recruits only when manpower and equipment are both on hand", () => {
    const short = issueCommand(fixtureCampaign("germany"), {
      type: "recruitDivision",
      templateId: "infantry-division",
      provinceId: "a",
      name: "Extra Corps",
    });
    expect(short.result.ok).toBe(false);
    expect(short.result.reason).toMatch(/harness/i);
    expect(short.campaign.state.countries.germany?.manpower).toBe(100000);
    expect(short.campaign.state.countries.germany?.stockpile.infantry_equipment).toBe(50);
    expect(Object.values(short.campaign.state.divisions).some((division) => division.name === "Extra Corps")).toBe(false);

    let ready = fixtureCampaign("germany");
    const germany = ready.state.countries.germany;
    if (!germany) throw new Error("fixture is missing germany");
    germany.stockpile = { ...germany.stockpile, infantry_equipment: 2000 };
    const raised = issueCommand(ready, {
      type: "recruitDivision",
      templateId: "infantry-division",
      provinceId: "a",
      name: "Extra Corps",
    });
    expect(raised.result.ok).toBe(true);
    expect(raised.campaign.state.countries.germany?.manpower).toBe(90000);
    expect(raised.campaign.state.countries.germany?.stockpile.infantry_equipment).toBe(1120);
    const spawned = Object.values(raised.campaign.state.divisions).find((division) => division.name === "Extra Corps");
    expect(spawned).toMatchObject({
      provinceId: "a",
      manpower: 10000,
      equipment: 880,
      organization: 52,
      templateId: "infantry-division",
    });
    expect(raised.campaign.state.countrySupply.germany?.a?.demand).toBe(32);

    const abroad = issueCommand(raised.campaign, {
      type: "recruitDivision",
      templateId: "infantry-division",
      provinceId: "d",
      name: "Second Corps",
    });
    expect(abroad.result.ok).toBe(false);
    expect(abroad.campaign.state.countries.germany?.manpower).toBe(90000);
  });

  it("repeats recruitment from the same commands", () => {
    const run = () => {
      let campaign = fixtureCampaign("germany", 11);
      const country = campaign.state.countries.germany;
      if (!country) throw new Error("fixture is missing germany");
      country.stockpile = { ...country.stockpile, infantry_equipment: 5000 };
      campaign = issueCommand(campaign, {
        type: "createTemplate",
        name: "Tyrannosaur pack",
      }).campaign;
      campaign = issueCommand(campaign, {
        type: "setBattalion",
        templateId: "germany-template-1",
        role: "line",
        battalion: "tyrannosaur",
        count: 4,
      }).campaign;
      campaign = issueCommand(campaign, {
        type: "recruitDivision",
        templateId: "germany-template-1",
        provinceId: "a",
        name: "Tyrannosaur Corps",
      }).campaign;
      return campaign.state;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
    const state = run();
    expect(state.divisions["germany-raised-2"]).toMatchObject({
      name: "Tyrannosaur Corps",
      manpower: 2000,
      equipment: 560,
    });
  });

  it("gives each species its own combat profile", () => {
    const hadrosaur = deriveTemplate({ line: [{ battalion: "hadrosaur", count: 1 }], support: [] });
    const raptor = deriveTemplate({ line: [{ battalion: "raptor", count: 1 }], support: [] });
    const ceratops = deriveTemplate({ line: [{ battalion: "ceratops", count: 1 }], support: [] });
    const tyrannosaur = deriveTemplate({ line: [{ battalion: "tyrannosaur", count: 1 }], support: [] });
    const ankylosaur = deriveTemplate({ line: [{ battalion: "ankylosaur", count: 1 }], support: [] });
    expect(raptor.breakthrough).toBeGreaterThan(hadrosaur.breakthrough);
    expect(raptor.defense).toBeLessThan(hadrosaur.defense);
    expect(ceratops.softAttack).toBeGreaterThan(hadrosaur.softAttack);
    expect(ceratops.combatWidth).toBeGreaterThan(hadrosaur.combatWidth);
    expect(tyrannosaur.hardAttack).toBeGreaterThan(hadrosaur.hardAttack);
    expect(tyrannosaur.armor).toBeGreaterThan(ankylosaur.armor);
    expect(ankylosaur.defense).toBeGreaterThan(tyrannosaur.defense);
  });
});
