import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildParts } from '../domain/furniture/parts';
import type { Part, PartSlot } from '../domain/furniture/parts/types';
import { defaultColours, defaultStyle, KIND_ORDER, lighten, TYPICAL_SIZE } from '../domain/furniture/recipe';
import type { Item, ItemColours, Kind, StyleValues } from '../domain/types';
import { buildFurniture, hashSeed } from './furnitureModels';

// buildParts passes through to the real one; the fallback tests make it throw once.
vi.mock('../domain/furniture/parts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../domain/furniture/parts')>();
  return { ...actual, buildParts: vi.fn(actual.buildParts) };
});

afterEach(() => {
  vi.mocked(buildParts).mockClear();
});

type Spec = Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h' | 'style' | 'colours'>;
type StdMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

const TOL = 1e-3;

function spec(kind: Kind, over: { style?: StyleValues; colours?: ItemColours; id?: string } = {}): Spec {
  return {
    id: over.id ?? `item-${kind}`,
    kind,
    ...TYPICAL_SIZE[kind],
    style: over.style ?? defaultStyle(kind),
    colours: over.colours ?? defaultColours(kind),
  };
}

/** The parts the model of `item` is built from, as buildFurniture asks for them. */
function partsOf(item: Spec): Part[] {
  return buildParts(item.kind, { w: item.w, d: item.d, h: item.h }, item.style, hashSeed(item.id));
}

/** The group's meshes, in order, leaving out the selection outline. */
function meshes(group: THREE.Group): StdMesh[] {
  return group.children.filter((o): o is StdMesh => o instanceof THREE.Mesh);
}

function worldSize(mesh: THREE.Object3D): THREE.Vector3 {
  mesh.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh).getSize(new THREE.Vector3());
}

function hex(mesh: StdMesh): string {
  return `#${mesh.material.color.getHexString()}`;
}

/** Each mesh paired with the part it was built from (the model keeps the parts' order). */
function pairs(item: Spec): { part: Part; mesh: StdMesh }[] {
  const parts = partsOf(item);
  const all = meshes(buildFurniture(item));
  expect(all).toHaveLength(parts.length);
  return parts.map((part, i) => {
    const mesh = all[i];
    if (!mesh) throw new Error(`no mesh for part ${i}`);
    return { part, mesh };
  });
}

describe('buildFurniture parts', () => {
  it('builds one mesh per part of the default sofa, plus the outline', () => {
    const item = spec('sofa');
    const parts = partsOf(item);
    const group = buildFurniture(item);
    expect(parts.length).toBeGreaterThan(1);
    expect(group.children).toHaveLength(parts.length + 1);
    expect(meshes(group)).toHaveLength(parts.length);
    expect(group.children).toContain(group.userData.outline);
  });

  it('places and sizes each mesh from its part: x to x, depth to z, up to y', () => {
    for (const { part, mesh } of pairs(spec('sofa'))) {
      expect(mesh.position.x).toBeCloseTo(part.cx, 6);
      expect(mesh.position.y).toBeCloseTo(part.z0 + part.sz / 2, 6);
      expect(mesh.position.z).toBeCloseTo(part.cy, 6);
      const size = worldSize(mesh);
      expect(size.x).toBeCloseTo(part.sx, 3);
      expect(size.y).toBeCloseTo(part.sz, 3);
      expect(size.z).toBeCloseTo(part.sy, 3);
    }
  });

  it('asks for the parts with the item size, style and the seed from its id', () => {
    const item = spec('sofa', { id: 'sofa-42' });
    buildFurniture(item);
    expect(buildParts).toHaveBeenCalledWith('sofa', { w: item.w, d: item.d, h: item.h }, item.style, hashSeed('sofa-42'));
  });
});

describe('buildFurniture colours', () => {
  const colours = { main: '#112233', accent: '#445566' };
  const bySlot = (slot: PartSlot) =>
    pairs(spec('sofa', { colours })).filter((p) => p.part.slot === slot).map((p) => p.mesh);

  it('paints main parts in the main colour with roughness 0.92', () => {
    const main = bySlot('main');
    expect(main.length).toBeGreaterThan(0);
    for (const m of main) {
      expect(hex(m)).toBe('#112233');
      expect(m.material.roughness).toBe(0.92);
    }
  });

  it('paints soft parts in the main colour lightened by 0.08 with roughness 0.92', () => {
    const soft = bySlot('soft');
    expect(soft.length).toBeGreaterThan(0);
    for (const m of soft) {
      expect(hex(m)).toBe(lighten('#112233', 0.08));
      expect(m.material.roughness).toBe(0.92);
    }
  });

  it('paints accent parts in the accent colour with roughness 0.6', () => {
    const accent = bySlot('accent');
    expect(accent.length).toBeGreaterThan(0);
    for (const m of accent) {
      expect(hex(m)).toBe('#445566');
      expect(m.material.roughness).toBe(0.6);
    }
  });
});

describe('buildFurniture materials', () => {
  it.each<Kind>(['dresser', 'sofa'])('shares one material per slot on the default %s', (kind) => {
    const all = pairs(spec(kind));
    const materials = new Set(all.map((p) => p.mesh.material));
    const slots = new Set(all.map((p) => p.part.slot));
    expect(materials.size).toBeLessThanOrEqual(slots.size);
    for (const slot of slots) {
      const used = new Set(all.filter((p) => p.part.slot === slot).map((p) => p.mesh.material));
      expect(used.size).toBe(1);
    }
  });
});

