import { create } from 'zustand';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { centrePosition, moveItem, rotateItem } from '../domain/geometry';
import type { Item, PlanDocument, ProductPreview, RoomAxis, Units } from '../domain/types';

/** The plan document plus the only operations allowed to change it. All lengths are inches. */
export interface PlanState extends PlanDocument {
  setUnits(units: Units): void;
  /** Sets one room dimension. Items are deliberately not re-clamped; conflicts report them. */
  setRoomDim(axis: RoomAxis, inches: number): void;
  /** Appends the preview as a new unrotated item centred in the room; returns its new id. */
  addItem(preview: ProductPreview): string;
  /** Moves an item to (x, y), snapped and kept inside the room. Unknown ids are ignored. */
  moveItemTo(id: string, x: number, y: number): void;
  /** Turns an item a quarter turn about its centre, kept inside the room. Unknown ids are ignored. */
  rotateItem(id: string): void;
  /** Removes an item. Unknown ids are ignored. */
  removeItem(id: string): void;
  /** Replaces the document with `doc`, or with the seeded initial document. */
  reset(doc?: PlanDocument): void;
}

/** Replaces the item with `id` via `update`; returns `items` unchanged when the id is unknown. */
function updateItem(items: Item[], id: string, update: (item: Item) => Item): Item[] {
  if (!items.some((i) => i.id === id)) return items;
  return items.map((i) => (i.id === id ? update(i) : i));
}

function documentFields(doc: PlanDocument): PlanDocument {
  return { schemaVersion: doc.schemaVersion, units: doc.units, room: doc.room, items: doc.items };
}

// Every geometry call passes CONFIG.furnitureSnap: clampSnap returns NaN for snap <= 0,
// so the snap step is never taken from a caller.
export const usePlanStore = create<PlanState>()((set, get) => ({
  ...createInitialDocument(),

  setUnits: (units) => set({ units }),

  // Returning the existing state skips the write and the subscriber notification.
  setRoomDim: (axis, inches) =>
    set((s) => (s.room[axis] === inches ? s : { room: { ...s.room, [axis]: inches } })),

  addItem: (preview) => {
    const id = crypto.randomUUID();
    const { room } = get();
    const item: Item = {
      id,
      kind: preview.kind,
      name: preview.name,
      host: preview.host,
      sourceUrl: preview.sourceUrl,
      price: preview.price,
      w: preview.w,
      d: preview.d,
      h: preview.h,
      ...centrePosition(preview, room, CONFIG.furnitureSnap),
      rot: 0,
      model: { ...preview.model },
    };
    set((s) => ({ items: [...s.items, item] }));
    return id;
  },

  // Pointer moves call this every frame; a move that lands on the same spot changes nothing.
  moveItemTo: (id, x, y) =>
    set((s) => {
      const item = s.items.find((i) => i.id === id);
      if (!item) return s;
      const moved = moveItem(item, x, y, s.room, CONFIG.furnitureSnap);
      if (moved.x === item.x && moved.y === item.y) return s;
      return { items: s.items.map((i) => (i.id === id ? moved : i)) };
    }),

  rotateItem: (id) =>
    set((s) => ({ items: updateItem(s.items, id, (item) => rotateItem(item, s.room, CONFIG.furnitureSnap)) })),

  removeItem: (id) =>
    set((s) => (s.items.some((i) => i.id === id) ? { items: s.items.filter((i) => i.id !== id) } : s)),

  reset: (doc) => set(documentFields(doc ?? createInitialDocument())),
}));
