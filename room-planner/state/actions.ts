import { usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

/** Cross-store actions: operations on the plan driven by the UI selection or lookup state. */

/** Turns the selected item a quarter turn; no-op when nothing is selected. */
export function rotateSelected(): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().rotateItem(id);
}

/** Removes the selected item and clears the selection; no-op when nothing is selected. */
export function removeSelected(): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  usePlanStore.getState().removeItem(id);
  useUiStore.getState().select(null);
}

/** Places the previewed product in the room, selects it and ends the lookup; no-op unless in preview. */
export function placePreview(): void {
  const ui = useUiStore.getState();
  if (ui.lookup.status !== 'preview') return;
  const id = usePlanStore.getState().addItem(ui.lookup.product);
  ui.select(id);
  ui.setLookup({ status: 'idle' });
}

/** Moves the selected item by (dx, dy) inches, kept inside the room; no-op when nothing is selected. */
export function nudgeSelected(dx: number, dy: number): void {
  const id = useUiStore.getState().selectedId;
  if (id === null) return;
  const plan = usePlanStore.getState();
  const item = plan.items.find((i) => i.id === id);
  if (!item) return;
  plan.moveItemTo(id, item.x + dx, item.y + dy);
}
