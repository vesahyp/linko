import { NO_INPUT, type SimInput } from '../game/state';
import { applyDrag, MOVE_ZONE } from './stick';

/**
 * Touch and keyboard.
 *
 * Touch: a thumb that lands on the left part of the screen (MOVE_ZONE) flies
 * the ship by relative drag: the ship's target moves with the thumb, GAIN
 * times as far, from wherever it lands (src/input/stick.ts). A thumb that
 * lands on the right part charges the wave cannon while it is down and fires
 * it when it lifts. A tap on the pod button launches or recalls the pod. The
 * guns fire by themselves. Buttons marked `data-ui` are left to React.
 *
 * Keyboard: WASD or arrows fly, hold space or J to charge and let go to
 * fire, E or K for the pod. The left mouse button charges too.
 *
 * Release and pod are edges: `read` returns them once and clears them.
 */
export interface Thumb {
  active: boolean;
  touchId: number | null;
  x: number;
  y: number;
  /** where it landed, for the drawn ring */
  cx: number;
  cy: number;
}

const newThumb = (): Thumb => ({ active: false, touchId: null, x: 0, y: 0, cx: 0, cy: 0 });

export class InputController {
  readonly move = newThumb();
  readonly charge = newThumb();
  /** the pod button's centre and radius, css px; set by the HUD layout */
  podBtn = { x: -999, y: -999, r: 0 };
  /** the ship in world units and the css px per world unit, set by the game loop each frame */
  ship = { x: 0, y: 0 };
  scale = 1;
  /** where the drag wants the ship, world units */
  target: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private keyCharge = false;
  private releaseEdge = false;
  private podEdge = false;
  private el: HTMLElement | null = null;

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown') {
      if (!this.keys.has(k) && (k === 'e' || k === 'k')) this.podEdge = true;
      if (k === ' ' || k === 'j') this.keyCharge = true;
      this.keys.add(k);
    } else {
      this.keys.delete(k);
      if ((k === ' ' || k === 'j') && this.keyCharge) {
        this.keyCharge = false;
        this.releaseEdge = true;
      }
    }
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  };
  private onMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui], button, .overlay')) return;
    if (e.button === 0 && !this.charge.active) this.keyCharge = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && this.keyCharge) {
      this.keyCharge = false;
      this.releaseEdge = true;
    }
  };

  private onTouchStart = (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui], button, .overlay')) return;
    const w = this.el?.clientWidth || window.innerWidth;
    for (const t of Array.from(e.changedTouches)) {
      const b = this.podBtn;
      if (Math.hypot(t.clientX - b.x, t.clientY - b.y) < b.r + 10) {
        this.podEdge = true;
        continue;
      }
      const th = t.clientX < w * MOVE_ZONE ? this.move : this.charge;
      if (th.touchId !== null) continue;
      th.touchId = t.identifier;
      th.active = true;
      th.x = th.cx = t.clientX;
      th.y = th.cy = t.clientY;
      if (th === this.move) this.target = { ...this.ship };
    }
    e.preventDefault();
  };

  private onTouchMove = (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui], button, .overlay')) return;
    for (const t of Array.from(e.changedTouches)) {
      for (const th of [this.move, this.charge]) {
        if (th.touchId !== t.identifier) continue;
        if (th === this.move && this.target) this.target = applyDrag(this.target, t.clientX - th.x, t.clientY - th.y, this.scale);
        th.x = t.clientX;
        th.y = t.clientY;
      }
    }
    e.preventDefault();
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      for (const th of [this.move, this.charge]) {
        if (th.touchId !== t.identifier) continue;
        if (th === this.charge) this.releaseEdge = true;
        if (th === this.move) this.target = null;
        th.touchId = null;
        th.active = false;
      }
    }
  };

  private onBlur = () => {
    this.keys.clear();
    this.keyCharge = false;
  };

  attach(el: HTMLElement): void {
    this.el = el;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd);
    el.addEventListener('touchcancel', this.onTouchEnd);
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach(el: HTMLElement): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('touchcancel', this.onTouchEnd);
    el.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('blur', this.onBlur);
    this.el = null;
  }

  /** Drop held thumbs, for a pause or a card pick. */
  reset(): void {
    for (const th of [this.move, this.charge]) {
      th.active = false;
      th.touchId = null;
    }
    this.target = null;
    this.releaseEdge = false;
    this.podEdge = false;
    this.keyCharge = false;
  }

  /** One frame of input. Edges are consumed. */
  read(): SimInput {
    const inp: SimInput = { ...NO_INPUT };
    if (this.move.active && this.target) inp.target = { ...this.target };
    else {
      const k = this.keys;
      let dx = 0;
      let dy = 0;
      if (k.has('a') || k.has('arrowleft')) dx -= 1;
      if (k.has('d') || k.has('arrowright')) dx += 1;
      if (k.has('w') || k.has('arrowup')) dy -= 1;
      if (k.has('s') || k.has('arrowdown')) dy += 1;
      const d = Math.hypot(dx, dy);
      if (d) {
        inp.mx = dx / d;
        inp.my = dy / d;
      }
    }
    inp.charging = this.charge.active || this.keyCharge;
    inp.release = this.releaseEdge;
    this.releaseEdge = false;
    inp.pod = this.podEdge;
    this.podEdge = false;
    return inp;
  }
}
