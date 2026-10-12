import { Rng } from './rng';
import type { EnemyKind, UpgradeId } from './content';

/** The arena in world units. The renderer fits it to the screen; nothing wraps. */
export const W = 780;
export const H = 390;
/** Fixed step. The render loop calls `step` a whole number of times. */
export const DT = 1 / 60;

export interface Planet {
  x: number;
  y: number;
  r: number;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** the nose, radians; turns toward where the guns point */
  angle: number;
  hp: number;
  maxHp: number;
  /** seconds of no damage after a hit */
  invuln: number;
  /** 0..1 while the right thumb is down */
  charge: number;
  charging: boolean;
  gunCd: number;
  missileCd: number;
  bitCd: number;
  podCd: number;
  dead: boolean;
  /** thrust 0..1 this step, for the flame */
  thrust: number;
  upgrades: Record<UpgradeId, number>;
}

export type PodMode = 'docked' | 'out' | 'return';

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
  /** a point it holds, for the ones that hover */
  hx: number;
  hy: number;
  /** red flash after a hit, seconds */
  flash: number;
  /** seconds of entry: no gravity, no collisions with the planet while it flies in */
  entering: number;
  /** 0..1 per kind, set at spawn */
  seed: number;
  /** per kind: the orbit's direction, the spinner's angle, the carrier's place on its ellipse */
  phase: number;
  /** shots fired, for bursts */
  burst: number;
}

export type Team = 'player' | 'enemy';

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
  kind: 'shot' | 'charge' | 'missile' | 'orb' | 'mine' | 'bit';
  /** the direction it left the gun in, to measure how far gravity bent it */
  a0: number;
  /** charge shots: how much damage they still carry through the enemies they kill */
  pierce: number;
  /** missiles: the enemy they steer at */
  target: number;
  /** ids already hit, for piercing shots */
  hit: number[] | null;
  /** recent positions for the trail */
  trail: number[];
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
  /** sparks feel the planet too */
  grav: boolean;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  color: string;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

/** One step of input, from the thumbs, the keyboard or the bot. */
export interface SimInput {
  /** move stick, -1..1 each, length up to 1 */
  mx: number;
  my: number;
  /** the right thumb is down: the wave cannon charges */
  charging: boolean;
  /** the right thumb has dragged: aim along (ax, ay); otherwise the auto-aim picks */
  aimed: boolean;
  ax: number;
  ay: number;
  /** the right thumb lifted this step: fire the charge */
  release: boolean;
  /** the pod button was tapped this step */
  pod: boolean;
}

export const NO_INPUT: SimInput = { mx: 0, my: 0, charging: false, aimed: false, ax: 0, ay: 0, release: false, pod: false };

/** What gravity did in a wave, for the checks and the death screen. */
export interface GravityTally {
  /** player hits whose bullet left the gun more than 12 degrees off the line it hit on */
  bentHits: number;
  hits: number;
  /** enemies that hit the planet */
  planetKills: number;
  /** close passes by the player: the slingshot */
  slingshots: number;
  /** player hull lost to the planet */
  planetDamage: number;
  /** enemy shots that bent more than 12 degrees before they hit the player */
  bentHurts: number;
  hurts: number;
}

export const newTally = (): GravityTally => ({ bentHits: 0, hits: 0, planetKills: 0, slingshots: 0, planetDamage: 0, bentHurts: 0, hurts: 0 });

export type Phase = 'fight' | 'pick' | 'dead';

export interface Spawn {
  at: number;
  kind: EnemyKind;
  count: number;
  /** the side it enters from, or 'orbit' for a chain that comes in on an orbit */
  from: 'left' | 'right' | 'top' | 'bottom' | 'orbit';
}

export interface SimState {
  rng: Rng;
  seed: number;
  time: number;
  phase: Phase;
  /** 1-based */
  wave: number;
  /** seconds into the current wave */
  waveTime: number;
  queue: Spawn[];
  planet: Planet;
  ship: Ship;
  pod: Pod;
  enemies: Enemy[];
  bullets: Bullet[];
  particles: Particle[];
  rings: Ring[];
  floaters: Floater[];
  nextId: number;
  score: number;
  kills: number;
  /** the upgrade cards on offer while phase is 'pick' */
  offers: UpgradeId[];
  /** sound names for the game loop to play; the sim never touches audio */
  sounds: string[];
  /** screen shake, world units, decays */
  shake: number;
  /** a line across the screen: the wave name, the slingshot */
  banner: { text: string; sub: string; life: number } | null;
  tally: GravityTally;
  /** one tally per finished wave */
  waveTallies: GravityTally[];
  /** seconds since death, the overlay waits a moment */
  deadTime: number;
  /** the slingshot: the player was inside the deep well this step */
  inWell: boolean;
  wellSpeed: number;
}

export function emptyUpgrades(): Record<UpgradeId, number> {
  return { spread: 0, rapid: 0, wave: 0, engine: 0, armor: 0, missiles: 0, bits: 0, podgun: 0, heavy: 0, repair: 0 };
}

export function createState(seed: number): SimState {
  const planet = { x: W / 2, y: H / 2, r: 44 };
  const ship: Ship = {
    x: W / 2 - 220,
    y: H / 2,
    vx: 0,
    vy: -150,
    angle: 0,
    hp: 100,
    maxHp: 100,
    invuln: 1.5,
    charge: 0,
    charging: false,
    gunCd: 0,
    missileCd: 0,
    bitCd: 0,
    podCd: 0,
    dead: false,
    thrust: 0,
    upgrades: emptyUpgrades(),
  };
  return {
    rng: new Rng(seed),
    seed,
    time: 0,
    phase: 'fight',
    wave: 0,
    waveTime: 0,
    queue: [],
    planet,
    ship,
    pod: { x: ship.x + 16, y: ship.y, vx: 0, vy: 0, mode: 'docked', t: 0, gunCd: 0, hitCd: new Map() },
    enemies: [],
    bullets: [],
    particles: [],
    rings: [],
    floaters: [],
    nextId: 1,
    score: 0,
    kills: 0,
    offers: [],
    sounds: [],
    shake: 0,
    banner: null,
    tally: newTally(),
    waveTallies: [],
    deadTime: 0,
    inWell: false,
    wellSpeed: 0,
  };
}
