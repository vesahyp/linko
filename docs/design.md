# Linko: the design

Star Control 2 as a phone game, built like Höyry, with planet gravity as the
main mechanic. Idea recorded 2026-10-12 in `jeeves/ideas/star-duel.md` as
"Star duel"; moved here the day the repo was made, under the name Linko
(Finnish for slingshot).

## Decisions for the first build (Vesa, 2026-10-12)

These answer or override parts of the idea below.

- **Single player only.** No online duels.
- **Several enemies at once**, in waves, with R-Type's feel: a charge shot,
  a detachable pod, dense formations, readable bullet patterns, big
  explosions. One ship against one ship is dropped for now.
- **Ship and gun upgrades** between waves, each visible on the ship. This
  replaces the loot of the idea for the first build.
- **One star system, one planet**, landscape twin-stick on a phone. The
  star map, more systems, landing and story wait (`TODO.md`).
- **Gravity must matter in every fight**, never decoration: ships, the
  pod, enemies and every bullet fall; shots curve; enemies crash; low
  orbits trap.

How the first build plays is in `README.md`; how the code is laid out is in
`CLAUDE.md`.

Vesa's words: "More game ideas: star control 2. But like höyry. Planet
gravity should play a big part."

## Pitch

Ship duels around a planet. Gravity pulls both ships, so you fly with the
well, not against it. Between duels you travel star systems, land on
planets, trade, and follow a story.

## Like Höyry

See `jeeves/projects/hoyry.md` and the hoyry repo.

- Phone first. Twin-stick: drag to steer and aim, tap to fire.
- Brawl Stars hands: auto-aim on tap, ammo in segments, a super.
- Borderlands loot: ship parts as type × maker × rarity, named orange parts
  that break a rule.
- The Räkkä stack: Vite, TypeScript, React HUD, Canvas 2D, headless sim with
  a bot behind `make check` and `make balance`.

## Take from Star Control 2

- Melee duels, one ship against one ship, with a planet in the arena.
- Many alien ships. Each has its own main weapon, special, and handling.
- Star map with systems to visit and explore.
- Planet landing to mine, find things, and meet aliens.
- Trading and a story that links the aliens.

## How gravity plays a big part

- Every planet has mass. Ships and shots bend around it.
- Slingshot: pass close to gain speed. Fast ships can use it to escape.
- Orbit: a ship in a stable orbit spends no fuel, and can fire from it.
- Gravity well in combat: a shot can curve round a planet to hit from behind.
- Crash: low orbit that fails burns the ship. Hull damage is the price.
- Landing: descend by managing the pull. Heavy planets cost more fuel.
- Star map: fuel use depends on the gravity of the system you leave.
- Ship classes differ in thrust to mass. Light ships win in strong wells.

## Open questions for Vesa

Answered for the first build above: duel or arena (a real-time arena of
waves), online duels (no), name (Linko). Still open:

- Is the duel a real-time arena, or does the whole game stay on the map?
- One ship at a time, or a fleet like Star Control 2?
- Is landing a separate mini-game, or the same flight in a ground view?
- How much story? Star Control 2 has a lot of text. Phones suit less.
- Online duels against other players, like Brawl Stars?
- Is the loot per ship, or a shared hangar?
- Name?
