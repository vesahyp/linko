# CLAUDE.md

Guidance for AI agents working in this repo. `README.md` is the player page.
Code, architecture and process notes live here. `TODO.md` is forward-looking
only; git history is the record.

## What this is

**Linko** (Finnish for slingshot) is a single-player shooter for the
browser, phones first, landscape, twin-stick: Star Control 2's melee round a
planet, played with Höyry's hands, with R-Type's charge shot, pod and dense
formations. The planet's pull acts on everything that moves: the ship, the
pod, every enemy, every bullet, the sparks of an explosion. The design is
`docs/design.md` (moved here from `jeeves/ideas/` the day the repo was made).
The stack is copied from the sibling games Höyry (`../hoyry`) and Räkkä
(`../rakka`); `docs/adr/0001-hoyry-stack.md` says why.

## Stack

- **Vite + TypeScript + React.** React renders the title, the HUD, the card
  pick and the overlays. The game itself never goes through React.
- **Canvas 2D** for the game view. No engine, no physics library. Ships are
  drawn with canvas paths every frame; the background (stars, the sunk grid
  that shows the pull, the planet) is drawn once per size and cached.
- **Seeded RNG** (`src/game/rng.ts`, mulberry32) on the sim state. Same seed
  and same input replay the same run.

## Where things live

```
src/
  game/                 the simulation, no DOM anywhere in here
    state.ts            SimState, Ship, Pod, Enemy, Bullet, SimInput, the arena size
    physics.ts          the pull (r^-1.5, docs/adr/0002), orbit speed, NO_RETURN,
                          predict() for path lines, solveAim() for every auto-aim
    content.ts          the enemies, the upgrades, the six waves
    sim.ts              newRun, step(): the ship, the pod, enemy behaviour,
                          bullets, collisions, waves, the card pick
  render/renderer.ts    fits the arena in the safe area; draws it all
  input/
    input.ts            two thumbs (move stick, charge-and-aim), the pod button,
                          keyboard and mouse
    stick.ts            the stick arithmetic shared with the hand
  ui/Game.tsx           the game loop (fixed step), HUD, the card pick, pause
  App.tsx               title, death screen, the local best score
  audio.ts              Web Audio synth
  version.ts            build id and the update banner (copied from hoyry)
tools/
  hand.ts               the hand: a player with a thumb's limits (reaction time,
                          thumb speed, attention, aim error). Headless for the
                          checks; in the page (?hand=1) it only says where its
                          thumbs are
  sim-check.ts          npm run sim-check: the rules, asserted
  balance.ts            npm run balance: the hand's runs, one line each
scripts/
  playthrough.mjs       make playthrough: the hand on an emulated iPhone 15 in
                          landscape, every input a real touch (CDP), on video
  sheet.mjs             make sheets: the playthrough's frames in grids
```

## Rules

1. **The sim is headless.** Nothing under `src/game/` touches `window`,
   `document`, React or audio. Sounds are names pushed onto `state.sounds`.
2. **Fixed step.** `DT = 1/60`; the render loop calls `step` a whole number
   of times. Edges (the charge release, the pod tap) go to the first step of
   a frame only.
3. **Everything that moves falls.** A new body (a bullet kind, an enemy, a
   pickup) gets `gravity()` added to its velocity every step unless it is
   on rails on purpose (the carrier, the spinner's slow circle, a hover
   that pays thrust against the pull and shows it). Gravity that is only
   drawn is not the game.
4. **One auto-aim.** Every aimed shot, the player's and the enemies', goes
   through `solveAim`, which flies candidate shots under the pull. A shot
   aimed in a straight line at something is a choice (the hand's drag, the
   dart's spread) and should read as one.
5. **Upgrades show on the ship.** A new upgrade gets a drawing in
   `renderer.ts`'s `drawShip` (barrels, coils, nozzles, plates, racks, bits,
   the pod's colour) in the same commit as its rule.
6. **Content is data.** An enemy is an `EnemyDef` plus its case in
   `stepEnemies`; an upgrade is an `UpgradeDef` plus its rule, read through
   `ship.upgrades[id]`; a wave is a list of timed groups in `WAVES`.
7. **English only for now.** Player strings are English; Finnish is on the
   TODO list. Identifiers, comments and docs are English.

## Workflow

- `make dev` (http://localhost:5173).
- **Before committing:** `make check` must pass (typecheck, build,
  `sim-check`, `playthrough`). The playthrough needs `make shots-setup` once.
- **Judge it by thumb, never by the bot winning.** A balance or feel change
  is proved with the hand: `make balance` for the numbers over many seeds
  (it should still die: median around wave 9, some before 6), then `make
  playthrough` and `make sheets`, and look at the frames before reporting.
  The playthrough prints, per wave, how much the planet did (hits that
  curved, enemies into it, slingshots, hull lost to it) and fails a wave
  where it did nothing.
- **URL knobs:** `?seed=N` fixes the run, `?wave=N` starts on wave N with
  the cards a run would have by then, `?speed=3` runs the sim faster,
  `?hand=1` lets the hand publish its thumbs (the playthrough's input).
- Deploy is automatic: every push to `main` builds and publishes to GitHub
  Pages at https://vesahyp.github.io/linko/.
- When a change alters what the player sees or does, update `README.md` in
  player words.
