import { useMemo } from 'react';
import { findConflicts } from '../domain/conflicts';
import type { Conflicts, Item } from '../domain/types';
import { usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

/**
 * Placement conflicts for the current plan. The selectors return existing store
 * references and the result is memoised on `items` and `room` identity, so the
 * returned object is stable while neither changes (a fresh object from inside a
 * Zustand 5 selector would loop `useSyncExternalStore`).
 */
export function useConflicts(): Conflicts {
  const items = usePlanStore((s) => s.items);
  const room = usePlanStore((s) => s.room);
  return useMemo(() => findConflicts(items, room), [items, room]);
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
