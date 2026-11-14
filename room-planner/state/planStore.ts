import { create } from 'zustand';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { moveItem, rotateItemBy, setItemAngle } from '../domain/geometry';
import type { OutlineResult } from '../domain/outline';
import { interiorPoint } from '../domain/polygon';
import { roomBounds } from '../domain/shape';
import type { Item, PlanDocument, ProductPreview, Units } from '../domain/types';

/**
 * The plan document plus the only operations allowed to change it. All lengths are inches; an
 * item's `x`, `y` are its footprint centre. Operations taking a number ignore one that is not
 * finite, so no NaN or Infinity is ever stored.
 */
export interface PlanState extends PlanDocument {
  setUnits(units: Units): void;
  /** Sets the ceiling height. Items are deliberately not re-checked here; conflicts report them. */
  setRoomHeight(inches: number): void;
  /**
   * Stores `result.outline` and returns true when the edit was accepted; otherwise changes nothing
   * and returns false. Items are not moved; conflicts report any left outside.
   */
  applyOutline(result: OutlineResult): boolean;
  /**
   * Appends the preview as a new unrotated item centred near the room's interior point, placed by
   * the same grid rule as a move; returns its new id.
   */
  addItem(preview: ProductPreview): string;
  /**
   * Moves an item's centre to (x, y), placed so its footprint's bounding-box min corner is on the
   * furniture grid, and kept inside the room bounds. Unknown ids are ignored.
   */
  moveItemTo(id: string, x: number, y: number): void;
  /** Turns an item `deg` degrees clockwise about its centre. Unknown ids are ignored. */
  rotateItemBy(id: string, deg: number): void;
  /** Turns an item to `deg` degrees clockwise about its centre. Unknown ids are ignored. */
  setItemAngle(id: string, deg: number): void;
  /** Removes an item. Unknown ids are ignored. */
  removeItem(id: string): void;
  /** Replaces the document with `doc`, or with the seeded initial document. */
  reset(doc?: PlanDocument): void;
}

/**
 * The state change that replaces the item with `id` by `update(item)`. Returns the existing state
 * (no write, no notification) when the id is unknown or the item lands where it already is.
 */
function changeItem(s: PlanState, id: string, update: (item: Item) => Item): PlanState | Pick<PlanState, 'items'> {
  const item = s.items.find((i) => i.id === id);
  if (!item) return s;
  const next = update(item);
  if (next.x === item.x && next.y === item.y && next.angle === item.angle) return s;
  return { items: s.items.map((i) => (i.id === id ? next : i)) };
}

function documentFields(doc: PlanDocument): PlanDocument {
  return { schemaVersion: doc.schemaVersion, units: doc.units, room: doc.room, items: doc.items };
}

// Every geometry call passes CONFIG.furnitureSnap, so the snap step is never taken from a caller.
// Returning the existing state from `set` skips the write and the subscriber notification.
export const usePlanStore = create<PlanState>()((set, get) => ({
  ...createInitialDocument(),

  setUnits: (units) => set({ units }),

  setRoomHeight: (inches) =>
    set((s) => (!Number.isFinite(inches) || s.room.height === inches ? s : { room: { ...s.room, height: inches } })),

  applyOutline: (result) => {
    if (!result.ok) return false;
    set((s) => ({ room: { ...s.room, outline: result.outline } }));
    return true;
  },

  addItem: (preview) => {
    const id = crypto.randomUUID();
    const { room } = get();
    const centre = interiorPoint(room.outline);
    const unplaced: Item = {
      id,
      kind: preview.kind,
      name: preview.name,
      host: preview.host,
      sourceUrl: preview.sourceUrl,
      price: preview.price,
      w: preview.w,
      d: preview.d,
      h: preview.h,
      x: 0,
      y: 0,
      angle: 0,
      model: { ...preview.model },
    };
    const item = moveItem(unplaced, centre.x, centre.y, roomBounds(room), CONFIG.furnitureSnap);
    set((s) => ({ items: [...s.items, item] }));
    return id;
  },

  // Pointer moves call this every frame; a move that lands on the same spot changes nothing.
  moveItemTo: (id, x, y) =>
    set((s) =>
      Number.isFinite(x) && Number.isFinite(y)
        ? changeItem(s, id, (item) => moveItem(item, x, y, roomBounds(s.room), CONFIG.furnitureSnap))
        : s,
    ),

  rotateItemBy: (id, deg) =>
    set((s) => (Number.isFinite(deg) ? changeItem(s, id, (item) => rotateItemBy(item, deg)) : s)),

  setItemAngle: (id, deg) =>
    set((s) => (Number.isFinite(deg) ? changeItem(s, id, (item) => setItemAngle(item, deg)) : s)),

  removeItem: (id) =>
    set((s) => (s.items.some((i) => i.id === id) ? { items: s.items.filter((i) => i.id !== id) } : s)),

  reset: (doc) => set(documentFields(doc ?? createInitialDocument())),
}));
