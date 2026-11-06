import {
  BATTALIONS,
  TEMPLATE_LIMITS,
  deriveTemplate,
  templateProblems,
  type BattalionId,
  type Command,
  type CommandResult,
  type DivisionTemplate,
  type TemplateSlot,
} from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { recomputeSupply } from "./supply.ts";

function refuse(summary: string, reason: string): CommandResult {
  return { ok: false, summary, reason };
}

function nextSerial(campaign: Campaign, prefix: string): string {
  let id = `${prefix}-${campaign.state.recruitSerial}`;
  campaign.state.recruitSerial += 1;
  const taken = new Set([
    ...Object.keys(campaign.state.divisions),
    ...campaign.state.templates.map((template) => template.id),
  ]);
  while (taken.has(id)) {
    id = `${prefix}-${campaign.state.recruitSerial}`;
    campaign.state.recruitSerial += 1;
  }
  return id;
}

function ownedTemplate(campaign: Campaign, templateId: string): DivisionTemplate | CommandResult {
  const template = campaign.state.templates.find((item) => item.id === templateId);
  if (!template) return refuse("Template not found.", "That division template does not exist.");
  if (template.countryId !== campaign.state.playerCountryId) {
    return refuse("Template refused.", "That template belongs to another country.");
  }
  return template;
}

function isTemplate(value: DivisionTemplate | CommandResult): value is DivisionTemplate {
  return !("ok" in value);
}

function replaceSlot(slots: TemplateSlot[], battalion: BattalionId, count: number): TemplateSlot[] {
  const next = slots.filter((slot) => slot.battalion !== battalion);
  if (count > 0) next.push({ battalion, count });
  next.sort((left, right) => (left.battalion < right.battalion ? -1 : 1));
  return next;
}

export function applyTemplateCommand(campaign: Campaign, command: Command): CommandResult {
  const playerId = campaign.state.playerCountryId;
  if (command.type === "createTemplate") {
    const name = command.name.trim();
    if (!name) return refuse("Template refused.", "A template needs a name.");
    const owned = campaign.state.templates.filter((template) => template.countryId === playerId);
    if (owned.length >= TEMPLATE_LIMITS.maxTemplates) {
      return refuse(
        "Template refused.",
        `A country can keep ${TEMPLATE_LIMITS.maxTemplates} division templates.`,
      );
    }
    const id = nextSerial(campaign, `${playerId}-template`);
    campaign.state.templates.push({
      id,
      name,
      countryId: playerId,
      line: [],
      support: [],
    });
    return { ok: true, summary: `Created the ${name} template.` };
  }

  if (command.type === "renameTemplate") {
    const found = ownedTemplate(campaign, command.templateId);
    if (!isTemplate(found)) return found;
    const name = command.name.trim();
    if (!name) return refuse("Template refused.", "A template needs a name.");
    found.name = name;
    return { ok: true, summary: `Renamed the template to ${name}.` };
  }

  if (command.type === "setBattalion") {
    const found = ownedTemplate(campaign, command.templateId);
    if (!isTemplate(found)) return found;
    const stats = BATTALIONS[command.battalion];
    if (stats.role !== command.role) {
      return refuse(
        "Template refused.",
        command.role === "line"
          ? `${stats.name} cannot stand in the line.`
          : `${stats.name} is not a support species.`,
      );
    }
    const next: DivisionTemplate = {
      ...found,
      line: command.role === "line" ? replaceSlot(found.line, command.battalion, command.count) : found.line.map((slot) => ({ ...slot })),
      support:
        command.role === "support"
          ? replaceSlot(found.support, command.battalion, command.count)
          : found.support.map((slot) => ({ ...slot })),
    };
    const problems = templateProblems(next);
    if (problems.length > 0) {
      return refuse("Template refused.", problems[0] ?? "That composition is not allowed.");
    }
    const derived = deriveTemplate(next);
    const inUse = Object.values(campaign.state.divisions).some((division) => division.templateId === found.id);
    if (derived.lineCount === 0 && inUse) {
      return refuse(
        "Template refused.",
        "Packs in the field still use this template, so it needs a line species.",
      );
    }
    found.line = next.line;
    found.support = next.support;
    for (const division of Object.values(campaign.state.divisions)) {
      if (division.templateId === found.id) division.organization = Math.min(division.organization, derived.organization);
    }
    const label = command.role === "line" ? "line" : "support";
    return {
      ok: true,
      summary:
        command.count === 0
          ? `Removed ${stats.name} from the ${label}.`
          : `Set ${stats.name} to ${command.count} in the ${label}.`,
    };
  }

  if (command.type === "recruitDivision") {
    const found = ownedTemplate(campaign, command.templateId);
    if (!isTemplate(found)) return found;
    const derived = deriveTemplate(found);
    if (derived.lineCount < 1 || derived.combatWidth < 1 || derived.manpower < 1) {
      return refuse("Recruitment refused.", "Add at least one line species before recruiting.");
    }
    const name = command.name.trim();
    if (!name) return refuse("Recruitment refused.", "A division needs a name.");
    const province = campaign.state.provinces[command.provinceId];
    const definition = campaign.provinces.get(command.provinceId);
    if (!province || !definition) return refuse("Recruitment refused.", "That province is not on the map.");
    if (definition.impassable) return refuse("Recruitment refused.", "That province cannot hold a division.");
    if (province.controllerId !== playerId) {
      return refuse("Recruitment refused.", "You can raise a division only in a province you control.");
    }
    const underFire = Object.values(campaign.state.battles).some((battle) => battle.provinceId === command.provinceId);
    if (underFire) return refuse("Recruitment refused.", "That province is in battle.");
    const country = campaign.state.countries[playerId];
    if (!country) return refuse("Recruitment refused.", "The player country is missing.");
    const gaps: string[] = [];
    if (country.manpower < derived.manpower) {
      gaps.push(`Need ${derived.manpower.toLocaleString()} manpower and the pool has ${country.manpower.toLocaleString()}.`);
    }
    if (country.stockpile.infantry_equipment < derived.equipment) {
      gaps.push(
        `Need ${derived.equipment.toLocaleString()} harness and the stockpile has ${country.stockpile.infantry_equipment.toLocaleString()}.`,
      );
    }
    if (gaps.length > 0) return refuse("Recruitment refused.", gaps.join(" "));
    country.manpower -= derived.manpower;
    country.stockpile.infantry_equipment -= derived.equipment;
    const id = nextSerial(campaign, `${playerId}-raised`);
    campaign.state.divisions[id] = {
      id,
      name,
      countryId: playerId,
      templateId: found.id,
      provinceId: command.provinceId,
      position: { lon: definition.center.lon, lat: definition.center.lat },
      manpower: derived.manpower,
      equipment: derived.equipment,
      organization: derived.organization,
      attackFrom: null,
      battleId: null,
      order: null,
      entrenchment: 0,
    };
    recomputeSupply(campaign);
    return {
      ok: true,
      summary: `Raised ${name} at ${definition.name}. Spent ${derived.manpower.toLocaleString()} handlers and ${derived.equipment.toLocaleString()} harness.`,
    };
  }

  return refuse("Order refused.", "That military order could not be applied.");
}
