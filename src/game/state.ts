import { Rng } from './rng';
import type { CardId, DropKind, EnemyKind, GunType } from './content';

/** The screen in world units. The stage scrolls right to left through it. */
export const W = 780;
export const H = 390;
/** Fixed step. The render loop calls `step` a whole number of times. */
export const DT = 1 / 60;
/** World units per second the stage moves past. */
export const SCROLL_SPEED = 45;

export interface Ship {
  x: number;
  y: number;
  /** velocity of the last step, for the flame and the tilt */
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  /** seconds of no damage after a hit */
  invuln: number;
  /** 0..1 while the second thumb is down */
  charge: number;
  charging: boolean;
  gunCd: number;
  missileCd: number;
  bitCd: number;
  dead: boolean;
  gun: GunType;
  /** 1..3 */
  gunLevel: number;
  /** items picked up in the fight */
  speed: number;
  missiles: number;
  bits: number;
  /** lasting upgrades from the cards between stages */
  cards: Record<CardId, number>;
  /** where the bits are, following the ship a little behind */
  bitPos: { x: number; y: number }[];
}

export type PodMode = 'front' | 'back' | 'out' | 'return';

export interface Pod {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: PodMode;
  /** seconds in its current mode */
  t: number;
  gunCd: number;
  /** per enemy id: seconds until the pod can ram it again */
  hitCd: Map<number, number>;
}

/** One piece of a boss: armour shrugs shots off, a gun can be shot away, the weak point is the boss's life. */
export interface Part {
  name: string;
  kind: 'armor' | 'gun' | 'weak';
  /** offset from the boss's centre */
  ox: number;
  oy: number;
  r: number;
  hp: number;
  maxHp: number;
  /** a weak point takes damage only while open */
  open: boolean;
  dead: boolean;
  flash: number;
  gunCd: number;
  /** shots fired, for bursts */
  burst: number;
}

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  r: number;
  angle: number;
  /** seconds alive */
  t: number;
  gunCd: number;
  burst: number;
  flash: number;
  /** the formation it flies in, for the drop when all of it is shot down; 0 for none */
  formation: number;
  /** its place in the formation, and the formation's line */
  index: number;
  y0: number;
  /** turrets: the stage distance it stands at, and floor or ceiling */
  d: number;
  anchor: 'floor' | 'ceil' | null;
  /** a carrier drops this */
  drop: DropKind | null;
  seed: number;
  /** a boss's parts; its hp is its weak point's */
  parts: Part[] | null;
  /** boss phase 1..3, or a pattern's own counter */
  phase: number;
  /** the serpent's path, for its body to follow: x, y pairs, newest last */
  trail: number[] | null;
}

export type Team = 'player' | 'enemy';

export type BulletKind = 'shot' | 'spread' | 'laser' | 'homing' | 'charge' | 'missile' | 'bit' | 'orb' | 'mine';

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  team: Team;
  /** seconds left */
  life: number;
  kind: BulletKind;
  /** charge shots: damage still carried through what they kill; mines: their hp */
  pierce: number;
  /** ids already hit, for piercing shots */
  hit: number[] | null;
  /** homing: the enemy it steers at */
  target: number;
  /** charge level 0..1, for the look */
  level: number;
}

/** A boss beam: a warning line first, then the beam itself, which may sweep. */
export interface Beam {
  x: number;
  y: number;
  angle: number;
  /** radians per second it turns while live */
  sweep: number;
  width: number;
  /** seconds of warning left */
  warn: number;
  /** seconds of beam left */
  life: number;
  owner: number;
  /** the part it comes out of, so it moves with the boss */
  ox: number;
  oy: number;
}

