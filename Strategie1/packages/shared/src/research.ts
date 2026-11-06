import { round3 } from "./constants.ts";
import type { DerivedTemplate } from "./templates.ts";

export const TECH_IDS = [
  "infantry_weapons",
  "support_weapons",
  "field_artillery",
  "machine_tools",
  "construction_engineering",
  "mobile_warfare",
  "breakthrough_doctrine",
  "grand_battleplan",
  "prepared_defense",
] as const;

export type TechId = (typeof TECH_IDS)[number];
export type DoctrineBranch = "mobile" | "battleplan";
export type TechKind = "tech" | "doctrine";

export interface CountryModifiers {
  softAttack: number;
  defense: number;
  breakthrough: number;
  militaryOutput: number;
  construction: number;
}

export interface TechnologyDefinition {
  id: TechId;
  name: string;
  kind: TechKind;
  branch: DoctrineBranch | null;
  days: number;
  requires: TechId[];
  summary: string;
  modifiers: CountryModifiers;
}

function mods(
  partial: Partial<CountryModifiers>,
): CountryModifiers {
  return {
    softAttack: 0,
    defense: 0,
    breakthrough: 0,
    militaryOutput: 0,
    construction: 0,
    ...partial,
  };
}

export const TECHNOLOGIES: Record<TechId, TechnologyDefinition> = {
  infantry_weapons: {
    id: "infantry_weapons",
    name: "Beast handling",
    kind: "tech",
    branch: null,
    days: 20,
    requires: [],
    summary: "Line beasts strike 10 percent harder.",
    modifiers: mods({ softAttack: 0.1 }),
  },
  support_weapons: {
    id: "support_weapons",
    name: "Support weapons",
    kind: "tech",
    branch: null,
    days: 20,
    requires: ["infantry_weapons"],
    summary: "Formations hold 10 percent more firmly.",
    modifiers: mods({ defense: 0.1 }),
  },
  field_artillery: {
    id: "field_artillery",
    name: "Field guns",
    kind: "tech",
    branch: null,
    days: 20,
    requires: [],
    summary: "Breakthrough rises by 10 percent.",
    modifiers: mods({ breakthrough: 0.1 }),
  },
  machine_tools: {
    id: "machine_tools",
    name: "Machine tools",
    kind: "tech",
    branch: null,
    days: 20,
    requires: [],
    summary: "Military factories deliver 20 percent more harness.",
    modifiers: mods({ militaryOutput: 0.2 }),
  },
  construction_engineering: {
    id: "construction_engineering",
    name: "Construction methods",
    kind: "tech",
    branch: null,
    days: 20,
    requires: [],
    summary: "Civilian factories finish projects 25 percent faster.",
    modifiers: mods({ construction: 0.25 }),
  },
  mobile_warfare: {
    id: "mobile_warfare",
    name: "Mobile warfare",
    kind: "doctrine",
    branch: "mobile",
    days: 21,
    requires: [],
    summary: "Attacks gain 10 percent. Closes the prepared-defence school.",
    modifiers: mods({ softAttack: 0.1 }),
  },
  breakthrough_doctrine: {
    id: "breakthrough_doctrine",
    name: "Breakthrough emphasis",
    kind: "doctrine",
    branch: "mobile",
    days: 21,
    requires: ["mobile_warfare"],
    summary: "Breakthrough rises another 15 percent.",
    modifiers: mods({ breakthrough: 0.15 }),
  },
  grand_battleplan: {
    id: "grand_battleplan",
    name: "Grand battle plan",
    kind: "doctrine",
    branch: "battleplan",
    days: 21,
    requires: [],
    summary: "Defence rises 10 percent. Closes the mobile school.",
    modifiers: mods({ defense: 0.1 }),
  },
  prepared_defense: {
    id: "prepared_defense",
    name: "Prepared defence",
    kind: "doctrine",
    branch: "battleplan",
    days: 21,
    requires: ["grand_battleplan"],
    summary: "Defence rises another 15 percent.",
    modifiers: mods({ defense: 0.15 }),
  },
};

export function emptyModifiers(): CountryModifiers {
  return mods({});
}

export function modifiersFrom(researched: readonly string[]): CountryModifiers {
  const total = emptyModifiers();
  for (const id of researched) {
    if (!isTechId(id)) continue;
    const item = TECHNOLOGIES[id];
    total.softAttack += item.modifiers.softAttack;
    total.defense += item.modifiers.defense;
    total.breakthrough += item.modifiers.breakthrough;
    total.militaryOutput += item.modifiers.militaryOutput;
    total.construction += item.modifiers.construction;
  }
  return {
    softAttack: round3(total.softAttack),
    defense: round3(total.defense),
    breakthrough: round3(total.breakthrough),
    militaryOutput: round3(total.militaryOutput),
    construction: round3(total.construction),
  };
}

export function applyCountryCombat(stats: DerivedTemplate, modifiers: CountryModifiers): DerivedTemplate {
  return {
    ...stats,
    softAttack: round3(stats.softAttack * (1 + modifiers.softAttack)),
    defense: round3(stats.defense * (1 + modifiers.defense)),
    breakthrough: round3(stats.breakthrough * (1 + modifiers.breakthrough)),
  };
}

export function isTechId(id: string): id is TechId {
  return Object.hasOwn(TECHNOLOGIES, id);
}

export function doctrineBranchOf(ids: readonly string[]): DoctrineBranch | null {
  for (const id of ids) {
    if (!isTechId(id)) continue;
    const branch = TECHNOLOGIES[id].branch;
    if (branch) return branch;
  }
  return null;
}
