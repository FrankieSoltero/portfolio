import { findPlanIssues } from '../domain/conflicts';
import type { Conflicts, Item, Obstacle, Opening, PlanIssues, Room } from '../domain/types';
import { usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

/** The last computed issues and the four plan references they were computed from. */
let lastIssues: {
  items: readonly Item[];
  room: Room;
  openings: readonly Opening[];
  obstacles: readonly Obstacle[];
  issues: PlanIssues;
} | null = null;

/**
 * findPlanIssues for these references, computed once per change of any of them and shared by every
 * hook and component: the same references return the same object.
 */
function planIssuesFor(items: readonly Item[], room: Room, openings: readonly Opening[], obstacles: readonly Obstacle[]): PlanIssues {
  const last = lastIssues;
  if (last !== null && last.items === items && last.room === room && last.openings === openings && last.obstacles === obstacles) {
    return last.issues;
  }
  const issues = findPlanIssues(items, room, openings, obstacles);
  lastIssues = { items, room, openings, obstacles, issues };
  return issues;
}

/**
 * The plan's issues. The selectors return existing store references and the result is
 * memoised on `items`, `room`, `openings` and `obstacles` identity, so the returned
 * object is stable while none changes (a fresh object from inside a Zustand 5
 * selector would loop `useSyncExternalStore`).
 */
function usePlanIssues(): PlanIssues {
  const items = usePlanStore((s) => s.items);
  const room = usePlanStore((s) => s.room);
  const openings = usePlanStore((s) => s.openings);
  const obstacles = usePlanStore((s) => s.obstacles);
  return planIssuesFor(items, room, openings, obstacles);
}

/** Conflicts of furniture, obstacles, doors and windows, by id (see findPlanIssues). */
export function useConflicts(): Conflicts {
  return usePlanIssues().conflicts;
}

/** Warnings (furniture covering a window), by item id; not counted as conflicts. */
export function useWarnings(): Conflicts {
  return usePlanIssues().warnings;
}

/** The selected item, or null when nothing (or an id no longer in the plan) is selected. */
export function useSelectedItem(): Item | null {
  const selectedId = useUiStore((s) => s.selectedId);
  return usePlanStore((s) => (selectedId === null ? null : (s.items.find((i) => i.id === selectedId) ?? null)));
}

/** Sum of item prices; an unknown (null) price counts as 0. */
export function totalPrice(items: readonly Item[]): number {
  return items.reduce((sum, item) => sum + (item.price ?? 0), 0);
}
