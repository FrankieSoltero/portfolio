import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Item } from '../domain/types';
import { furnishedDocument } from '../test/fixtures';
import { buildFurniture } from './furnitureModels';
import { modelKey, resolveModel } from './modelSource';

function seedBed(): Item {
  const bed = furnishedDocument().items.find((i) => i.id === 'seed-bed');
  if (!bed) throw new Error('seed bed missing');
  return bed;
}

function meshCount(group: THREE.Group): number {
  let n = 0;
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) n += 1;
  });
  return n;
}

describe('modelKey', () => {
  it.each<[string, Partial<Item>]>([
    ['x', { x: 7 }],
    ['y', { y: 9 }],
    ['angle', { angle: 180 }],
    ['name', { name: 'Another bed' }],
    ['price', { price: 1 }],
  ])('does not change when %s changes', (_field, change) => {
    const bed = seedBed();
    expect(modelKey({ ...bed, ...change })).toBe(modelKey(bed));
  });

  it.each<[string, (item: Item) => Item]>([
    ['kind', (i) => ({ ...i, kind: 'sofa' })],
    ['w', (i) => ({ ...i, w: i.w + 1 })],
    ['d', (i) => ({ ...i, d: i.d + 1 })],
    ['h', (i) => ({ ...i, h: i.h + 1 })],
    ['model.assetUrl', (i) => ({ ...i, model: { ...i.model, assetUrl: 'https://cdn.example/bed.glb' } })],
    ['style.headboard', (i) => ({ ...i, style: { ...i.style, headboard: 'tall' } })],
    ['style.base', (i) => ({ ...i, style: { ...i.style, base: 'storage' } })],
    ['colours.main', (i) => ({ ...i, colours: { ...i.colours, main: '#2f4057' } })],
    ['colours.accent', (i) => ({ ...i, colours: { ...i.colours, accent: '#b08d57' } })],
  ])('changes when %s changes', (_field, change) => {
    const bed = seedBed();
    expect(modelKey(change(bed))).not.toBe(modelKey(bed));
  });

  it('does not depend on the order of the style keys', () => {
    const bed = seedBed();
    const reversed = Object.fromEntries(Object.entries(bed.style).reverse());
    expect(Object.keys(reversed)).not.toEqual(Object.keys(bed.style));
    expect(modelKey({ ...bed, style: reversed })).toBe(modelKey(bed));
  });

  it('tells a style value apart from a key: a value cannot pose as the next key', () => {
    const bed = seedBed();
    expect(modelKey({ ...bed, style: { a: 'b,c' } })).not.toBe(modelKey({ ...bed, style: { a: 'b', c: '' } }));
  });

  it('keeps the main and accent colours apart', () => {
    const bed = seedBed();
    const swapped = { ...bed, colours: { main: bed.colours.accent, accent: bed.colours.main } };
    expect(modelKey(swapped)).not.toBe(modelKey(bed));
  });
});

describe('resolveModel', () => {
  it('builds the parametric model for the seed bed', () => {
    const bed = seedBed();
    const group = resolveModel(bed);
    expect(group).toBeInstanceOf(THREE.Group);
    const expected = meshCount(buildFurniture(bed));
    expect(expected).toBeGreaterThan(0);
    expect(meshCount(group)).toBe(expected);
    expect(group.userData.outline).toBeInstanceOf(THREE.LineSegments);
  });
});
