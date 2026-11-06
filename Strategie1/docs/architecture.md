# Architecture

Meridian Front keeps one authoritative campaign. React and PixiJS read snapshots. They do not advance the clock or resolve combat.

## Why these boundaries

npm workspaces keep the engine, content, and web app in one install without a second package manager. The core package exports TypeScript source so Vite and Vitest compile it directly. That avoids a second build step while the engine is still small.

The simulation worker exists in this first build because the message protocol is part of the architecture: start, command, advance, save, and load. The main thread sends commands and receives a snapshot after each request, not a copy of the world on every animation frame. The hour budget is capped at six game hours per request so a background tab cannot queue an unbounded catch-up.

`loadSave` takes the scenario as a second argument. The illustrative `loadSave(saveData)` signature would have forced a hidden scenario registry inside the engine. Passing the scenario keeps the core free of content imports and makes a bad save fail against a known definition.

## Clock

The simulation steps one game hour at a time. Pause sets a flag, and `advanceSimulation` returns immediately while that flag is set. Speeds are 1x, 2x, 4x, and 8x, meaning that many game hours per real second. Choosing a speed also resumes the clock unless a player decision is open.

Movement is resolved every hour. Combat is resolved every hour a battle exists, because a battle has to change organization and strength through the day. Supply is recomputed at midnight, again if construction changes infrastructure, and immediately when control changes. The economy settles at that same midnight. Timings for movement, combat, supply, economy, and events are returned on the simulation report and are not written into campaign state, so they cannot disturb determinism.

## Combat and supply

A pack template stores line dinosaur species and support species. Soft attack, hard attack, defense, breakthrough, organization, combat width, manpower, harness, and supply use are derived from that list. Readiness is the lower of its handler ratio and harness ratio. The figures shown for a pack are those derived statistics multiplied by readiness. Changing a template does not issue handlers or harness to packs already in the field. Combat width is 80. Packs that do not fit do not contribute that hour. A template with no combat width does not fight. Organization loss is split across the packs that fit, and a fraction of that loss removes handlers and harness. An attacker whose organization reaches zero falls back to the province it marched from. A broken defender retreats to the best-supplied friendly neighbor, and the attacker takes control. Ownership does not change. If that defender has no friendly path to its capital, it takes extra organization loss. If the retreat province is also cut off, the formation is deleted.

Armor is the highest species armor on a side, scaled by readiness. Piercing is the average. When armor exceeds the other side's piercing, that side's attack or defense rises by 40 percent and the organization loss it takes is halved. Each fort level adds 15 percent defense, up to five. An idle pack digs in one entrenchment an hour, or two with a stegosaur, up to 20. Each point adds 3 percent defense. An order, a battle, or an attack resets it. A defender whose province is already in battle keeps the value it had. Weather is taken from the month and the province climate. September is clear. Rain, mud, and snow reduce attack and slow movement. They do not reduce defense.

A front is one enemy. It lists the player's controlled provinces that touch that enemy. Hold sends idle assigned divisions to the empty ones, shortest path first. Attack orders a division that is already on the border into the enemy province with the lowest id, and marches the others to the border. A division that already has an order or a battle is skipped. A manual move is unchanged.

Recruitment spends the template's handlers and harness from the national pools and raises a new pack at full strength in a controlled province. If either pool is short, or the province is hostile or in battle, nothing is spent. Production still does not reinforce existing formations. The designer can assign military factories to the harness line those species require.

Research slots work one technology or doctrine each. Progress is one day at midnight. A finished project adds its modifiers: beast handling and mobile warfare raise attack, support weapons and the battle-plan school raise defence, field guns and breakthrough emphasis raise breakthrough, machine tools raise military output, and construction methods speed the civilian queue. Starting a doctrine school closes the other. The engine reads those modifiers from the country's researched list. It does not branch on a country id.

A focus tree is scenario data. The player starts one focus at a time. A computer-controlled country with empty labs or no running focus picks the first open technology and the first open focus at midnight. Completing a focus applies the same effect list events use, including factories and unlocking a technology.

Supply starts at the capital, which is a hub. Trucks travel two provinces from a hub, and the amount that arrives is the bottleneck along the route. A road into a province carries infrastructure times eight. A railway between two provinces that both have track can carry more than that road, twelve per rail level. A sea lane joins friendly ports at sixteen per port level. There is no blockade. A hub reached by rail, sea, or truck restarts the two-province truck range. The supply map draws the rail, sea, and road links that won, and marks hubs. A province with no demand is fully supplied. A province whose demand exceeds what arrived is short, and that ratio reduces combat. Building a railway, port, or hub recomputes supply when it finishes. Infrastructure still does too.

## Economy

The economy settles once, at midnight, after supply is current and before events. Extraction from controlled deposits is added to the national stockpile. Imports then move resources from the seller's stockpile to the buyer, limited by the civilian factories on the route, the seller's reserve, and the buyer's transport. Transport is the connected infrastructure of the buyer times four. Civilian factories assigned to trade do not build that day.

The construction queue spends the remaining civilian factories, at most fifteen on one project. A finished civilian or military factory is idle until the player assigns it. Infrastructure adds one level to a controlled province and supply is recomputed. A fort adds one level on a controlled province and does not change supply. Military factories on a production line consume the infantry-equipment recipe and deliver finished equipment to the stockpile. A shortage reduces that delivery and stops efficiency growth. That delivery does not enter formations. Recruitment is the order that spends the stockpile.

Dockyards stay as a count. They do not build ships. Trade between countries at war closes at the next midnight. There is no sea blockade in this phase.

## Data

Country behavior comes from scenario data: alignment, capitals, the starting templates, wars, and events. Edited templates are campaign state, so a save keeps them. The engine does not branch on a country id to invent a special rule. Events fire on an exact game date. The player is paused for a choice. Another country picks by weight with the seeded generator.

Zod parses scenarios and saves. Unknown keys are rejected. A save that parses but points a division at a missing province is rejected by the referential check. There is no fallback campaign.
