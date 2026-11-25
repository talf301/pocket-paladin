export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);

export class GameOver extends Error {
  constructor(won, reason) { super(reason); this.won = won; this.reason = reason; }
}

/** The subset of `items` (by value) with the smallest total that is at least `need`; null if none. Ties: fewer items. */
export function cheapestSubset(items, value, need) {
  let best = null;
  for (let mask = 1; mask < 1 << items.length; mask++) {
    const pick = items.filter((_, i) => mask & (1 << i));
    const total = sum(pick, value);
    if (total < need) continue;
    if (!best || total < best.total || (total === best.total && pick.length < best.pick.length)) best = { pick, total };
  }
  return best && best.pick;
}
