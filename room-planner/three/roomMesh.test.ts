import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Point } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { buildRoom, createFloorTexture } from './roomMesh';

const RECT: readonly Point[] = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 168 }, { x: 0, y: 168 }];
/** The 6-corner L-shape; (72, 84) is the reflex corner. */
const L_SHAPE: readonly Point[] = [
  { x: 0, y: 0 }, { x: 72, y: 0 }, { x: 72, y: 84 }, { x: 144, y: 84 }, { x: 144, y: 168 }, { x: 0, y: 168 },
];
const H = 96;
const TOKENS: Tokens = {
  bg: '#ffffff',
  text: '#111111',
  n100: '#f5f5f8',
  n200: '#e5e5ea',
  a100: '#eef0ff',
  a200: '#dde1ff',
  a300: '#c4cbff',
  a400: '#a3adff',
  a700: '#3a46c8',
};

type StdMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;

function meshes(group: THREE.Group): StdMesh[] {
  return group.children.filter((c): c is StdMesh => c instanceof THREE.Mesh);
}

/** Every vertex of the mesh's geometry, in world space. */
function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld));
  return out;
}

/** Vertex indices of each triangle, indexed or not. */
function triangles(geometry: THREE.BufferGeometry): [number, number, number][] {
  const index = geometry.getIndex();
  const count = index ? index.count : geometry.getAttribute('position').count;
  const at = (i: number) => (index ? index.getX(i) : i);
  const tris: [number, number, number][] = [];
  for (let i = 0; i < count; i += 3) tris.push([at(i), at(i + 1), at(i + 2)]);
  return tris;
}

/** World-space unit normals of the front faces (counter-clockwise winding) of every triangle. */
function frontNormals(mesh: THREE.Mesh): THREE.Vector3[] {
  const v = worldVertices(mesh);
  return triangles(mesh.geometry).map(([a, b, c]) => {
    const [pa, pb, pc] = [v[a], v[b], v[c]] as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    return pb.clone().sub(pa).cross(pc.clone().sub(pa)).normalize();
  });
}

/** The floor is the one mesh lying flat on y = 0; the rest are walls. */
function split(group: THREE.Group): { floor: StdMesh; walls: StdMesh[] } {
  group.updateMatrixWorld(true);
  const all = meshes(group);
  const isFloor = (m: StdMesh) => worldVertices(m).every((p) => Math.abs(p.y) < 1e-9);
  const floors = all.filter(isFloor);
  if (floors.length !== 1 || !floors[0]) throw new Error(`expected one floor mesh, found ${floors.length}`);
  return { floor: floors[0], walls: all.filter((m) => !isFloor(m)) };
}

/** Rounded to 1e-6 in, with −0 folded into 0 so float noise either side of zero compares equal. */
const round6 = (v: number) => (Math.round(v * 1e6) / 1e6 + 0).toFixed(6);
const key = (p: THREE.Vector3) => `${round6(p.x)},${round6(p.y)},${round6(p.z)}`;
const uniqueKeys = (ps: THREE.Vector3[]) => [...new Set(ps.map(key))].sort();

/** The wall mesh whose world vertices are exactly the four corners of the wall from a to b. */
function wallBetween(walls: StdMesh[], a: Point, b: Point, height: number): StdMesh {
  const want = uniqueKeys([
    new THREE.Vector3(a.x, 0, a.y), new THREE.Vector3(b.x, 0, b.y),
    new THREE.Vector3(a.x, height, a.y), new THREE.Vector3(b.x, height, b.y),
  ]);
  const found = walls.filter((w) => JSON.stringify(uniqueKeys(worldVertices(w))) === JSON.stringify(want));
  if (found.length !== 1 || !found[0]) throw new Error(`expected one wall from (${a.x},${a.y}) to (${b.x},${b.y})`);
  return found[0];
}

/** The inward unit normal of the wall from a to b, mapped to three (plan y → Z). */
function inwardNormal(a: Point, b: Point): THREE.Vector3 {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return new THREE.Vector3(-(b.y - a.y) / len, 0, (b.x - a.x) / len);
}

