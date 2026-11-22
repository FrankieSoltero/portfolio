/**
 * Timing helpers for the hostile-input tests of the page readers and the size parser (server
 * tests only: they use `process.cpuUsage`).
 *
 * Those tests assert growth, not an absolute time. The same input is read at a small size and at
 * 8 times that size, back to back in one test, and the CPU-time ratio must stay under
 * `GROWTH_MAX`: linear work gives about 8, work growing with the square of the input about 64.
 * Both runs meet the same load and usually the same kind of core, so the ratio holds where an
 * absolute bound does not: on a machine with efficiency cores the same read measured 0.5 to 0.9 s
 * alone, 2.0 to 2.4 s in the full parallel suite and 4.6 to 6.6 s pinned to efficiency cores.
 *
 * A loose absolute guard, `HANG_GUARD_MS`, stays on the largest inputs. Its only job is to fail if
 * the minutes-long behaviour comes back; it is far above any normal run on any core.
 */

/** The largest CPU-time ratio accepted between an input 8 times larger and the small one. */
export const GROWTH_MAX = 24;

/** The CPU time, in ms, above which a full-size read counts as hung. */
export const HANG_GUARD_MS = 15_000;

/** The per-test timeout for a test that runs a full-size read, in ms. */
export const HANG_TIMEOUT_MS = 60_000;

/** The least CPU time, in ms, a measurement gathers by repeating a short run. */
const MEASURE_MIN_MS = 20;

/** The most times a short run is repeated to reach `MEASURE_MIN_MS`. */
const REPEAT_MAX = 200;

/** The CPU time `run` takes, user plus system, in milliseconds. */
export function cpuMs(run: () => void): number {
  const start = process.cpuUsage();
  run();
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1000;
}

/**
 * The CPU time of one call of `run`, in ms: `run` is repeated until at least `MEASURE_MIN_MS` has
 * been spent (or `REPEAT_MAX` calls made) and the total is divided by the calls, so a run too
 * short to measure on its own is still measured.
 */
export function cpuPerRun(run: () => void): number {
  let total = 0;
  let calls = 0;
  while (calls < REPEAT_MAX && (calls === 0 || total < MEASURE_MIN_MS)) {
    total += cpuMs(run);
    calls += 1;
  }
  return total / calls;
}

/**
 * How much more CPU time `read` takes on `large` (8 times the size of `small`) than on `small`,
 * with each measured by `cpuPerRun`, back to back. Also gives both times for the failure message.
 */
export function growth(read: (input: string) => void, small: string, large: string): { ratio: number; smallMs: number; largeMs: number } {
  const smallMs = cpuPerRun(() => read(small));
  const largeMs = cpuPerRun(() => read(large));
  return { ratio: largeMs / smallMs, smallMs, largeMs };
}

/** A failure message naming both times and the ratio. */
export function growthMessage({ ratio, smallMs, largeMs }: { ratio: number; smallMs: number; largeMs: number }): string {
  return `${smallMs.toFixed(1)} ms small, ${largeMs.toFixed(1)} ms at 8 times the size: ratio ${ratio.toFixed(1)}`;
}
