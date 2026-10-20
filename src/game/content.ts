/**
 * The cast, the guns, the drops, the cards and the three stages. Content
 * is data: an enemy is an EnemyDef plus its case in sim.ts's
 * `stepEnemies`, a stage is a timed script of formations plus its terrain.
 */

export type EnemyKind = 'popcorn' | 'swooper' | 'chaser' | 'gunship' | 'carrier' | 'turret' | 'spinner' | 'warden' | 'serpent' | 'bulwark';

export interface EnemyDef {
  name: string;
  hp: number;
  r: number;
  score: number;
  /** body damage on contact */
  ram: number;
  color: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  popcorn: { name: 'Popcorn', hp: 2, r: 8, score: 10, ram: 25, color: '#ff5a6e' },
  swooper: { name: 'Swooper', hp: 4, r: 10, score: 30, ram: 25, color: '#ff9d4a' },
  chaser: { name: 'Chaser', hp: 4, r: 9, score: 30, ram: 25, color: '#c86bff' },
  gunship: { name: 'Gunship', hp: 45, r: 18, score: 200, ram: 30, color: '#ffcf4a' },
  carrier: { name: 'Carrier', hp: 7, r: 13, score: 50, ram: 20, color: '#7ce0ff' },
  turret: { name: 'Turret', hp: 9, r: 11, score: 60, ram: 20, color: '#9aa8c8' },
  spinner: { name: 'Spinner', hp: 30, r: 15, score: 150, ram: 25, color: '#4dffc3' },
  warden: { name: 'Warden', hp: 1100, r: 60, score: 5000, ram: 30, color: '#ff7a3d' },
  serpent: { name: 'Serpent', hp: 1150, r: 20, score: 6000, ram: 30, color: '#6dff8a' },
  bulwark: { name: 'Bulwark', hp: 2200, r: 70, score: 8000, ram: 30, color: '#ff4a6a' },
};

export const BOSSES: EnemyKind[] = ['warden', 'serpent', 'bulwark'];

/** The gun's type comes from the crystal colour last picked up. */
export type GunType = 'vulcan' | 'spread' | 'laser' | 'homing';

export const GUN_NAME: Record<GunType, string> = { vulcan: 'Vulcan', spread: 'Spread', laser: 'Laser', homing: 'Homing' };
export const GUN_COLOR: Record<GunType, string> = { vulcan: '#bfefff', spread: '#ff5a5a', laser: '#4aa8ff', homing: '#ffd84a' };

/** Crystals set the gun; letters are items. */
export type DropKind = 'red' | 'blue' | 'yellow' | 'speed' | 'missile' | 'bit' | 'repair';

export const CRYSTAL_GUN: Partial<Record<DropKind, GunType>> = { red: 'spread', blue: 'laser', yellow: 'homing' };
export const DROP_LABEL: Record<DropKind, string> = { red: '', blue: '', yellow: '', speed: 'S', missile: 'M', bit: 'B', repair: '+' };
export const DROP_COLOR: Record<DropKind, string> = { red: '#ff5a5a', blue: '#4aa8ff', yellow: '#ffd84a', speed: '#7cffb0', missile: '#ffffff', bit: '#ffb35a', repair: '#ff7ab8' };

export type CardId = 'plates' | 'capacitor' | 'bigwave' | 'overdrive' | 'podarmor' | 'magnet';

export interface CardDef {
  id: CardId;
  name: string;
  /** what each level does, in player words */
  levels: string[];
}

export const CARDS: CardDef[] = [
  { id: 'plates', name: 'Hull Plates', levels: ['Hull +40, repaired', 'Hull +80, repaired', 'Hull +120, repaired'] },
  { id: 'capacitor', name: 'Capacitor', levels: ['Charge 30% faster', 'Charge 55% faster', 'Charge 80% faster'] },
  { id: 'bigwave', name: 'Big Wave', levels: ['Charge shot 30% bigger and harder', 'Charge shot 60% bigger', 'Full charge splits in three'] },
  { id: 'overdrive', name: 'Overdrive', levels: ['Guns fire 20% faster', 'Guns fire 40% faster', 'Guns fire 60% faster'] },
  { id: 'podarmor', name: 'Pod Armour', levels: ['Pod bigger, rams twice as hard', 'Pod bigger again', 'Pod fires twice as fast'] },
  { id: 'magnet', name: 'Magnet', levels: ['Pull drops from further', 'Pull drops from the whole screen'] },
];

