import { BATTALIONS, RECIPES, TEMPLATE_LIMITS, round3, type BattalionId } from "./constants.ts";

export interface TemplateSlot {
  battalion: BattalionId;
  count: number;
}

export interface TemplateComposition {
  line: TemplateSlot[];
  support: TemplateSlot[];
}

export interface DerivedTemplate {
  combatWidth: number;
  manpower: number;
  equipment: number;
  softAttack: number;
  hardAttack: number;
  defense: number;
  breakthrough: number;
  organization: number;
  supplyUse: number;
  productionSteel: number;
  lineCount: number;
  supportCount: number;
  armor: number;
  piercing: number;
}

/** Sum the battalion catalog. Displayed combat statistics come from this, not from stored totals. */
export function deriveTemplate(template: TemplateComposition): DerivedTemplate {
  let combatWidth = 0;
  let manpower = 0;
  let equipment = 0;
  let softAttack = 0;
  let hardAttack = 0;
  let defense = 0;
  let breakthrough = 0;
  let organizationWeight = 0;
  let battalions = 0;
  let supplyUse = 0;
  let lineCount = 0;
  let supportCount = 0;
  let armor = 0;
  let piercingWeight = 0;

  const add = (slot: TemplateSlot, role: "line" | "support") => {
    const stats = BATTALIONS[slot.battalion];
    if (stats.role !== role) return;
    const count = slot.count;
    combatWidth += stats.combatWidth * count;
    manpower += stats.manpower * count;
    equipment += stats.equipment * count;
    softAttack += stats.softAttack * count;
    hardAttack += stats.hardAttack * count;
    defense += stats.defense * count;
    breakthrough += stats.breakthrough * count;
    organizationWeight += stats.organization * count;
    battalions += count;
    supplyUse += stats.supplyUse * count;
    if (role === "line") lineCount += count;
    else supportCount += count;
    armor = Math.max(armor, stats.armor);
    piercingWeight += stats.piercing * count;
  };

  for (const slot of template.line) add(slot, "line");
  for (const slot of template.support) add(slot, "support");

  return {
    combatWidth,
    manpower,
    equipment,
    softAttack: round3(softAttack),
    hardAttack: round3(hardAttack),
    defense: round3(defense),
    breakthrough: round3(breakthrough),
    organization: battalions === 0 ? 0 : Math.round(organizationWeight / battalions),
    supplyUse,
    productionSteel: equipment * (RECIPES.infantry_equipment.steel ?? 0),
    lineCount,
    supportCount,
    armor,
    piercing: battalions === 0 ? 0 : round3(piercingWeight / battalions),
  };
}

export function templateProblems(template: TemplateComposition): string[] {
  const problems: string[] = [];
  const seenLine = new Set<string>();
  const seenSupport = new Set<string>();
  let line = 0;
  let support = 0;

  for (const slot of template.line) {
    const stats = BATTALIONS[slot.battalion];
    if (stats.role !== "line") problems.push(`${stats.name} cannot stand in the line`);
    if (seenLine.has(slot.battalion)) problems.push(`${stats.name} is listed twice in the line`);
    seenLine.add(slot.battalion);
    line += slot.count;
  }
  for (const slot of template.support) {
    const stats = BATTALIONS[slot.battalion];
    if (stats.role !== "support") problems.push(`${stats.name} is not a support species`);
    if (seenSupport.has(slot.battalion)) problems.push(`${stats.name} is listed twice as support`);
    seenSupport.add(slot.battalion);
    if (slot.count > 1) problems.push(`Only one ${stats.name} can be attached`);
    support += slot.count;
  }
  if (line > TEMPLATE_LIMITS.maxLine) {
    problems.push(`A pack can hold ${TEMPLATE_LIMITS.maxLine} line beasts`);
  }
  if (support > TEMPLATE_LIMITS.maxSupport) {
    problems.push(`A pack can hold ${TEMPLATE_LIMITS.maxSupport} support species`);
  }
  return problems;
}

/** The most numerous line species, then alphabetical. Map plates and army copy use this. */
export function leadSpecies(template: TemplateComposition): BattalionId | null {
  const ranked = template.line
    .filter((slot) => slot.count > 0)
    .slice()
    .sort((left, right) => right.count - left.count || (left.battalion < right.battalion ? -1 : 1));
  return ranked[0]?.battalion ?? null;
}