function centreOf(mesh: THREE.Mesh): THREE.Vector3 {
  const box = new THREE.Box3().setFromPoints(worldVertices(mesh));
  return box.getCenter(new THREE.Vector3());
}

function expectVec(v: THREE.Vector3, x: number, y: number, z: number): void {
  expect(v.x).toBeCloseTo(x, 9);
  expect(v.y).toBeCloseTo(y, 9);
  expect(v.z).toBeCloseTo(z, 9);
}

function expectEachWallSpansAndFacesInward(outline: readonly Point[], height: number): void {
  const { walls } = split(buildRoom(outline, height, TOKENS, null));
  expect(walls).toHaveLength(outline.length);
  const used = new Set<StdMesh>();
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length] as Point;
    const wall = wallBetween(walls, a, b, height);
    used.add(wall);
    const n = inwardNormal(a, b);
    for (const normal of frontNormals(wall)) expectVec(normal, n.x, n.y, n.z);
  });
  expect(used.size).toBe(outline.length);
}

describe('buildRoom', () => {
  it('builds one floor and one wall per corner', () => {
    const rect = split(buildRoom(RECT, H, TOKENS, null));
    expect(rect.walls).toHaveLength(4);
    const l = split(buildRoom(L_SHAPE, H, TOKENS, null));
    expect(l.walls).toHaveLength(6);
  });

  it('lays the floor on the outline corners at (x, 0, y), facing up and receiving shadows', () => {
    const { floor } = split(buildRoom(L_SHAPE, H, TOKENS, null));
    const want = uniqueKeys(L_SHAPE.map((p) => new THREE.Vector3(p.x, 0, p.y)));
    expect(uniqueKeys(worldVertices(floor))).toEqual(want);
    const normals = frontNormals(floor);
    expect(normals.length).toBe(L_SHAPE.length - 2);
    for (const n of normals) expectVec(n, 0, 1, 0);
    const attr = floor.geometry.getAttribute('normal');
    for (let i = 0; i < attr.count; i++) expectVec(new THREE.Vector3().fromBufferAttribute(attr, i), 0, 1, 0);
    expect(floor.receiveShadow).toBe(true);
    expect(floor.material.roughness).toBe(0.75);
    expect(floor.material.side).toBe(THREE.FrontSide);
  });

  it('covers the floor area exactly once', () => {
    const { floor } = split(buildRoom(L_SHAPE, H, TOKENS, null));
    const v = worldVertices(floor);
    const area = triangles(floor.geometry).reduce((sum, [a, b, c]) => {
      const [pa, pb, pc] = [v[a], v[b], v[c]] as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      return sum + pb.clone().sub(pa).cross(pc.clone().sub(pa)).length() / 2;
    }, 0);
    expect(area).toBeCloseTo(18144, 6);
  });

  it('gives each floor vertex the UV (x, y) in inches', () => {
    const { floor } = split(buildRoom(L_SHAPE, H, TOKENS, null));
    const uv = floor.geometry.getAttribute('uv');
    const v = worldVertices(floor);
    expect(uv.count).toBe(v.length);
    v.forEach((p, i) => {
      expect(uv.getX(i)).toBeCloseTo(p.x, 9);
      expect(uv.getY(i)).toBeCloseTo(p.z, 9);
    });
  });

  it('spans each rectangle wall between its two corners and faces it inward', () => {
    expectEachWallSpansAndFacesInward(RECT, H);
  });

  it('keeps the rectangle walls where they were before, facing the same way', () => {
    const { walls } = split(buildRoom(RECT, H, TOKENS, null));
    // Centre and inward facing of the four walls of the 144×168×96 room before outlines.
    const before: { c: [number, number, number]; n: [number, number, number] }[] = [
      { c: [72, 48, 0], n: [0, 0, 1] },
      { c: [72, 48, 168], n: [0, 0, -1] },
      { c: [0, 48, 84], n: [1, 0, 0] },
      { c: [144, 48, 84], n: [-1, 0, 0] },
    ];
    const seen = walls.map((w) => ({ c: centreOf(w), n: frontNormals(w)[0] as THREE.Vector3 }));
    for (const { c, n } of before) {
      const match = seen.filter((s) => s.c.distanceTo(new THREE.Vector3(...c)) < 1e-9
        && s.n.distanceTo(new THREE.Vector3(...n)) < 1e-9);
      expect(match).toHaveLength(1);
    }
  });

  it('builds six inward walls for the L-shape, the two at the reflex corner facing into the room', () => {
    expectEachWallSpansAndFacesInward(L_SHAPE, H);
    const { walls } = split(buildRoom(L_SHAPE, H, TOKENS, null));
    const down = wallBetween(walls, { x: 72, y: 0 }, { x: 72, y: 84 }, H);
    const across = wallBetween(walls, { x: 72, y: 84 }, { x: 144, y: 84 }, H);
    // The wall down from (72, 0) faces −X (towards x < 72); the wall across faces +Z (towards y > 84).
    expectVec(frontNormals(down)[0] as THREE.Vector3, -1, 0, 0);
    expectVec(frontNormals(across)[0] as THREE.Vector3, 0, 0, 1);
  });

  it('raises every wall to the given height, single-sided, receiving but not casting shadows', () => {
    const { walls } = split(buildRoom(L_SHAPE, 110, TOKENS, null));
    for (const wall of walls) {
      const ys = worldVertices(wall).map((p) => p.y);
      expect(Math.min(...ys)).toBeCloseTo(0, 9);
      expect(Math.max(...ys)).toBeCloseTo(110, 9);
      expect(wall.material.side).toBe(THREE.FrontSide);
      expect(wall.castShadow).toBe(false);
      expect(wall.receiveShadow).toBe(true);
      expect(wall.material.roughness).toBe(1);
    }
  });

  it('colours the walls with the n100 token', () => {
    const { walls } = split(buildRoom(RECT, H, TOKENS, null));
    for (const wall of walls) expect(wall.material.color.getHexString()).toBe('f5f5f8');
  });

  it('uses the given texture as the floor map', () => {
    const texture = new THREE.Texture();
    const { floor } = split(buildRoom(RECT, H, TOKENS, texture));
    expect(floor.material.map).toBe(texture);
  });

  it('leaves the floor unmapped when no texture is given', () => {
    const { floor } = split(buildRoom(RECT, H, TOKENS, null));
    expect(floor.material.map).toBeNull();
  });
});

