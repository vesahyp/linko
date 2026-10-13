---
adr: 3
title: Linko becomes a scrolling arcade shooter; the planet's pull is no longer the core
date: 2026-10-13
status: Accepted
deciders: Vesa
---

## Context

The first build (ADR 0002) put one planet in a fixed arena and made its
pull act on everything. Vesa's direction after it: drop the fixed planet
and gravity as the core, and take the game toward R-Type and arcade
shooters: a stage that scrolls, set-piece formations, a screen full of
enemies and readable bullet patterns to dodge, bosses with phases and weak
points, the charge shot and the pod kept and grown, power-ups dropped in
the fight as well as picked between stages, all of them visible on the
ship. Gravity may come back later as a hazard in some stages.

A twin-stick velocity stick was right for flying round a planet. It is
wrong for dodging: a stick sets a speed, so the ship lags behind the thumb
and overshoots a gap.

## Decision

- The stage scrolls right to left. The ship faces right and its guns fire
  forward by themselves. Each stage is a timed script of formations, with
  terrain (floor and ceiling with turrets) in parts of it, and ends in a
  boss. Three stages, three bosses, then the loop starts again harder.
- Movement is a relative drag: the ship follows the thumb's movement with a
  gain, from wherever the thumb lands on the left part of the screen. The
  game plays with that one thumb. The other thumb is optional: hold on the
  right side to charge the wave cannon, lift to fire, tap POD to launch or
  recall the pod.
- Bosses are bodies made of parts: armour that shrugs shots off, guns that
  can be shot away, and a weak point. Each boss changes its attack at
  phase thresholds.
- Power-ups: carriers and whole formations drop crystals (the gun's type
  and level) and items (speed, missiles, bits, repair); a card pick after
  each boss gives a lasting ship upgrade.
- `physics.ts` and the planet go. Git history keeps them for a gravity
  hazard stage.

## Consequences

- The ship's hitbox is small (a 4-unit circle under a 30-unit sprite), as
  shooter players expect. Hull points stay: five bullets, not one, end a
  run, because a phone thumb covers part of the screen.
- No aiming. The skill is position and timing; the auto-aim code goes.
- Content grows by data (stage scripts, formations, boss parts), so the
  sim needs a small vocabulary of movement paths and bullet patterns.
- The hand and its checks are rebuilt for the drag: what it proves is
  dodging by a thumb, not orbital sums.
