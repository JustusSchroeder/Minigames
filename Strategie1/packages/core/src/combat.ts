import {
  BATTALIONS,
  COMBAT,
  RIVER_DEFENSE,
  TERRAIN_DEFENSE,
  WEATHER_ATTACK,
  applyCountryCombat,
  deriveTemplate,
  round3,
  weatherAt,
  type DerivedTemplate,
  type DivisionState,
  type DivisionTemplate,
} from "@meridian/shared";
import type { Campaign } from "./campaign.ts";
import { provincePoint } from "./geo.ts";
import { completeHop } from "./movement.ts";
import { friendlyController } from "./relations.ts";
import { countryModifiers } from "./research.ts";
import { supplyRatioForDivision } from "./supply.ts";

export function readiness(division: DivisionState, template: DivisionTemplate): number {
  const stats = deriveTemplate(template);
  if (stats.manpower <= 0) return 0;
  const manpowerRatio = division.manpower / stats.manpower;
  const equipmentRatio = stats.equipment <= 0 ? 1 : division.equipment / stats.equipment;
  return Math.min(1, Math.max(0, Math.min(manpowerRatio, equipmentRatio)));
}

function templateOf(campaign: Campaign, division: DivisionState): DivisionTemplate {
  const template = campaign.templates.get(division.templateId);
  if (!template) throw new Error(`Missing template ${division.templateId}`);
  return template;
}

function statsOf(campaign: Campaign, division: DivisionState): DerivedTemplate {
  return applyCountryCombat(deriveTemplate(templateOf(campaign, division)), countryModifiers(campaign, division.countryId));
}

function fillWidth(
  campaign: Campaign,
  divisions: DivisionState[],
  stat: "softAttack" | "defense",
): DivisionState[] {
  const ranked = [...divisions].sort((left, right) => {
    const leftTemplate = templateOf(campaign, left);
    const rightTemplate = templateOf(campaign, right);
    const leftScore = statsOf(campaign, left)[stat] * readiness(left, leftTemplate);
    const rightScore = statsOf(campaign, right)[stat] * readiness(right, rightTemplate);
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left.id < right.id ? -1 : 1;
  });
  const picked: DivisionState[] = [];
  let used = 0;
  for (const division of ranked) {
    const width = statsOf(campaign, division).combatWidth;
    if (width <= 0) continue;
    if (used + width > COMBAT.combatWidth && used > 0) continue;
    used += width;
    picked.push(division);
  }
  return picked;
}

function applyLoss(division: DivisionState, stats: DerivedTemplate, orgLoss: number): void {
  if (orgLoss <= 0 || stats.organization <= 0) return;
  division.organization = round3(Math.max(0, division.organization - orgLoss));
  const share = orgLoss / stats.organization;
  const manpowerLoss = Math.min(
    division.manpower,
    Math.round(division.manpower * share * COMBAT.strengthFromOrg),
  );
  const equipmentLoss = Math.min(
    division.equipment,
    Math.round(division.equipment * share * COMBAT.strengthFromOrg),
  );
  division.manpower -= manpowerLoss;
  division.equipment -= equipmentLoss;
}

export function digIn(campaign: Campaign): void {
  const battles = Object.values(campaign.state.battles);
  for (const division of Object.values(campaign.state.divisions)) {
    if (division.order || division.battleId || division.attackFrom) {
      division.entrenchment = 0;
      continue;
    }
    const underAttack = battles.some((battle) => battle.provinceId === division.provinceId);
    if (underAttack) continue;
    const template = campaign.templates.get(division.templateId);
    const digs = template?.support.some((slot) => BATTALIONS[slot.battalion].digsIn && slot.count > 0) ?? false;
    const gain = digs ? COMBAT.entrenchmentEngineer : COMBAT.entrenchmentPerHour;
    division.entrenchment = round3(Math.min(COMBAT.maxEntrenchment, division.entrenchment + gain));
  }
}

/** True when friendly-controlled provinces connect this province to the capital. */
export function capitalRoute(campaign: Campaign, countryId: string, startId: string): boolean {
  const country = campaign.scenario.countries.find((item) => item.id === countryId);
  if (!country) return false;
  const seen = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const state = campaign.state.provinces[id];
    const meta = campaign.provinces.get(id);
    if (!state || !meta || meta.impassable) continue;
    if (!friendlyController(campaign, state.controllerId, countryId)) continue;
    if (id === country.capitalProvinceId) return true;
    for (const neighbor of meta.neighbors) queue.push(neighbor);
  }
  return false;
}

