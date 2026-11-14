import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import type { Conflicts, Item, Room } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import { computeCameraPose } from '../view/camera';
import type { PaneRect } from '../view/panes';
import { SceneRenderer, type RendererLike, type SceneInput } from './SceneRenderer';

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

const PANE: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 1000 };

interface FakeRenderer extends RendererLike {
  renders: { scene: THREE.Scene; camera: THREE.Camera }[];
  setPixelRatio: ReturnType<typeof vi.fn<RendererLike['setPixelRatio']>>;
  setSize: ReturnType<typeof vi.fn<RendererLike['setSize']>>;
  dispose: ReturnType<typeof vi.fn<RendererLike['dispose']>>;
  forceContextLoss: ReturnType<typeof vi.fn<RendererLike['forceContextLoss']>>;
}

/** A renderer stand-in: records render calls instead of drawing, so no WebGL is needed. */
function fakeRenderer(): FakeRenderer {
  const renders: FakeRenderer['renders'] = [];
  return {
    renders,
    shadowMap: { enabled: false, type: THREE.BasicShadowMap } as unknown as THREE.WebGLShadowMap,
    outputColorSpace: THREE.LinearSRGBColorSpace,
    setPixelRatio: vi.fn<RendererLike['setPixelRatio']>(),
    setSize: vi.fn<RendererLike['setSize']>(),
    dispose: vi.fn<RendererLike['dispose']>(),
    forceContextLoss: vi.fn<RendererLike['forceContextLoss']>(),
    render: vi.fn((scene: THREE.Object3D, camera: THREE.Camera) => {
      renders.push({ scene: scene as THREE.Scene, camera });
    }),
  };
}

function seedItems(): Item[] {
  return createInitialDocument().items;
}

function input(over: Partial<SceneInput> = {}): SceneInput {
  const room: Room = over.room ?? { w: 144, l: 168, h: 96 };
  return {
    room,
    items: seedItems(),
    selectedId: null,
    conflicts: {},
    pose: computeCameraPose(room, { ...CONFIG.camera }, PANE),
    width: PANE.w,
    height: PANE.h,
    pixelRatio: 2,
    ...over,
  };
}

let fake: FakeRenderer;
let sr: SceneRenderer;

function lastScene(): THREE.Scene {
  const last = fake.renders.at(-1);
  if (!last) throw new Error('nothing rendered');
  return last.scene;
}

function lastCamera(): THREE.PerspectiveCamera {
  const cam = fake.renders.at(-1)?.camera;
  if (!(cam instanceof THREE.PerspectiveCamera)) throw new Error('no perspective camera rendered');
  return cam;
}

function groupOf(id: string): THREE.Object3D | undefined {
  return lastScene().children.find((c) => c.name === id);
}

function roomGroup(): THREE.Object3D | undefined {
  return lastScene().children.find((c) => c.name === 'room');
}

function outlineOf(id: string): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const outline: unknown = groupOf(id)?.userData.outline;
  if (!(outline instanceof THREE.LineSegments)) throw new Error(`no outline for ${id}`);
  return outline as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
}

function lightsOf<T extends THREE.Light>(type: new (...args: never[]) => T): T[] {
  return lastScene().children.filter((c): c is T => c instanceof type);
}

function sun(): THREE.DirectionalLight {
  const [s] = lightsOf(THREE.DirectionalLight);
  if (!s) throw new Error('no sun');
  return s;
}

/** Counts 'dispose' events from every geometry, material and texture under `root`. */
function watchDisposal(root: THREE.Object3D): { total: number; disposed: () => number } {
  const resources = new Set<THREE.EventDispatcher<{ dispose: object }>>();
  root.traverse((node) => {
    if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments) {
      resources.add(node.geometry as THREE.BufferGeometry);
      const mats = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.Material[];
      for (const m of mats) {
        resources.add(m);
        if ('map' in m && m.map instanceof THREE.Texture) resources.add(m.map);
      }
    }
  });
  let count = 0;
  resources.forEach((r) => r.addEventListener('dispose', () => count++));
  return { total: resources.size, disposed: () => count };
}

