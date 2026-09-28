# Castle defense

A browser castle-defense game. You fly a free camera over an island meadow, place walls and towers around a keep, then survive **10 waves** of enemies that land from the shore and path to the keep.

Play it from the hub card **Castle defense**, or open this folder directly:

- Local: [http://127.0.0.1:8765/castle-defense/](http://127.0.0.1:8765/castle-defense/)
- GitHub Pages: [https://phonedmonkey10.github.io/Minigames/castle-defense/](https://phonedmonkey10.github.io/Minigames/castle-defense/)

You need a static file server (modules and an import map). Serving the folder with `python3 -m http.server` is enough. There is no build step.

## How to play

1. Press **Play**. The mouse locks to the meadow.
2. Place farms, barracks, walls, and towers on **grass**.
3. Press **Start waves** when you are ready.
4. Keep the keep’s health above 0 through all 10 waves.

You start with **180 gold**. During prep, gold cannot go above **400**. After waves start, that cap is lifted. Selling a building refunds its full cost.

**Win:** clear wave 10. **Lose:** the keep reaches 0 HP.

### Camera

Click the meadow to lock the mouse.

| Input | Action |
| --- | --- |
| Mouse | Look |
| W / S | Fly forward / back along the camera |
| A / D | Strafe |
| Space | Up |
| Shift | Down |
| Double-tap W | Sprint |
| Q | Cancel building, or clear troop selection |
| E | Select all troops |
| Esc | Release the mouse (if a wall is being drawn, Esc cancels the draw first) |

### Building

The crosshair picks a point on the ground. Keys **1–5** or the **scroll wheel** choose a building. Click a placed building to inspect it (sell, or open the barracks troop menu).

You can only **build on grass**. Beach, shallows, forest, rocks, the keep, and occupied tiles are blocked.

| Key | Building | Cost | HP | Notes |
| --- | --- | --- | --- | --- |
| 1 | Wooden wall | 10g+ | 40 per piece | Drawn as a line. See [Walls](#walls). |
| 2 | Crossbow | 40g | 60 | Range 5.2 tiles, 8 damage, 0.7s between shots, bolt |
| 3 | Cannon | 70g | 70 | Range 4.2 tiles, 18 damage, 1.6 splash, 1.8s between shots, ball |
| 4 | Farm | 50g | 25 | +2 gold per second. Cap of 6 farms |
| 5 | Barracks | 80g | 80 | Opens a troop menu. Each barracks adds 20 army space. Troops train instantly |

Towers shoot the nearest enemy in range. Cannons deal splash. Range is measured in tiles (each tile is 2 world units).

### Walls

Walls are not single tiles. Click a start point, then click the other end.

- Minimum length: about 0.7 tiles. Maximum: 14 tiles.
- Aim near an existing wall tip to snap a joint.
- Each wall is split into pieces. Longer walls cost **less per piece**: 10, then 8, 6, 5, then 4 gold for every piece after that.
- Enemies cannot walk through walls. They smash the nearest blocking wall (or the keep) instead of walking around if the wall sits on their path.

### Army

Open any barracks for a Clash-style troop menu. Click a unit to train it **instantly**. Hold the button to keep training. Troops spawn at the hall you have open and walk to that hall's rally.

Each barracks adds **20 army space**. One train click buys a **squad**: several bodies for that slot's housing. A Warden train still costs 4 space and drops 5 Wardens.

| Troop | Cost | Space | Squad | Role |
| --- | --- | --- | --- | --- |
| Spearman | 5g | 1 | ×8 | Cheap melee swarm |
| Slinger | 8g | 1 | ×6 | Short-range shots |
| Raider | 6g | 1 | ×8 | Fast melee swarm |
| Knight | 28g | 5 | ×3 | Slow tank |
| Warden | 32g | 4 | ×5 | Ranged splash |

Click grass while a barracks is selected to set that hall's **rally**. Idle troops gather there unless you give them an order.

**Select troops:** with no building tool (right-click or Q), drag a box on the meadow to select. Click a cluster to select nearby units. Ctrl-click adds to the group. **E** selects everyone. Click the ground (or right-click) to send them. **Q** clears the selection.

### Enemies

Enemies spawn in the **shallows** around the island and path over beach, grass, and forest toward the keep. They attack walls that block them, then the keep.

| Type | HP | Damage | Speed | Gold | Role |
| --- | --- | --- | --- | --- | --- |
| Goblin | 18 | 7 | 3.4 | 4 | Early fodder |
| Runner | 12 | 6 | 5.4 | 5 | Fast, fragile |
| Archer | 28 | 6 | 2.3 | 8 | Attacks from 2.4 tiles |
| Brute | 80 | 14 | 1.55 | 10 | Slow tank |
| Ogre | 220 | 28 | 1.15 | 28 | Late-wave boss |

Killing an enemy grants its gold immediately.

### Waves

There is a 2-second pause between waves. Composition, in spawn order:

| Wave | Mix |
| --- | --- |
| 1 | 8 goblins |
| 2 | 12 goblins |
| 3 | 8 goblins, 3 brutes |
| 4 | 8 goblins, 4 brutes |
| 5 | 5 goblins, 8 runners |
| 6 | 5 goblins, 3 brutes, 5 runners |
| 7 | 3 goblins, 3 brutes, 5 archers |
| 8 | 5 goblins, 4 brutes, 3 runners, 3 archers |
| 9 | 6 goblins, 4 brutes, 1 ogre |
| 10 | 3 goblins, 4 brutes, 3 runners, 3 archers, 2 ogres |

## The island

The map is a tile grid (320×320 tiles, 2 units each) with an oval island in the middle.

| Ground | Looks like | Build? | Walk? |
| --- | --- | --- | --- |
| Grass | Bright green meadow | Yes | Yes |
| Forest | Tree groves on the meadow | No | Yes |
| Beach | Yellow ring around the island | No | Yes |
| Shallows | Light water at the shore | No | Yes (spawn) |
| Rock | Grey shore blobs enemies walk around | No | No |
| Sea | Open water | No | No |

The keep occupies four grass tiles near the center. Enemies land from spawn tiles in the shallows all around the coast.

## Files

Everything lives in `castle-defense/`. There is no bundler. ES modules load in the browser. Three.js 0.170 comes from jsDelivr via the import map in `index.html`.

```
castle-defense/
  index.html      HUD, overlays, import map
  css/style.css   Layout and HUD
  js/world.js     Island, tiles, pathfinding, walls
  js/game.js      Sim, input, waves, audio
  js/view3d.js    Three.js scene, camera, meshes
```

- **`world.js`** — Island shape, terrain kinds, keep and spawn tiles, A\* pathfinding, wall segments, build rules.
- **`game.js`** — Gold, buildings, troops, enemies, projectiles, wave queue, pointer-lock input, Web Audio beeps.
- **`view3d.js`** — Ground mesh and color map, trees, rocks, keep, buildings, units, and the flying camera.

## Debug

Append `?admin` to the URL, or press **F2** in play, for unlimited gold. F2 toggles it off again.

## Run from the repo root

```bash
python3 -m http.server 8765
```

Then open [http://127.0.0.1:8765/castle-defense/](http://127.0.0.1:8765/castle-defense/).
