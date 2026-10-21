# KILL THE ZOMBIES — Implementation Plan

## Scope and source project

Use the user's uploaded `lastlight` Vite/TypeScript source as the implementation foundation. The archive had no attachable WebDev resource or Git remote, so the original public site could not be overwritten from this session. After the user explicitly authorized it, the same tested game source was copied into the new managed WebDev project `/home/ubuntu/killzombies`; leave the original URL unchanged. The original active entry (`src/main.ts`) launched a Three.js, overhead ruined-city survival slice through `src/game/survival.ts` and `src/ui/survival-ui.ts`; it already had the story sequence, movement, zombie approach/attacks, exact two-hit brain-shot rule, one-source death drop, a 20-source evolution threshold, basic pause/game-over, and regression tests. Its README/TODO explicitly stated that the game stopped at the Level 2 evolution screen, and the active build had no campaign, inventory, supply collection, weapon/ammo progression, or campaign save.

The brief explicitly changes the active game to 2D side-scrolling. Replace the active rendering/simulation path with an original Canvas 2D game while keeping the project’s Vite/TypeScript setup, existing source organization where useful, fonts, favicon, licenses, procedural-art approach, and relevant tested survival rules. Keep the old source modules in the project rather than deleting them; disconnect them from the active entry. The new managed website is only a host for this same upgraded game, not a second game scaffold; do not add a fifth campaign level.

## Implementation approach

- Keep the browser entry at `index.html` → `src/main.ts`; replace the current WebGL/Three.js launch path with a responsive Canvas 2D runtime and DOM overlays.
- Add focused `src/game2d/` modules for typed campaign data, simulation/state, world drawing, character drawing, collision/combat, inventory/missions, sound, persistence, and runtime coordination. Add a game-specific UI module under `src/ui/` and game styles under `src/styles/`.
- Represent the four locations as distinct seeded side-scrolling maps with different geometry, props, color/light treatments, enemy rosters, ambience and mission triggers: Blood Zone streets; the shopping mall; the infected hospital; and the underground research facility/boss arena. Use collision-aware world objects and a smooth following camera.
- Use reusable, original Canvas shapes and effects for the survivor, zombie archetypes, supplies, pickups, scenery, projectiles, interface marks, fog/dust/fire and transitions. Keep the survivor pale and outlined, enemies sickly grey-green with type-specific silhouettes/accent colors, and collectibles high contrast. Reuse existing fonts/favicon where appropriate; do not add unrelated stock art.
- Implement the main menu, cinematic intro/skip, briefing, gameplay, pause, inventory, player status, settings/how-to, inter-level transition/completion, game over, and campaign ending as explicit states. Inputs are consumed only during gameplay; browser audio begins after a user gesture.
- Use pure, testable rules for unlimited firearm ammunition and the infinity HUD label, damage/drop-once, inventory stacking/capacity, collection range/one-item interaction, level gating, mission submission, reward-once evolution, boss completion and save parsing. Keep Life Sources and Zombie Cores out of ordinary inventory.
- Save campaign, per-level collected/used state, player stats, inventory, currencies, ammo/unlocks, mission/station progress, and audio/accessibility settings to a versioned localStorage key distinct from the legacy settings save. Apply progression/rewards idempotently and let Continue restore the saved campaign.
- Preserve existing dependencies unless a demonstrated need arises. Use the existing Vite, TypeScript, Vitest and Playwright tooling; extend unit and browser smoke coverage for the actual Canvas game.

## Four-level campaign decisions

1. **Level 1 — BLOOD ZONE:** Normal zombies have exactly 2 HP; each death creates one blue Life Source. Start at player Level 1, 100/100 HP, Strength 25, 10 ordinary slots, a service pistol with unlimited ammunition, and 0/20 Life Sources. Legacy v1 magazine/reserve fields are retained only for save compatibility and never limit firing. Collect 20 sources, then run the one-time Human Power evolution (150 max HP, +50 current HP capped at 150, Strength 40, 15 slots, player Level 2) and unlock Level 2.
2. **Level 2 — INFECTED SHOPPING MALL:** Distinct indoor corridors/storefronts, shelves/carts/escalators/glass and flicker/emergency lights. Use Runner, Armored, Brute, Toxic and Elite Mall archetypes with different movement/health/attacks. A clearly marked research station shows costs/progress, is activated with E, explains shortages, consumes its requirements once, creates the first cure sample and unlocks Level 3.
3. **Level 3 — INFECTED HOSPITAL:** Distinct ward/lab layout with beds, wheelchairs, monitors, operating rooms and quarantine barriers. Gather uniquely identified medical supplies and records, defeat stronger infected, reveal virus-origin clues, and activate a research terminal only after its explicit requirements are met; unlock Level 4.
4. **Level 4 — THE LAST DAWN:** Distinct high-security lab/containment environment. Activate required terminals, fight evolved enemies and a unique telegraphed multi-pattern boss with its own health bar/reactions/audio. After defeating the boss, activate the infection-neutralization system and ending sequence. End at **CAMPAIGN COMPLETE — LEVEL 4 / THE LAST DAWN** with Restart Campaign and Main Menu; no Level 5.

