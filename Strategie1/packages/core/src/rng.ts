/** Mulberry32 step. The stored seed is the generator state, not a hidden global. */
export function rngNext(seed: number): { value: number; seed: number } {
  let state = seed | 0;
  state = (state + 0x6d2b79f5) | 0;
  let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
  mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
  const value = ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  return { value, seed: state };
}

export function normalizeSeed(seed: number): number {
  if (!Number.isInteger(seed)) {
    throw new Error("Seed must be an integer");
  }
  return seed | 0;
}
