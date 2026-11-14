import type { Kind, PartRect, PlanDocument } from './types';

/** Box parts per kind, as fractions of width, depth, height; v=0 is the back edge. */
export const PARTS: Record<Kind, readonly PartRect[]> = {
  sofa: [[.08,.92,.28,1,0,.5],[0,1,0,.28,0,1],[0,.08,.28,1,0,.7],[.92,1,.28,1,0,.7]],
  chair: [[.12,.88,.25,1,0,.5],[0,1,0,.25,0,1],[0,.12,.25,1,0,.68],[.88,1,.25,1,0,.68]],
  bed: [[0,1,.04,1,0,.42],[0,1,0,.04,0,1],[.08,.46,.08,.26,.42,.52],[.54,.92,.08,.26,.42,.52]],
  desk: [[0,1,0,1,.93,1],[.02,.06,.06,.94,0,.93],[.94,.98,.06,.94,0,.93]],
  table: [[0,1,0,1,.82,1],[.06,.12,.1,.9,0,.82],[.88,.94,.1,.9,0,.82]],
  shelf: [[0,1,0,1,0,1]],
  rug: [[0,1,0,1,0,1]],
  box: [[0,1,0,1,0,1]],
};

/** 3D material colours per kind. */
export const LOOKS: Record<Kind, { main?: string; soft?: string; wood?: string; metal?: string }> = {
  sofa: { main: '#6f7f8c', soft: '#7e8e9b', wood: '#3b2f27' },
  chair: { main: '#b5673f', soft: '#c0744c', wood: '#2e2a27' },
  bed: { main: '#8a9a8b', wood: '#a67c52' },
  desk: { wood: '#b98d5e', metal: '#2b2b2d' },
  table: { wood: '#6b4a33' },
  shelf: { wood: '#ddd8ce' },
  rug: { main: '#c9b8a3', soft: '#ded2c2' },
  box: { main: '#c9ccd1' },
};

export const LINEN = '#f3f1ec';
export const BOOK_COLOURS = ['#7c8a96', '#b9a48a', '#5f6b5c', '#a2584a', '#d8d2c4'] as const;

/** The seeded plan shown on first load. Returns a fresh object every call. */
export function createInitialDocument(): PlanDocument {
  return {
    schemaVersion: 1,
    units: 'ft',
    room: { w: 144, l: 168, h: 96 },
    items: [
      {
        id: 'seed-bed', kind: 'bed', name: 'Low platform bed, queen', host: 'shop.example',
        sourceUrl: null, price: 890, w: 64, d: 85, h: 38, x: 40, y: 0, rot: 0,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
      {
        id: 'seed-desk', kind: 'desk', name: 'Tack writing desk', host: 'shop.example',
        sourceUrl: null, price: 420, w: 55, d: 26, h: 30, x: 118, y: 104, rot: 1,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
    ],
  };
}