function sideArmor(campaign: Campaign, divisions: DivisionState[]): { armor: number; piercing: number } {
  let armor = 0;
  let piercing = 0;
  let counted = 0;
  for (const division of divisions) {
    const template = templateOf(campaign, division);
    const stats = deriveTemplate(template);
    const ready = readiness(division, template);
    armor = Math.max(armor, stats.armor * ready);
    piercing += stats.piercing * ready;
    counted += 1;
  }
  return { armor, piercing: counted === 0 ? 0 : piercing / counted };
}

export function retreatDestination(
  campaign: Campaign,
  division: DivisionState,
  fromProvince: string,
): string | null {
  const def = campaign.provinces.get(fromProvince);
  if (!def) return null;
  const options = def.neighbors.filter((id) => {
    const state = campaign.state.provinces[id];
    const meta = campaign.provinces.get(id);
    if (!state || !meta || meta.impassable) return false;
    return friendlyController(campaign, state.controllerId, division.countryId);
  });
  options.sort((left, right) => {
    const leftInfra = campaign.state.provinces[left]?.infrastructure ?? 0;
    const rightInfra = campaign.state.provinces[right]?.infrastructure ?? 0;
    if (rightInfra !== leftInfra) return rightInfra - leftInfra;
    return left < right ? -1 : 1;
  });
  return options[0] ?? null;
}

function pullOut(campaign: Campaign, division: DivisionState, log: string[]): void {
  const fallback = division.attackFrom ?? division.provinceId;
  division.organization = COMBAT.retreatOrganization;
  division.provinceId = fallback;
  division.position = provincePoint(campaign, fallback) ?? division.position;
  division.battleId = null;
  division.attackFrom = null;
  division.order = null;
  const place = campaign.provinces.get(fallback)?.name ?? fallback;
  log.push(`${division.name} fell back to ${place}.`);
}

function shatter(campaign: Campaign, division: DivisionState, battleProvince: string, log: string[]): void {
  log.push(`${division.name} was shattered at ${campaign.provinces.get(battleProvince)?.name ?? battleProvince}.`);
  delete campaign.state.divisions[division.id];
}

function defenderRetreat(campaign: Campaign, division: DivisionState, battleProvince: string, log: string[]): void {
  const encircled = !capitalRoute(campaign, division.countryId, battleProvince);
  division.organization = COMBAT.retreatOrganization;
  division.battleId = null;
  division.attackFrom = null;
  division.order = null;
  division.entrenchment = 0;
  const destination = retreatDestination(campaign, division, battleProvince);
  if (!destination) {
    shatter(campaign, division, battleProvince, log);
    return;
  }
  if (encircled && !capitalRoute(campaign, division.countryId, destination)) {
    shatter(campaign, division, battleProvince, log);
    return;
  }
  division.provinceId = destination;
  division.position = provincePoint(campaign, destination) ?? division.position;
  log.push(
    `${division.name} retreated to ${campaign.provinces.get(destination)?.name ?? destination}.`,
  );
}

function finishAttack(campaign: Campaign, division: DivisionState, provinceId: string): void {
  division.battleId = null;
  division.attackFrom = null;
  if (division.order) {
    completeHop(campaign, division.id);
    return;
  }
  division.provinceId = provinceId;
  division.position = provincePoint(campaign, provinceId) ?? division.position;
}

function occupy(campaign: Campaign, provinceId: string, controllerId: string, log: string[]): void {
  const province = campaign.state.provinces[provinceId];
  if (!province) return;
  const previous = province.controllerId;
  if (previous === controllerId) return;
  province.controllerId = controllerId;
  const name = campaign.provinces.get(provinceId)?.name ?? provinceId;
  const controller = campaign.countries.get(controllerId)?.name ?? controllerId;
  log.push(`${controller} took control of ${name}. The owner remains ${campaign.countries.get(province.ownerId)?.name ?? province.ownerId}.`);
}

