import {
  isTechId,
  scenarioSchema,
  templateProblems,
  type CampaignState,
  type ScenarioDefinition,
} from "@meridian/shared";

function unique(ids: string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) dupes.push(id);
    seen.add(id);
  }
  return dupes;
}

export function parseScenario(input: unknown): ScenarioDefinition {
  return scenarioSchema.parse(input);
}

export function validateScenario(scenario: ScenarioDefinition): string[] {
  const errors: string[] = [];
  const countryIds = new Set(scenario.countries.map((country) => country.id));
  const provinceIds = new Set(scenario.provinces.map((province) => province.id));
  const templateIds = new Set(scenario.templates.map((template) => template.id));

  for (const id of unique(scenario.countries.map((country) => country.id))) {
    errors.push(`Duplicate country id ${id}`);
  }
  for (const id of unique(scenario.provinces.map((province) => province.id))) {
    errors.push(`Duplicate province id ${id}`);
  }
  for (const id of unique(scenario.templates.map((template) => template.id))) {
    errors.push(`Duplicate template id ${id}`);
  }
  for (const id of unique(scenario.divisions.map((division) => division.id))) {
    errors.push(`Duplicate division id ${id}`);
  }
  for (const id of unique(scenario.events.map((event) => event.id))) {
    errors.push(`Duplicate event id ${id}`);
  }

  for (const province of scenario.provinces) {
    if (!countryIds.has(province.countryId)) {
      errors.push(`Province ${province.id} owner ${province.countryId} is missing`);
    }
    if (new Set(province.neighbors).size !== province.neighbors.length) {
      errors.push(`Province ${province.id} lists a neighbor more than once`);
    }
    for (const neighbor of province.neighbors) {
      if (neighbor === province.id) errors.push(`Province ${province.id} neighbors itself`);
      if (!provinceIds.has(neighbor)) {
        errors.push(`Province ${province.id} neighbors missing ${neighbor}`);
      }
      const other = scenario.provinces.find((item) => item.id === neighbor);
      if (other && !other.neighbors.includes(province.id)) {
        errors.push(`Adjacency ${province.id} -> ${neighbor} is not symmetric`);
      }
    }
    if (province.center.lon < -180 || province.center.lon > 180 || province.center.lat < -90 || province.center.lat > 90) {
      errors.push(`Province ${province.id} has an impossible center`);
    }
  }

  const land = scenario.provinces.filter(
    (province) => !province.impassable && !province.strategicTags.includes("island"),
  );
  if (land.length > 0) {
    const first = land[0];
    if (first) {
      const seen = new Set<string>();
      const queue = [first.id];
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const province = land.find((item) => item.id === id);
        if (!province) continue;
        for (const neighbor of province.neighbors) {
          if (land.some((item) => item.id === neighbor)) queue.push(neighbor);
        }
      }
      if (seen.size !== land.length) {
        errors.push(`Isolated land provinces: ${land.length - seen.size} unreachable`);
      }
    }
  }

  for (const country of scenario.countries) {
    if (!provinceIds.has(country.capitalProvinceId)) {
      errors.push(`Country ${country.id} capital ${country.capitalProvinceId} is missing`);
    }
    const capital = scenario.provinces.find((province) => province.id === country.capitalProvinceId);
    if (capital && capital.countryId !== country.id) {
      errors.push(`Country ${country.id} capital is not initially owned by that country`);
    }
    if (country.alignedTo !== null && !countryIds.has(country.alignedTo)) {
      errors.push(`Country ${country.id} alignment ${country.alignedTo} is missing`);
    }
    if (country.alignedTo === country.id) errors.push(`Country ${country.id} cannot align to itself`);
    if (new Set(country.startingResearch).size !== country.startingResearch.length) {
      errors.push(`Country ${country.id} lists a starting technology twice`);
    }
    for (const techId of country.startingResearch) {
      if (!isTechId(techId)) errors.push(`Country ${country.id} starts with unknown technology ${techId}`);
    }
  }

  for (const template of scenario.templates) {
    if (!countryIds.has(template.countryId)) {
      errors.push(`Template ${template.id} country ${template.countryId} is missing`);
    }
    for (const problem of templateProblems(template)) {
      errors.push(`Template ${template.id}: ${problem}`);
    }
  }

  for (const division of scenario.divisions) {
    if (!countryIds.has(division.countryId)) errors.push(`Division ${division.id} country is missing`);
    if (!templateIds.has(division.templateId)) errors.push(`Division ${division.id} template is missing`);
    const template = scenario.templates.find((item) => item.id === division.templateId);
    if (template && template.countryId !== division.countryId) {
      errors.push(`Division ${division.id} uses a template from another country`);
    }
    if (!provinceIds.has(division.provinceId)) errors.push(`Division ${division.id} province is missing`);
  }

  for (const war of scenario.wars) {
    for (const id of [...war.attackers, ...war.defenders]) {
      if (!countryIds.has(id)) errors.push(`War ${war.id} references missing country ${id}`);
    }
    for (const id of war.attackers) {
      if (war.defenders.includes(id)) errors.push(`War ${war.id} lists ${id} on both sides`);
    }
  }

  for (const event of scenario.events) {
    if (!countryIds.has(event.countryId)) errors.push(`Event ${event.id} country is missing`);
    for (const id of unique(event.choices.map((choice) => choice.id))) {
      errors.push(`Event ${event.id} repeats choice ${id}`);
    }
  }

  const seenTrees = new Set<string>();
  for (const tree of scenario.focusTrees) {
    if (!countryIds.has(tree.countryId)) errors.push(`Focus tree country ${tree.countryId} is missing`);
    if (seenTrees.has(tree.countryId)) errors.push(`Country ${tree.countryId} has more than one focus tree`);
    seenTrees.add(tree.countryId);
    const nodeIds = new Set<string>();
    for (const node of tree.nodes) {
      if (nodeIds.has(node.id)) errors.push(`Focus ${node.id} is listed twice`);
      nodeIds.add(node.id);
    }
    for (const node of tree.nodes) {
      for (const need of node.requires) {
        if (!nodeIds.has(need)) errors.push(`Focus ${node.id} requires missing ${need}`);
      }
    }
  }

  return errors;
}

