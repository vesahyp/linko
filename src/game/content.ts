import type { Spawn } from './state';

/**
 * The cast, the upgrades and the waves. Content is data: a new enemy is an
 * EnemyDef plus its behaviour in sim.ts's `think`, a new upgrade is an
 * UpgradeDef plus the rule where it lives, read through `ship.upgrades[id]`.
 */

export type EnemyKind = 'dart' | 'lancer' | 'diver' | 'spinner' | 'miner' | 'carrier';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  r: number;
  score: number;
  /** body damage to the player on contact */
  ram: number;
  color: string;
  /** how hard the engine pushes, world units per second squared */
  thrust: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  // A chain that enters on an orbit and falls round the planet with no engine
  // at all, then peels off at the ship one by one.
  dart: { kind: 'dart', name: 'Dart', hp: 6, r: 8, score: 10, ram: 12, color: '#ff5a6e', thrust: 260 },
  // Holds a point against the pull (its flame shows the cost) and fires
  // three-shot bursts aimed with gravity in the sum, so they arrive curved.
  lancer: { kind: 'lancer', name: 'Lancer', hp: 24, r: 13, score: 40, ram: 18, color: '#ffb347', thrust: 420 },
  // Dives at the ship. It does not brake for the planet, so a ship that
  // skims low can lead it into the ground.
  diver: { kind: 'diver', name: 'Diver', hp: 8, r: 9, score: 20, ram: 20, color: '#c86bff', thrust: 380 },
  // Drifts in a wide orbit and fires rings of slow shots; the planet bends
  // each ring into a spiral.
  spinner: { kind: 'spinner', name: 'Spinner', hp: 50, r: 16, score: 80, ram: 20, color: '#4dffc3', thrust: 160 },
  // Lays mines that fall into orbit and fill the low sky over time.
  miner: { kind: 'miner', name: 'Miner', hp: 36, r: 14, score: 60, ram: 18, color: '#ffe066', thrust: 300 },
  // The wave-6 boss: a long orbit, turrets, a core that opens to fire.
  carrier: { kind: 'carrier', name: 'Carrier', hp: 700, r: 44, score: 1000, ram: 30, color: '#ff7a3d', thrust: 0 },
};

export type UpgradeId = 'spread' | 'rapid' | 'wave' | 'engine' | 'armor' | 'missiles' | 'bits' | 'podgun' | 'heavy' | 'repair';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** what each level does, in player words; the card shows the next one */
  levels: string[];
  /** ship or gun, for the card colour */
  slot: 'ship' | 'gun';
}

export const UPGRADES: UpgradeDef[] = [
  { id: 'spread', name: 'Spread Cannon', slot: 'gun', levels: ['Two barrels', 'Three-way spread', 'Five-way spread'] },
  { id: 'rapid', name: 'Rapid Feed', slot: 'gun', levels: ['Fire rate +30%', 'Fire rate +60%', 'Fire rate +100%'] },
  { id: 'wave', name: 'Wave Cannon', slot: 'gun', levels: ['Charge 35% faster, hits harder', 'Charge 70% faster, hits harder', 'Full charge splits in three'] },
  { id: 'heavy', name: 'Mass Driver', slot: 'gun', levels: ['Shots +60% damage, slower, bend more', 'Shots +120% damage', 'Shots +180% damage'] },
  { id: 'missiles', name: 'Missile Racks', slot: 'gun', levels: ['A homing missile every second', 'Two missiles', 'Four missiles'] },
  { id: 'podgun', name: 'Pod Laser', slot: 'gun', levels: ['Pod fires three-way', 'Pod fires faster', 'Pod fires five-way'] },
  { id: 'engine', name: 'Afterburners', slot: 'ship', levels: ['Thrust +20%', 'Thrust +40%', 'Thrust +60%'] },
  { id: 'armor', name: 'Hull Plates', slot: 'ship', levels: ['Hull +40, repaired', 'Hull +80, repaired', 'Hull +120, repaired'] },
  { id: 'bits', name: 'Bit Drones', slot: 'ship', levels: ['One bit: blocks shots, fires', 'Two bits', 'Bits fire twice as fast'] },
  { id: 'repair', name: 'Field Repair', slot: 'ship', levels: ['Repair 35 hull'] },
];

export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

/**
 * The waves. Each line is a group that arrives `at` seconds into the wave;
 * groups overlap, so several enemies attack at once. After wave 6 the list
 * repeats with tougher enemies (sim.ts, `cycleOf`).
 */
export const WAVES: { name: string; spawns: Spawn[] }[] = [
  {
    name: 'First contact',
    spawns: [
      { at: 0, kind: 'dart', count: 8, from: 'orbit' },
      { at: 4, kind: 'dart', count: 8, from: 'orbit' },
      { at: 8, kind: 'diver', count: 4, from: 'right' },
      { at: 12, kind: 'dart', count: 8, from: 'orbit' },
    ],
  },
  {
    name: 'Gun line',
    spawns: [
      { at: 0, kind: 'lancer', count: 3, from: 'right' },
      { at: 2, kind: 'dart', count: 9, from: 'orbit' },
      { at: 8, kind: 'diver', count: 4, from: 'left' },
      { at: 10, kind: 'dart', count: 9, from: 'orbit' },
      { at: 13, kind: 'lancer', count: 2, from: 'top' },
    ],
  },
  {
    name: 'Spiral',
    spawns: [
      { at: 0, kind: 'spinner', count: 1, from: 'top' },
      { at: 1, kind: 'dart', count: 10, from: 'orbit' },
      { at: 6, kind: 'lancer', count: 3, from: 'left' },
      { at: 10, kind: 'diver', count: 5, from: 'right' },
      { at: 13, kind: 'spinner', count: 1, from: 'bottom' },
    ],
  },
  {
    name: 'Minefield',
    spawns: [
      { at: 0, kind: 'miner', count: 2, from: 'left' },
      { at: 2, kind: 'dart', count: 10, from: 'orbit' },
      { at: 6, kind: 'spinner', count: 1, from: 'bottom' },
      { at: 9, kind: 'diver', count: 5, from: 'top' },
      { at: 12, kind: 'lancer', count: 3, from: 'right' },
      { at: 16, kind: 'dart', count: 10, from: 'orbit' },
    ],
  },
  {
    name: 'Swarm',
    spawns: [
      { at: 0, kind: 'dart', count: 10, from: 'orbit' },
      { at: 1, kind: 'lancer', count: 3, from: 'top' },
      { at: 4, kind: 'dart', count: 10, from: 'orbit' },
      { at: 7, kind: 'spinner', count: 2, from: 'left' },
      { at: 11, kind: 'diver', count: 6, from: 'right' },
      { at: 14, kind: 'miner', count: 2, from: 'bottom' },
      { at: 17, kind: 'dart', count: 10, from: 'orbit' },
    ],
  },
  {
    name: 'The Carrier',
    spawns: [
      { at: 0, kind: 'carrier', count: 1, from: 'right' },
      { at: 3, kind: 'dart', count: 8, from: 'orbit' },
      { at: 14, kind: 'lancer', count: 2, from: 'left' },
    ],
  },
];
