// Fractional ordering keys: moving a card rewrites only that card's file.
// Keys sort by ASCII code (digits < uppercase < lowercase).
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

/** Returns c with a < c < b. a = '' means "start"; b = null means "end". Never ends in '0'. */
export function keyBetween(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error('keyBetween: a must be smaller than b');
  if (b !== null) {
    let n = 0;
    while ((a[n] || '0') === b[n]) n++;
    if (n > 0) return b.slice(0, n) + keyBetween(a.slice(n), b.slice(n));
  }
  const da = a ? DIGITS.indexOf(a[0]) : 0;
  const db = b !== null ? DIGITS.indexOf(b[0]) : BASE;
  if (db - da > 1) return DIGITS[Math.round((da + db) / 2)];
  if (b !== null && b.length > 1) return b.slice(0, 1);
  return DIGITS[da] + keyBetween(a.slice(1), null);
}

export const keyAfter = (a: string | null): string => keyBetween(a ?? '', null);
export const keyBefore = (b: string | null): string => keyBetween('', b);
