import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { BOOK_COLOURS, LINEN, LOOKS, PARTS, createInitialDocument } from './catalog';
import type { Door, Kind, Obstacle, WindowOpening } from './types';

const KINDS: Kind[] = ['sofa', 'chair', 'bed', 'desk', 'table', 'shelf', 'rug', 'box'];

describe('createInitialDocument', () => {
  it('returns the seeded plan document', () => {
    const doc = createInitialDocument();
    const model = { tier: 'retailer', label: '3D model from retailer', assetUrl: null };
    expect(doc.schemaVersion).toBe(3);
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'units', 'room', 'items', 'openings', 'obstacles']);
    expect(doc.openings).toEqual([]);
    expect(doc.obstacles).toEqual([]);
    expect(doc.units).toBe('ft');
    expect(doc.room).toEqual({
      outline: [{ id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 }],
      height: 96,
    });
    expect(doc.items).toEqual([
      { id: 'seed-bed', kind: 'bed', name: 'Low platform bed, queen', host: 'shop.example', sourceUrl: null, price: 890, w: 64, d: 85, h: 38, x: 72, y: 42.5, angle: 0, model },
      { id: 'seed-desk', kind: 'desk', name: 'Tack writing desk', host: 'shop.example', sourceUrl: null, price: 420, w: 55, d: 26, h: 30, x: 131, y: 131.5, angle: 90, model },
    ]);
  });

  it('returns a fresh object each call', () => {
    const a = createInitialDocument();
    const b = createInitialDocument();
    expect(a).not.toBe(b);
    expect(a.openings).not.toBe(b.openings);
    expect(a.obstacles).not.toBe(b.obstacles);
    const [firstA] = a.items;
    const [firstB] = b.items;
    expect(firstA).toBeDefined();
    expect(firstA).not.toBe(firstB);
    if (firstA) firstA.model.label = 'changed';
    a.room.height = 1;
    a.room.outline[1].x = 1;
    expect(firstB?.model.label).toBe('3D model from retailer');
    expect(b.room.height).toBe(96);
    expect(b.room.outline[1].x).toBe(144);
  });
});

describe('catalogue tables', () => {
  it('has parts and looks for every kind', () => {
    for (const k of KINDS) {
      expect(PARTS[k].length).toBeGreaterThanOrEqual(1);
      expect(LOOKS[k]).toBeDefined();
    }
  });

  it('has valid part fractions', () => {
    for (const k of KINDS) {
      for (const [u0, u1, v0, v1, z0, z1] of PARTS[k]) {
        for (const n of [u0, u1, v0, v1, z0, z1]) {
          expect(n).toBeGreaterThanOrEqual(0);
          expect(n).toBeLessThanOrEqual(1);
        }
        expect(u0).toBeLessThan(u1);
        expect(v0).toBeLessThan(v1);
        expect(z0).toBeLessThan(z1);
      }
    }
  });

  it('exports the linen and book colours', () => {
    expect(LINEN).toBe('#f3f1ec');
    expect(BOOK_COLOURS).toEqual(['#7c8a96', '#b9a48a', '#5f6b5c', '#a2584a', '#d8d2c4']);
  });
});

describe('CONFIG', () => {
  it('has exactly the listed values', () => {
    expect(CONFIG).toEqual({
      roomMin: 36, roomMax: 720, furnitureSnap: 1,
      previewDimMax: 240, showClearances: true, lookupDelayMs: 900,
      camera: { yaw: -0.65, pitch: 0.55, zoom: 1 },
      pitchMin: 0.12, pitchMax: 1.45, zoomMin: 0.6, zoomMax: 2.5,
      orbitYawPerPx: 0.008, orbitPitchPerPx: 0.006, zoomPerDelta: 0.001,
      planMargin: 64, planMarginInset: 48, dimOffset: 30, dimOffsetInset: 22,
      insetGap: 16, minPlanScale: 0.2, minSafeWidth: 200, conflictEpsilon: 0.01,
      cornerSnap: 1, angleSnapDeg: 15, angleSnapTolerancePx: 8, wallMin: 6, maxCorners: 64, coordMax: 1440, maxItems: 200,
      maxPixelRatio: 2, nudgeStep: 1, nudgeStepLarge: 12,
      hemiIntensity: 3.0, sunIntensity: 1.7,
      planStorageKey: 'room-planner:plan:v1', maxStoredChars: 524288, saveDebounceMs: 300,
      maxOpenings: 64, maxObstacles: 64,
      openingWidthMin: 12, openingWidthMax: 240, openingHeightMin: 12, openingHeightMax: 240,
      sillMax: 240, obstacleSizeMin: 1, obstacleSizeMax: 240, obstacleHeightMax: 720, obstacleLabelMax: 40,
      doorClearDepth: 24, windowZoneDepth: 6, arcSegments: 8, cylinderSegments: 16,
    });
  });
});

describe('opening and obstacle types', () => {
  it('accepts valid literals and rejects an unknown opening kind', () => {
    const door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 10, width: 36, height: 80, hinge: 'start', swing: 'in' } satisfies Door;
    const win = { id: 'w1', kind: 'window', wallId: 'c1', offset: 10, width: 36, sill: 30, height: 48 } satisfies WindowOpening;
    const obstacle = { id: 'o1', shape: 'box', label: 'Pillar', x: 10, y: 10, rotation: 0, width: 12, depth: 12, height: 96, elevation: 0 } satisfies Obstacle;
    // @ts-expect-error 'gate' is not an opening kind
    const gate = { id: 'g1', kind: 'gate', wallId: 'c1', offset: 10, width: 36, height: 80, hinge: 'start', swing: 'in' } satisfies Door;
    expect([door.kind, win.kind, obstacle.shape, gate.id]).toEqual(['door', 'window', 'box', 'g1']);
  });
});
