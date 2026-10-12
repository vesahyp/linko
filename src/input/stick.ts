/**
 * The stick arithmetic, shared by the touch input and the hand (the bot
 * with a thumb's limits, tools/hand.ts), so the hand's thumb goes through
 * the same dead zone and curve a real thumb does.
 */
export const STICK_RADIUS = 60;
/** a right-thumb drag shorter than this, css px, is a press, not an aim */
export const DRAG_MIN = 16;
const DEAD = 0.12;

/** A thumb offset from where it landed, css px, to a move vector of length up to 1. */
export function moveFromOffset(dx: number, dy: number): { mx: number; my: number } {
  const d = Math.hypot(dx, dy) / STICK_RADIUS;
  if (d <= DEAD) return { mx: 0, my: 0 };
  const m = Math.min(1, (d - DEAD) / 0.7);
  const len = Math.hypot(dx, dy);
  return { mx: (dx / len) * m, my: (dy / len) * m };
}
