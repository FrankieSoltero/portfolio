import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Corner, Door, Opening, Point, WindowOpening } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { rectRoom } from '../test/fixtures';
import { buildRoom, createFloorTexture, wallHoles, type WallHole } from './roomMesh';

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

/** The room R of the brief: 144 × 168 × 96, corners c1…c4. */
const R = rectRoom(144, 168, 96).outline;
const D1: Door = { id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const W1: WindowOpening = { id: 'w1', kind: 'window', wallId: 'c2', offset: 100, width: 36, sill: 36, height: 48 };

/** The wall of `walls` lying in the vertical plane of the wall from a to b (glass excluded). */
function wallOn(walls: StdMesh[], a: Point, b: Point): StdMesh {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const n = inwardNormal(a, b);
  const onPlane = (m: StdMesh) => worldVertices(m).every((p) =>
    Math.abs((p.x - a.x) * n.x + (p.z - a.y) * n.z) < 1e-9);
  const found = walls.filter((w) => !w.material.transparent && onPlane(w)
    && worldVertices(w).some((p) => Math.abs(p.x - b.x) + Math.abs(p.z - b.y) < 1e-9)
    && len > 0);
  if (found.length !== 1 || !found[0]) throw new Error(`expected one wall on (${a.x},${a.y})–(${b.x},${b.y})`);
  return found[0];
}

/** Every vertex of the mesh as (along, up) in the frame of the wall from a to b. */
function wallFrame(mesh: THREE.Mesh, a: Point, b: Point): THREE.Vector2[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  return worldVertices(mesh).map((p) => new THREE.Vector2((p.x - a.x) * ux + (p.z - a.y) * uy, p.y));
}

/** True when some triangle of the mesh contains the point `along` in from a and `up` above the floor. */
function covers(mesh: THREE.Mesh, a: Point, b: Point, along: number, up: number): boolean {
  const v = wallFrame(mesh, a, b);
  const p = new THREE.Vector2(along, up);
  return triangles(mesh.geometry).some(([i, j, k]) => {
    const [pa, pb, pc] = [v[i], v[j], v[k]] as [THREE.Vector2, THREE.Vector2, THREE.Vector2];
    const side = (s: THREE.Vector2, t: THREE.Vector2) => (t.x - s.x) * (p.y - s.y) - (t.y - s.y) * (p.x - s.x);
    const d1 = side(pa, pb);
    const d2 = side(pb, pc);
    const d3 = side(pc, pa);
    const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
    const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
    return !(neg && pos);
  });
}

/** Total area of the mesh's triangles. */
function areaOf(mesh: THREE.Mesh): number {
  const v = worldVertices(mesh);
  return triangles(mesh.geometry).reduce((sum, [a, b, c]) => {
    const [pa, pb, pc] = [v[a], v[b], v[c]] as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    return sum + pb.clone().sub(pa).cross(pc.clone().sub(pa)).length() / 2;
  }, 0);
}

function expectFacesInward(mesh: THREE.Mesh, a: Point, b: Point): void {
  const n = inwardNormal(a, b);
  const normals = frontNormals(mesh);
  expect(normals.length).toBeGreaterThan(0);
  for (const normal of normals) expectVec(normal, n.x, n.y, n.z);
}

const [C1, C2, C3] = R as [Corner, Corner, Corner, Corner];

describe('buildRoom with holes', () => {
  const holes = (openings: Opening[]): WallHole[][] => wallHoles(R, openings, H);

  it('cuts a door (touching the floor) out of its wall, which still faces inward', () => {
    const { walls } = split(buildRoom(R, H, TOKENS, null, holes([D1])));
    const wall = wallOn(walls, C1, C2);
    expect(covers(wall, C1, C2, 36, 40)).toBe(false);
    expect(covers(wall, C1, C2, 10, 40)).toBe(true);
    expect(covers(wall, C1, C2, 36, 90)).toBe(true);
    expect(covers(wall, C1, C2, 100, 5)).toBe(true);
    expectFacesInward(wall, C1, C2);
    expect(areaOf(wall)).toBeCloseTo(144 * 96 - 32 * 80, 6);
    expect(wall.material.side).toBe(THREE.FrontSide);
    expect(wall.receiveShadow).toBe(true);
    expect(wall.castShadow).toBe(false);
    expect(wall.material.color.getHexString()).toBe('f5f5f8');
    expect(wall.material.roughness).toBe(1);
  });

  it('cuts a window (strictly inside) out of its wall, covering below and above it', () => {
    const { walls } = split(buildRoom(R, H, TOKENS, null, holes([W1])));
    const wall = wallOn(walls, C2, C3);
    expect(covers(wall, C2, C3, 118, 60)).toBe(false);
    expect(covers(wall, C2, C3, 118, 20)).toBe(true);
    expect(covers(wall, C2, C3, 118, 90)).toBe(true);
    expect(covers(wall, C2, C3, 90, 60)).toBe(true);
    expect(covers(wall, C2, C3, 150, 60)).toBe(true);
    expectFacesInward(wall, C2, C3);
    expect(areaOf(wall)).toBeCloseTo(168 * 96 - 36 * 48, 6);
  });

  it('cuts a full-height opening (touching floor and ceiling), leaving the wall either side', () => {
    const { walls } = split(buildRoom(R, H, TOKENS, null, holes([{ ...D1, height: 120 }])));
    const wall = wallOn(walls, C1, C2);
    for (const up of [1, 40, 95]) expect(covers(wall, C1, C2, 36, up)).toBe(false);
    expect(covers(wall, C1, C2, 10, 95)).toBe(true);
    expect(covers(wall, C1, C2, 60, 1)).toBe(true);
    expectFacesInward(wall, C1, C2);
    expect(areaOf(wall)).toBeCloseTo(144 * 96 - 32 * 96, 6);
  });

  it('cuts two holes from one wall', () => {
    const second: Opening = { ...W1, id: 'w2', wallId: 'c1', offset: 80 };
    const { walls } = split(buildRoom(R, H, TOKENS, null, holes([D1, second])));
    const wall = wallOn(walls, C1, C2);
    expect(covers(wall, C1, C2, 36, 40)).toBe(false);
    expect(covers(wall, C1, C2, 98, 60)).toBe(false);
    expect(covers(wall, C1, C2, 66, 60)).toBe(true);
    expect(covers(wall, C1, C2, 98, 20)).toBe(true);
    expectFacesInward(wall, C1, C2);
    expect(areaOf(wall)).toBeCloseTo(144 * 96 - 32 * 80 - 36 * 48, 6);
  });

  it('fills a window hole with one transparent pane in the wall plane, facing inward, casting no shadow', () => {
    const group = buildRoom(R, H, TOKENS, null, holes([W1]));
    group.updateMatrixWorld(true);
    const glass = meshes(group).filter((m) => m.material.transparent);
    expect(glass).toHaveLength(1);
    const [pane] = glass as [StdMesh];
    const v = wallFrame(pane, C2, C3);
    const along = v.map((p) => p.x);
    const up = v.map((p) => p.y);
    expect(Math.min(...along)).toBeCloseTo(100, 9);
    expect(Math.max(...along)).toBeCloseTo(136, 9);
    expect(Math.min(...up)).toBeCloseTo(36, 9);
    expect(Math.max(...up)).toBeCloseTo(84, 9);
    for (const p of worldVertices(pane)) expect(p.x).toBeCloseTo(144, 9);
    expectFacesInward(pane, C2, C3);
    expect(pane.material.transparent).toBe(true);
    expect(pane.material.opacity).toBeLessThan(1);
    expect(pane.material.opacity).toBeGreaterThan(0);
    expect(pane.castShadow).toBe(false);
    expect(pane.material.color.getHexString()).toBe('dde1ff');
  });

  it('puts no pane in a door', () => {
    const group = buildRoom(R, H, TOKENS, null, holes([D1]));
    expect(meshes(group).filter((m) => m.material.transparent)).toHaveLength(0);
    expect(meshes(group)).toHaveLength(5);
  });

  it('builds the same meshes with empty hole lists as without the argument', () => {
    const plain = split(buildRoom(L_SHAPE, H, TOKENS, null));
    const empty = split(buildRoom(L_SHAPE, H, TOKENS, null, L_SHAPE.map(() => [])));
    expect(meshes(buildRoom(L_SHAPE, H, TOKENS, null, L_SHAPE.map(() => [])))).toHaveLength(7);
    const shape = (walls: StdMesh[]) => walls.map((w) => ({
      type: w.geometry.type,
      v: uniqueKeys(worldVertices(w)),
      n: frontNormals(w).map(key),
    }));
    expect(shape(empty.walls)).toEqual(shape(plain.walls));
    expect(uniqueKeys(worldVertices(empty.floor))).toEqual(uniqueKeys(worldVertices(plain.floor)));
  });
});

describe('buildRoom opening frames', () => {
  const DOOR_HOLE: WallHole = { x0: 20, x1: 52, z0: 0, z1: 80, glass: false };
  const WINDOW_HOLE: WallHole = { x0: 100, x1: 136, z0: 36, z1: 84, glass: true };
  /** Holes on wall 0 (C1 to C2) only. */
  const onWall0 = (...cut: WallHole[]): WallHole[][] => R.map((_, i) => (i === 0 ? cut : []));

  function frames(group: THREE.Group): THREE.LineSegments[] {
    group.updateMatrixWorld(true);
    return group.children.filter((c): c is THREE.LineSegments => c.name === 'opening-frames');
  }

  /** The frame's segments as `(along,up)-(along,up)` in the frame of the wall from a to b, sorted. */
  function segmentsInWall(frame: THREE.LineSegments, a: Point, b: Point): string[] {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const pos = frame.geometry.getAttribute('position');
    const at = (i: number): string => {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(frame.matrixWorld);
      const along = (p.x - a.x) * ux + (p.z - a.y) * uy;
      return `(${round6(along)},${round6(p.y)})`;
    };
    const out: string[] = [];
    for (let i = 0; i + 1 < pos.count; i += 2) out.push([at(i), at(i + 1)].sort().join('-'));
    return out.sort();
  }

  /** Signed distance of every frame vertex from the wall's plane, along its inward normal. */
  function offsetsFromWall(frame: THREE.LineSegments, a: Point, b: Point): number[] {
    const n = inwardNormal(a, b);
    const pos = frame.geometry.getAttribute('position');
    const out: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(frame.matrixWorld);
      out.push((p.x - a.x) * n.x + (p.z - a.y) * n.z);
    }
    return out;
  }

  const seg = (p: [number, number], q: [number, number]): string =>
    [`(${round6(p[0])},${round6(p[1])})`, `(${round6(q[0])},${round6(q[1])})`].sort().join('-');

  it('frames a door hole with its two jambs and its head, just inside the wall, in the text colour', () => {
    const found = frames(buildRoom(R, H, TOKENS, null, onWall0(DOOR_HOLE)));
    expect(found).toHaveLength(1);
    const [frame] = found as [THREE.LineSegments];
    expect(frame).toBeInstanceOf(THREE.LineSegments);
    // SceneRenderer's disposeTree frees the geometry and material of every THREE.Line.
    expect(frame).toBeInstanceOf(THREE.Line);
    expect(segmentsInWall(frame, C1, C2)).toEqual([
      seg([20, 0], [20, 80]), seg([52, 0], [52, 80]), seg([20, 80], [52, 80]),
    ].sort());
    for (const d of offsetsFromWall(frame, C1, C2)) expect(d).toBeCloseTo(0.25, 9);
    const material = frame.material as THREE.Material;
    expect(material).toBeInstanceOf(THREE.LineBasicMaterial);
    expect((material as THREE.LineBasicMaterial).color.getHexString()).toBe('111111');
  });

  it('frames a window hole with its jambs, head and sill', () => {
    const [frame] = frames(buildRoom(R, H, TOKENS, null, onWall0(WINDOW_HOLE))) as [THREE.LineSegments];
    expect(segmentsInWall(frame, C1, C2)).toEqual([
      seg([100, 36], [100, 84]), seg([136, 36], [136, 84]), seg([100, 84], [136, 84]), seg([100, 36], [136, 36]),
    ].sort());
  });

  it('puts every frame of one wall in one object', () => {
    const [frame, ...rest] = frames(buildRoom(R, H, TOKENS, null, onWall0(DOOR_HOLE, WINDOW_HOLE)));
    expect(rest).toHaveLength(0);
    if (!frame) throw new Error('no frame');
    expect(segmentsInWall(frame, C1, C2)).toHaveLength(7);
  });

  it('gives a wall without holes no frame object', () => {
    expect(frames(buildRoom(R, H, TOKENS, null, onWall0(DOOR_HOLE)))).toHaveLength(1);
    expect(frames(buildRoom(R, H, TOKENS, null, R.map(() => [])))).toHaveLength(0);
    expect(frames(buildRoom(R, H, TOKENS, null))).toHaveLength(0);
  });
});
