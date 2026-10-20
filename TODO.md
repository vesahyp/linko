# TODO

Forward-looking only. Shipped work is deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- Play it on a phone. The drag gain (1.5) and the move zone (the left 62 %)
  are guesses until a thumb has flown them; both are in
  `src/input/stick.ts`.
- The Serpent is the wall: the hand loses there in about half its runs,
  often to the body ramming it. Decide by hand whether that is the right
  boss to be the hard one.
- Tracking: linko has the tracker but no pixel host, so it sends nothing.
  Copy hoyry's `infra/` pixel (S3 + CloudFront), set `VITE_PIXEL_URL` as a
  repository variable, and add the stats board
  (`jeeves/practices/web-tracking.md`).
- Finnish strings beside the English ones (`i18n.ts` as in hoyry).
- Check on a real iPhone that the home-screen install opens with no
  browser bars and the notch inset lands where `make screen-check` assumes
  (59 px each side, 21 px for the home bar).

## Later

- Gravity as a hazard in some stages: a planet or a black hole that pulls
  ships and shots (ADR 0003). The first build's code is in git history
  (`src/game/physics.ts` before 2026-10-13).
- More stages and bosses; a midboss half way through a stage.
- Terrain that matters more: narrow passages, walls that move.
- Global records, as in hoyry (`hoyry/docs/adr/0002-own-records-api.md`).
- From the original idea, if the game grows that way: a star map between
  stages, landing, story.