export const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c])) as Record<CardId, CardDef>;

// ---------------------------------------------------------------- stages

export type Form = 'snake' | 'row' | 'wall' | 'v' | 'rear' | 'gunship' | 'carrier' | 'turret' | 'spinner' | 'boss' | 'hint';

/** One line of a stage script: a formation that arrives `t` seconds in. */
export interface Line {
  t: number;
  form: Form;
  n?: number;
  /** the line's height, 0..1 of the screen */
  y?: number;
  at?: 'floor' | 'ceil';
  drop?: DropKind;
  /** popcorn speed, world units a second (150 when left out) */
  speed?: number;
  /** these never fire: the opening's practice targets */
  quiet?: boolean;
  /** a hint line under the play, on the first round only */
  text?: string;
}

export interface StageDef {
  name: string;
  boss: EnemyKind;
  /** floor and ceiling heights by stage distance: [distance, height] pairs, 0 where there is none */
  floor: [number, number][];
  ceil: [number, number][];
  /** the colour of the stage's sky and terrain */
  sky: [string, string];
  metal: string;
  script: Line[];
}

/** Turrets every `gap` seconds from `from` to `to`, alternating floor and ceiling. */
function turrets(from: number, to: number, gap: number, start: 'floor' | 'ceil' = 'floor'): Line[] {
  const out: Line[] = [];
  let at = start;
  for (let t = from; t <= to; t += gap) {
    out.push({ t, form: 'turret', at });
    at = at === 'floor' ? 'ceil' : 'floor';
  }
  return out;
}

