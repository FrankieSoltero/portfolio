import type { PlanDocument } from '../domain/types';
import type { LoadResult, PlanStore } from '../services/planStorage';

/** What a fake method call does: resolve with a value, reject with an error, or stay pending. */
export type FakeOutcome<T> =
  | { type: 'resolve'; value: T }
  | { type: 'reject'; error: unknown }
  | { type: 'pending' };

/** A promise a test settles itself. */
export interface Pending<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

/**
 * An in-memory `PlanStore` for tests. A test sets what `load` and `save` do; every call is
 * recorded. Unlike the browser store, this fake may reject, so callers can be tested against a
 * store that does.
 */
export interface FakePlanStore extends PlanStore {
  /**
   * What each later `load` call does. `null` (the default) answers from memory: `loaded` with the
   * last successfully saved document, or `empty`.
   */
  loadOutcome: FakeOutcome<LoadResult> | null;
  /** What each later `save` call does. Default: resolve `true` (and remember the document). */
  saveOutcome: FakeOutcome<boolean>;
  /** Number of `load` calls so far. */
  loadCalls: number;
  /** The argument of every `save` call, in order. */
  saveCalls: PlanDocument[];
  /** Number of `clear` calls so far. */
  clearCalls: number;
  /** The document held in memory: the last one a resolving `save` accepted, or null. */
  stored: PlanDocument | null;
  /** The promises returned by `load` calls made while `loadOutcome` was pending, in order. */
  pendingLoads: Pending<LoadResult>[];
  /** The promises returned by `save` calls made while `saveOutcome` was pending, in order. */
  pendingSaves: Pending<boolean>[];
}

function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Creates a fake store, optionally with its `load` and `save` behaviour already set. */
export function createFakePlanStore(
  options: { load?: FakeOutcome<LoadResult> | null; save?: FakeOutcome<boolean> } = {},
): FakePlanStore {
  const fake: FakePlanStore = {
    loadOutcome: options.load ?? null,
    saveOutcome: options.save ?? { type: 'resolve', value: true },
    loadCalls: 0,
    saveCalls: [],
    clearCalls: 0,
    stored: null,
    pendingLoads: [],
    pendingSaves: [],

    load() {
      fake.loadCalls++;
      const outcome = fake.loadOutcome;
      if (outcome === null) {
        return Promise.resolve(fake.stored ? { status: 'loaded', doc: fake.stored } : { status: 'empty' });
      }
      if (outcome.type === 'resolve') return Promise.resolve(outcome.value);
      if (outcome.type === 'reject') return Promise.reject(outcome.error);
      const p = pending<LoadResult>();
      fake.pendingLoads.push(p);
      return p.promise;
    },

    save(doc) {
      fake.saveCalls.push(doc);
      const outcome = fake.saveOutcome;
      if (outcome.type === 'resolve') {
        if (outcome.value) fake.stored = doc;
        return Promise.resolve(outcome.value);
      }
      if (outcome.type === 'reject') return Promise.reject(outcome.error);
      const p = pending<boolean>();
      fake.pendingSaves.push(p);
      return p.promise;
    },

    clear() {
      fake.clearCalls++;
      fake.stored = null;
      return Promise.resolve();
    },
  };
  return fake;
}