beforeEach(() => {
  // jsdom has no 2D canvas; a stub context lets the floor texture (and its disposal) exist.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => new Proxy({}, { get: () => () => undefined, set: () => true })) as unknown as HTMLCanvasElement['getContext'],
  );
  fake = fakeRenderer();
  sr = new SceneRenderer(document.createElement('canvas'), TOKENS, () => fake);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SceneRenderer', () => {
  it('configures the renderer for sRGB output and PCF shadows', () => {
    expect(fake.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(fake.shadowMap.enabled).toBe(true);
    expect(fake.shadowMap.type).toBe(THREE.PCFShadowMap);
  });

  it('lights the scene with one hemisphere light and one shadow-casting sun', () => {
    sr.update(input());
    const hemis = lightsOf(THREE.HemisphereLight);
    const suns = lightsOf(THREE.DirectionalLight);
    expect(hemis).toHaveLength(1);
    expect(suns).toHaveLength(1);
    const [hemi] = hemis;
    expect(hemi?.color.getHex()).toBe(0xffffff);
    expect(hemi?.groundColor.getHex()).toBe(0xd8d2c8);
    expect(hemi?.intensity).toBe(CONFIG.hemiIntensity);
    const s = sun();
    expect(s.color.getHex()).toBe(0xffffff);
    expect(s.intensity).toBe(CONFIG.sunIntensity);
    expect(s.castShadow).toBe(true);
    expect(s.shadow.mapSize.x).toBe(2048);
    expect(s.shadow.mapSize.y).toBe(2048);
    expect(s.shadow.bias).toBe(-0.0006);
    expect(s.shadow.normalBias).toBe(0.4);
    expect(s.shadow.radius).toBe(3);
    expect(s.shadow.camera.near).toBe(1);
    expect(s.shadow.camera.far).toBeCloseTo(Math.hypot(144, 168, 96) * 5, 10);
  });

  it('renders exactly once per update', () => {
    sr.update(input());
    expect(fake.render).toHaveBeenCalledTimes(1);
  });

  it('places an item group at its footprint centre, turned by its rotation', () => {
    sr.update(input());
    const g = groupOf('seed-desk');
    expect(g).toBeDefined();
    expect(g?.position.x).toBeCloseTo(131, 10);
    expect(g?.position.y).toBe(0);
    expect(g?.position.z).toBeCloseTo(131.5, 10);
    expect(g?.rotation.y).toBeCloseTo(-Math.PI / 2, 10);
  });

  it('reuses an item group when the item only moves', () => {
    const items = seedItems();
    sr.update(input({ items }));
    const before = groupOf('seed-desk');
    const moved = items.map((i) => (i.id === 'seed-desk' ? { ...i, x: 20, y: 30 } : i));
    sr.update(input({ items: moved }));
    const after = groupOf('seed-desk');
    expect(after).toBe(before);
    expect(after?.position.x).toBeCloseTo(33, 10);
    expect(after?.position.z).toBeCloseTo(57.5, 10);
  });

  it('rebuilds an item group when its size changes, disposing the old one', () => {
    const items = seedItems();
    sr.update(input({ items }));
    const before = groupOf('seed-desk');
    if (!before) throw new Error('no desk group');
    const watch = watchDisposal(before);
    const resized = items.map((i) => (i.id === 'seed-desk' ? { ...i, w: 60 } : i));
    sr.update(input({ items: resized }));
    const after = groupOf('seed-desk');
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    expect(lastScene().children).not.toContain(before);
    expect(watch.disposed()).toBe(watch.total);
  });

  it('removes and disposes the group of an item that is gone', () => {
    const items = seedItems();
    sr.update(input({ items }));
    const before = groupOf('seed-desk');
    if (!before) throw new Error('no desk group');
    const watch = watchDisposal(before);
    sr.update(input({ items: items.filter((i) => i.id !== 'seed-desk') }));
    expect(groupOf('seed-desk')).toBeUndefined();
    expect(lastScene().children).not.toContain(before);
    expect(watch.disposed()).toBe(watch.total);
  });

  it('rebuilds the room only when its dimensions change, disposing the old one with its floor texture', () => {
    sr.update(input());
    const first = roomGroup();
    expect(first).toBeDefined();
    if (!first) return;
    sr.update(input());
    expect(roomGroup()).toBe(first);
    const watch = watchDisposal(first);
    expect(watch.total).toBeGreaterThan(0);
    const textures: THREE.Texture[] = [];
    first.traverse((n) => {
      if (n instanceof THREE.Mesh && n.material instanceof THREE.MeshStandardMaterial && n.material.map) {
        textures.push(n.material.map);
      }
    });
    expect(textures).toHaveLength(1);
    sr.update(input({ room: { w: 150, l: 168, h: 96 } }));
    const second = roomGroup();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(lastScene().children).not.toContain(first);
    expect(watch.disposed()).toBe(watch.total);
  });

  it('points the sun at the room centre and fits the shadow camera to the room', () => {
    sr.update(input());
    const s = sun();
    expect(s.position.x).toBeCloseTo(0, 10);
    expect(s.position.y).toBeCloseTo(230.4, 10);
    expect(s.position.z).toBeCloseTo(235.2, 10);
    expect(s.target.position.x).toBeCloseTo(72, 10);
    expect(s.target.position.y).toBeCloseTo(0, 10);
    expect(s.target.position.z).toBeCloseTo(84, 10);
    expect(lastScene().children).toContain(s.target);
    const r = Math.hypot(144, 168) / 2 + 24;
    const sc = s.shadow.camera;
    expect(sc.left).toBeCloseTo(-r, 10);
    expect(sc.right).toBeCloseTo(r, 10);
    expect(sc.top).toBeCloseTo(r, 10);
    expect(sc.bottom).toBeCloseTo(-r, 10);
  });

  it('shows the selected item outline in the accent colour', () => {
    sr.update(input({ selectedId: 'seed-desk' }));
    const ol = outlineOf('seed-desk');
    expect(ol.visible).toBe(true);
    expect(ol.material.color.getHex()).toBe(new THREE.Color(TOKENS.a700).getHex());
  });

  it('shows a conflicting item outline in the text colour', () => {
    const conflicts: Conflicts = { 'seed-desk': 'overlaps bed' };
    sr.update(input({ conflicts }));
    const ol = outlineOf('seed-desk');
    expect(ol.visible).toBe(true);
    expect(ol.material.color.getHex()).toBe(new THREE.Color(TOKENS.text).getHex());
  });

  it('hides the outline of an item that is neither selected nor conflicting', () => {
    sr.update(input({ selectedId: 'seed-desk' }));
    sr.update(input());
    expect(outlineOf('seed-desk').visible).toBe(false);
  });

  it('places the camera from the pose, mapping plan y to three z', () => {
    const pose = computeCameraPose({ w: 144, l: 168, h: 96 }, { yaw: 0.3, pitch: 0.7, zoom: 1.3 }, PANE);
    sr.update(input({ pose }));
    const cam = lastCamera();
    expect(cam.fov).toBeCloseTo(pose.fovDeg, 10);
    expect(cam.aspect).toBeCloseTo(pose.aspect, 10);
    expect(cam.near).toBe(1);
    expect(cam.far).toBeCloseTo(pose.distance * 5, 10);
    expect(cam.position.x).toBeCloseTo(pose.position[0], 10);
    expect(cam.position.y).toBeCloseTo(pose.position[2], 10);
    expect(cam.position.z).toBeCloseTo(pose.position[1], 10);
    const target = new THREE.Vector3(pose.target[0], pose.target[2], pose.target[1]);
    const toTarget = target.sub(cam.position).normalize();
    const facing = cam.getWorldDirection(new THREE.Vector3());
    expect(facing.dot(toTarget)).toBeCloseTo(1, 10);
  });

  it('applies the pose view offset, and clears it when the offset is zero', () => {
    const base = input();
    sr.update({ ...base, pose: { ...base.pose, viewOffsetX: 196 } });
    const cam = lastCamera();
    expect(cam.view?.enabled).toBe(true);
    expect(cam.view?.offsetX).toBe(196);
    expect(cam.view?.offsetY).toBe(0);
    expect(cam.view?.fullWidth).toBe(PANE.w);
    expect(cam.view?.fullHeight).toBe(PANE.h);
    expect(cam.view?.width).toBe(PANE.w);
    expect(cam.view?.height).toBe(PANE.h);
    sr.update({ ...base, pose: { ...base.pose, viewOffsetX: 0 } });
    expect(lastCamera().view?.enabled ?? false).toBe(false);
  });

  it('resizes the renderer only when the size or pixel ratio changes', () => {
    sr.update(input());
    expect(fake.setPixelRatio).toHaveBeenCalledTimes(1);
    expect(fake.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(fake.setSize).toHaveBeenCalledTimes(1);
    expect(fake.setSize).toHaveBeenLastCalledWith(1000, 600, false);
    sr.update(input());
    expect(fake.setPixelRatio).toHaveBeenCalledTimes(1);
    expect(fake.setSize).toHaveBeenCalledTimes(1);
    sr.update(input({ width: 800 }));
    expect(fake.setSize).toHaveBeenCalledTimes(2);
    expect(fake.setSize).toHaveBeenLastCalledWith(800, 600, false);
    sr.update(input({ width: 800, pixelRatio: 1 }));
    expect(fake.setPixelRatio).toHaveBeenCalledTimes(3);
    expect(fake.setPixelRatio).toHaveBeenLastCalledWith(1);
  });

  it('disposes the renderer once and empties the scene, releasing every resource', () => {
    sr.update(input());
    const scene = lastScene();
    const watch = watchDisposal(scene);
    sr.dispose();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
    expect(watch.disposed()).toBe(watch.total);
  });

  it('forces the context loss exactly once, after disposing the renderer', () => {
    sr.update(input());
    sr.dispose();
    expect(fake.forceContextLoss).toHaveBeenCalledTimes(1);
    const [disposeOrder] = fake.dispose.mock.invocationCallOrder;
    const [lossOrder] = fake.forceContextLoss.mock.invocationCallOrder;
    expect(lossOrder).toBeGreaterThan(disposeOrder ?? Infinity);
  });

  it('does nothing on a second dispose', () => {
    sr.update(input());
    sr.dispose();
    sr.dispose();
    expect(fake.dispose).toHaveBeenCalledTimes(1);
    expect(fake.forceContextLoss).toHaveBeenCalledTimes(1);
  });

  it('does not render after dispose', () => {
    sr.update(input());
    expect(fake.renders).toHaveLength(1);
    sr.dispose();
    sr.update(input());
    expect(fake.renders).toHaveLength(1);
  });
});
