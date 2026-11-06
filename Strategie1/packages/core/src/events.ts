import { TECHNOLOGIES, clamp, round3, type Effect } from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { sameDate } from "./clock.ts";
import { rngNext } from "./rng.ts";

export function pickWeighted<T extends { weight: number }>(choices: readonly T[], roll: number): T {
  const first = choices[0];
  if (!first) throw new Error("Event has no choices");
  const total = choices.reduce((sum, choice) => sum + choice.weight, 0);
  if (total <= 0) return first;
  let cursor = roll * total;
  for (const choice of choices) {
    cursor -= choice.weight;
    if (cursor < 0) return choice;
  }
  return choices[choices.length - 1] ?? first;
}

export function applyEffects(campaign: Campaign, countryId: string, effects: readonly Effect[]): void {
  const country = campaign.state.countries[countryId];
  if (!country) throw new Error(`Unknown country ${countryId}`);
  for (const effect of effects) {
    if (effect.type === "addManpower") {
      country.manpower = Math.max(0, country.manpower + effect.amount);
    } else if (effect.type === "addWarSupport") {
      country.warSupport = round3(clamp(country.warSupport + effect.amount, 0, 100));
    } else if (effect.type === "addStability") {
      country.stability = round3(clamp(country.stability + effect.amount, 0, 100));
    } else if (effect.type === "addEquipment") {
      country.stockpile.infantry_equipment = Math.max(
        0,
        country.stockpile.infantry_equipment + effect.amount,
      );
    } else if (effect.type === "addCivilianFactories") {
      country.civilianFactories = Math.max(0, country.civilianFactories + effect.amount);
    } else if (effect.type === "addMilitaryFactories") {
      country.militaryFactories = Math.max(0, country.militaryFactories + effect.amount);
    } else if (effect.type === "unlockTech") {
      if (!country.researched.includes(effect.techId)) {
        country.researched.push(effect.techId);
        country.researched.sort();
      }
      country.research = country.research.filter((item) => item.techId !== effect.techId);
      const owner = campaign.countries.get(countryId)?.name ?? countryId;
      campaign.state.log.push(`${owner} gained ${TECHNOLOGIES[effect.techId].name}.`);
    }
  }
}

export function checkEvents(campaign: Campaign, log: string[]): void {
  for (const event of campaign.scenario.events) {
    if (campaign.state.firedEvents.includes(event.id)) continue;
    if (campaign.state.pendingEvent?.eventId === event.id) continue;
    if (!sameDate(campaign.state.date, event.trigger)) continue;
    if (event.countryId === campaign.state.playerCountryId) {
      if (campaign.state.pendingEvent) continue;
      campaign.state.firedEvents.push(event.id);
      campaign.state.pendingEvent = { eventId: event.id, countryId: event.countryId };
      campaign.state.paused = true;
      log.push(`${event.title} requires a decision.`);
      continue;
    }
    campaign.state.firedEvents.push(event.id);
    const rolled = rngNext(campaign.state.rngState);
    campaign.state.rngState = rolled.seed;
    const choice = pickWeighted(event.choices, rolled.value);
    applyEffects(campaign, event.countryId, choice.effects);
    const country = campaign.countries.get(event.countryId)?.name ?? event.countryId;
    log.push(`${country} decided: ${choice.label}.`);
  }
}
