import { W, H, type SimState, type SimInput, type Enemy, type Bullet } from '../game/state';
import { predict, NO_RETURN, R_REF } from '../game/physics';
import { bitPositions, chargeAngle, CHARGE_SPEED, WELL, SHIP_R } from '../game/sim';
import { ENEMIES } from '../game/content';

/**
 * Canvas 2D. The arena is fitted inside the screen's safe area; everything
 * is drawn in world units under one transform. The background (stars, the
 * bent grid that shows the pull, the planet) is drawn once per size and
 * cached. Cosmetic randomness uses Math.random, never the sim's stream.
 */
/** Ships are drawn larger than their hit circles: readable on a phone, and a small hitbox is what a shooter player expects. */
const SPRITE = 1.3;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private bg: HTMLCanvasElement | null = null;
  private bgKey = '';
  /** css px per world unit, and the arena's top-left in css px */
  scale = 1;
  ox = 0;
  oy = 0;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Fit the arena in the css-px box, minus the insets. */
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

  /** css px to world */
  toWorld(x: number, y: number): { x: number; y: number } {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  }
  /** world to css px */
  toScreen(x: number, y: number): { x: number; y: number } {
    return { x: this.ox + x * this.scale, y: this.oy + y * this.scale };
  }

  private background(s: SimState): HTMLCanvasElement {
    const key = `${this.canvas.width}x${this.canvas.height}:${this.scale}`;
    if (this.bg && this.bgKey === key) return this.bg;
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const g = c.getContext('2d')!;
    g.fillStyle = '#03040c';
    g.fillRect(0, 0, c.width, c.height);
    const k = this.dpr * this.scale;
    g.setTransform(k, 0, 0, k, this.dpr * this.ox, this.dpr * this.oy);
    const p = s.planet;
    // deep space, a nebula, stars
    const sky = g.createRadialGradient(p.x, p.y, 40, p.x, p.y, W * 0.7);
    sky.addColorStop(0, '#0d1230');
    sky.addColorStop(1, '#05060f');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const neb = (x: number, y: number, r: number, col: string) => {
      const n = g.createRadialGradient(x, y, 0, x, y, r);
      n.addColorStop(0, col);
      n.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = n;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(W * 0.15, H * 0.2, 260, 'rgba(90,40,140,0.22)');
    neb(W * 0.85, H * 0.85, 300, 'rgba(20,90,140,0.2)');
    neb(W * 0.7, H * 0.1, 180, 'rgba(140,50,80,0.12)');
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W;
      const y = rnd() * H;
      const b = rnd();
      g.fillStyle = `rgba(${200 + b * 55},${210 + b * 45},255,${0.25 + b * 0.6})`;
      const r = b > 0.93 ? 1.3 : 0.6;
      g.fillRect(x - r / 2, y - r / 2, r, r);
    }
    // the pull, drawn: a square grid sunk toward the planet, deeper where it pulls harder
    g.lineWidth = 0.7;
    const sink = (x: number, y: number) => {
      const dx = x - p.x;
      const dy = y - p.y;
      const r = Math.hypot(dx, dy) || 1;
      const d = Math.min(r - p.r * 0.6, 38 * Math.pow(R_REF / r, 1.1));
      return [x - (dx / r) * d, y - (dy / r) * d];
    };
    const gridLine = (pts: number[][]) => {
      g.beginPath();
      pts.forEach(([x, y], i) => {
        const [sx, sy] = sink(x, y);
        if (i) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      });
      g.stroke();
    };
    const step = 40;
    for (let x = p.x % step; x <= W; x += step) {
      g.strokeStyle = `rgba(90,150,255,${0.08 + 0.1 * Math.exp(-Math.abs(x - p.x) / 200)})`;
      const pts = [];
      for (let y = 0; y <= H; y += 8) pts.push([x, y]);
      gridLine(pts);
    }
    for (let y = p.y % step; y <= H; y += step) {
      g.strokeStyle = `rgba(90,150,255,${0.08 + 0.1 * Math.exp(-Math.abs(y - p.y) / 200)})`;
      const pts = [];
      for (let x = 0; x <= W; x += 8) pts.push([x, y]);
      gridLine(pts);
    }
    // the well, where the cannon charges fast, and the line of no return
    g.setLineDash([3, 6]);
    g.strokeStyle = 'rgba(120,230,255,0.35)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(p.x, p.y, WELL, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    const glow = g.createRadialGradient(p.x, p.y, p.r, p.x, p.y, NO_RETURN + 6);
    glow.addColorStop(0, 'rgba(255,90,50,0.0)');
    glow.addColorStop(0.75, 'rgba(255,90,50,0.10)');
    glow.addColorStop(1, 'rgba(255,90,50,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(p.x, p.y, NO_RETURN + 6, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,110,70,0.45)';
    g.setLineDash([2, 4]);
    g.beginPath();
    g.arc(p.x, p.y, NO_RETURN, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    // the planet: an atmosphere, bands, the night side
    const atm = g.createRadialGradient(p.x, p.y, p.r * 0.9, p.x, p.y, p.r * 1.5);
    atm.addColorStop(0, 'rgba(255,170,110,0.55)');
    atm.addColorStop(1, 'rgba(255,120,80,0)');
    g.fillStyle = atm;
    g.beginPath();
    g.arc(p.x, p.y, p.r * 1.5, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.beginPath();
    g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#d9874c';
    g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    const bands = ['#f0b277', '#b85f34', '#e9a066', '#9c4a2c', '#f3c38d', '#c46d3c', '#7e3b26'];
    for (let i = 0; i < 14; i++) {
      g.fillStyle = bands[i % bands.length];
      const y = p.y - p.r + (i / 14) * p.r * 2;
      g.beginPath();
      g.moveTo(p.x - p.r, y);
      for (let x = -p.r; x <= p.r; x += 4) g.lineTo(p.x + x, y + Math.sin(x * 0.12 + i) * 1.6);
      g.lineTo(p.x + p.r, y + 5);
      g.lineTo(p.x - p.r, y + 5);
      g.fill();
    }
    g.fillStyle = 'rgba(160,40,30,0.8)';
    g.beginPath();
    g.ellipse(p.x + 12, p.y + 10, 8, 4, 0, 0, Math.PI * 2);
    g.fill();
    const shade = g.createRadialGradient(p.x - p.r * 0.45, p.y - p.r * 0.45, p.r * 0.2, p.x, p.y, p.r * 1.15);
    shade.addColorStop(0, 'rgba(255,240,210,0.25)');
    shade.addColorStop(0.55, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(5,3,15,0.85)');
    g.fillStyle = shade;
    g.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    g.restore();
    // the arena's edge
    g.strokeStyle = 'rgba(120,160,255,0.18)';
    g.lineWidth = 1;
    g.strokeRect(0.5, 0.5, W - 1, H - 1);
    this.bg = c;
    this.bgKey = key;
    return c;
  }

  draw(s: SimState, inp: SimInput, alpha: number): void {
    void alpha;
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    let sx = 0;
    let sy = 0;
    if (s.shake > 0) {
      sx = (Math.random() - 0.5) * s.shake * this.scale * this.dpr;
      sy = (Math.random() - 0.5) * s.shake * this.scale * this.dpr;
    }
    g.drawImage(this.background(s), sx, sy);
    const k = this.dpr * this.scale;
    g.setTransform(k, 0, 0, k, this.dpr * this.ox + sx, this.dpr * this.oy + sy);
    this.drawPaths(s, inp);
    for (const e of s.enemies) this.drawEnemy(e, s);
    this.drawBullets(s);
    if (!s.ship.dead) this.drawShip(s);
    this.drawPod(s);
    this.drawEffects(s);
  }

  /** Where the ship falls if the thumb lets go, and where the charge would fly. */
  private drawPaths(s: SimState, inp: SimInput): void {
    const g = this.ctx;
    const sh = s.ship;
    if (sh.dead || s.phase !== 'fight') return;
    const fall = predict(s.planet, sh.x, sh.y, sh.vx, sh.vy, 1.4, 1 / 30);
    g.fillStyle = 'rgba(150,220,255,0.55)';
    for (let i = 4; i < fall.length; i += 6) {
      g.globalAlpha = 1 - i / fall.length;
      g.fillRect(fall[i] - 1, fall[i + 1] - 1, 2, 2);
    }
    g.globalAlpha = 1;
    if (sh.charging) {
      const a = chargeAngle(s, inp);
      const path = predict(s.planet, sh.x, sh.y, sh.vx * 0.5 + Math.cos(a) * CHARGE_SPEED, sh.vy * 0.5 + Math.sin(a) * CHARGE_SPEED, 1.6, 1 / 40);
      g.strokeStyle = sh.charge >= 1 ? 'rgba(130,240,255,0.85)' : `rgba(130,240,255,${0.25 + 0.4 * sh.charge})`;
      g.lineWidth = 1 + sh.charge * 1.5;
      g.setLineDash([5, 5]);
      g.lineDashOffset = -s.time * 40;
      g.beginPath();
      g.moveTo(path[0], path[1]);
      for (let i = 2; i < path.length; i += 2) g.lineTo(path[i], path[i + 1]);
      g.stroke();
      g.setLineDash([]);
    }
  }

  private drawShip(s: SimState): void {
    const g = this.ctx;
    const sh = s.ship;
    const u = sh.upgrades;
    if (sh.invuln > 0 && Math.floor(s.time * 20) % 2 === 0 && s.time > 1.6) g.globalAlpha = 0.45;
    g.save();
    g.translate(sh.x, sh.y);
    g.scale(SPRITE, SPRITE);
    // charge glow at the nose, and the meter round the ship
    if (sh.charge > 0) {
      g.globalCompositeOperation = 'lighter';
      const r = 4 + sh.charge * 10 + (sh.charge >= 1 ? Math.sin(s.time * 30) * 1.5 : 0);
      const nx = Math.cos(sh.angle) * 15;
      const ny = Math.sin(sh.angle) * 15;
      const cg = g.createRadialGradient(nx, ny, 0, nx, ny, r);
      cg.addColorStop(0, 'rgba(255,255,255,0.95)');
      cg.addColorStop(0.4, 'rgba(120,230,255,0.7)');
      cg.addColorStop(1, 'rgba(60,120,255,0)');
      g.fillStyle = cg;
      g.beginPath();
      g.arc(nx, ny, r, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = sh.charge >= 1 ? '#bff8ff' : 'rgba(120,220,255,0.8)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, 21, -Math.PI / 2, -Math.PI / 2 + sh.charge * Math.PI * 2);
      g.stroke();
    }
    g.rotate(sh.angle);
    // engine flames, one per nozzle, by thrust
    const nozzles = u.engine >= 2 ? [-5, 0, 5] : u.engine >= 1 ? [-4, 4] : [0];
    g.globalCompositeOperation = 'lighter';
    for (const ny of nozzles) {
      const len = 4 + sh.thrust * (10 + 3 * u.engine) * (0.8 + Math.random() * 0.4);
      const fl = g.createLinearGradient(-10, 0, -10 - len, 0);
      fl.addColorStop(0, 'rgba(180,240,255,0.95)');
      fl.addColorStop(0.5, 'rgba(80,160,255,0.6)');
      fl.addColorStop(1, 'rgba(60,80,255,0)');
      g.fillStyle = fl;
      g.beginPath();
      g.moveTo(-9, ny - 2.2);
      g.lineTo(-10 - len, ny);
      g.lineTo(-9, ny + 2.2);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // missile racks under the wings
    if (u.missiles) {
      g.fillStyle = '#c9ced8';
      for (const side of [-1, 1]) for (let i = 0; i < u.missiles; i++) g.fillRect(-6 + i * 3.2, side * (7.5 + 0) - 1, 2.6, 2);
    }
    // the hull: an arrowhead with swept wings
    g.fillStyle = '#e9eef8';
    g.strokeStyle = '#2a3a66';
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(2, -3.5);
    g.lineTo(-4, -9.5);
    g.lineTo(-9, -9);
    g.lineTo(-7, -3);
    g.lineTo(-10, -2.5);
    g.lineTo(-10, 2.5);
    g.lineTo(-7, 3);
    g.lineTo(-9, 9);
    g.lineTo(-4, 9.5);
    g.lineTo(2, 3.5);
    g.closePath();
    g.fill();
    g.stroke();
    // hull plates: darker armour along the wings, one band per level
    if (u.armor) {
      g.fillStyle = '#8a95ad';
      for (let i = 0; i < u.armor; i++) {
        for (const side of [-1, 1]) {
          g.beginPath();
          g.moveTo(-1 - i * 2.4, side * 4);
          g.lineTo(-3 - i * 2.4, side * (7.5 - i * 0.3));
          g.lineTo(-4.6 - i * 2.4, side * (7.5 - i * 0.3));
          g.lineTo(-2.6 - i * 2.4, side * 4);
          g.fill();
        }
      }
    }
    // the canopy
    g.fillStyle = '#3fd8ff';
    g.beginPath();
    g.ellipse(3, 0, 4, 1.8, 0, 0, Math.PI * 2);
    g.fill();
    // barrels: one per spread level, longer with rapid feed, thicker with the mass driver
    const barrels = [[0], [-2.4, 2.4], [-3.5, 0, 3.5], [-5, -2.5, 0, 2.5, 5]][u.spread];
    const len = 5 + u.rapid * 2.2;
    g.fillStyle = u.heavy ? '#ffb46b' : '#9fb3d9';
    for (const by of barrels) g.fillRect(8 - Math.abs(by) * 0.8, by - 0.6 - u.heavy * 0.25, len, 1.2 + u.heavy * 0.5);
    // the wave cannon coil: rings on the nose, brighter per level
    for (let i = 0; i < u.wave; i++) {
      g.strokeStyle = `rgba(110,240,255,${0.6 + 0.15 * i})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(9 - i * 2.6, 0, 1, 3.4 - i * 0.2, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
    // bits
    for (const bp of bitPositions(s)) {
      g.fillStyle = '#ffd36e';
      g.beginPath();
      g.arc(bp.x, bp.y, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,240,180,0.8)';
      g.lineWidth = 1;
      g.beginPath();
      g.arc(bp.x, bp.y, 6 + Math.sin(s.time * 8) * 0.8, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  private drawPod(s: SimState): void {
    const g = this.ctx;
    const pod = s.pod;
    const lvl = s.ship.upgrades.podgun;
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
    if (pod.mode !== 'docked') {
      // its own fall line: the pod is a free body
      const path = predict(s.planet, pod.x, pod.y, pod.vx, pod.vy, 0.8, 1 / 30);
      g.fillStyle = 'rgba(255,190,110,0.5)';
      for (let i = 4; i < path.length; i += 6) g.fillRect(path[i] - 0.8, path[i + 1] - 0.8, 1.6, 1.6);
    }
    g.save();
    g.translate(pod.x, pod.y);
    g.scale(SPRITE, SPRITE);
    g.globalCompositeOperation = 'lighter';
    const gl = g.createRadialGradient(0, 0, 0, 0, 0, 14);
    gl.addColorStop(0, lvl >= 2 ? 'rgba(255,120,200,0.8)' : 'rgba(255,170,80,0.8)');
    gl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gl;
    g.beginPath();
    g.arc(0, 0, 14, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = lvl >= 1 ? '#ff8fd0' : '#ffb35a';
    g.beginPath();
    g.arc(0, 0, 5.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff3d6';
    g.beginPath();
    g.arc(0, 0, 2.6, 0, Math.PI * 2);
    g.fill();
    // the cage, turning
    g.rotate(s.time * (pod.mode === 'docked' ? 2 : 7));
    g.strokeStyle = '#c9a26a';
    g.lineWidth = 1.4;
    for (let i = 0; i < 3 + lvl; i++) {
      const a = (i / (3 + lvl)) * Math.PI * 2;
      g.beginPath();
      g.arc(0, 0, 8.5, a, a + 0.9);
      g.stroke();
    }
    g.restore();
  }

  private drawEnemy(e: Enemy, s: SimState): void {
    const g = this.ctx;
    const def = ENEMIES[e.kind];
    g.save();
    g.translate(e.x, e.y);
    g.scale(SPRITE, SPRITE);
    if (e.entering > 0) {
      // warping in: a ring closes on it
      g.strokeStyle = def.color;
      g.globalAlpha = Math.min(1, e.entering * 2);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, e.r + e.entering * 30, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    const col = e.flash > 0 ? '#ffffff' : def.color;
    g.rotate(e.angle);
    g.fillStyle = col;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 1;
    switch (e.kind) {
      case 'dart': {
        g.beginPath();
        g.moveTo(9, 0);
        g.lineTo(-6, -6);
        g.lineTo(-3, 0);
        g.lineTo(-6, 6);
        g.closePath();
        g.fill();
        g.fillStyle = '#2a0610';
        g.beginPath();
        g.arc(1, 0, 1.8, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'diver': {
        g.beginPath();
        g.moveTo(11, 0);
        g.quadraticCurveTo(-2, -9, -8, -4);
        g.lineTo(-4, 0);
        g.lineTo(-8, 4);
        g.quadraticCurveTo(-2, 9, 11, 0);
        g.fill();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(220,140,255,0.8)';
        g.beginPath();
        g.arc(-6, 0, 2 + Math.random() * 2, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'source-over';
        break;
      }
      case 'lancer': {
        // the flame that holds it up against the pull
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = 'rgba(255,160,60,0.7)';
        const gp = Math.atan2(s.planet.y - e.y, s.planet.x - e.x) - e.angle;
        g.save();
        g.rotate(gp);
        g.beginPath();
        g.moveTo(8, -3);
        g.lineTo(14 + Math.random() * 6, 0);
        g.lineTo(8, 3);
        g.fill();
        g.restore();
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(14, 0);
        g.lineTo(4, -5);
        g.lineTo(-10, -11);
        g.lineTo(-6, 0);
        g.lineTo(-10, 11);
        g.lineTo(4, 5);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#5a2a00';
        g.fillRect(-2, -2, 9, 4);
        break;
      }
      case 'spinner': {
        g.rotate(e.t * 2);
        for (let i = 0; i < 5; i++) {
          g.rotate((Math.PI * 2) / 5);
          g.beginPath();
          g.moveTo(5, -4);
          g.lineTo(17, 0);
          g.lineTo(5, 4);
          g.fill();
        }
        g.fillStyle = '#0c3b2e';
        g.beginPath();
        g.arc(0, 0, 8, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = e.gunCd < 0.5 ? '#ffffff' : col;
        g.beginPath();
        g.arc(0, 0, 4.5, 0, Math.PI * 2);
        g.fill();
        break;
      }
      case 'miner': {
        g.beginPath();
        g.ellipse(0, 0, 14, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        g.fillStyle = '#4d3d00';
        for (let i = -1; i <= 1; i++) {
          g.beginPath();
          g.arc(i * 6, 0, 2.4, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'carrier': {
        g.scale(1.3, 1.3);
        g.fillStyle = e.flash > 0 ? '#ffffff' : '#7a3a22';
        g.beginPath();
        g.moveTo(40, 0);
        g.lineTo(26, -14);
        g.lineTo(-30, -18);
        g.lineTo(-42, -8);
        g.lineTo(-42, 8);
        g.lineTo(-30, 18);
        g.lineTo(26, 14);
        g.closePath();
        g.fill();
        g.strokeStyle = '#ff9a5a';
        g.lineWidth = 1.5;
        g.stroke();
        g.fillStyle = '#4a2214';
        for (const x of [-26, 26]) g.fillRect(x - 5, -22, 10, 44);
        // the core
        g.globalCompositeOperation = 'lighter';
        const pulse = 0.6 + 0.4 * Math.sin(s.time * 6);
        const cg = g.createRadialGradient(0, 0, 0, 0, 0, 16);
        cg.addColorStop(0, `rgba(255,255,220,${pulse})`);
        cg.addColorStop(0.4, `rgba(255,140,60,${pulse * 0.8})`);
        cg.addColorStop(1, 'rgba(255,80,20,0)');
        g.fillStyle = cg;
        g.beginPath();
        g.arc(0, 0, 16, 0, Math.PI * 2);
        g.fill();
        g.globalCompositeOperation = 'source-over';
        break;
      }
    }
    g.restore();
    if ((e.kind === 'spinner' || e.kind === 'miner' || e.kind === 'carrier' || e.kind === 'lancer') && e.hp < e.maxHp) {
      const w = e.r * 2;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(e.x - w / 2, e.y - e.r * SPRITE - 6, w, 2.5);
      g.fillStyle = def.color;
      g.fillRect(e.x - w / 2, e.y - e.r * SPRITE - 6, (w * e.hp) / e.maxHp, 2.5);
    }
  }

  private drawBullets(s: SimState): void {
    const g = this.ctx;
    g.globalCompositeOperation = 'lighter';
    for (const b of s.bullets) this.drawBullet(g, b, s);
    g.globalCompositeOperation = 'source-over';
  }

  private drawBullet(g: CanvasRenderingContext2D, b: Bullet, s: SimState): void {
    const tr = b.trail;
    if (b.kind === 'shot' || b.kind === 'bit') {
      const n = tr.length;
      const tx = n >= 4 ? tr[n - 4] : b.x - b.vx * 0.03;
      const ty = n >= 4 ? tr[n - 3] : b.y - b.vy * 0.03;
      g.strokeStyle = b.kind === 'bit' ? 'rgba(255,220,120,0.9)' : 'rgba(120,230,255,0.95)';
      g.lineWidth = b.r * 1.2;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = b.r * 0.5;
      g.beginPath();
      g.moveTo((tx + b.x) / 2, (ty + b.y) / 2);
      g.lineTo(b.x, b.y);
      g.stroke();
      return;
    }
    // the trail: this is where the curve shows
    const col = b.team === 'player' ? (b.kind === 'missile' ? '255,170,90' : '120,230,255') : b.kind === 'mine' ? '255,224,102' : '255,90,170';
    if (tr.length >= 4) {
      g.lineCap = 'round';
      for (let i = 2; i < tr.length; i += 2) {
        const f = i / tr.length;
        g.strokeStyle = `rgba(${col},${0.5 * f})`;
        g.lineWidth = b.r * (b.kind === 'charge' ? 1.6 : 0.9) * f;
        g.beginPath();
        g.moveTo(tr[i - 2], tr[i - 1]);
        g.lineTo(tr[i], tr[i + 1]);
        g.stroke();
      }
      g.strokeStyle = `rgba(${col},0.5)`;
      g.beginPath();
      g.moveTo(tr[tr.length - 2], tr[tr.length - 1]);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    if (b.kind === 'mine') {
      g.globalCompositeOperation = 'source-over';
      const blink = Math.floor(s.time * 6) % 2 === 0;
      g.fillStyle = blink ? '#fff2a8' : '#c9a400';
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + s.time;
        const r = i % 2 ? b.r * 0.6 : b.r * 1.15;
        g.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
      }
      g.fill();
      g.globalCompositeOperation = 'lighter';
      return;
    }
    const r = b.kind === 'charge' ? b.r : b.r * 1.9;
    const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, `rgba(${col},0.9)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(b.x, b.y, r, 0, Math.PI * 2);
    g.fill();
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
      g.lineWidth = 2 * (r.life / r.max) + 0.5;
      g.beginPath();
      g.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.textAlign = 'center';
    g.font = 'bold 11px system-ui, sans-serif';
    for (const f of s.floaters) {
      g.globalAlpha = Math.min(1, f.life * 2);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
    void SHIP_R;
  }
}
