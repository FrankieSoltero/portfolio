import { CONFIG } from '../config';
import { parsePlan } from '../domain/planSchema';
import type { PlanDocument } from '../domain/types';
import type { LoadResult, PlanStore } from './planStorage';

/**
 * A `PlanStore` over one browser storage key (`CONFIG.planStorageKey`).
 *
 * The stored value is untrusted: it reaches the caller only through `parsePlan`, and text longer
 * than `CONFIG.maxStoredChars` is discarded without being parsed. A value `parsePlan` refuses as
 * unreadable is removed (it would fail on every visit); a value written by a newer planner is left
 * exactly as it is, so a rollback cannot destroy it.
 *
 * Every storage access, including the getter (reading `window.localStorage` throws when storage
 * is blocked), happens inside a `try`, so no method throws or rejects. Nothing read or written is
 * ever logged. The store keeps no state between calls.
 */
export function createBrowserPlanStore(storage: () => Storage = () => window.localStorage): PlanStore {
  const key = CONFIG.planStorageKey;

  async function load(): Promise<LoadResult> {
    try {
      const area = storage();
      const stored = area.getItem(key);
      if (stored === null) return { status: 'empty' };
      if (stored.length > CONFIG.maxStoredChars) {
        area.removeItem(key);
        return { status: 'invalid' };
      }
      let input: unknown;
      try {
        input = JSON.parse(stored);
      } catch {
        area.removeItem(key);
        return { status: 'invalid' };
      }
      const result = parsePlan(input);
      if (result.ok) return { status: 'loaded', doc: result.doc };
      if (result.newer) return { status: 'newer' };
      area.removeItem(key);
      return { status: 'invalid' };
    } catch {
      return { status: 'unavailable' };
    }
  }

  async function save(doc: PlanDocument): Promise<boolean> {
    try {
      // Built field by field: the argument may be a store state carrying actions and UI state.
      const text = JSON.stringify({ schemaVersion: doc.schemaVersion, units: doc.units, room: doc.room, items: doc.items });
      if (text.length > CONFIG.maxStoredChars) return false;
      storage().setItem(key, text);
      return true;
    } catch {
      return false;
    }
  }

  async function clear(): Promise<void> {
    try {
      storage().removeItem(key);
    } catch {
      // Blocked storage: there is nothing this store can remove.
    }
  }

  return { load, save, clear };
}
