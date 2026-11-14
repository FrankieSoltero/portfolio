import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { BOOK_COLOURS, LINEN, LOOKS, PARTS, createInitialDocument } from './catalog';
import type { Kind } from './types';

const KINDS: Kind[] = ['sofa', 'chair', 'bed', 'desk', 'table', 'shelf', 'rug', 'box'];

describe('createInitialDocument', () => {
  it('returns the seeded plan document', () => {
    const doc = createInitialDocument();
    const model = { tier: 'retailer', label: '3D model from retailer', assetUrl: null };
    expect(doc.schemaVersion).toBe(2);
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
    });
  });
});