describe('createFloorTexture', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null without throwing when no 2D canvas context is available (jsdom)', () => {
    // jsdom's getContext() returns null; stub that result so jsdom does not print its
    // "Not implemented" line.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    let texture: THREE.CanvasTexture | null | undefined;
    expect(() => {
      texture = createFloorTexture();
    }).not.toThrow();
    expect(texture).toBeNull();
  });

  describe('with a 2D context', () => {

    it('draws a 512² plank canvas into a repeating sRGB texture, one repeat per 64 in of UV', () => {
      const fillRect = vi.fn();
      const fake = { fillStyle: '', fillRect } as unknown as CanvasRenderingContext2D;
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake);
      const tex = createFloorTexture();
      if (!tex) throw new Error('expected a texture');
      const canvas = tex.image as HTMLCanvasElement;
      expect(canvas.width).toBe(512);
      expect(canvas.height).toBe(512);
      expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      expect(tex.repeat.x).toBeCloseTo(1 / 64, 12);
      expect(tex.repeat.y).toBeCloseTo(1 / 64, 12);
      expect(tex.anisotropy).toBe(4);
      // Eight 64 px rows, each closed by a full-width seam line.
      const seams = fillRect.mock.calls.filter((c) => c[0] === 0 && c[2] === 512 && c[3] === 1.5);
      expect(seams.map((c) => c[1])).toEqual([0, 64, 128, 192, 256, 320, 384, 448]);
    });

    it('draws the same planks every time (seed 7)', () => {
      const runs = [0, 1].map(() => {
        const fillRect = vi.fn();
        const fake = { fillStyle: '', fillRect } as unknown as CanvasRenderingContext2D;
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake);
        createFloorTexture();
        vi.restoreAllMocks();
        return fillRect.mock.calls;
      });
      expect(runs[0]).toEqual(runs[1]);
      expect(runs[0]?.length).toBeGreaterThan(16);
    });
  });
});
