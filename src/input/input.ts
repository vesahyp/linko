import { NO_INPUT, type SimInput } from '../game/state';
import { DRAG_MIN, moveFromOffset } from './stick';

/**
 * Two thumbs and a keyboard.
 *
 * Touch: a touch that starts on the left half of the screen is the move
 * stick, its base where the thumb lands; let go and the ship falls free. A
 * touch on the right half charges the wave cannon while it is down; drag it
 * to aim, lift to fire (a lift with no drag fires at what the auto-aim
 * picks). A touch that starts on the pod button launches or recalls the pod.
 * The main gun fires by itself. Buttons marked `data-ui` (pause, the cards)
 * are left to React.
 *
 * Keyboard and mouse: WASD or arrows move, hold the left mouse button to
 * charge (it aims at the pointer), let go to fire, space or E for the pod.
 *
 * Release and pod are edges: `read` returns them once and clears them.
 */
export interface Stick {
  active: boolean;
  cx: number;
  cy: number;
  x: number;
  y: number;
  touchId: number | null;
  dragged: boolean;
}

const newStick = (): Stick => ({ active: false, cx: 0, cy: 0, x: 0, y: 0, touchId: null, dragged: false });

export class InputController {
  readonly move = newStick();
  readonly right = newStick();
  /** the pod button's centre and radius, css px; set by the HUD layout */
  podBtn = { x: -999, y: -999, r: 0 };
  /** the ship on screen, css px, for mouse aim */
  shipScreen = { x: 0, y: 0 };
  private keys = new Set<string>();
  private releaseEdge = false;
  private releaseAim: { x: number; y: number } | null = null;
  private podEdge = false;
  private mouse = { x: 0, y: 0, down: false };
  usedTouch = false;
  private el: HTMLElement | null = null;

  private onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (e.type === 'keydown') {
      if (!this.keys.has(k) && (k === ' ' || k === 'e')) this.podEdge = true;
      this.keys.add(k);
    } else this.keys.delete(k);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  };

  private onMouseMove = (e: MouseEvent) => {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  };
  private onMouseDown = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui], button, .overlay')) return;
    this.onMouseMove(e);
    if (e.button === 0) this.mouse.down = true;
    if (e.button === 2) this.podEdge = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0 && this.mouse.down) {
      this.mouse.down = false;
      this.releaseEdge = true;
      this.releaseAim = this.mouseAim();
    }
  };
  private onContext = (e: Event) => e.preventDefault();

  private mouseAim(): { x: number; y: number } {
    const dx = this.mouse.x - this.shipScreen.x;
    const dy = this.mouse.y - this.shipScreen.y;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  private onTouchStart = (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui], button, .overlay')) return;
    this.usedTouch = true;
    const w = this.el?.clientWidth || window.innerWidth;
    for (const t of Array.from(e.changedTouches)) {
      const b = this.podBtn;
      if (Math.hypot(t.clientX - b.x, t.clientY - b.y) < b.r + 12) {
        this.podEdge = true;
        continue;
      }
      const st = t.clientX < w / 2 ? this.move : this.right;
      if (st.touchId !== null) continue;
      st.touchId = t.identifier;
      st.active = true;
      st.dragged = false;
      st.cx = t.clientX;
      st.cy = t.clientY;
      st.x = t.clientX;
      st.y = t.clientY;
    }
    e.preventDefault();
  };

  private onTouchMove = (e: TouchEvent) => {
    if ((e.target as HTMLElement).closest('[data-ui], button, .overlay')) return;
    for (const t of Array.from(e.changedTouches)) {
      for (const st of [this.move, this.right]) {
        if (st.touchId !== t.identifier) continue;
        st.x = t.clientX;
        st.y = t.clientY;
        if (Math.hypot(st.x - st.cx, st.y - st.cy) > DRAG_MIN) st.dragged = true;
      }
    }
    e.preventDefault();
  };

  private onTouchEnd = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      for (const st of [this.move, this.right]) {
        if (st.touchId !== t.identifier) continue;
        if (st === this.right) {
          this.releaseEdge = true;
          this.releaseAim = st.dragged ? this.dragDir(st) : null;
        }
        st.touchId = null;
        st.active = false;
        st.dragged = false;
      }
    }
  };

  private onBlur = () => {
    this.keys.clear();
    this.mouse.down = false;
  };

  private dragDir(st: Stick): { x: number; y: number } {
    const dx = st.x - st.cx;
    const dy = st.y - st.cy;
    const d = Math.hypot(dx, dy) || 1;
    return { x: dx / d, y: dy / d };
  }

  attach(el: HTMLElement): void {
    this.el = el;
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    el.addEventListener('touchstart', this.onTouchStart, { passive: false });
    el.addEventListener('touchmove', this.onTouchMove, { passive: false });
    el.addEventListener('touchend', this.onTouchEnd);
    el.addEventListener('touchcancel', this.onTouchEnd);
    el.addEventListener('mousemove', this.onMouseMove);
    el.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    el.addEventListener('contextmenu', this.onContext);
    window.addEventListener('blur', this.onBlur);
  }

  detach(el: HTMLElement): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('touchcancel', this.onTouchEnd);
    el.removeEventListener('mousemove', this.onMouseMove);
    el.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    el.removeEventListener('contextmenu', this.onContext);
    window.removeEventListener('blur', this.onBlur);
    this.el = null;
  }

  /** Drop held thumbs, for a pause or a card pick. */
  reset(): void {
    for (const st of [this.move, this.right]) {
      st.active = false;
      st.touchId = null;
      st.dragged = false;
    }
    this.releaseEdge = false;
    this.podEdge = false;
    this.mouse.down = false;
  }

  /** One frame of input. Edges are consumed. */
  read(): SimInput {
    const inp: SimInput = { ...NO_INPUT };
    if (this.move.active) {
      const v = moveFromOffset(this.move.x - this.move.cx, this.move.y - this.move.cy);
      inp.mx = v.mx;
      inp.my = v.my;
    } else {
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
    if (this.right.active) {
      inp.charging = true;
      if (this.right.dragged) {
        const v = this.dragDir(this.right);
        inp.aimed = true;
        inp.ax = v.x;
        inp.ay = v.y;
      }
    } else if (this.mouse.down && !this.usedTouch) {
      inp.charging = true;
      const v = this.mouseAim();
      inp.aimed = true;
      inp.ax = v.x;
      inp.ay = v.y;
    }
    if (this.releaseEdge) {
      inp.release = true;
      if (this.releaseAim) {
        inp.aimed = true;
        inp.ax = this.releaseAim.x;
        inp.ay = this.releaseAim.y;
      }
      this.releaseEdge = false;
      this.releaseAim = null;
    }
    inp.pod = this.podEdge;
    this.podEdge = false;
    return inp;
  }
}
