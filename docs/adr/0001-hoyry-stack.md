---
adr: 1
title: Linko is built on the Höyry and Räkkä stack
date: 2026-10-12
status: Accepted
deciders: Vesa
---

## Context

Linko is a phone-first shooter with tens of enemies and a few hundred
bullets in one arena round a planet. Räkkä and Höyry already ship that
shape of game on Vite, TypeScript, React for menus, Canvas 2D for the game
and a headless fixed-step sim, with a bot that drives the real sim for
checks and a Playwright script that plays on an emulated phone. Vesa asked
for the same stack.

## Decision

Copy the stack and the repo layout from Höyry: `src/game/` is a headless
sim at `DT = 1/60` on a seeded mulberry32 RNG, React draws only the menus,
HUD and card pick, Canvas 2D draws the game, GitHub Pages serves the build
from `main`. Copy `version.ts` and the update banner as they are.

Use no physics library. The only physics is one pull toward one planet and
circle collisions, and both have to be the same code in the sim, the path
lines and the auto-aim.

The bot is a hand with a thumb's limits (`tools/hand.ts`), from the first
commit, following the lesson from Höyry and Sora: a perfect bot proves
nothing about a phone player. It drives the headless checks directly and
the phone playthrough by real touches.

## Consequences

- Fast checks: twelve full runs of the hand take a few seconds, so balance
  is tuned against the thumb, not against a perfect bot.
- No back end yet. The tracker is in the page but has no pixel host, and
  there are no global records; both are on `TODO.md`.
- Canvas 2D limits the effects to what additive blending and cached
  gradients can do. A bigger look (bloom, distortion of the background by
  the pull) would need WebGL, which this stack does not have.
