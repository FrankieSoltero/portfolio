// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

/** The lookup route's settings: 20 lookups per 600,000 ms per address. */
const LIMIT = 20;
const WINDOW_MS = 600_000;

/** A limiter with the route's limit and window, and room for `maxKeys` addresses. */
function limiter(maxKeys = 1000) {
  return createRateLimiter({ limit: LIMIT, windowMs: WINDOW_MS, maxKeys });
}

/** Makes `count` allowed calls for `key`, one every `stepMs` starting at `start`, and checks each. */
function fill(
  rl: ReturnType<typeof createRateLimiter>,
  key: string,
  start = 0,
  stepMs = 1000,
  count = LIMIT,
) {
  for (let i = 0; i < count; i++) {
    expect(rl.allow(key, start + i * stepMs)).toEqual({ ok: true });
  }
}

describe('createRateLimiter', () => {
  it('allows 20 calls for the same key within the window', () => {
    const rl = limiter();
    fill(rl, 'a');
  });

  it('allows 20 calls at the same instant', () => {
    const rl = limiter();
    fill(rl, 'a', 5000, 0);
  });

  it('refuses the 21st call with the whole seconds until the oldest call leaves the window', () => {
    const rl = limiter();
    fill(rl, 'a'); // calls at 0, 1000, ..., 19000
    expect(rl.allow('a', 20_000)).toEqual({ ok: false, retryAfterSec: 580 });
  });

  it('rounds a part second up', () => {
    const rl = limiter();
    fill(rl, 'a');
    expect(rl.allow('a', 20_500)).toEqual({ ok: false, retryAfterSec: 580 });
  });

  it('never asks the caller to wait less than 1 second', () => {
    const rl = limiter();
    fill(rl, 'a', 0, 0);
    expect(rl.allow('a', 599_999)).toEqual({ ok: false, retryAfterSec: 1 });
    // Exactly one window after the oldest call, that call still counts.
    expect(rl.allow('a', 600_000)).toEqual({ ok: false, retryAfterSec: 1 });
  });

  it('does not record a refused call', () => {
    const rl = limiter();
    fill(rl, 'a', 0, 0);
    for (let i = 0; i < 5; i++) expect(rl.allow('a', 300_000).ok).toBe(false);
    // Once the 20 calls at 0 leave, all 20 places are free again: the refusals took none.
    fill(rl, 'a', 600_001, 0);
    expect(rl.allow('a', 600_001)).toEqual({ ok: false, retryAfterSec: 600 });
  });

  it('allows a call 600,001 ms after the first once the window has slid past it', () => {
    const rl = limiter();
    fill(rl, 'a');
    expect(rl.allow('a', 600_001)).toEqual({ ok: true });
    // Only the first call has left; the 22nd now waits for the call at 1000.
    expect(rl.allow('a', 600_001)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(rl.allow('a', 601_001)).toEqual({ ok: true });
  });

  it('keeps keys independent', () => {
    const rl = limiter();
    fill(rl, 'A');
    expect(rl.allow('A', 20_000).ok).toBe(false);
    expect(rl.allow('B', 20_000)).toEqual({ ok: true });
  });

  it('treats object property names as ordinary keys', () => {
    const rl = limiter();
    for (const key of ['__proto__', 'constructor', 'hasOwnProperty', 'toString']) {
      fill(rl, key);
      expect(rl.allow(key, 20_000)).toEqual({ ok: false, retryAfterSec: 580 });
    }
    expect(rl.allow('other', 20_000)).toEqual({ ok: true });
  });

  it('drops the least recently seen key once more than maxKeys keys are seen', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: WINDOW_MS, maxKeys: 2 });
    expect(rl.allow('a', 0)).toEqual({ ok: true });
    expect(rl.allow('b', 0)).toEqual({ ok: true });
    // Seeing `a` again, even when refused, makes `b` the least recently seen.
    expect(rl.allow('a', 1)).toEqual({ ok: false, retryAfterSec: 600 });
    expect(rl.allow('c', 2)).toEqual({ ok: true });
    // `b` was dropped, so it starts afresh; `a` was kept.
    expect(rl.allow('a', 3).ok).toBe(false);
    expect(rl.allow('b', 4)).toEqual({ ok: true });
  });

  it('never holds more than maxKeys keys', () => {
    const maxKeys = 5;
    const rl = createRateLimiter({ limit: 1, windowMs: WINDOW_MS, maxKeys });
    for (let i = 0; i < 50; i++) expect(rl.allow(`k${i}`, i)).toEqual({ ok: true });
    // Only a remembered key is refused; exactly the last maxKeys keys are remembered.
    const remembered: number[] = [];
    for (let i = 49; i >= 0; i--) {
      if (!rl.allow(`k${i}`, 100).ok) remembered.push(i);
    }
    expect(remembered).toEqual([49, 48, 47, 46, 45]);
  });

  it('frees a key whose calls have all left the window', () => {
    const rl = createRateLimiter({ limit: 1, windowMs: WINDOW_MS, maxKeys: 2 });
    expect(rl.allow('a', 0)).toEqual({ ok: true });
    expect(rl.allow('b', 1)).toEqual({ ok: true });
    // `a` has emptied and is seen again: it is allowed and becomes the most recently seen.
    expect(rl.allow('a', 600_001)).toEqual({ ok: true });
    expect(rl.allow('c', 600_002)).toEqual({ ok: true });
    expect(rl.allow('a', 600_003).ok).toBe(false);
  });

  it('survives a clock that goes backwards', () => {
    const rl = limiter();
    fill(rl, 'a', 100_000); // calls at 100,000, ..., 119,000
    // Time 0 is taken as the latest call, 119,000: the oldest call leaves 581 s after that.
    expect(rl.allow('a', 0)).toEqual({ ok: false, retryAfterSec: 581 });
    // The log is still in order: the window slides past the first call on time.
    expect(rl.allow('a', 700_001)).toEqual({ ok: true });
    expect(rl.allow('a', 700_001).ok).toBe(false);
  });

  it('records a backwards call no earlier than the latest call', () => {
    const rl = createRateLimiter({ limit: 2, windowMs: WINDOW_MS, maxKeys: 10 });
    expect(rl.allow('a', 500_000)).toEqual({ ok: true });
    expect(rl.allow('a', 0)).toEqual({ ok: true });
    // Both calls count from 500,000, so neither has left at 1,000,000.
    expect(rl.allow('a', 1_000_000)).toEqual({ ok: false, retryAfterSec: 100 });
    expect(rl.allow('a', 1_100_001)).toEqual({ ok: true });
  });

  it.each([NaN, Infinity, -Infinity])('refuses a non-finite time (%s) without touching the log', (now) => {
    const rl = limiter();
    expect(rl.allow('a', now)).toEqual({ ok: false, retryAfterSec: 1 });
    fill(rl, 'a');
    expect(rl.allow('a', now)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(rl.allow('a', 20_000)).toEqual({ ok: false, retryAfterSec: 580 });
    expect(rl.allow('a', 600_001)).toEqual({ ok: true });
  });
});
