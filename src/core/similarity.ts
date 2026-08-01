/** Approximate string comparison, used only to *suggest* matches the exact rungs missed. */

/** Levenshtein distance, two-row rolling buffer — O(n·m) time, O(min(n,m)) space. */
export function editDistance(a: string[], b: string[]): number {
  // Iterate over the shorter axis to keep the buffers small.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.length === 0) return long.length;

  let previous = Array.from({ length: short.length + 1 }, (_, i) => i);
  let current = new Array<number>(short.length + 1).fill(0);

  for (let i = 0; i < long.length; i += 1) {
    current[0] = i + 1;
    for (let j = 0; j < short.length; j += 1) {
      const substitution = (previous[j] as number) + (long[i] === short[j] ? 0 : 1);
      const insertion = (current[j] as number) + 1;
      const deletion = (previous[j + 1] as number) + 1;
      current[j + 1] = Math.min(substitution, insertion, deletion);
    }
    [previous, current] = [current, previous];
  }

  return previous[short.length] as number;
}

/**
 * Normalised edit distance in `0..1`, where 1 is identical.
 *
 * Splits with the spread operator rather than `.split('')` so an accented letter or an emoji
 * counts as one edit rather than several code units.
 */
export function ratio(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  const left = [...a];
  const right = [...b];
  const longest = Math.max(left.length, right.length);

  // A length gap that big cannot clear any threshold we care about; skip the O(n·m) work.
  if (Math.abs(left.length - right.length) > longest / 2) return 0;

  return 1 - editDistance(left, right) / longest;
}
