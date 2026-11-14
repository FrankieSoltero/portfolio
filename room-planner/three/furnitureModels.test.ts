import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOOK_COLOURS, LINEN, LOOKS } from '../domain/catalog';
import type { Item, Kind } from '../domain/types';
import { buildFurniture, hashSeed } from './furnitureModels';

type Spec = Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h'>;

/** Catalogue sizes (Task 8 table); `box` uses the unknown-product size. */
const SIZES: Record<Kind, { w: number; d: number; h: number }> = {
  sofa: { w: 84, d: 36, h: 33 },
  chair: { w: 30, d: 32, h: 31 },
  bed: { w: 64, d: 85, h: 38 },
  desk: { w: 55, d: 26, h: 30 },
  table: { w: 44, d: 24, h: 16 },
  shelf: { w: 36, d: 13, h: 78 },
  rug: { w: 60, d: 96, h: 0.5 },
  box: { w: 36, d: 24, h: 30 },
};
const KINDS = Object.keys(SIZES) as Kind[];
const TOL = 0.01;

type StdMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

function spec(kind: Kind, id = `item-${kind}`): Spec {
  return { id, kind, ...SIZES[kind] };
}

function meshes(group: THREE.Group): StdMesh[] {
  const out: StdMesh[] = [];
  group.traverse((o) => {
    if (o instanceof THREE.Mesh && o !== group.userData.outline) out.push(o as StdMesh);
  });
  return out;
}

function meshBounds(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const m of meshes(group)) box.expandByObject(m);
  return box;
}

describe('buildFurniture bounds', () => {
  it.each(KINDS)('%s stays within w × h × d and fills at least 95 percent of each axis', (kind) => {
    const { w, d, h } = SIZES[kind];
    const size = meshBounds(buildFurniture(spec(kind))).getSize(new THREE.Vector3());
    expect(size.x).toBeLessThanOrEqual(w + TOL);
    expect(size.y).toBeLessThanOrEqual(h + TOL);
    expect(size.z).toBeLessThanOrEqual(d + TOL);
    expect(size.x).toBeGreaterThanOrEqual(w * 0.95);
    expect(size.y).toBeGreaterThanOrEqual(h * 0.95);
    expect(size.z).toBeGreaterThanOrEqual(d * 0.95);
  });

  it('lays a rug over its full footprint no taller than 0.5', () => {
    const size = meshBounds(buildFurniture({ id: 'r', kind: 'rug', w: 60, d: 96, h: 12 })).getSize(
      new THREE.Vector3(),
    );
    expect(size.x).toBeCloseTo(60, 2);
    expect(size.z).toBeCloseTo(96, 2);
    expect(size.y).toBeLessThanOrEqual(0.5 + TOL);
  });
});

