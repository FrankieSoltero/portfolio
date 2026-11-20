import type { PlanDocument } from './types';

export const LINEN = '#f3f1ec';
export const BOOK_COLOURS = ['#7c8a96', '#b9a48a', '#5f6b5c', '#a2584a', '#d8d2c4'] as const;

/** The starting plan shown on first load and after Reset: the room with no furniture. Returns a fresh object every call. */
export function createInitialDocument(): PlanDocument {
  return {
    schemaVersion: 4,
    units: 'ft',
    room: {
      outline: [{ id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 }],
      height: 96,
    },
    items: [],
    openings: [],
    obstacles: [],
  };
}
