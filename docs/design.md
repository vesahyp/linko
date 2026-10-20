# Linko: the design

Linko (Finnish for slingshot) is an arcade shooter for the phone in the
shape of R-Type: a stage that scrolls, formations that come in set pieces,
a screen full of enemies and bullets to read and dodge, a charge shot, a
pod, power-ups you see on your ship, and bosses with phases and weak
points. Landscape, one thumb to fly, the other optional.

## History

- 2026-10-12: recorded in `jeeves/ideas/star-duel.md` as "Star duel":
  Star Control 2 played like Höyry, planet gravity central. The first build
  (ADR 0002) was one planet in a fixed arena whose pull bent every ship and
  bullet, with waves, a charge shot, a pod and upgrade cards.
- 2026-10-13, Vesa: "forget the whole fixed planet gravity thing". Take it
  toward R-Type and arcade shooters. Gravity may return as a hazard in
  some stages, never as the core (ADR 0003).

## Controls

- **Left thumb: drag to fly.** The ship follows the thumb's movement with a
  gain of 1.5, from wherever the thumb lands on the left two thirds of the
  screen. Lift and land again to move further. Position control, because a
  stick's lag and overshoot lose to a bullet gap.
- **Guns fire by themselves**, forward.
- **Right thumb (optional): hold to charge, lift to fire** the wave
  cannon. The longer the hold, the bigger the beam; a full charge pierces
  a whole formation.
- **POD button:** launch the pod forward; tap again to call it back. It
  docks on the side it comes from: in front it shields and fires forward,
  behind it shields and fires backward.

## The ship

- Hull of 100: an enemy shot takes 25, a ram 25, the terrain 10. A short
  blink of safety after each hit. A 4-unit hitbox under the sprite.
- **Gun type from crystals**, the R-Type way. Red: a spread. Blue: a
  piercing laser, with diagonals that bounce off the terrain. Yellow: homing shots. The same colour again raises the
  level (to 3); a new colour changes the type and keeps the level. The pod
  takes the colour and fires its own version.
- **Items:** S (speed, to 3), M (missiles, to 2), B (a bit above and below
  the ship, to 2), + (repair 25).
- **Cards after each boss:** one of three lasting upgrades (hull plates,
  capacitor, big wave, overdrive, pod armour, magnet).
- Everything shows on the ship: emitters by gun type and level, nozzles by
  speed, racks by missiles, the bits, plates, coils, the pod's colour.

## Stages

Three stages, each a timed script of about ninety seconds, then a boss.
After the third boss the loop starts again, tougher.

**The opening teaches.** Vesa, 2026-10-20: the first build was "too
full-on straight from the start". Stage 1's first half minute brings one
thing at a time, each with a hint under the play: slow ships that never
fire (fly), a straight row that one beam takes (charge), a lone carrier
with the first crystal (pick up), then the pod and the first slow shots.
Only after about 30 s does the pace rise toward the Warden.

## The screen

The play area fits inside the safe area; the stage is drawn on past it to
every edge, under the notch too, so nothing is letterboxed. iPhone Safari
gives a page no fullscreen, so the title screen tells an iPhone player to
add the game to the home screen, where it runs with no browser around it.

1. **Outer Ring**: open space, then a station with floor and ceiling and
   turrets on them. Boss: the **Warden**.
2. **Drift**: open space, dense formations from both sides. Boss: the
   **Serpent**.
3. **Dock**: a long hull with turrets above and below. Boss: the
   **Bulwark**.

## Enemies

Popcorn in snakes and waves, swoopers in V formations, turrets on the
terrain, gunships that hold and fire fans and rings, chasers that come in
from behind, carriers that drop power-ups. Killing a whole formation drops
a power-up too.

Bullets are few kinds, always the same look: pink orbs with white cores,
aimed singles, aimed bursts, fans, rings, spirals, and boss beams that
draw a warning line first.

## Bosses

- **Warden:** a fortress with two gun pods and a core behind a shutter.
  The core opens to fire and can be hit only while open. Phase 2 when the
  pods are gone or the core is at 60 %: a turning spiral and a swept beam.
  Phase 3 at 25 %: rings between the spirals.
- **Serpent:** a head and ten armoured segments that follow its path.
  The eye is the weak point. Phase 2: the head fires fans and moves
  faster. Phase 3: the segments fire rings in turn.
- **Bulwark:** a battleship with three turrets and two missile hatches.
  Its bridge sits behind plating that falls when the turrets are gone.
  Phase 3: the core is out, spirals and beams.

## Later

See `TODO.md`: gravity hazard stages, more stages, continues with a
score cost, Finnish strings, global records.
