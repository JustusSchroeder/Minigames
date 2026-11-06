import {
  TECHNOLOGIES,
  doctrineBranchOf,
  isTechId,
  modifiersFrom,
  type Command,
  type CommandResult,
  type CountryModifiers,
  type TechId,
} from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { applyEffects } from "./events.ts";

function refuse(summary: string, reason: string): CommandResult {
  return { ok: false, summary, reason };
}

export function countryModifiers(campaign: Campaign, countryId: string): CountryModifiers {
  return modifiersFrom(campaign.state.countries[countryId]?.researched ?? []);
}

export function treeFor(campaign: Campaign, countryId: string) {
  return campaign.scenario.focusTrees.find((tree) => tree.countryId === countryId);
}

function researchedSet(campaign: Campaign, countryId: string): Set<string> {
  return new Set(campaign.state.countries[countryId]?.researched ?? []);
}

function inProgress(campaign: Campaign, countryId: string): TechId[] {
  return (campaign.state.countries[countryId]?.research ?? []).map((item) => item.techId);
}

export function availableTech(campaign: Campaign, countryId: string, techId: TechId): string | null {
  const country = campaign.state.countries[countryId];
  const tech = TECHNOLOGIES[techId];
  if (!country) return "That country is not in the campaign.";
  if (country.researched.includes(techId)) return `${tech.name} is already known.`;
  if (country.research.some((item) => item.techId === techId)) return `${tech.name} is already being researched.`;
  const known = researchedSet(campaign, countryId);
  for (const need of tech.requires) {
    if (!known.has(need)) return `${tech.name} needs ${TECHNOLOGIES[need].name} first.`;
  }
  const branch = doctrineBranchOf([...country.researched, ...inProgress(campaign, countryId)]);
  if (tech.branch && branch && tech.branch !== branch) {
    return "That school is closed. A different doctrine is already in use.";
  }
  return null;
}

export function applyResearchCommand(campaign: Campaign, command: Command): CommandResult {
  const playerId = campaign.state.playerCountryId;
  const country = campaign.state.countries[playerId];
  const definition = campaign.scenario.countries.find((item) => item.id === playerId);
  if (!country || !definition) return refuse("Research refused.", "Your country is missing from the campaign.");

  if (command.type === "startResearch") {
    const blocked = availableTech(campaign, playerId, command.techId);
    if (blocked) return refuse("Research refused.", blocked);
    if (country.research.length >= definition.researchSlots) {
      return refuse("Research refused.", "Every research slot is already assigned.");
    }
    country.research.push({ techId: command.techId, progress: 0 });
    country.research.sort((left, right) => (left.techId < right.techId ? -1 : 1));
    return { ok: true, summary: `Researching ${TECHNOLOGIES[command.techId].name}.` };
  }

  if (command.type === "cancelResearch") {
    const before = country.research.length;
    country.research = country.research.filter((item) => item.techId !== command.techId);
    if (country.research.length === before) {
      return refuse("Research refused.", "That project is not in your labs.");
    }
    return { ok: true, summary: `Cancelled ${TECHNOLOGIES[command.techId].name}. Progress is lost.` };
  }

  if (command.type === "startFocus") {
    const tree = treeFor(campaign, playerId);
    const node = tree?.nodes.find((item) => item.id === command.focusId);
    if (!tree || !node) return refuse("Focus refused.", "That focus is not on your tree.");
    if (country.focusId) return refuse("Focus refused.", "A national focus is already running.");
    if (country.completedFocuses.includes(node.id)) {
      return refuse("Focus refused.", `${node.name} is already complete.`);
    }
    for (const need of node.requires) {
      if (!country.completedFocuses.includes(need)) {
        const required = tree.nodes.find((item) => item.id === need)?.name ?? need;
        return refuse("Focus refused.", `${node.name} needs ${required} first.`);
      }
    }
    country.focusId = node.id;
    country.focusProgress = 0;
    return { ok: true, summary: `Working toward ${node.name}.` };
  }

  if (command.type === "cancelFocus") {
    if (!country.focusId) return refuse("Focus refused.", "No national focus is running.");
    const name = treeFor(campaign, playerId)?.nodes.find((item) => item.id === country.focusId)?.name ?? country.focusId;
    country.focusId = null;
    country.focusProgress = 0;
    return { ok: true, summary: `Cancelled ${name}. Progress is lost.` };
  }

  return refuse("Order refused.", "That research order could not be applied.");
}

function completeTech(campaign: Campaign, countryId: string, techId: TechId, log: string[]): void {
  const country = campaign.state.countries[countryId];
  if (!country || country.researched.includes(techId)) return;
  country.researched.push(techId);
  country.researched.sort();
  country.research = country.research.filter((item) => item.techId !== techId);
  const owner = campaign.countries.get(countryId)?.name ?? countryId;
  log.push(`${owner} completed ${TECHNOLOGIES[techId].name}.`);
}

function firstOpenTech(campaign: Campaign, countryId: string): TechId | null {
  const techs = Object.values(TECHNOLOGIES).sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "tech" ? -1 : 1;
    return left.id < right.id ? -1 : 1;
  });
  for (const tech of techs) {
    if (!availableTech(campaign, countryId, tech.id)) return tech.id;
  }
  return null;
}

function assignComputers(campaign: Campaign, log: string[]): void {
  const playerId = campaign.state.playerCountryId;
  for (const definition of campaign.scenario.countries) {
    if (definition.id === playerId) continue;
    const country = campaign.state.countries[definition.id];
    if (!country) continue;
    while (country.research.length < definition.researchSlots) {
      const next = firstOpenTech(campaign, definition.id);
      if (!next) break;
      country.research.push({ techId: next, progress: 0 });
      country.research.sort((left, right) => (left.techId < right.techId ? -1 : 1));
    }
    if (country.focusId) continue;
    const tree = treeFor(campaign, definition.id);
    const node = tree?.nodes.find(
      (item) =>
        !country.completedFocuses.includes(item.id) &&
        item.requires.every((need) => country.completedFocuses.includes(need)),
    );
    if (!node) continue;
    country.focusId = node.id;
    country.focusProgress = 0;
    log.push(`${definition.name} began ${node.name}.`);
  }
}

export function resolveResearch(campaign: Campaign, log: string[]): void {
  assignComputers(campaign, log);
  const countryIds = Object.keys(campaign.state.countries).sort();
  for (const countryId of countryIds) {
    const country = campaign.state.countries[countryId];
    const definition = campaign.scenario.countries.find((item) => item.id === countryId);
    if (!country || !definition) continue;
    const finished: TechId[] = [];
    for (const project of country.research) {
      project.progress += 1;
      const tech = TECHNOLOGIES[project.techId];
      if (project.progress >= tech.days) finished.push(project.techId);
    }
    for (const techId of finished) completeTech(campaign, countryId, techId, log);

    if (!country.focusId) continue;
    const node = treeFor(campaign, countryId)?.nodes.find((item) => item.id === country.focusId);
    if (!node) {
      country.focusId = null;
      country.focusProgress = 0;
      continue;
    }
    country.focusProgress += 1;
    if (country.focusProgress < node.days) continue;
    applyEffects(campaign, countryId, node.effects);
    country.completedFocuses.push(node.id);
    country.completedFocuses.sort();
    country.focusId = null;
    country.focusProgress = 0;
    log.push(`${definition.name} completed ${node.name}.`);
  }
}
