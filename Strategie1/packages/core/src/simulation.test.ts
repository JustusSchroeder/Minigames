import { describe, expect, it } from "vitest";
import {
  advanceSimulation,
  createSave,
  findPath,
  issueCommand,
  loadSave,
  SaveValidationError,
} from "./index.ts";
import { pickWeighted } from "./events.ts";
import { fixtureCampaign, fixtureScenario, pointOf } from "./test-fixture.ts";

describe("simulation", () => {
  it("pauses the clock", () => {
    const campaign = fixtureCampaign();
    expect(campaign.state.paused).toBe(true);
    const advanced = advanceSimulation(campaign, 5).campaign;
    expect(advanced.state.tick).toBe(0);
    expect(advanced.state.date.hour).toBe(0);
  });

  it("repeats the same state from the same seed, orders, and hours", () => {
    const run = () => {
      let campaign = fixtureCampaign("germany", 11, 23);
      campaign = issueCommand(campaign, { type: "resume" }).campaign;
      campaign = issueCommand(campaign, {
        type: "moveDivision",
        divisionId: "ger-home",
        ...pointOf(campaign, "d"),
      }).campaign;
      return advanceSimulation(campaign, 12).campaign.state;
    };
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it("rejects a march through hostile territory and accepts an adjacent attack", () => {
    const campaign = fixtureCampaign("germany");
    const blocked = findPath(campaign, "a", "e", "germany");
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/interior/i);
    const neutral = findPath(campaign, "a", "f", "germany");
    expect(neutral.ok).toBe(false);
    if (!neutral.ok) expect(neutral.reason).toMatch(/military access/i);
    const attack = issueCommand(campaign, {
      type: "moveDivision",
      divisionId: "ger-home",
      ...pointOf(campaign, "d"),
    });
    expect(attack.result.ok).toBe(true);
    expect(attack.result.summary).toMatch(/Attack order accepted/);
    expect(attack.result.estimatedHours).toBeGreaterThan(0);
    const impassable = findPath(campaign, "a", "blocked", "germany");
    expect(impassable.ok).toBe(false);
  });

  it("retreats a broken defender and transfers control without changing the owner", () => {
    let campaign = fixtureCampaign("germany", 7, 23);
    campaign = issueCommand(campaign, { type: "resume" }).campaign;
    campaign = issueCommand(campaign, {
      type: "moveDivision",
      divisionId: "ger-home",
      ...pointOf(campaign, "d"),
    }).campaign;
    campaign = advanceSimulation(campaign, 10).campaign;
    const province = campaign.state.provinces.d;
    expect(province?.controllerId).toBe("germany");
    expect(province?.ownerId).toBe("poland");
    const defender = campaign.state.divisions["pol-front"];
    expect(defender?.provinceId).not.toBe("d");
    expect(campaign.state.divisions["ger-home"]?.provinceId).toBe("d");
    expect(defender?.organization).toBeGreaterThan(0);
  });

  it("starves a division behind a low-infrastructure bottleneck", () => {
    const campaign = fixtureCampaign();
    const far = campaign.state.countrySupply.germany?.c;
    const home = campaign.state.countrySupply.germany?.a;
    expect(far?.connected).toBe(true);
    expect(far?.ratio).toBeLessThan(1);
    expect(home?.ratio).toBe(1);
  });

  it("applies the weighted event and keeps the choice deterministic", () => {
    expect(pickWeighted([{ id: "a", weight: 70 }, { id: "b", weight: 30 }], 0.1).id).toBe("a");
    expect(pickWeighted([{ id: "a", weight: 70 }, { id: "b", weight: 30 }], 0.9).id).toBe("b");

    let watched = fixtureCampaign("poland", 3);
    watched = issueCommand(watched, { type: "resume" }).campaign;
    watched = advanceSimulation(watched, 2).campaign;
    expect(watched.state.firedEvents).toContain("levy");
    expect(watched.state.countries.germany?.manpower).toBe(115000);

    let deciding = fixtureCampaign("germany", 3);
    deciding = issueCommand(deciding, { type: "resume" }).campaign;
    deciding = advanceSimulation(deciding, 2).campaign;
    expect(deciding.state.paused).toBe(true);
    expect(deciding.state.pendingEvent?.eventId).toBe("levy");
    expect(deciding.state.countries.germany?.manpower).toBe(100000);
    deciding = issueCommand(deciding, {
      type: "resolveEvent",
      eventId: "levy",
      choiceId: "levy",
    }).campaign;
    expect(deciding.state.countries.germany?.manpower).toBe(115000);
    expect(deciding.state.pendingEvent).toBeNull();
  });

  it("round-trips a save and rejects corrupted files", () => {
    const campaign = fixtureCampaign("germany", 4);
    const moved = issueCommand(campaign, {
      type: "moveDivision",
      divisionId: "ger-home",
      ...pointOf(campaign, "c"),
    }).campaign;
    const save = createSave(moved, "Test", "1939-09-01T00:00:00.000Z");
    const loaded = loadSave(JSON.parse(JSON.stringify(save)), fixtureScenario());
    expect(loaded.state).toEqual(moved.state);

    expect(() => loadSave({ version: 1, name: "bad", savedAt: "t", state: {} }, fixtureScenario())).toThrow(
      SaveValidationError,
    );
    const corrupt = structuredClone(save);
    const division = corrupt.state.divisions["ger-home"];
    if (!division) throw new Error("missing division");
    division.provinceId = "nope";
    expect(() => loadSave(corrupt, fixtureScenario())).toThrow(SaveValidationError);
  });
});
