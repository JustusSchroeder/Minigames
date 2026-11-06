# Phase 1 acceptance

- [x] The app runs locally with the pinned stack and no account or network connection after install.
- [x] A campaign starts at 04:00 on 1 September, 68 Ma for the Rhenish Massif or Holy Cross Island.
- [x] The clock pauses, resumes, and runs at 1x, 2x, 4x, and 8x. Pause does not advance the date.
- [x] Europe's administrative areas render from generated geometry, with click selection, pan, and zoom.
- [x] Map modes recolor political control, terrain, infrastructure, resources, supply, military control, and victory points from campaign data.
- [x] A march order reports success or a specific refusal. An attack into an adjacent hostile province is accepted. A route through hostile territory is refused.
- [x] Battles reduce organization and strength. A broken defender retreats and loses control. The owner stays the same.
- [x] Supply is a path from the capital. The Galician detachment is short. Warsaw is not.
- [x] The 2 September satellite-pack decision changes Rhenish manpower when chosen, and a computer-controlled Massif picks by weight.
- [x] Saves round-trip through Zod and Dexie. A corrupt save is rejected.
- [x] The same seed, orders, and hour sequence repeat the same state.
- [x] Map validation fails closed on duplicate ids, bad owners, broken rings, one-way borders, and isolated land.
- [x] Coverage and assumptions are written down. Missing countries are not drawn as empty provinces.

# Economy acceptance

- [x] Controlled deposits add steel, aluminum, oil, rubber, tungsten, and chromium to the national stockpile at midnight. A captured deposit changes who receives it.
- [x] Civilian factories build civilian factories, military factories, or infrastructure. Infrastructure changes supply. Factories spent on trade do not build.
- [x] Military factories produce harness into the stockpile. A steel shortage delivers less and does not raise efficiency. Formations do not gain that harness.
- [x] A player can open and close an import. Delivery is limited by the seller's reserve and by connected infrastructure. Trade with a country at war is refused.
- [x] The same commands and hours repeat the same stockpiles, queue, and efficiency.

# Division designer acceptance

- [x] A template stores line dinosaur species and support species. Soft attack, hard attack, defense, breakthrough, organization, width, manpower, harness, supply use, and steel cost are derived from that list.
- [x] Adding a species changes those figures. A pack already raised keeps its handlers and harness, and its shown statistics scale by the new readiness.
- [x] A line species cannot be filed as support, a support species cannot stand in the line, and the line and support caps are enforced.
- [x] A player cannot edit another country's template.
- [x] Recruitment spends handlers and harness and raises a full-strength pack in a controlled province. A short pool, a hostile province, or an empty template spends nothing.
- [x] The same recruit commands produce the same division.
- [x] The designer shows the derived statistics, and raising a division from it changes the army and the stockpile.

# Fronts and combat modifiers

- [x] Armor above the enemy's piercing raises that side's attack or defense and halves the organization loss it takes.
- [x] An idle division digs in. Engineers dig faster. A battle freezes the defender's entrenchment, and an order clears it. Higher entrenchment keeps more organization.
- [x] A fort project on a controlled province raises the fort level, and five levels keep more organization than none.
- [x] January snow on continental ground reduces attack and lengthens a march. September stays clear.
- [x] A defender with no path to its capital loses organization faster. Cut off with nowhere to retreat, it is shattered.
- [x] A front can be opened only against a country at war that shares a border. Hold marches an assigned division to an empty border province. Attack from that border targets the enemy province.

# Logistics acceptance

- [x] A railway on both sides of a weak road raises the supply that gets through.
- [x] Trucks stop after two provinces. A hub on the way extends that range. An inland province cannot take a port.
- [x] A sea lane between friendly ports supplies a province that no longer touches the land network.
- [x] The supply map draws those rail, road, and sea links, and the province panel shows railway, port, and hub.
- [x] The Galician detachment stays short. Warsaw does not. Developed provinces and seaports start with a schematic railway or port.

# Research acceptance

- [x] Machine tools raise harness output. Beast handling raises the attacker's organization damage.
- [x] A doctrine school blocks the other school. A slot cap and a missing prerequisite refuse a start.
- [x] A focus needs its earlier node. Completing it adds the listed factories or unlocks.
- [x] A computer-controlled country assigns open technologies at midnight.
- [x] The research panel shows slots, known work, running projects, and the player's focus tree.
