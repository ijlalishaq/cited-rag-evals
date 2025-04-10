/** Seeded PRNG (mulberry32) so bootstrap intervals are reproducible run to run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

export function percentile(xs: number[], p: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]!;
}

/**
 * Bootstrap 95% confidence interval of the mean: resample the per-question scores with
 * replacement many times and take the 2.5th and 97.5th percentiles of the resampled means.
 * With 30 questions, a 5-point "improvement" is often inside the noise; this shows it.
 */
export function bootstrapCI(xs: number[], iterations = 1000, seed = 42): [number, number] {
  if (xs.length === 0) return [NaN, NaN];
  const rand = rng(seed);
  const means: number[] = [];
  for (let i = 0; i < iterations; i++) {
    let s = 0;
    for (let j = 0; j < xs.length; j++) s += xs[Math.floor(rand() * xs.length)]!;
    means.push(s / xs.length);
  }
  return [percentile(means, 2.5), percentile(means, 97.5)];
}