export function resolveCombat(campaign: Campaign, log: string[]): boolean {
  let dirty = false;
  const battleIds = Object.keys(campaign.state.battles).sort();
  for (const battleId of battleIds) {
    const battle = campaign.state.battles[battleId];
    if (!battle) continue;
    const province = campaign.state.provinces[battle.provinceId];
    const definition = campaign.provinces.get(battle.provinceId);
    if (!province || !definition) {
      delete campaign.state.battles[battleId];
      continue;
    }

    const attackers = Object.values(campaign.state.divisions)
      .filter((division) => division.battleId === battleId)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    const defenders = Object.values(campaign.state.divisions)
      .filter(
        (division) =>
          division.provinceId === battle.provinceId &&
          division.battleId === null &&
          friendlyController(campaign, province.controllerId, division.countryId),
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1));

    battle.attackerIds = attackers.map((division) => division.id);
    battle.defenderIds = defenders.map((division) => division.id);

    if (attackers.length === 0) {
      delete campaign.state.battles[battleId];
      continue;
    }

    if (defenders.length === 0) {
      const winner = attackers[0]?.countryId;
      if (winner) {
        occupy(campaign, battle.provinceId, winner, log);
        dirty = true;
      }
      for (const division of attackers) {
        finishAttack(campaign, division, battle.provinceId);
      }
      delete campaign.state.battles[battleId];
      continue;
    }

    const terrainMod =
      TERRAIN_DEFENSE[definition.terrain] *
      (definition.strategicTags.includes("river") ? RIVER_DEFENSE : 1);
    const weather = weatherAt(campaign.state.date.month, definition.climate);
    const fightingAttackers = fillWidth(campaign, attackers, "softAttack");
    const fightingDefenders = fillWidth(campaign, defenders, "defense");
    const attackersArms = sideArmor(campaign, fightingAttackers);
    const defendersArms = sideArmor(campaign, fightingDefenders);

    let attack = 0;
    for (const division of fightingAttackers) {
      const template = templateOf(campaign, division);
      const supply = Math.max(COMBAT.supplyFloor, supplyRatioForDivision(campaign, division.id));
      attack += statsOf(campaign, division).softAttack * readiness(division, template) * supply * WEATHER_ATTACK[weather];
    }
    let defense = 0;
    for (const division of fightingDefenders) {
      const template = templateOf(campaign, division);
      const supply = Math.max(COMBAT.supplyFloor, supplyRatioForDivision(campaign, division.id));
      const dugIn = 1 + division.entrenchment * COMBAT.entrenchmentDefense;
      const forts = 1 + province.forts * COMBAT.fortDefense;
      defense += statsOf(campaign, division).defense * readiness(division, template) * supply * terrainMod * dugIn * forts;
    }
    if (attackersArms.armor > defendersArms.piercing) attack *= 1 + COMBAT.armorBonus;
    if (defendersArms.armor > attackersArms.piercing) defense *= 1 + COMBAT.armorBonus;

    const hit = attack / (attack + defense + 0.001);
    let defenderPool =
      attack <= 0 ? 0 : round3(Math.max(COMBAT.minOrgLoss, attack * hit * COMBAT.orgFactor));
    let attackerPool =
      defense <= 0 ? 0 : round3(Math.max(0, defense * (1 - hit) * COMBAT.attackerOrgFactor));
    if (attackersArms.armor > defendersArms.piercing) attackerPool = round3(attackerPool * COMBAT.armorDamageTaken);
    if (defendersArms.armor > attackersArms.piercing) defenderPool = round3(defenderPool * COMBAT.armorDamageTaken);
    const encircled = defenders.some((division) => !capitalRoute(campaign, division.countryId, battle.provinceId));
    if (encircled) defenderPool = round3(defenderPool * COMBAT.encirclementDamage);

    if (fightingDefenders.length > 0 && defenderPool > 0) {
      const each = round3(defenderPool / fightingDefenders.length);
      for (const division of fightingDefenders) {
        applyLoss(division, statsOf(campaign, division), each);
      }
    }
    if (fightingAttackers.length > 0 && attackerPool > 0) {
      const each = round3(attackerPool / fightingAttackers.length);
      for (const division of fightingAttackers) {
        applyLoss(division, statsOf(campaign, division), each);
      }
    }

    battle.hours += 1;
    const attackersBroken = attackers.every((division) => division.organization <= 0);
    const defendersBroken = defenders.every((division) => division.organization <= 0);

    if (attackersBroken) {
      for (const division of attackers) pullOut(campaign, division, log);
      for (const division of defenders) {
        if (division.organization <= 0) division.organization = COMBAT.retreatOrganization;
      }
      delete campaign.state.battles[battleId];
      continue;
    }

    if (defendersBroken) {
      const winner = attackers[0]?.countryId;
      for (const division of defenders) {
        defenderRetreat(campaign, division, battle.provinceId, log);
      }
      if (winner) {
        occupy(campaign, battle.provinceId, winner, log);
        dirty = true;
      }
      for (const division of attackers) {
        finishAttack(campaign, division, battle.provinceId);
      }
      delete campaign.state.battles[battleId];
    }
  }
  return dirty;
}
