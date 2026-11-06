// Number helpers shared by the racer's modules.

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** a mod n in [0, n). */
export const wrap = (a: number, n: number) => ((a % n) + n) % n

/** 0 below a, 1 above b, and a smooth S between. */
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
