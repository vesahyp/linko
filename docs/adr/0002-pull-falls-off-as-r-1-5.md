---
adr: 2
title: The planet's pull falls off as r^-1.5
date: 2026-10-12
status: Superseded by 0003
deciders: Vesa
---

## Context

Gravity has to matter in every fight. With the real inverse square law
tuned so that low orbits trap the ship, the pull at the arena's edges is
too weak to bend a shot you can see; with it tuned to bend shots at the
edges, the planet swallows the whole middle of the screen.

## Decision

The pull is `G_REF * (R_REF / r)^1.5` (`src/game/physics.ts`), with
`G_REF = 240` at `R_REF = 130` world units, in an arena of 780 by 390.
Below `NO_RETURN` (about 83 units, drawn as the red ring) it is stronger
than the base engine's thrust. Orbits are still closed circles at the
orbit speed, so chains of enemies can fly them with no engine.

## Consequences

- A main-gun shot passing 90 units from the planet turns about 17 degrees,
  an enemy shot passing 120 units about 80; `sim-check` asserts both.
- Elliptical orbits precess, unlike real ones. Nobody playing will check.
- Every tuning number (thrust, shot speeds, the well radius, `NO_RETURN`)
  depends on this curve; changing the exponent means retuning them all.
