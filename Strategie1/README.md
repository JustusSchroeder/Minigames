# Meridian Front

Meridian Front is an original grand-strategy game. This playable build is a Late Cretaceous (Maastrichtian, 68 Ma) campaign on a map of Europe: a pausable simulation, a selectable province map, march and attack orders, hourly combat, capital-based supply, construction, production, trade, a pack designer, recruitment, fronts, armor, entrenchment, forts, weather, encirclement, rail and port supply, research, doctrines, national focuses, and local save/load.

Hearts of Iron is a reference for the genre only. This project does not use its code, data, art, or trademarks.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5174. Choose the Rhenish Massif or Holy Cross Island. The clock starts paused.

```bash
npm test
npm run typecheck
npm run test:e2e
```

`npm test` rebuilds the map, then runs Vitest. Playwright needs a Chromium install: `npx playwright install chromium`.

## Layout

- `apps/web` renders the interface and the PixiJS map. It does not own the rules.
- `packages/core` is the authoritative simulation. It does not import React, PixiJS, or Dexie.
- `packages/shared` holds Zod schemas and the command types.
- `packages/content` holds the Late Cretaceous scenario.
- `packages/map-data` holds source cells, Natural Earth land, and generated runtime files.
- `tools/map-import` builds and validates province geometry.
- `tools/data-validation` checks the scenario against the engine rules.

The engine API is `createCampaign`, `advanceSimulation`, `issueCommand`, `queryCountry`, `queryProvince`, `createSave`, and `loadSave`. Saves store the serializable state. The scenario is loaded beside the save so the map is not copied into every file.

See `docs/architecture.md` for the system split and `docs/roadmap.md` for what is intentionally not in this build.
