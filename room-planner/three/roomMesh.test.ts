import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { buildRoom, createFloorTexture } from './roomMesh';

const ROOM: Room = { w: 144, l: 168, h: 96 };
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

type StdMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;

function meshes(group: THREE.Group): StdMesh[] {
  return group.children.filter((c): c is StdMesh => c instanceof THREE.Mesh);
}

/** The floor is the one mesh whose plane lies flat (normal along +Y). */
function split(group: THREE.Group): { floor: StdMesh; walls: StdMesh[] } {
  group.updateMatrixWorld(true);
  const all = meshes(group);
  const isFloor = (m: StdMesh) => worldNormal(m).y > 0.99;
  const floor = all.find(isFloor);
  if (!floor) throw new Error('no floor mesh');
  return { floor, walls: all.filter((m) => !isFloor(m)) };
}

function worldNormal(mesh: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
}

describe('buildRoom', () => {
  it('builds five meshes: one floor and four walls', () => {
    const group = buildRoom(ROOM, TOKENS, null);
    expect(meshes(group)).toHaveLength(5);
    const { walls } = split(group);
    expect(walls).toHaveLength(4);
  });

  it('lays a W×L floor plane flat at the room centre that receives shadows', () => {
    const { floor } = split(buildRoom(ROOM, TOKENS, null));
    expect(floor.geometry.parameters.width).toBe(144);
    expect(floor.geometry.parameters.height).toBe(168);
    expect(floor.position.toArray()).toEqual([72, 0, 84]);
    expect(floor.rotation.x).toBeCloseTo(-Math.PI / 2, 10);
    expect(floor.receiveShadow).toBe(true);
    expect(floor.material.roughness).toBe(0.75);
  });

  it('faces every wall inward, front-side only, receiving but not casting shadows', () => {
    const { walls } = split(buildRoom(ROOM, TOKENS, null));
    const centre = new THREE.Vector3(72, 48, 84);
    for (const wall of walls) {
      const pos = wall.getWorldPosition(new THREE.Vector3());
      const toCentre = centre.clone().sub(pos).normalize();
      expect(worldNormal(wall).dot(toCentre)).toBeGreaterThan(0.99);
      expect(pos.y).toBeCloseTo(48, 10);
      expect(wall.geometry.parameters.height).toBe(96);
      expect(wall.material.side).toBe(THREE.FrontSide);
      expect(wall.castShadow).toBe(false);
      expect(wall.receiveShadow).toBe(true);
      expect(wall.material.roughness).toBe(1);
    }
    const widths = walls.map((w) => w.geometry.parameters.width).sort((a, b) => a - b);
    expect(widths).toEqual([144, 144, 168, 168]);
  });

  it('colours the walls with the n100 token', () => {
    const { walls } = split(buildRoom(ROOM, TOKENS, null));
    for (const wall of walls) expect(wall.material.color.getHexString()).toBe('f5f5f8');
  });

  it('uses the given texture as the floor map', () => {
    const texture = new THREE.Texture();
    const { floor } = split(buildRoom(ROOM, TOKENS, texture));
    expect(floor.material.map).toBe(texture);
  });

  it('leaves the floor unmapped when no texture is given', () => {
    const { floor } = split(buildRoom(ROOM, TOKENS, null));
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
      texture = createFloorTexture(ROOM);
    }).not.toThrow();
    expect(texture).toBeNull();
  });

  describe('with a 2D context', () => {

    it('draws a 512² plank canvas into a repeating sRGB texture', () => {
      const fillRect = vi.fn();
      const fake = { fillStyle: '', fillRect } as unknown as CanvasRenderingContext2D;
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fake);
      const tex = createFloorTexture(ROOM);
      if (!tex) throw new Error('expected a texture');
      const canvas = tex.image as HTMLCanvasElement;
      expect(canvas.width).toBe(512);
      expect(canvas.height).toBe(512);
      expect(tex.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      expect(tex.repeat.x).toBeCloseTo(144 / 64, 10);
      expect(tex.repeat.y).toBeCloseTo(168 / 64, 10);
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
        createFloorTexture(ROOM);
        vi.restoreAllMocks();
        return fillRect.mock.calls;
      });
      expect(runs[0]).toEqual(runs[1]);
      expect(runs[0]?.length).toBeGreaterThan(16);
    });
  });
});