export function validateState(scenario: ScenarioDefinition, state: CampaignState): string[] {
  const errors: string[] = [];
  if (state.scenarioId !== scenario.id) {
    errors.push(`Save scenario ${state.scenarioId} does not match ${scenario.id}`);
  }
  const countryIds = new Set(scenario.countries.map((country) => country.id));
  const provinceIds = new Set(scenario.provinces.map((province) => province.id));
  const templateIds = new Set<string>();
  for (const template of state.templates) {
    if (templateIds.has(template.id)) errors.push(`Duplicate template id ${template.id}`);
    templateIds.add(template.id);
    if (!countryIds.has(template.countryId)) errors.push(`Template ${template.id} country is unknown`);
    for (const problem of templateProblems(template)) {
      errors.push(`Template ${template.id}: ${problem}`);
    }
  }
  if (!countryIds.has(state.playerCountryId)) errors.push("Player country is missing from the scenario");

  for (const [id, province] of Object.entries(state.provinces)) {
    if (!provinceIds.has(id)) errors.push(`Save province ${id} is not in the scenario`);
    if (!countryIds.has(province.ownerId)) errors.push(`Province ${id} owner is unknown`);
    if (!countryIds.has(province.controllerId)) errors.push(`Province ${id} controller is unknown`);
  }
  for (const province of scenario.provinces) {
    if (!state.provinces[province.id]) errors.push(`Save is missing province ${province.id}`);
  }
  for (const [id, country] of Object.entries(state.countries)) {
    if (!countryIds.has(id)) errors.push(`Save country ${id} is not in the scenario`);
    if (country.alignedTo !== null && !countryIds.has(country.alignedTo)) {
      errors.push(`Country ${id} alignment is unknown`);
    }
    const definition = scenario.countries.find((item) => item.id === id);
    if (new Set(country.researched).size !== country.researched.length) {
      errors.push(`Country ${id} lists a technology twice`);
    }
    const seenProjects = new Set<string>();
    for (const project of country.research) {
      if (seenProjects.has(project.techId)) errors.push(`Country ${id} researches ${project.techId} twice`);
      seenProjects.add(project.techId);
      if (country.researched.includes(project.techId)) {
        errors.push(`Country ${id} is researching a technology it already knows`);
      }
    }
    if (definition && country.research.length > definition.researchSlots) {
      errors.push(`Country ${id} assigned more research than it has slots`);
    }
    const tree = scenario.focusTrees.find((item) => item.countryId === id);
    const focusIds = new Set(tree?.nodes.map((node) => node.id) ?? []);
    if (country.focusId && !focusIds.has(country.focusId)) {
      errors.push(`Country ${id} is working a focus that is not on its tree`);
    }
    if (country.focusId === null && country.focusProgress !== 0) {
      errors.push(`Country ${id} has focus progress without a focus`);
    }
    for (const focusId of country.completedFocuses) {
      if (!focusIds.has(focusId)) errors.push(`Country ${id} completed unknown focus ${focusId}`);
    }
    if (new Set(country.completedFocuses).size !== country.completedFocuses.length) {
      errors.push(`Country ${id} lists a completed focus twice`);
    }
  }
  for (const country of scenario.countries) {
    if (!state.countries[country.id]) errors.push(`Save is missing country ${country.id}`);
  }
  for (const division of Object.values(state.divisions)) {
    if (!countryIds.has(division.countryId)) errors.push(`Division ${division.id} country is unknown`);
    if (!templateIds.has(division.templateId)) errors.push(`Division ${division.id} template is unknown`);
    const template = state.templates.find((item) => item.id === division.templateId);
    if (template && template.countryId !== division.countryId) {
      errors.push(`Division ${division.id} uses a template from another country`);
    }
    if (!provinceIds.has(division.provinceId)) errors.push(`Division ${division.id} province is unknown`);
    if (division.attackFrom !== null && !provinceIds.has(division.attackFrom)) {
      errors.push(`Division ${division.id} attack origin is unknown`);
    }
    if (division.battleId !== null && !state.battles[division.battleId]) {
      errors.push(`Division ${division.id} battle is unknown`);
    }
    if (division.order) {
      if (division.order.hops.length !== division.order.waypoints.length - 1) {
        errors.push(`Division ${division.id} route hops do not match its waypoints`);
      }
      for (const step of division.order.hops) {
        if (!provinceIds.has(step)) errors.push(`Division ${division.id} route leaves the map`);
      }
    }
  }
  for (const [id, division] of Object.entries(state.divisions)) {
    if (division.id !== id) errors.push(`Division key ${id} does not match ${division.id}`);
  }
  for (const battle of Object.values(state.battles)) {
    if (!provinceIds.has(battle.provinceId)) errors.push(`Battle ${battle.id} province is unknown`);
  }
  const seenProjects = new Set<string>();
  for (const project of state.construction) {
    if (seenProjects.has(project.id)) errors.push(`Duplicate construction id ${project.id}`);
    seenProjects.add(project.id);
    if (!countryIds.has(project.countryId)) errors.push(`Construction ${project.id} country is unknown`);
    if (project.progress > project.cost) errors.push(`Construction ${project.id} progress exceeds its cost`);
    if (
      project.kind === "infrastructure" ||
      project.kind === "fort" ||
      project.kind === "rail" ||
      project.kind === "port" ||
      project.kind === "supply_hub"
    ) {
      if (!project.provinceId || !provinceIds.has(project.provinceId)) {
        errors.push(`Construction ${project.id} province is unknown`);
      }
    } else if (project.provinceId !== null) {
      errors.push(`Construction ${project.id} assigns a province to a national factory`);
    }
  }
  const seenLines = new Set<string>();
  const seenRecipes = new Set<string>();
  const militaryUsed = new Map<string, number>();
  for (const line of state.production) {
    if (seenLines.has(line.id)) errors.push(`Duplicate production id ${line.id}`);
    seenLines.add(line.id);
    if (!countryIds.has(line.countryId)) errors.push(`Production ${line.id} country is unknown`);
    const key = `${line.countryId}:${line.equipment}`;
    if (seenRecipes.has(key)) errors.push(`Production ${line.id} repeats ${line.equipment} for ${line.countryId}`);
    seenRecipes.add(key);
    militaryUsed.set(line.countryId, (militaryUsed.get(line.countryId) ?? 0) + line.factories);
  }
  const seenTrade = new Set<string>();
  const seenImports = new Set<string>();
  const tradeUsed = new Map<string, number>();
  for (const route of state.trade) {
    if (seenTrade.has(route.id)) errors.push(`Duplicate trade id ${route.id}`);
    seenTrade.add(route.id);
    if (!countryIds.has(route.buyerId) || !countryIds.has(route.sellerId)) {
      errors.push(`Trade ${route.id} names an unknown country`);
    }
    if (route.buyerId === route.sellerId) errors.push(`Trade ${route.id} imports from itself`);
    const pair = `${route.buyerId}:${route.sellerId}:${route.resource}`;
    if (seenImports.has(pair)) errors.push(`Trade ${route.id} repeats an existing import`);
    seenImports.add(pair);
    tradeUsed.set(route.buyerId, (tradeUsed.get(route.buyerId) ?? 0) + route.factories);
  }
  for (const [id, country] of Object.entries(state.countries)) {
    if ((militaryUsed.get(id) ?? 0) > country.militaryFactories) {
      errors.push(`Country ${id} assigns more military factories than it has`);
    }
    if ((tradeUsed.get(id) ?? 0) > country.civilianFactories) {
      errors.push(`Country ${id} assigns more civilian factories to trade than it has`);
    }
  }

  const seenFronts = new Set<string>();
  const assignedDivisions = new Set<string>();
  for (const front of state.fronts) {
    if (seenFronts.has(front.id)) errors.push(`Duplicate front id ${front.id}`);
    seenFronts.add(front.id);
    if (!countryIds.has(front.countryId)) errors.push(`Front ${front.id} country is unknown`);
    if (!countryIds.has(front.enemyId)) errors.push(`Front ${front.id} enemy is unknown`);
    if (front.countryId === front.enemyId) errors.push(`Front ${front.id} faces its own country`);
    for (const divisionId of front.divisionIds) {
      const division = state.divisions[divisionId];
      if (!division) errors.push(`Front ${front.id} lists missing division ${divisionId}`);
      else if (division.countryId !== front.countryId) {
        errors.push(`Front ${front.id} lists a division from another country`);
      }
      if (assignedDivisions.has(divisionId)) errors.push(`Division ${divisionId} is on more than one front`);
      assignedDivisions.add(divisionId);
    }
    if (front.line.length === 1) errors.push(`Front ${front.id} line needs at least two points`);
    if (front.offensive && front.offensive.length === 1) {
      errors.push(`Front ${front.id} arrow needs at least two points`);
    }
  }

  for (const eventId of state.firedEvents) {
    if (!scenario.events.some((event) => event.id === eventId)) {
      errors.push(`Fired event ${eventId} is not in the scenario`);
    }
  }
  if (state.pendingEvent) {
    const event = scenario.events.find((item) => item.id === state.pendingEvent?.eventId);
    if (!event) errors.push("Pending event is not in the scenario");
    else if (event.countryId !== state.pendingEvent.countryId) {
      errors.push("Pending event country does not match the event definition");
    }
  }
  return errors;
}
