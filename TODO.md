# TODO

Forward-looking only. Shipped work is deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- Play it on a phone. The hand clears a median of nine waves; a thumb
  will clear fewer. Tune from what feels wrong, with `make balance` and
  `make playthrough` beside it.
- A quarter of all kills are enemies falling into the planet by themselves
  (mostly darts that dive at a ship near it). Decide by hand whether that
  reads as the player's doing or as free points.
- Tracking: linko has the tracker but no pixel host, so it sends nothing.
  Copy hoyry's `infra/` pixel (S3 + CloudFront), set `VITE_PIXEL_URL` as a
  repository variable, and add the stats board (`jeeves/practices/web-tracking.md`).
- Finnish strings beside the English ones (`i18n.ts` as in hoyry).
- A home-screen icon in PNG for iOS (`apple-touch-icon.png`).

## Later, from the design

- More systems: other planets with other masses, two-planet systems, a
  moon on its own orbit that pulls too.
- The star map between systems, fuel by the pull of the system you leave.
- Landing: descend to a planet by managing the pull, mine, find things.
- Alien ships with their own handling and weapons, Star Control 2 style,
  and the loot of the design (type × maker × rarity parts).
- Story and the aliens who tell it, kept short for a phone.
- Global records, as in hoyry (`hoyry/docs/adr/0002-own-records-api.md`).