describe('buildFurniture shapes', () => {
  it('builds a rounded part as a RoundedBoxGeometry of its size', () => {
    const rounded = pairs(spec('sofa')).filter((p) => p.part.shape === 'rounded');
    expect(rounded.length).toBeGreaterThan(0);
    for (const { part, mesh } of rounded) {
      expect(mesh.geometry).toBeInstanceOf(RoundedBoxGeometry);
      mesh.geometry.computeBoundingBox();
      const size = mesh.geometry.boundingBox?.getSize(new THREE.Vector3());
      expect(Math.abs((size?.x ?? NaN) - part.sx)).toBeLessThanOrEqual(TOL);
      expect(Math.abs((size?.y ?? NaN) - part.sz)).toBeLessThanOrEqual(TOL);
      expect(Math.abs((size?.z ?? NaN) - part.sy)).toBeLessThanOrEqual(TOL);
    }
  });

  it('builds a box part as a plain BoxGeometry', () => {
    const boxes = pairs(spec('sofa')).filter((p) => p.part.shape === 'box');
    expect(boxes.length).toBeGreaterThan(0);
    for (const { mesh } of boxes) expect(mesh.geometry.type).toBe('BoxGeometry');
  });

  it('builds a tapered leg as a cylinder of its size, narrower at the bottom', () => {
    const item = spec('sofa', { style: { ...defaultStyle('sofa'), legs: 'tapered' } });
    const legs = pairs(item).filter((p) => p.part.shape === 'cylinder' && p.part.taper !== undefined);
    expect(legs.length).toBe(4);
    for (const { part, mesh } of legs) {
      expect(mesh.geometry).toBeInstanceOf(THREE.CylinderGeometry);
      const size = worldSize(mesh);
      expect(Math.abs(size.x - part.sx)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(size.y - part.sz)).toBeLessThanOrEqual(TOL);
      expect(Math.abs(size.z - part.sy)).toBeLessThanOrEqual(TOL);
      // Widest vertex of the bottom and the top rings, in local (unscaled) units.
      const pos = mesh.geometry.getAttribute('position');
      let bottom = 0;
      let top = 0;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        if (pos.getY(i) < 0) bottom = Math.max(bottom, r);
        else top = Math.max(top, r);
      }
      expect(bottom).toBeLessThan(top);
      expect(bottom).toBeCloseTo(0.5 * (part.taper ?? 1), 5);
    }
  });
});

describe('buildFurniture shadows', () => {
  it.each(KIND_ORDER.filter((k) => k !== 'rug'))('%s meshes cast and receive shadows', (kind) => {
    const all = meshes(buildFurniture(spec(kind)));
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m.castShadow).toBe(true);
      expect(m.receiveShadow).toBe(true);
    }
  });

  it('rug meshes receive but do not cast shadows', () => {
    const all = meshes(buildFurniture(spec('rug')));
    expect(all.length).toBeGreaterThan(0);
    for (const m of all) {
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(true);
    }
  });
});

describe('buildFurniture fallback', () => {
  /** Expects the group to be one plain box of the item's size in `colour`, standing on the floor, plus the outline. */
  function expectPlainBox(group: THREE.Group, item: Spec, colour: string): void {
    expect(group.children).toHaveLength(2);
    const [mesh] = meshes(group);
    if (!mesh) throw new Error('no mesh');
    expect(mesh.geometry.type).toBe('BoxGeometry');
    const size = worldSize(mesh);
    expect(size.x).toBeCloseTo(item.w, 6);
    expect(size.y).toBeCloseTo(item.h, 6);
    expect(size.z).toBeCloseTo(item.d, 6);
    expect(mesh.position.toArray()).toEqual([0, item.h / 2, 0]);
    expect(hex(mesh)).toBe(colour);
    expect(group.userData.outline).toBeInstanceOf(THREE.LineSegments);
  }

  it('builds a plain box in the main colour when the parts cannot be made', () => {
    vi.mocked(buildParts).mockImplementationOnce(() => {
      throw new Error('no parts');
    });
    const item = spec('sofa', { colours: { main: '#112233', accent: '#445566' } });
    let group: THREE.Group | undefined;
    expect(() => {
      group = buildFurniture(item);
    }).not.toThrow();
    if (!group) throw new Error('no group');
    expectPlainBox(group, item, '#112233');
  });

  it('builds a plain neutral box when the main colour is not #rrggbb', () => {
    const item = spec('sofa', { colours: { main: 'not a colour', accent: '#445566' } });
    let group: THREE.Group | undefined;
    expect(() => {
      group = buildFurniture(item);
    }).not.toThrow();
    if (!group) throw new Error('no group');
    expectPlainBox(group, item, '#c9ccd1');
  });

  it('keeps a rug fallback from casting shadows', () => {
    vi.mocked(buildParts).mockImplementationOnce(() => {
      throw new Error('no parts');
    });
    const [mesh] = meshes(buildFurniture(spec('rug')));
    expect(mesh?.castShadow).toBe(false);
    expect(mesh?.receiveShadow).toBe(true);
  });
});

describe('buildFurniture outline', () => {
  it.each(KIND_ORDER)('%s has a hidden padded outline box centred at h/2 + 0.3', (kind) => {
    const { w, d, h } = TYPICAL_SIZE[kind];
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