export const STAGES: StageDef[] = [
  {
    name: 'Outer Ring',
    boss: 'warden',
    // open space, then the station from about 41 s to 95 s
    floor: [
      [0, 0],
      [2595, 0],
      [2645, 46],
      [2945, 46],
      [3005, 74],
      [3295, 74],
      [3345, 40],
      [3845, 40],
      [3895, 64],
      [4195, 64],
      [4265, 0],
    ],
    ceil: [
      [0, 0],
      [2645, 0],
      [2705, 40],
      [3145, 40],
      [3205, 66],
      [3545, 66],
      [3605, 36],
      [4145, 36],
      [4245, 0],
    ],
    sky: ['#0b1030', '#03040c'],
    metal: '#56607e',
    script: [
      // the opening teaches, one thing at a time: fly, charge, pick up, the pod; then the pace rises
      { t: 0.5, form: 'hint', text: 'Drag on the left side to fly' },
      { t: 3, form: 'snake', n: 3, y: 0.5, speed: 70, quiet: true },
      { t: 7, form: 'snake', n: 3, y: 0.3, speed: 80, quiet: true },
      { t: 10, form: 'snake', n: 3, y: 0.7, speed: 80, quiet: true },
      { t: 13, form: 'hint', text: 'Hold on the right side to charge · lift to fire' },
      { t: 14, form: 'row', n: 5, y: 0.5, speed: 60, quiet: true },
      { t: 19, form: 'hint', text: 'Shoot the glass carrier for a crystal' },
      { t: 19.5, form: 'carrier', y: 0.45, drop: 'red' },
      { t: 24, form: 'hint', text: 'Tap POD to launch the pod · tap again to call it back' },
      { t: 24, form: 'snake', n: 5, y: 0.35, speed: 110 },
      { t: 27, form: 'v', n: 3, y: 0.6 },
      { t: 30, form: 'snake', n: 6, y: 0.65, speed: 130 },
      { t: 32, form: 'snake', n: 8, y: 0.5 },
      { t: 35, form: 'gunship', y: 0.3 },
      { t: 37, form: 'rear', n: 3, y: 0.7 },
      { t: 39, form: 'v', n: 5, y: 0.25 },
      { t: 40, form: 'v', n: 5, y: 0.75 },
      { t: 43, form: 'carrier', y: 0.6, drop: 'speed' },
      { t: 44, form: 'wall', n: 7 },
      { t: 47, form: 'wall', n: 7 },
      { t: 49, form: 'gunship', y: 0.7 },
      { t: 51, form: 'snake', n: 8, y: 0.35 },
      { t: 53, form: 'carrier', y: 0.5, drop: 'blue' },
      { t: 55, form: 'snake', n: 8, y: 0.65 },
      ...turrets(42, 74, 2.2),
      { t: 61, form: 'snake', n: 6, y: 0.5 },
      { t: 65, form: 'carrier', y: 0.5, drop: 'missile' },
      { t: 67, form: 'v', n: 5, y: 0.5 },
      { t: 71, form: 'rear', n: 4, y: 0.5 },
      { t: 74, form: 'gunship', y: 0.5 },
      { t: 78, form: 'snake', n: 8, y: 0.4 },
      { t: 81, form: 'carrier', y: 0.5, drop: 'bit' },
      { t: 83, form: 'v', n: 5, y: 0.6 },
      { t: 87, form: 'snake', n: 8, y: 0.55 },
      { t: 90, form: 'gunship', y: 0.4 },
      { t: 93, form: 'snake', n: 8, y: 0.3 },
      { t: 95, form: 'snake', n: 8, y: 0.7 },
      { t: 97, form: 'v', n: 5, y: 0.3 },
      { t: 98, form: 'v', n: 5, y: 0.7 },
      { t: 100, form: 'carrier', y: 0.5, drop: 'repair' },
      { t: 101, form: 'wall', n: 7 },
      { t: 105, form: 'boss' },
    ],
  },
  {
    name: 'Drift',
    boss: 'serpent',
    floor: [[0, 0]],
    ceil: [[0, 0]],
    sky: ['#1a0b2e', '#05030c'],
    metal: '#6a4e7e',
    script: [
      { t: 1.5, form: 'snake', n: 8, y: 0.5 },
      { t: 4, form: 'rear', n: 4, y: 0.3 },
      { t: 6, form: 'v', n: 7, y: 0.6 },
      { t: 8, form: 'carrier', y: 0.3, drop: 'yellow' },
      { t: 10, form: 'spinner', y: 0.5 },
      { t: 13, form: 'snake', n: 8, y: 0.25 },
      { t: 14, form: 'snake', n: 8, y: 0.75 },
      { t: 17, form: 'rear', n: 4, y: 0.7 },
      { t: 19, form: 'gunship', y: 0.3 },
      { t: 20, form: 'gunship', y: 0.7 },
      { t: 23, form: 'carrier', y: 0.5, drop: 'bit' },
      { t: 25, form: 'wall', n: 8 },
      { t: 27, form: 'wall', n: 8 },
      { t: 29, form: 'wall', n: 8 },
      { t: 32, form: 'spinner', y: 0.3 },
      { t: 33, form: 'spinner', y: 0.7 },
      { t: 36, form: 'v', n: 7, y: 0.5 },
      { t: 38, form: 'carrier', y: 0.5, drop: 'red' },
      { t: 40, form: 'rear', n: 5, y: 0.5 },
      { t: 43, form: 'snake', n: 10, y: 0.4 },
      { t: 45, form: 'gunship', y: 0.5 },
      { t: 48, form: 'v', n: 7, y: 0.3 },
      { t: 49, form: 'v', n: 7, y: 0.7 },
      { t: 52, form: 'carrier', y: 0.4, drop: 'speed' },
      { t: 54, form: 'spinner', y: 0.5 },
      { t: 57, form: 'snake', n: 10, y: 0.6 },
      { t: 60, form: 'rear', n: 5, y: 0.3 },
      { t: 62, form: 'gunship', y: 0.3 },
      { t: 63, form: 'gunship', y: 0.7 },
      { t: 67, form: 'carrier', y: 0.5, drop: 'missile' },
      { t: 69, form: 'wall', n: 8 },
      { t: 71, form: 'v', n: 7, y: 0.5 },
      { t: 74, form: 'carrier', y: 0.5, drop: 'repair' },
      { t: 78, form: 'boss' },
    ],
  },
  {
    name: 'Dock',
    boss: 'bulwark',
    floor: [
      [0, 0],
      [300, 0],
      [360, 50],
      [900, 50],
      [960, 90],
      [1300, 90],
      [1360, 44],
      [2000, 44],
      [2060, 80],
      [2400, 80],
      [2460, 50],
      [3100, 50],
      [3180, 0],
    ],
    ceil: [
      [0, 0],
      [400, 0],
      [460, 44],
      [1100, 44],
      [1160, 84],
      [1500, 84],
      [1560, 40],
      [2300, 40],
      [2360, 76],
      [2700, 76],
      [2760, 40],
      [3150, 40],
      [3220, 0],
    ],
    sky: ['#2a0b14', '#08030a'],
    metal: '#7e5660',
    script: [
      { t: 1.5, form: 'snake', n: 8, y: 0.5 },
      ...turrets(3, 51, 1.7, 'ceil'),
      { t: 3, form: 'gunship', y: 0.5 },
      { t: 4, form: 'v', n: 7, y: 0.3 },
      { t: 5, form: 'v', n: 7, y: 0.7 },
      { t: 7, form: 'rear', n: 4, y: 0.5 },
      { t: 9, form: 'carrier', y: 0.5, drop: 'blue' },
      { t: 11, form: 'gunship', y: 0.5 },
      { t: 13, form: 'spinner', y: 0.4 },
      { t: 15, form: 'rear', n: 4, y: 0.5 },
      { t: 16, form: 'snake', n: 10, y: 0.6 },
      { t: 18, form: 'snake', n: 8, y: 0.45 },
      { t: 21, form: 'spinner', y: 0.5 },
      { t: 24, form: 'carrier', y: 0.5, drop: 'bit' },
      { t: 26, form: 'v', n: 7, y: 0.5 },
      { t: 29, form: 'gunship', y: 0.35 },
      { t: 30, form: 'gunship', y: 0.65 },
      { t: 34, form: 'snake', n: 10, y: 0.5 },
      { t: 37, form: 'carrier', y: 0.5, drop: 'yellow' },
      { t: 39, form: 'rear', n: 5, y: 0.5 },
      { t: 42, form: 'spinner', y: 0.4 },
      { t: 45, form: 'wall', n: 6 },
      { t: 47, form: 'wall', n: 6 },
      { t: 50, form: 'carrier', y: 0.5, drop: 'speed' },
      { t: 52, form: 'v', n: 7, y: 0.5 },
      { t: 55, form: 'gunship', y: 0.5 },
      { t: 58, form: 'snake', n: 10, y: 0.5 },
      { t: 61, form: 'rear', n: 5, y: 0.5 },
      { t: 64, form: 'carrier', y: 0.5, drop: 'missile' },
      { t: 66, form: 'spinner', y: 0.5 },
      { t: 70, form: 'v', n: 7, y: 0.3 },
      { t: 71, form: 'v', n: 7, y: 0.7 },
      { t: 74, form: 'carrier', y: 0.5, drop: 'repair' },
      { t: 78, form: 'boss' },
    ],
  },
];

// The sim reads a script in order, so each runs sorted by time: the turret
// runs are written as a block, and unsorted they arrived in bunches.
for (const st of STAGES) st.script.sort((a, b) => a.t - b.t);

/** Height of a floor or ceiling at a stage distance, linear between points. */
export function heightAt(pts: [number, number][], d: number): number {
  if (pts.length === 1) return pts[0][1];
  if (d <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (d <= pts[i][0]) {
      const [d0, h0] = pts[i - 1];
      const [d1, h1] = pts[i];
      return h0 + ((h1 - h0) * (d - d0)) / (d1 - d0);
    }
  }
  return pts[pts.length - 1][1];
}
