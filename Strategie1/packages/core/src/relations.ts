import type { Campaign } from "./campaign.ts";

export function aligned(campaign: Campaign, controllerId: string, nationId: string): boolean {
  if (controllerId === nationId) return true;
  const controller = campaign.state.countries[controllerId];
  const nation = campaign.state.countries[nationId];
  if (!controller || !nation) return false;
  return controller.alignedTo === nationId || nation.alignedTo === controllerId;
}

export function atWar(campaign: Campaign, left: string, right: string): boolean {
  if (left === right) return false;
  return campaign.state.wars.some((war) => {
    const leftSide = war.attackers.includes(left)
      ? "attack"
      : war.defenders.includes(left)
        ? "defend"
        : null;
    const rightSide = war.attackers.includes(right)
      ? "attack"
      : war.defenders.includes(right)
        ? "defend"
        : null;
    return leftSide !== null && rightSide !== null && leftSide !== rightSide;
  });
}

export function friendlyController(
  campaign: Campaign,
  controllerId: string,
  nationId: string,
): boolean {
  return aligned(campaign, controllerId, nationId);
}
