/**
 * In-memory rate limiter for the product lookup route. It is a sliding log: for each key (an
 * address), the times of the calls it allowed within the last window. A refused call is not
 * recorded. The memory is per server instance, so it slows abuse but does not stop a determined
 * caller; the hard limit is the site's firewall rule.
 *
 * Time comes only from the `now` argument, so the caller owns the clock.
 */

/** Decides whether one more call for a key fits within the limit. */
export interface RateLimiter { allow(key: string, now: number): { ok: true } | { ok: false; retryAfterSec: number } }

/**
 * A limiter that allows `limit` calls per key in any `windowMs` milliseconds and remembers at most
 * `maxKeys` keys, dropping the least recently seen key to make room for a new one.
 *
 * A call made exactly `windowMs` after an earlier call still counts that earlier call; one
 * millisecond later it has left the window. When refused, `retryAfterSec` is the whole seconds
 * until the oldest counted call leaves, and at least 1. A `now` that is not finite is refused with
 * `retryAfterSec` 1 and changes nothing; a `now` earlier than the key's latest call is taken as
 * that latest call, so the log stays in time order.
 */
export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys: number }): RateLimiter {
  const { limit, windowMs, maxKeys } = opts;
  // A Map keeps insertion order and treats every string, `__proto__` included, as a plain key.
  // Each key is moved to the end whenever it is seen, so the first key is the least recently seen.
  const logs = new Map<string, number[]>();

  return {
    allow(key, now) {
      if (!Number.isFinite(now)) return { ok: false, retryAfterSec: 1 };

      const log = logs.get(key) ?? [];
      logs.delete(key);

      const latest = log[log.length - 1];
      const at = latest !== undefined && latest > now ? latest : now;

      // Times are in order, so the calls that have left the window are at the front.
      let first = 0;
      while (first < log.length && log[first] + windowMs < at) first++;
      const live = log.slice(first);

      if (live.length >= limit) {
        logs.set(key, live);
        const waitMs = live[0] + windowMs - at;
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) };
      }

      live.push(at);
      if (logs.size >= maxKeys) {
        const oldest = logs.keys().next();
        if (!oldest.done) logs.delete(oldest.value);
      }
      logs.set(key, live);
      return { ok: true };
    },
  };
}