export interface Drop {
  x: number;
  y: number;
  kind: DropKind;
  t: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

/**
 * One step of input, from the thumbs, the keyboard or the hand. The drag
 * gives a target point the ship flies to; the keyboard gives a direction.
 */
export interface SimInput {
  /** where the drag wants the ship, world units; null with no thumb down */
  target: { x: number; y: number } | null;
  /** keyboard direction, -1..1 */
  mx: number;
  my: number;
  /** the second thumb is down: the wave cannon charges */
  charging: boolean;
  /** the second thumb lifted this step: fire the charge */
  release: boolean;
  /** the pod button was tapped this step */
  pod: boolean;
}

export const NO_INPUT: SimInput = { target: null, mx: 0, my: 0, charging: false, release: false, pod: false };

/** What happened in a stage, for the checks and the end screen. */
export interface Tally {
  hits: number;
  hurts: number;
  drops: number;
  formations: number;
  bosses: number;
  /** player shots that a boss's armour turned away */
  pings: number;
  /** the most enemy shots in the air at once */
  peakShots: number;
  /** hull lost, by what took it: shot, ram, wall, beam */
  hurtBy: Record<string, number>;
  /** seconds the boss fight took, 0 until it is won */
  bossTime: number;
}

export const newTally = (): Tally => ({ hits: 0, hurts: 0, drops: 0, formations: 0, bosses: 0, pings: 0, peakShots: 0, hurtBy: {}, bossTime: 0 });

export type Phase = 'play' | 'clear' | 'pick' | 'dead';

export interface SimState {
  rng: Rng;
  seed: number;
  time: number;
  phase: Phase;
  /** 1..3 inside a loop */
  stage: number;
  /** 0 on the first pass, 1 after the third boss, and so on */
  loop: number;
  /** seconds into the stage */
  stageTime: number;
  /** stage distance scrolled, world units */
  scroll: number;
  /** the next script line to run */
  cursor: number;
  /** the boss's id while one is up */
  boss: number | null;
  ship: Ship;
  pod: Pod;
  enemies: Enemy[];
  bullets: Bullet[];
  beams: Beam[];
  drops: Drop[];
  particles: Particle[];
  rings: Ring[];
  floaters: Floater[];
  /** live formations: how many are left and whether any got away */
  formations: Map<number, { left: number; escaped: boolean; size: number }>;
  nextId: number;
  score: number;
  kills: number;
  offers: CardId[];
  /** sound names for the game loop to play; the sim never touches audio */
  sounds: string[];
  /** screen shake, world units, decays */
  shake: number;
  /** a white flash over the screen, 0..1 */
  flash: number;
  banner: { text: string; sub: string; life: number } | null;
  tally: Tally;
  stageTallies: Tally[];
  /** seconds in the clear and dead phases */
  phaseTime: number;
}

export function emptyCards(): Record<CardId, number> {
  return { plates: 0, capacitor: 0, bigwave: 0, overdrive: 0, podarmor: 0, magnet: 0 };
}

export function createState(seed: number): SimState {
  const ship: Ship = {
    x: 120,
    y: H / 2,
    vx: 0,
    vy: 0,
    hp: 100,
    maxHp: 100,
    invuln: 2,
    charge: 0,
    charging: false,
    gunCd: 0,
    missileCd: 0,
    bitCd: 0,
    dead: false,
    gun: 'vulcan',
    gunLevel: 1,
    speed: 0,
    missiles: 0,
    bits: 0,
    cards: emptyCards(),
    bitPos: [
      { x: 120, y: H / 2 - 30 },
      { x: 120, y: H / 2 + 30 },
    ],
  };
  return {
    rng: new Rng(seed),
    seed,
    time: 0,
    phase: 'play',
    stage: 1,
    loop: 0,
    stageTime: 0,
    scroll: 0,
    cursor: 0,
    boss: null,
    ship,
    pod: { x: ship.x + 20, y: ship.y, vx: 0, vy: 0, mode: 'front', t: 0, gunCd: 0, hitCd: new Map() },
    enemies: [],
    bullets: [],
    beams: [],
    drops: [],
    particles: [],
    rings: [],
    floaters: [],
    formations: new Map(),
    nextId: 1,
    score: 0,
    kills: 0,
    offers: [],
    sounds: [],
    shake: 0,
    flash: 0,
    banner: null,
    tally: newTally(),
    stageTallies: [],
    phaseTime: 0,
  };
}
