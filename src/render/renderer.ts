import { W, H, type SimState, type Enemy, type Bullet, type Part } from '../game/state';
import { ENEMIES, STAGES, GUN_COLOR, DROP_COLOR, DROP_LABEL, heightAt } from '../game/content';
import { podRadius } from '../game/sim';

/**
 * Canvas 2D. The screen (W by H world units) is fitted inside the safe
 * area; everything is drawn in world units under one transform. The sky is
 * drawn once per stage and size and cached; stars, terrain and the rest
 * every frame. Cosmetic randomness uses Math.random, never the sim's stream.
 */

/** Ships are drawn larger than their hit circles: readable on a phone, and a small hitbox is what a shooter player expects. */
const SPRITE = 1.25;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private sky: HTMLCanvasElement | null = null;
  private skyKey = '';
  /** css px per world unit, and the screen's top-left in css px */
  scale = 1;
  ox = 0;
  oy = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Fit the screen in the css-px box, minus the insets. */
  resize(w: number, h: number, inset: { l: number; r: number; t: number; b: number }): void {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const aw = w - inset.l - inset.r;
    const ah = h - inset.t - inset.b;
    this.scale = Math.min(aw / W, ah / H);
    this.ox = inset.l + (aw - W * this.scale) / 2;
    this.oy = inset.t + (ah - H * this.scale) / 2;
  }

  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }

  /** The stage's sky: a gradient, a nebula, a far planet. Cached. */
  private skyFor(s: SimState): HTMLCanvasElement {
    const key = `${this.canvas.width}x${this.canvas.height}:${this.scale}:${s.stage}`;
    if (this.sky && this.skyKey === key) return this.sky;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    const def = STAGES[s.stage - 1];
    g.fillStyle = '#020309';
    g.fillRect(0, 0, c.width, c.height);
    const k = this.dpr * this.scale;
    g.setTransform(k, 0, 0, k, this.dpr * this.ox, this.dpr * this.oy);
    const grad = g.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, def.sky[0]);
    grad.addColorStop(1, def.sky[1]);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    const neb = (x: number, y: number, r: number, col: string) => {
      const n = g.createRadialGradient(x, y, 0, x, y, r);
      n.addColorStop(0, col);
      n.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = n;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const tint = ['rgba(60,90,200,0.22)', 'rgba(150,50,190,0.24)', 'rgba(200,50,60,0.22)'][s.stage - 1];
    neb(W * 0.7, H * 0.3, 300, tint);
    neb(W * 0.2, H * 0.8, 240, 'rgba(30,120,160,0.12)');
    // a far planet on the horizon of each stage
    const px = [W * 0.82, W * 0.18, W * 0.6][s.stage - 1];
    const py = [H * 0.82, H * 0.2, H * 1.25][s.stage - 1];
    const pr = [110, 60, 260][s.stage - 1];
    const pl = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
    const base = ['#2a4c7a', '#5a3a7a', '#7a2a3a'][s.stage - 1];
    pl.addColorStop(0, base);
    pl.addColorStop(1, '#05060c');
    g.globalAlpha = 0.55;
    g.fillStyle = pl;
    g.beginPath();
    g.arc(px, py, pr, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    this.sky = c;
    this.skyKey = key;
    return c;
  }

  draw(s: SimState): void {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0;
    let sy = 0;
    if (s.shake > 0) {
      sx = (Math.random() - 0.5) * s.shake * this.scale * this.dpr;
      sy = (Math.random() - 0.5) * s.shake * this.scale * this.dpr;
    }
    g.drawImage(this.skyFor(s), sx, sy);
    const k = this.dpr * this.scale;
    g.setTransform(k, 0, 0, k, this.dpr * this.ox + sx, this.dpr * this.oy + sy);
    g.save();
    g.beginPath();
    g.rect(0, 0, W, H);
    g.clip();
    this.drawStars(s);
    this.drawTerrain(s);
    for (const d of s.drops) this.drawDrop(d, s);
    for (const e of s.enemies) if (e.hp > 0) (e.parts ? this.drawBoss(e, s) : this.drawEnemy(e, s));
    this.drawBeams(s);
    this.drawPlayerShots(s);
    if (!s.ship.dead) this.drawShip(s);
    this.drawPod(s);
    this.drawEnemyShots(s);
    this.drawEffects(s);
    g.restore();
    if (s.flash > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = `rgba(255,255,255,${Math.min(0.7, s.flash * 0.6)})`;
      g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  /** Three layers of stars, each moving at its own share of the scroll, and dust streaks. */
  private drawStars(s: SimState): void {
    const g = this.ctx;
    const layers = [
      { n: 70, speed: 0.15, size: 0.8, a: 0.45 },
      { n: 45, speed: 0.4, size: 1.2, a: 0.7 },
      { n: 18, speed: 1.6, size: 1.6, a: 0.5 },
    ];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const L of layers) {
      g.fillStyle = `rgba(210,225,255,${L.a})`;
      for (let i = 0; i < L.n; i++) {
        const x0 = rnd() * W;
        const y = rnd() * H;
        const x = (((x0 - s.scroll * L.speed) % W) + W) % W;
        if (L.speed > 1) {
          g.globalAlpha = 0.35;
          g.fillRect(x, y, 14, 0.8);
          g.globalAlpha = 1;
        } else g.fillRect(x, y, L.size, L.size);
      }
    }
  }

  private drawTerrain(s: SimState): void {
    const def = STAGES[s.stage - 1];
    const g = this.ctx;
    for (const side of ['floor', 'ceil'] as const) {
      const pts = side === 'floor' ? def.floor : def.ceil;
      if (pts.length === 1 && pts[0][1] === 0) continue;
      const ys: number[] = [];
      let any = false;
      for (let x = -8; x <= W + 8; x += 8) {
        const h = heightAt(pts, s.scroll + x);
        if (h > 0) any = true;
        ys.push(h);
      }
      if (!any) continue;
      const edge = (i: number) => (side === 'floor' ? H - ys[i] : ys[i]);
      g.beginPath();
      g.moveTo(-8, side === 'floor' ? H + 2 : -2);
      ys.forEach((_, i) => g.lineTo(-8 + i * 8, edge(i)));
      g.lineTo(W + 8, side === 'floor' ? H + 2 : -2);
      g.closePath();
      const gr = g.createLinearGradient(0, side === 'floor' ? H - 90 : 90, 0, side === 'floor' ? H : 0);
      gr.addColorStop(0, def.metal);
      gr.addColorStop(1, '#14161f');
      g.fillStyle = gr;
      g.fill();
      // panel seams that move with the stage
      g.save();
      g.clip();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.lineWidth = 1;
      const off = -(s.scroll % 48);
      for (let x = off; x < W; x += 48) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, H);
        g.stroke();
      }
      g.fillStyle = 'rgba(255,170,80,0.7)';
      for (let x = off + 24; x < W; x += 96) {
        const i = Math.round((x + 8) / 8);
        if (i < 0 || i >= ys.length || ys[i] <= 0) continue;
        if (Math.floor(s.time * 2 + x) % 2 === 0) g.fillRect(x, side === 'floor' ? edge(i) + 8 : edge(i) - 10, 3, 2);
      }
      g.restore();
      // the lit edge
      g.strokeStyle = 'rgba(200,220,255,0.55)';
      g.lineWidth = 1.5;
      g.beginPath();
      let started = false;
      ys.forEach((h, i) => {
        if (h <= 0) {
          started = false;
          return;
        }
        if (!started) g.moveTo(-8 + i * 8, edge(i));
        else g.lineTo(-8 + i * 8, edge(i));
        started = true;
      });
      g.stroke();
    }
  }

  private drawShip(s: SimState): void {
    const g = this.ctx;
    const sh = s.ship;
    const col = GUN_COLOR[sh.gun];
    if (sh.invuln > 0 && Math.floor(s.time * 20) % 2 === 0 && s.stageTime > 2) g.globalAlpha = 0.4;
    g.save();
    g.translate(sh.x, sh.y);
    g.scale(SPRITE, SPRITE);
    // a tilt by vertical speed
    g.transform(1, Math.max(-0.25, Math.min(0.25, sh.vy / 1400)), 0, 1, 0, 0);
    // engine flames, one per nozzle (speed items add nozzles)
    const nozzles = [[0], [-3, 3], [-4, 0, 4], [-5, -2, 2, 5]][sh.speed];
    g.globalCompositeOperation = 'lighter';
    for (const ny of nozzles) {
      const len = 6 + 4 * sh.speed + Math.random() * 5 + Math.max(0, sh.vx) / 40;
      const fl = g.createLinearGradient(-12, 0, -12 - len, 0);
      fl.addColorStop(0, 'rgba(200,245,255,1)');
      fl.addColorStop(0.4, 'rgba(90,170,255,0.7)');
      fl.addColorStop(1, 'rgba(60,80,255,0)');
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(-11, ny - 2);
      g.lineTo(-12 - len, ny);
      g.lineTo(-11, ny + 2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // missile racks under the wings
    if (sh.missiles) {
      g.fillStyle = '#d6dbe6';
      for (const side of sh.missiles >= 2 ? [-1, 1] : [1]) {
        g.fillRect(-7, side * 9 - 1.2, 9, 2.4);
        g.fillStyle = '#ff5a5a';
        g.fillRect(2, side * 9 - 1.2, 2, 2.4);
        g.fillStyle = '#d6dbe6';
      }
    }
    // the hull, R-9 style: a long nose, swept wings, a canopy
    g.fillStyle = '#e8edf7';
    g.strokeStyle = '#26345c';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(16, 0);
    g.lineTo(6, -3);
    g.lineTo(-2, -4);
    g.lineTo(-8, -11);
    g.lineTo(-13, -11);
    g.lineTo(-10, -4);
    g.lineTo(-13, -3);
    g.lineTo(-13, 3);
    g.lineTo(-10, 4);
    g.lineTo(-13, 11);
    g.lineTo(-8, 11);
    g.lineTo(-2, 4);
    g.lineTo(6, 3);
    g.closePath();
    g.fill();
    g.stroke();
    // hull plates from the cards: grey bands on the wings
    for (let i = 0; i < sh.cards.plates; i++) {
      g.fillStyle = '#8b96ae';
      for (const side of [-1, 1]) g.fillRect(-11 + i * 2.6, side > 0 ? 5 : -9, 2, 4);
    }
    // the canopy
    g.fillStyle = '#3fd8ff';
    g.beginPath();
    g.ellipse(2, 0, 4.5, 1.8, 0, 0, Math.PI * 2);
    g.fill();
    // the gun's emitters: the crystal's colour, one per level
    g.fillStyle = col;
    const em = [[0], [-2.5, 2.5], [-3.5, 0, 3.5]][sh.gunLevel - 1];
    for (const y of em) {
      if (sh.gun === 'laser') g.fillRect(9, y - 0.7, 10, 1.4);
      else if (sh.gun === 'spread') {
        g.beginPath();
        g.moveTo(9, y);
        g.lineTo(14, y - 2);
        g.lineTo(14, y + 2);
        g.fill();
      } else if (sh.gun === 'homing') {
        g.beginPath();
        g.arc(11, y, 1.6, 0, Math.PI * 2);
        g.fill();
      } else g.fillRect(10, y - 0.6, 7, 1.2);
    }
    // the capacitor coils on the nose, from the cards
    for (let i = 0; i < sh.cards.capacitor; i++) {
      g.strokeStyle = 'rgba(120,240,255,0.9)';
      g.lineWidth = 0.9;
      g.beginPath();
      g.ellipse(4 - i * 2.4, 0, 0.9, 3.6, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // the charge, gathering at the nose
    if (sh.charge > 0) {
      g.globalCompositeOperation = 'lighter';
      const r = 3 + sh.charge * 11 + (sh.charge >= 1 ? Math.sin(s.time * 30) * 2 : 0);
      const cg = g.createRadialGradient(18, 0, 0, 18, 0, r);
      cg.addColorStop(0, 'rgba(255,255,255,1)');
      cg.addColorStop(0.35, 'rgba(120,230,255,0.85)');
      cg.addColorStop(1, 'rgba(60,120,255,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(18, 0, r, 0, Math.PI * 2);
      g.fill();
      // sparks drawn in toward the nose
      g.strokeStyle = 'rgba(160,240,255,0.8)';
      g.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 10 + Math.random() * 14;
        g.beginPath();
        g.moveTo(18 + Math.cos(a) * d, Math.sin(a) * d);
        g.lineTo(18 + Math.cos(a) * d * 0.5, Math.sin(a) * d * 0.5);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
    g.globalAlpha = 1;
    // the hitbox, a small dot: shooter players dodge by it
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(sh.x, sh.y, 1.6, 0, Math.PI * 2);
    g.fill();
    // bits
    for (let i = 0; i < sh.bits; i++) {
      const bp = sh.bitPos[i];
      g.globalCompositeOperation = 'lighter';
      const bg = g.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, 9);
      bg.addColorStop(0, 'rgba(255,220,140,0.9)');
      bg.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = bg;
      g.beginPath();
      g.arc(bp.x, bp.y, 9, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ffd36e';
      g.beginPath();
      g.arc(bp.x, bp.y, 4, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawPod(s: SimState): void {
    const g = this.ctx;
    const pod = s.pod;
    const col = GUN_COLOR[s.ship.gun];
    const r = podRadius(s);
    if (pod.mode === 'return') {
      g.strokeStyle = 'rgba(255,200,120,0.35)';
      g.setLineDash([2, 4]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(pod.x, pod.y);
      g.lineTo(s.ship.x, s.ship.y);
      g.stroke();
      g.setLineDash([]);
    }
    g.save();
    g.translate(pod.x, pod.y);
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(0, 0, 0, 0, 0, r * 1.7);
    gl.addColorStop(0, 'rgba(255,190,110,0.85)');
    gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl;
    g.beginPath();
    g.arc(0, 0, r * 1.7, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = col;
    g.beginPath();
    g.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff8e6';
    g.beginPath();
    g.arc(0, 0, r * 0.25, 0, Math.PI * 2);
    g.fill();
    // the cage, open on the side that faces the ship when docked
    g.rotate(pod.mode === 'out' || pod.mode === 'return' ? s.time * 7 : pod.mode === 'back' ? 0 : Math.PI);
    g.strokeStyle = '#d8a860';
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = -0.9 + i * 0.9;
      g.beginPath();
      g.arc(0, 0, r, a - 0.3, a + 0.3);
      g.stroke();
    }
    g.restore();
  }

  private drawEnemy(e: Enemy, s: SimState): void {
    const g = this.ctx;
    const def = ENEMIES[e.kind];
    const col = e.flash > 0 ? '#ffffff' : def.color;
    g.save();
    g.translate(e.x, e.y);
    g.scale(SPRITE, SPRITE);
    if (e.kind === 'turret') {
      // a base on the terrain and a barrel that follows the ship
      const up = e.anchor === 'ceil' ? -1 : 1;
      g.fillStyle = e.flash > 0 ? '#fff' : '#5b6684';
      g.beginPath();
      g.ellipse(0, up * 4, 11, 7, 0, Math.PI, 0, up < 0);
      g.fill();
      g.fillStyle = col;
      g.beginPath();
      g.arc(0, 0, 6, 0, Math.PI * 2);
      g.fill();
      g.rotate(e.angle);
      g.fillStyle = '#2b3348';
      g.fillRect(2, -2, 11, 4);
      g.restore();
      return;
    }
    g.rotate(e.angle);
    g.fillStyle = col;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 1;
    switch (e.kind) {
      case 'popcorn': {
        // a little bug-eyed drone; it faces where it flies
        g.beginPath();
        g.moveTo(8, 0);
        g.lineTo(-2, -6);
        g.lineTo(-7, -3);
        g.lineTo(-5, 0);
        g.lineTo(-7, 3);
        g.lineTo(-2, 6);
        g.closePath();
        g.fill();
        g.fillStyle = '#ffe9a8';
        g.beginPath();
        g.arc(2, 0, 2, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'swooper': {
        g.beginPath();
        g.moveTo(11, 0);
        g.lineTo(-4, -9);
        g.lineTo(-9, -9);
        g.lineTo(-4, 0);
        g.lineTo(-9, 9);
        g.lineTo(-4, 9);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#5a1e00';
        g.fillRect(-2, -2, 7, 4);
        break;
      }
      case 'chaser': {
        g.beginPath();
        g.moveTo(11, 0);
        g.quadraticCurveTo(-2, -10, -9, -5);
        g.lineTo(-5, 0);
        g.lineTo(-9, 5);
        g.quadraticCurveTo(-2, 10, 11, 0);
        g.fill();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(220,140,255,0.8)';
        g.beginPath();
        g.arc(-7, 0, 2.5 + Math.random() * 2, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'gunship': {
        g.rotate(-e.angle + Math.PI);
        g.fillStyle = e.flash > 0 ? '#fff' : '#6b5420';
        g.beginPath();
        g.moveTo(20, 0);
        g.lineTo(10, -16);
        g.lineTo(-18, -12);
        g.lineTo(-22, 0);
        g.lineTo(-18, 12);
        g.lineTo(10, 16);
        g.closePath();
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = col;
        for (const y of [-9, 0, 9]) g.fillRect(14, y - 1.5, 9, 3);
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(255,200,80,0.7)';
        g.beginPath();
        g.arc(-6, 0, 5 + Math.sin(s.time * 8) * 1.5, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'carrier': {
        // the power-up carrier: a glass case with the drop inside
        g.rotate(-e.angle);
        g.fillStyle = e.flash > 0 ? '#fff' : '#2d4a66';
        g.beginPath();
        g.ellipse(0, 0, 14, 10, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#9fe8ff';
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = e.drop ? DROP_COLOR[e.drop] : '#fff';
        g.beginPath();
        g.moveTo(0, -6);
        g.lineTo(5, 0);
        g.lineTo(0, 6);
        g.lineTo(-5, 0);
        g.closePath();
        g.fill();
        for (const sx of [-1, 1]) {
          g.fillStyle = '#9fe8ff';
          g.fillRect(sx * 13 - 2, -2 + Math.sin(s.time * 10) * 3, 4, 4);
        }
        break;
      }
      case 'spinner': {
        g.rotate(e.t * 3);
        for (let i = 0; i < 3; i++) {
          g.rotate((Math.PI * 2) / 3);
          g.beginPath();
          g.moveTo(5, -5);
          g.lineTo(18, 0);
          g.lineTo(5, 5);
          g.fill();
        }
        g.fillStyle = '#0c3b2e';
        g.beginPath();
        g.arc(0, 0, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = col;
        g.beginPath();
        g.arc(0, 0, 5, 0, Math.PI * 2);
        g.fill();
        break;
      }
      default:
        break;
    }
    g.restore();
    if ((e.kind === 'gunship' || e.kind === 'spinner') && e.hp < e.maxHp) {
      const w = e.r * 2;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(e.x - w / 2, e.y - e.r * SPRITE - 7, w, 2.5);
      g.fillStyle = ENEMIES[e.kind].color;
      g.fillRect(e.x - w / 2, e.y - e.r * SPRITE - 7, (w * e.hp) / e.maxHp, 2.5);
    }
  }

  /** A boss is drawn part by part, so what you see is what you can hit. */
  private drawBoss(e: Enemy, s: SimState): void {
    const def = ENEMIES[e.kind];
    const parts = e.parts!;
    // the serpent's body first, tail to head
    const order = e.kind === 'serpent' ? [...parts].reverse() : [...parts].sort((a, b) => (a.kind === 'armor' ? -1 : 1) - (b.kind === 'armor' ? -1 : 1));
    if (e.kind === 'bulwark') this.bulwarkHull(e);
    if (e.kind === 'warden') this.wardenHull(e);
    for (const p of order) {
      if (p.dead) {
        if (p.kind === 'gun') this.wreck(e.x + p.ox, e.y + p.oy, p.r);
        continue;
      }
      const x = e.x + p.ox;
      const y = e.y + p.oy;
      if (p.kind === 'armor') this.armor(x, y, p, e, s);
      else if (p.kind === 'gun') this.gun(x, y, p, s);
      else this.weak(x, y, p, e, s, def.color);
    }
  }

  private wardenHull(e: Enemy): void {
    const g = this.ctx;
    g.save();
    g.translate(e.x, e.y);
    g.fillStyle = '#3a2a26';
    g.strokeStyle = '#ff9a5a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-50, -30);
    g.lineTo(-30, -100);
    g.lineTo(40, -95);
    g.lineTo(70, -40);
    g.lineTo(70, 40);
    g.lineTo(40, 95);
    g.lineTo(-30, 100);
    g.lineTo(-50, 30);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
  }

  private bulwarkHull(e: Enemy): void {
    const g = this.ctx;
    g.save();
    g.translate(e.x, e.y);
    g.fillStyle = '#2e1c22';
    g.strokeStyle = '#ff6a7a';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-70, -150);
    g.lineTo(80, -160);
    g.lineTo(90, 160);
    g.lineTo(-70, 150);
    g.lineTo(-100, 80);
    g.lineTo(-110, 0);
    g.lineTo(-100, -80);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    for (let y = -140; y <= 140; y += 28) {
      g.beginPath();
      g.moveTo(-60, y);
      g.lineTo(80, y);
      g.stroke();
    }
    g.restore();
  }

  private armor(x: number, y: number, p: Part, e: Enemy, s: SimState): void {
    const g = this.ctx;
    const serp = e.kind === 'serpent';
    const gr = g.createRadialGradient(x - p.r * 0.4, y - p.r * 0.4, p.r * 0.1, x, y, p.r);
    gr.addColorStop(0, serp ? '#7adf8a' : '#8a8fa6');
    gr.addColorStop(1, serp ? '#1d4a2a' : '#262a38');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, p.r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = serp ? '#a8ffb8' : 'rgba(220,230,255,0.4)';
    g.lineWidth = 1;
    g.stroke();
    if (serp) {
      // spines
      g.fillStyle = '#c8ffd0';
      g.beginPath();
      g.moveTo(x - 3, y - p.r + 1);
      g.lineTo(x, y - p.r - 6);
      g.lineTo(x + 3, y - p.r + 1);
      g.fill();
    } else {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.6;
        g.fillRect(x + Math.cos(a) * p.r * 0.7 - 1, y + Math.sin(a) * p.r * 0.7 - 1, 2, 2);
      }
    }
    void s;
  }

  private gun(x: number, y: number, p: Part, s: SimState): void {
    const g = this.ctx;
    g.fillStyle = p.flash > 0 ? '#ffffff' : '#c86a3a';
    g.beginPath();
    g.arc(x, y, p.r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffd0a0';
    g.lineWidth = 1.5;
    g.stroke();
    const a = Math.atan2(s.ship.y - y, s.ship.x - x);
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = '#2a1a14';
    g.fillRect(p.r * 0.3, -2.5, p.r + 6, 5);
    g.restore();
    // its own hull bar
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(x - p.r, y - p.r - 6, p.r * 2, 2);
    g.fillStyle = '#ffb070';
    g.fillRect(x - p.r, y - p.r - 6, (p.r * 2 * p.hp) / p.maxHp, 2);
  }

  private wreck(x: number, y: number, r: number): void {
    const g = this.ctx;
    g.fillStyle = '#1a1210';
    g.beginPath();
    g.arc(x, y, r * 0.8, 0, Math.PI * 2);
    g.fill();
    if (Math.random() < 0.3) {
      g.fillStyle = 'rgba(255,140,60,0.8)';
      g.fillRect(x - 1 + Math.random() * 4, y - 1 - Math.random() * 6, 2, 2);
    }
  }

  private weak(x: number, y: number, p: Part, e: Enemy, s: SimState, color: string): void {
    const g = this.ctx;
    if (e.kind === 'serpent') {
      // the head: a jaw and one eye
      g.save();
      g.translate(x, y);
      const a = Math.atan2(s.ship.y - y, s.ship.x - x);
      g.rotate(a);
      g.fillStyle = p.flash > 0 ? '#fff' : '#2e7a3e';
      g.beginPath();
      g.moveTo(26, -6);
      g.lineTo(-14, -18);
      g.lineTo(-18, 0);
      g.lineTo(-14, 18);
      g.lineTo(26, 6);
      g.closePath();
      g.fill();
      g.strokeStyle = '#a8ffb8';
      g.stroke();
      g.restore();
    }
    if (!p.open) {
      // shut: metal slats over the core
      g.fillStyle = '#4a4f62';
      g.beginPath();
      g.arc(x, y, p.r + 3, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#202432';
      g.lineWidth = 2;
      for (const dy of [-6, 0, 6]) {
        g.beginPath();
        g.moveTo(x - p.r, y + dy);
        g.lineTo(x + p.r, y + dy);
        g.stroke();
      }
      return;
    }
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.7 + 0.3 * Math.sin(s.time * 10);
    const cg = g.createRadialGradient(x, y, 0, x, y, p.r * 1.9);
    cg.addColorStop(0, `rgba(255,255,230,${pulse})`);
    cg.addColorStop(0.35, color);
    cg.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.arc(x, y, p.r * 1.9, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = p.flash > 0 ? '#ffffff' : '#fff2c0';
    g.beginPath();
    g.arc(x, y, p.r * 0.55, 0, Math.PI * 2);
    g.fill();
  }

  private drawBeams(s: SimState): void {
    const g = this.ctx;
    for (const b of s.beams) {
      const len = 1200;
      const ex = b.x + Math.cos(b.angle) * len;
      const ey = b.y + Math.sin(b.angle) * len;
      if (b.warn > 0) {
        // the warning: a thin flickering line along where the beam will be
        g.strokeStyle = Math.floor(s.time * 16) % 2 ? 'rgba(255,80,120,0.85)' : 'rgba(255,200,220,0.5)';
        g.lineWidth = 1.5;
        g.setLineDash([8, 6]);
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(ex, ey);
        g.stroke();
        g.setLineDash([]);
        // the sweep's far edge, so you know which way it will turn
        const end = b.angle + b.sweep * b.life;
        g.strokeStyle = 'rgba(255,80,120,0.3)';
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(b.x + Math.cos(end) * len, b.y + Math.sin(end) * len);
        g.stroke();
        continue;
      }
      g.globalCompositeOperation = 'lighter';
      for (const [w, c] of [
        [b.width * 1.8, 'rgba(255,60,140,0.35)'],
        [b.width, 'rgba(255,120,190,0.8)'],
        [b.width * 0.35, 'rgba(255,255,255,1)'],
      ] as const) {
        g.strokeStyle = c;
        g.lineWidth = w * (0.9 + Math.random() * 0.2);
        g.beginPath();
        g.moveTo(b.x, b.y);
        g.lineTo(ex, ey);
        g.stroke();
      }
      g.globalCompositeOperation = 'source-over';
    }
  }

  private drawPlayerShots(s: SimState): void {
    const g = this.ctx;
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (const b of s.bullets) if (b.team === 'player') this.playerShot(g, b, s);
    g.globalCompositeOperation = 'source-over';
  }

  private playerShot(g: CanvasRenderingContext2D, b: Bullet, s: SimState): void {
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const ux = b.vx / sp;
    const uy = b.vy / sp;
    switch (b.kind) {
      case 'charge': {
        // the wave: a bright head and a rippling tail
        const r = b.r;
        const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r * 1.6);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.4, 'rgba(120,235,255,0.9)');
        gr.addColorStop(1, 'rgba(40,100,255,0)');
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(b.x, b.y, r * 1.6, r * 1.1, Math.atan2(uy, ux), 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = 'rgba(140,230,255,0.6)';
        g.lineWidth = 2;
        for (let i = 1; i <= 3; i++) {
          g.beginPath();
          g.arc(b.x - ux * i * r * 0.9, b.y - uy * i * r * 0.9, r * (1 - i * 0.18), -Math.PI / 2 + Math.atan2(uy, ux) + Math.PI, Math.PI / 2 + Math.atan2(uy, ux) + Math.PI, true);
          g.stroke();
        }
        return;
      }
      case 'laser': {
        g.strokeStyle = 'rgba(80,160,255,0.9)';
        g.lineWidth = b.r * 1.6;
        g.beginPath();
        g.moveTo(b.x - ux * 34, b.y - uy * 34);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = b.r * 0.5;
        g.beginPath();
        g.moveTo(b.x - ux * 30, b.y - uy * 30);
        g.lineTo(b.x, b.y);
        g.stroke();
        return;
      }
      case 'spread': {
        g.strokeStyle = 'rgba(255,90,80,0.95)';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(b.x - ux * 8, b.y - uy * 8);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.strokeStyle = '#ffe0d8';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(b.x - ux * 5, b.y - uy * 5);
        g.lineTo(b.x, b.y);
        g.stroke();
        return;
      }
      case 'homing':
      case 'missile': {
        const c = b.kind === 'homing' ? 'rgba(255,220,80,0.9)' : 'rgba(255,255,255,0.95)';
        g.strokeStyle = b.kind === 'homing' ? 'rgba(255,170,40,0.5)' : 'rgba(200,200,200,0.4)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(b.x - ux * 12, b.y - uy * 12);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.fillStyle = c;
        g.beginPath();
        g.arc(b.x, b.y, 2.4, 0, Math.PI * 2);
        g.fill();
        return;
      }
      default: {
        const bit = b.kind === 'bit';
        g.strokeStyle = bit ? 'rgba(255,210,110,0.9)' : 'rgba(150,230,255,0.95)';
        g.lineWidth = 3.4;
        g.beginPath();
        g.moveTo(b.x - ux * 12, b.y - uy * 12);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(b.x - ux * 7, b.y - uy * 7);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }
    void s;
  }

  /** Enemy shots go on top of everything: they are what kills you. */
  private drawEnemyShots(s: SimState): void {
    const g = this.ctx;
    for (const b of s.bullets) {
      if (b.team !== 'enemy') continue;
      if (b.kind === 'mine') {
        g.fillStyle = Math.floor(s.time * 6) % 2 ? '#ff8ad0' : '#c02a7a';
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + s.time * 2;
          const r = i % 2 ? b.r * 0.6 : b.r * 1.25;
          g.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
        }
        g.fill();
        continue;
      }
      g.fillStyle = 'rgba(255,60,150,0.4)';
      g.beginPath();
      g.arc(b.x, b.y, b.r * 1.9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff4fa0';
      g.beginPath();
      g.arc(b.x, b.y, b.r * 1.15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(b.x, b.y, b.r * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawDrop(d: { x: number; y: number; kind: keyof typeof DROP_COLOR; t: number }, s: SimState): void {
    const g = this.ctx;
    const col = DROP_COLOR[d.kind];
    const label = DROP_LABEL[d.kind];
    g.save();
    g.translate(d.x, d.y);
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(0, 0, 0, 0, 0, 18);
    gl.addColorStop(0, col);
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = 0.5 + 0.3 * Math.sin(s.time * 8);
    g.fillStyle = gl;
    g.beginPath();
    g.arc(0, 0, 18, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (!label) {
      // a crystal, turning
      g.rotate(d.t * 2);
      g.fillStyle = col;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(0, -9);
      g.lineTo(7, 0);
      g.lineTo(0, 9);
      g.lineTo(-7, 0);
      g.closePath();
      g.fill();
      g.stroke();
    } else {
      g.fillStyle = '#10182c';
      g.strokeStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      g.roundRect(-9, -8, 18, 16, 4);
      g.fill();
      g.stroke();
      g.fillStyle = col;
      g.font = 'bold 12px system-ui, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(label, 0, 1);
    }
    g.restore();
  }

  private drawEffects(s: SimState): void {
    const g = this.ctx;
    g.globalCompositeOperation = 'lighter';
    for (const q of s.particles) {
      g.globalAlpha = Math.max(0, q.life / q.max);
      g.fillStyle = q.color;
      const r = q.size * (0.5 + 0.5 * (q.life / q.max));
      g.fillRect(q.x - r / 2, q.y - r / 2, r, r);
    }
    g.globalAlpha = 1;
    for (const r of s.rings) {
      g.strokeStyle = r.color;
      g.globalAlpha = Math.max(0, r.life / r.max);
      g.lineWidth = r.width * (r.life / r.max) + 0.5;
      g.beginPath();
      g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = 'bold 11px system-ui, sans-serif';
    for (const f of s.floaters) {
      g.globalAlpha = Math.min(1, f.life * 2);
      g.fillStyle = f.color;
      g.fillText(f.text, Math.max(30, Math.min(W - 30, f.x)), f.y);
    }
    g.globalAlpha = 1;
  }
}
