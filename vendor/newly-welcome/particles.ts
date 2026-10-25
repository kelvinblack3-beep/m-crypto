/**
 * Particle specs for the Welcome screen. Each tap rolls fresh randomness so no two
 * drops or bursts look alike; the specs are plain data so the screen can key them and
 * the particle components can run each flight entirely on the UI thread.
 */

/** One icon falling from the top edge. */
export type Drop = {
  id: number;
  /** Horizontal position as a fraction of the screen width. */
  x: number;
  size: number;
  /** ms for the full fall. Slower than the UI motion tokens on purpose: this is a toy,
   *  not chrome, and a 200ms fall reads as a glitch. */
  duration: number;
  /** Total rotation over the fall, degrees. */
  spin: number;
  /** Horizontal drift over the fall, pt. */
  sway: number;
};

/** One icon flying out of the hero's centre. */
export type Spark = {
  id: number;
  size: number;
  dx: number;
  dy: number;
  duration: number;
  spin: number;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

export function makeDrop(id: number): Drop {
  return {
    id,
    x: rand(0.06, 0.94),
    size: Math.round(rand(26, 52)),
    duration: Math.round(rand(1500, 2400)),
    spin: Math.round(rand(-270, 270)),
    sway: Math.round(rand(-30, 30)),
  };
}

/** A full ring of sparks with jittered angles and radii so it reads as a burst, not a dial. */
export function makeBurst(firstId: number, count = 36): Spark[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rand(0, 0.3);
    const radius = rand(150, 340);
    return {
      id: firstId + i,
      size: Math.round(rand(18, 44)),
      dx: Math.round(Math.cos(angle) * radius),
      dy: Math.round(Math.sin(angle) * radius),
      duration: Math.round(rand(900, 1400)),
      spin: Math.round(rand(-360, 360)),
    };
  });
}
