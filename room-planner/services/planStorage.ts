import type { PlanDocument } from '../domain/types';

/**
 * What loading the saved plan found. `invalid` means a stored value existed but could not be used
 * (and was discarded); `newer` means it was written by a newer planner and was left untouched;
 * `unavailable` means the storage itself could not be used.
 */
export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; doc: PlanDocument }
  | { status: 'invalid' }
  | { status: 'newer' }
  | { status: 'unavailable' };

/**
 * The seam between the planner and wherever its plan is kept. Asynchronous so a server-backed
 * store can replace the browser one without changing callers. No method throws or rejects.
 */
export interface PlanStore {
  load(): Promise<LoadResult>;
  /** Resolves `true` when the plan was written, `false` when nothing could be written. */
  save(doc: PlanDocument): Promise<boolean>;
  clear(): Promise<void>;
}