Where the prompt leaves quantities open, make mission costs and counts explicit in campaign data (Level 2 station: 6 additional Life Sources and 3 Zombie Cores; Level 3: 3 medical supplies and 3 distinct research records; Level 4: 2 terminals, boss, neutralization console). Seed enough eligible enemies/pickups and recovery supplies for each mission to remain completable after a retry.

## Design system

- **Design movement:** Cinematic 2D survival-horror illustration with a restrained analog field-report interface; tactile silhouettes and hand-drawn environmental geometry rather than a generic pixel-art kit.
- **Core principles:** readable silhouettes first; four environments must read differently at a glance; tactical information is always legible; survival feedback is immediate and fair.
- **Color philosophy:** near-black charcoal and desaturated slate carry the danger; oxidized red marks threat/alerts; cold cyan/blue owns the supernatural Human Power and Life Source; crimson-violet owns Zombie Cores; pale silver/cream clothing separates the survivor from the world.
- **Layout paradigm:** full-viewport side-scrolling playfield with restrained edge-anchored HUD bands; contextual prompts sit near the interaction target; menus and inventory are focused overlays rather than a grid of cards over the action.
- **Signature elements:** a glowing Human Power tattoo/sigil; thin field-instrument rules and numbered mission markers; location-coded emergency-light bands and collectible halos.
- **Interaction philosophy:** one clear action per control; E previews the nearest eligible target and interacts with only that target; menus visibly capture input and return it cleanly to play; provide mouse and keyboard paths.
- **Animation:** short eased state changes, readable anticipation before hostile attacks, distinct hit/death reactions, limited screen shake, layered smoke/dust/flicker, a concise four-phase evolution and restrained reduced-effects option. Pause freezes simulation and simulation-tied audio.
- **Typography system:** reuse bundled Manus CC0 family when suitable; compact tracked uppercase labels for instrumentation, larger display face for chapter/title, neutral readable body text and keycap styling for controls. Maintain responsive type scale and contrast.
- **Brand essence:** a tense, systems-driven fight to turn an impossible infection into a cure; for players who enjoy readable, hands-on survival action. Personality: stark, resilient, uncanny.
- **Brand voice:** concise survivor field-report copy; CTAs are direct and functional. Examples: “WAKING THE CITY” and “The next breach is already moving.”
- **Wordmark/logo:** a custom all-caps title lockup paired with a fractured cyan life-source diamond/sigil, retaining the supplied game’s recognizable energy motif without retaining its old Lastlight wording.
- **Signature brand color:** Human Power cyan `#62E7F2`.

## Project structure

- `index.html`, `src/main.ts`: browser shell, boot state, input setup and runtime composition; update document title/meta and remove old active branding.
- `src/game2d/`: new 2D campaign model and pure rules; canvas world renderer and actor drawing; simulation, movement, enemy AI, weapon/inventory/mission logic, level transitions, persistence, and synthesized Web Audio.
- `src/ui/`: new game UI that exposes the required state panels and updates HUD from typed game state. Leave unused `survival-ui.ts` in place as source history, not wired into the entry.
- `src/styles/`: game-specific responsive dark survival interface styles. Preserve licensing and existing bundled font files.
- `tests/`: expand pure-rule tests and add actual browser-flow checks; revise `scripts/smoke.mjs` to target the new public runtime and expose development-only deterministic test hooks.
- Existing `src/game/`, `src/engine/`, `scripts/`, sharing metadata, and asset-lock artifacts remain available. Only update project docs/identity/build metadata necessary for the new game; do not delete original sources or licenses.

## Material constraints

The uploaded archive had no Git repository or valid WebDev binding, and attachment to `https://lastlight-gqm9lwkl.manus.game` was denied. The user then authorized a separate permanent site; the new project uses the same upgraded Canvas game code, a static `dist/` build, and localStorage saves. The original public site is left unchanged. No backend or database is required.


## Permanent website delivery

- The user explicitly authorized a separate permanent site with a new URL after WebDev denied attachment to the original project's resource. Keep `https://lastlight-gqm9lwkl.manus.game` unchanged.
- Reuse the already completed Vite/TypeScript Canvas 2D game source and its existing assets. Do not substitute a new game scaffold for the playable game.
- Host it as a managed static website: the root route serves the game, `dist/` is the publish output, and the production build runs from the committed package manifests/lockfile using the source-only `pnpm build` script. Keep the original asset-sync aliases explicit and unused by the new site's build. No backend, database, login, or private runtime secret is needed.
- Preserve the source's game title, favicon, responsive controls, four-level campaign, infinite ammunition, local save behavior, and verified source/build checks.

## 30-second gameplay demo video

- Produce a **30-second** 16:9 gameplay video from authentic captures of the current KILL THE ZOMBIES game; do not add a playable tutorial or change game behavior for the video.
- Show the title/gameplay, all four distinct campaign environments, readable action/combat, unlimited ammunition, and the Level 4 origin-site threat; finish with a clear KILL THE ZOMBIES end card.
- Export a polished 1280×720 H.264 MP4 with restrained audio and concise scene labels; deliver the video as a file. The video is a separate deliverable and is not a new website feature.
