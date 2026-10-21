# KILL THE ZOMBIES

**KILL THE ZOMBIES** is a complete four-level 2D side-scrolling survival campaign built from the uploaded Lastlight source project. The original TypeScript/Vite project, bundled fonts, existing unit tests, and original gameplay files remain in place; `src/main.ts` now boots the active Canvas 2D campaign in `src/game2d/`.

## Run the game locally

Requirements: Node.js 22 and pnpm.

```bash
pnpm install
pnpm dev
```

Open the Vite address printed in the terminal (normally <http://localhost:5173>). The local run does not depend on hosted asset storage.

Build and test:

```bash
pnpm typecheck           # strict TypeScript diagnostics
pnpm test                # unit and regression suite
pnpm build               # production Vite bundle and size budget without hosted asset sync
pnpm smoke               # headless browser gameplay acceptance flow
```

The browser test uses Chromium and writes screenshots to `./shots/`. If Chromium is installed elsewhere, set `CHROMIUM_PATH=/absolute/path/to/chromium`.

The new permanent site uses source-only `pnpm dev` and `pnpm build`; its hosted static build does not restore or write assets from the original game project. The `dev:local` and `build:local` aliases remain available. Explicit `manus:dev` and `manus:build` aliases preserve the original project's legacy asset-sync workflow and are not used by this site's preview or production build.

## Controls

| Input | Action |
| --- | --- |
| A / D or Left / Right | Move |
| W / Up / Space | Jump; Space also starts a level from its briefing |
| Shift | Sprint |
| Mouse aim + left click | Fire the equipped firearm |
| F / Enter | Keyboard attack |
| 1 / 2 / 3 / 4 | Equip an unlocked weapon |
| E | Collect the nearest pickup or use a nearby mission station |
| I or the HUD Inventory button | Open / close Human Power Inventory |
| Tab | Open / close Player Status |
| Esc | Skip the opening cinematic, pause/resume play, or close an open panel |

All firearms (pistol, shotgun, and assault rifle) have unlimited ammunition and never empty. The HUD shows **∞ AMMO · NO RELOAD**; there is no manual or automatic reload, delay, or out-of-ammo state. Optional ammo pickups remain storable; selecting one explains that it is not needed and keeps it in inventory.

## Campaign

1. **Blood Zone — Ruined City Street:** The survivor begins at 100 HP with Strength 25 and a service pistol with unlimited ammunition. Each normal infected takes exactly two successful pistol hits and drops one blue Life Source. Collect 20 to trigger the Human Power awakening: HP/max HP 150, Strength 40, Player Level 2, inventory capacity 15, and Level 2 unlocked.
2. **Infected Shopping Mall:** Defeat evolved infected, collect at least 6 Life Sources and 3 separate Zombie Cores, then submit them at the research station to create the cure sample. The breach shotgun unlocks.
3. **Infected Hospital:** Collect 3 medical supply packs and 3 distinct research records/clues, then submit them at the research terminal. Activation consumes exactly those required units, preserves any extras, and unlocks the assault rifle and Level 4.
4. **The Last Dawn — Origin Site:** Collect energy components and activate both security terminals, defeat the Origin boss, then activate the infection-neutralization system. The campaign ends here; there is no fifth level.

The four levels use distinct palettes, silhouettes, props, lighting and mission spaces: ruined city streets, a retail mall, a medical complex, and a sealed research facility. Enemies vary in health, speed, attacks and ranged behavior; doors, shelves, rubble, beds, generators, lab pods, terminals and other obstacles affect movement or combat.

## Supplies, inventory and persistence

Ordinary supplies use the **Human Power** storage grid; Life Sources and Zombie Cores remain separate mission counters. Inventory capacity increases by exactly five slots per player-level increase: 10, 15, 20, then 25. Identical items stack to their defined limit. If only part of a stack fits, only that quantity is collected and the remainder stays in the world. A full inventory never silently removes a supply.

Medkits restore up to 35 HP; bandages, food, and water provide smaller recovery. Ammo pickups can be stored as optional supplies, but all firearms already have unlimited ammo; using an ammo item explains this and keeps it in inventory. Research, crafting, and quest items remain available for their relevant mission uses, and the inventory explains when an item is not consumable there.

Campaign progress and settings are stored in browser local storage. **Continue** restores the saved level, position, health, weapon/ammunition, inventory, collected/dead IDs, objective progress, mission resources, evolution, and preferences. **Play** does not overwrite an existing campaign without a separate start-over confirmation. Retrying a level restores the survivor to maximum HP but retains campaign resources and completed objectives, so collected drops and rewards do not duplicate.

## Project map

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Active browser entry, input listeners, Canvas/UI wiring and development-only test hooks |
| `src/game2d/types.ts` | Typed campaign, actor, world, item, weapon and save models |
| `src/game2d/content.ts` | Four distinct level layouts, palettes, props, enemy rosters, stations and pickups |
| `src/game2d/rules.ts` | Pure combat, inventory, infinite-ammo display, capacity and progression rules |
| `src/game2d/game.ts` | Active 2D simulation, movement/collision, combat, interactions, mission progression and persistence |
| `src/game2d/renderer.ts` | Original Canvas 2D scenery, survivor/zombie drawings, lighting, effects and animation |
| `src/game2d/audio.ts` | Browser-safe synthesized combat, character, UI and level ambience sounds |
| `src/ui/kill-zombies-ui.ts` | Main menu, cinematic, level briefings, HUD, inventory/status, settings, pause, game-over and ending screens |
| `src/styles/game2d.css` | Responsive game UI, typography, layout, animations and reduced-motion/contrast handling |
| `src/game/`, `src/engine/`, `src/ui/ui.ts` | Existing uploaded 3D gameplay and engine source retained as reference; the active entry now uses `src/game2d/` |
| `tests/game2d.test.ts`, `tests/campaign-resume.test.ts` | Campaign logic, two-hit kills, unlimited ammo/save migration, capacity, stacking, research, and correct resume screens after Level 1–3 missions and the Level 4 ending |
| `scripts/smoke.mjs` | Local Chromium smoke/acceptance test against the active playable build |

The project uses its bundled Manus CC0 fonts and original vector-style Canvas artwork, with no required remote art or audio assets. Audio safely falls back to synthesized Web Audio and initializes after user interaction; the city, mall, hospital, and research site have distinct generated ambience. Settings include master/music/SFX volume, mute, reduced intense effects, and stronger character outlines.