describe('buildFurniture origin', () => {
  it.each(KINDS)('%s is centred on x and z and sits on the floor', (kind) => {
    const box = meshBounds(buildFurniture(spec(kind)));
    const centre = box.getCenter(new THREE.Vector3());
    expect(Math.abs(centre.x)).toBeLessThanOrEqual(TOL);
    expect(Math.abs(centre.z)).toBeLessThanOrEqual(TOL);
    // Vertices are Float32, so allow rounding error but nothing visibly below the floor.
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe('buildFurniture shadows', () => {
  it.each(KINDS.filter((k) => k !== 'rug'))('%s meshes cast and receive shadows', (kind) => {
    const all = meshes(buildFurniture(spec(kind)));
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m.castShadow).toBe(true);
      expect(m.receiveShadow).toBe(true);
    }
  });

  it('rug meshes receive but do not cast shadows', () => {
    const all = meshes(buildFurniture(spec('rug')));
    expect(all).toHaveLength(2);
    for (const m of all) {
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(true);
    }
  });
});

describe('buildFurniture outline', () => {
  it.each(KINDS)('%s has a hidden padded outline box centred at h/2 + 0.3', (kind) => {
    const { w, d, h } = SIZES[kind];
    const group = buildFurniture(spec(kind));
    const outline: unknown = group.userData.outline;
    expect(outline).toBeInstanceOf(THREE.LineSegments);
    const ol = outline as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    expect(ol.parent).toBe(group);
    expect(ol.visible).toBe(false);
    expect(ol.material).toBeInstanceOf(THREE.LineBasicMaterial);
    ol.geometry.computeBoundingBox();
    const size = ol.geometry.boundingBox?.getSize(new THREE.Vector3());
    expect(size?.x).toBeCloseTo(w + 1.2, 4);
    expect(size?.y).toBeCloseTo(h + 0.6, 4);
    expect(size?.z).toBeCloseTo(d + 1.2, 4);
    expect(ol.position.x).toBe(0);
    expect(ol.position.y).toBeCloseTo(h / 2 + 0.3, 10);
    expect(ol.position.z).toBe(0);
  });
});

describe('buildFurniture materials', () => {
  const hex = (m: StdMesh) => `#${m.material.color.getHexString()}`;

  it('uses wood 0.6 and metal 0.5 roughness on the desk', () => {
    const all = meshes(buildFurniture(spec('desk')));
    const metal = all.filter((m) => hex(m) === LOOKS.desk.metal);
    const wood = all.filter((m) => hex(m) === LOOKS.desk.wood);
    expect(metal).toHaveLength(4);
    expect(wood).toHaveLength(2);
    for (const m of metal) expect(m.material.roughness).toBe(0.5);
    for (const m of wood) expect(m.material.roughness).toBe(0.6);
  });

  it('uses the default 0.92 roughness on main, soft and linen parts', () => {
    const bed = meshes(buildFurniture(spec('bed')));
    const linen = bed.filter((m) => hex(m) === LINEN);
    expect(linen).toHaveLength(3);
    for (const m of linen) expect(m.material.roughness).toBe(0.92);
    const sofa = meshes(buildFurniture(spec('sofa')));
    const fabric = sofa.filter((m) => hex(m) === LOOKS.sofa.main || hex(m) === LOOKS.sofa.soft);
    expect(fabric.length).toBeGreaterThan(0);
    for (const m of fabric) expect(m.material.roughness).toBe(0.92);
  });

  it('draws books in the book colours with 0.85 roughness', () => {
    const all = meshes(buildFurniture(spec('shelf')));
    const books = all.filter((m) => (BOOK_COLOURS as readonly string[]).includes(hex(m)));
    expect(books.length).toBeGreaterThan(0);
    for (const m of books) expect(m.material.roughness).toBe(0.85);
  });

  it('colours a box in the box main colour', () => {
    const all = meshes(buildFurniture(spec('box')));
    expect(all).toHaveLength(1);
    expect(all.map(hex)).toEqual([LOOKS.box.main]);
  });
});

describe('buildFurniture shelf determinism', () => {
  const layout = (id: string) =>
    meshes(buildFurniture(spec('shelf', id))).map((m) => m.position.toArray().join(','));

  it('builds the same books for the same id', () => {
    const a = layout('shelf-a');
    expect(layout('shelf-a')).toEqual(a);
  });

  it('builds a valid shelf for two different ids', () => {
    const { w, d, h } = SIZES.shelf;
    for (const id of ['shelf-a', '0b6f4a8e-2c1d-4e5f-9a7b-3c8d1e2f4a5b']) {
      const group = buildFurniture(spec('shelf', id));
      expect(meshes(group).length).toBeGreaterThan(6);
      const size = meshBounds(group).getSize(new THREE.Vector3());
      expect(size.x).toBeLessThanOrEqual(w + TOL);
      expect(size.y).toBeLessThanOrEqual(h + TOL);
      expect(size.z).toBeLessThanOrEqual(d + TOL);
    }
    expect(layout('shelf-a')).not.toEqual(layout('0b6f4a8e-2c1d-4e5f-9a7b-3c8d1e2f4a5b'));
  });
});

describe('hashSeed', () => {
  it.each(['seed-bed', '0b6f4a8e-2c1d-4e5f-9a7b-3c8d1e2f4a5b', ''])(
    'maps %j to a stable integer in 1..2147483646',
    (id) => {
      const seed = hashSeed(id);
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(1);
      expect(seed).toBeLessThanOrEqual(2147483646);
      expect(hashSeed(id)).toBe(seed);
    },
  );

  it('separates different ids', () => {
    expect(hashSeed('seed-bed')).not.toBe(hashSeed('seed-desk'));
  });
});
