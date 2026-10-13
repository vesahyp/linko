import { W, H } from '../game/state';

/**
 * The drag arithmetic, shared by the touch input and the hand (the bot with
 * a thumb's limits, tools/hand.ts), so the hand's thumb moves the ship by
 * exactly the rule a real thumb does.
 *
 * Relative drag: the ship's target moves with the thumb, GAIN times as far,
 * from wherever the thumb lands. A landing thumb sets the target to where
 * the ship is, so landing never jerks the ship.
 */
export const GAIN = 1.5;

/** Move a target by a thumb's movement in css px, at `scale` css px per world unit; clamped to the screen. */
export function applyDrag(t: { x: number; y: number }, dxPx: number, dyPx: number, scale: number): { x: number; y: number } {
  return {
    x: Math.max(16, Math.min(W - 16, t.x + (dxPx * GAIN) / scale)),
    y: Math.max(12, Math.min(H - 12, t.y + (dyPx * GAIN) / scale)),
  };
}

/** The share of the screen's width, from the left, where a landing thumb flies the ship. The rest charges. */
export const MOVE_ZONE = 0.62;
