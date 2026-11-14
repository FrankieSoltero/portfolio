import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createInitialDocument } from '../domain/catalog';
import type { Item } from '../domain/types';
import { buildFurniture } from './furnitureModels';
import { modelKey, resolveModel } from './modelSource';

function seedBed(): Item {
  const bed = createInitialDocument().items.find((i) => i.id === 'seed-bed');
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
    ['rot', { rot: 2 }],
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
  ])('changes when %s changes', (_field, change) => {
    const bed = seedBed();
    expect(modelKey(change(bed))).not.toBe(modelKey(bed));
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
