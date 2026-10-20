# CLAUDE.md

Guidance for AI agents working in this repo. `README.md` is the player page.
Code, architecture and process notes live here. `TODO.md` is forward-looking
only; git history is the record.

## What this is

**Linko** (Finnish for slingshot) is a single-player arcade shooter for
the browser, phones first, landscape, in the shape of R-Type: a stage that
scrolls, set-piece formations, readable bullet patterns, a charge beam, a
pod, power-ups shown on the ship, and bosses built of parts with phases and
weak points. It began as a planet-gravity game (ADR 0002) and became this
on 2026-10-13 (ADR 0003). The design is `docs/design.md`. The stack is
copied from the sibling games Höyry (`../hoyry`) and Räkkä (`../rakka`);
`docs/adr/0001-hoyry-stack.md` says why.

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
    state.ts            SimState, Ship, Pod, Enemy, Part, Bullet, Beam, SimInput, the screen size
    content.ts          enemies, guns, drops, cards, the three stage scripts and their terrain
    sim.ts              newRun, continueRun, step(): the scroll, the script, the ship and its
                          guns, the charge, the pod, enemy behaviour, drops, collisions, the
                          stage clear and the card pick
    bosses.ts           the Warden, the Serpent and the Bulwark: their parts and phases
    patterns.ts         enemy shots and the few patterns: aimed, fan, ring, beam
    fx.ts               explosions and sparks
  render/renderer.ts    fits the screen in the safe area; stars, terrain, ships, bosses part by
                          part, beams with their warning, shots, drops
  input/
    input.ts            relative drag on the left, hold to charge on the right, the pod button,
                          keyboard
    stick.ts            the drag rule (GAIN, MOVE_ZONE), shared with the hand
  ui/safe.ts            the safe area (and the ?safe= knob), fullscreen where the browser allows it
  ui/Game.tsx           the game loop (fixed step), HUD, boss bar, beam meter, card pick, pause
  App.tsx               title, the end screen with continue, the local best score
  audio.ts              Web Audio synth
  version.ts            build id and the update banner (copied from hoyry)
tools/
  hand.ts               the hand: a player with a thumb's limits (reaction time, thumb speed,
                          attention, judgement). Headless for the checks; in the page (?hand=1)
                          it only says where its thumbs are
  sim-check.ts          npm run sim-check: the rules, asserted
  balance.ts            npm run balance: the hand's runs, one line each, with what hurt it
scripts/
  playthrough.mjs       make playthrough: the hand on an emulated iPhone 15 in landscape,
                          every input a real touch (CDP), on video
  sheet.mjs             make sheets: the playthrough's frames in grids
  boss-shots.mjs        make boss-shots: each boss mid-fight
  screen-check.mjs      make screen-check: the play screen fills the phone, inside its safe area
  icons.mjs             make icons: the home-screen PNGs from public/icon.svg
```

## Rules

1. **The sim is headless.** Nothing under `src/game/` touches `window`,
   `document`, React or audio. Sounds are names pushed onto `state.sounds`.
2. **Fixed step.** `DT = 1/60`; the render loop calls `step` a whole number
   of times. Edges (the charge release, the pod tap) go to the first step of
   a frame only.
3. **Bullets are readable.** Every enemy shot is the same pink orb with a
   white core, drawn on top of everything. A pattern differs by count,
   speed and spacing, never by look. A beam always shows its warning line
   first. No enemy fires from closer than 90 units to the ship
   (`patterns.ts`): a thumb cannot dodge that, so it is only a hit.
4. **What you see is what you hit.** A boss is its parts: the hull art may
   be larger, but a part is drawn where its circle is, and armour, guns and
   the weak point each look different.
5. **Power-ups show on the ship.** A new gun, item or card gets a drawing
   in `renderer.ts`'s `drawShip` in the same commit as its rule.
6. **Content is data.** A formation is a `Line` in a stage script, an enemy
   an `EnemyDef` plus its case in `stepEnemies`, a boss a `makeBoss` case
   plus its function in `bosses.ts`.
7. **English only for now.** Player strings are English; Finnish is on the
   TODO list. Identifiers, comments and docs are English.

## Workflow

- `make dev` (http://localhost:5173).
- **Before committing:** `make check` must pass (typecheck, build,
  `sim-check`, `screen-check`, `playthrough`). The playthrough needs `make shots-setup` once.
  It takes about seven minutes: it plays all three stages in real time.
- **Judge it by thumb, never by the bot winning.** A balance or feel change
  is proved with the hand: `make balance` for the numbers over many seeds
  (where runs end, boss fight times, what took the hull), then `make
  playthrough` and `make sheets`, and look at the frames before reporting.
  As of 2026-10-14, over 24 seeds the hand loses 4 runs in stage 1, 6 to
  the Serpent and 5 in the Dock, and clears all three stages in 9.
- **The screen:** `make screen-check` proves the play screen fills an
  iPhone 15 in landscape two ways: the whole 852x393 screen as from the
  home screen, with the notch and home-bar insets stood in by
  `?safe=59,59,0,21` (Chromium's emulation has no notch), and Playwright's
  734x343 preset, the page Safari leaves beside its bars. Every inset in
  CSS goes through `--safe-*` (`src/ui/safe.ts`), never `env()` directly,
  so the knob reaches it.
- **URL knobs:** `?safe=l,r,t,b` stands in for the safe area, `?seed=N` fixes the run, `?stage=N` starts on stage N with
  the build a run has by then, `?boss=1` skips to the stage's boss,
  `?god=1` keeps the ship alive (screenshots), `?speed=2` runs the sim
  faster, `?hand=1` lets the hand publish its thumbs.
- Deploy is automatic: every push to `main` builds and publishes to GitHub
  Pages at https://vesahyp.github.io/linko/.
- When a change alters what the player sees or does, update `README.md` in
  player words.
