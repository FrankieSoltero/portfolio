import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { CONFIG } from '../config';
import { defaultColours, defaultStyle, TYPICAL_SIZE } from '../domain/furniture/recipe';
import type { Item, Kind } from '../domain/types';
import { buildFurniture } from './furnitureModels';
import {
  disposePreviewRenderer,
  renderPieceSnapshot,
  setPreviewRendererFactory,
  type PreviewRenderer,
} from './previewSnapshot';

// buildFurniture passes through to the real one, so a test can reach the group it returned.
vi.mock('./furnitureModels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./furnitureModels')>();
  return { ...actual, buildFurniture: vi.fn(actual.buildFurniture) };
});

type Spec = Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h' | 'style' | 'colours'>;

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const FOV = 35;
const MARGIN = 1.15;
const VIEW_DIRECTION = new THREE.Vector3(1, 0.8, 1.4).normalize();

function spec(kind: Kind = 'sofa'): Spec {
  return { id: `item-${kind}`, kind, ...TYPICAL_SIZE[kind], style: defaultStyle(kind), colours: defaultColours(kind) };
}

interface Frame { scene: THREE.Scene; camera: THREE.Camera }

interface FakeRenderer extends PreviewRenderer {
  canvas: HTMLCanvasElement;
  frames: Frame[];
  /** dispose spies attached to every geometry and material in the scene at render time. */
  resourceSpies: ReturnType<typeof vi.fn>[];
  setPixelRatio: ReturnType<typeof vi.fn<PreviewRenderer['setPixelRatio']>>;
  setSize: ReturnType<typeof vi.fn<PreviewRenderer['setSize']>>;
  setClearColor: ReturnType<typeof vi.fn<PreviewRenderer['setClearColor']>>;
  dispose: ReturnType<typeof vi.fn<PreviewRenderer['dispose']>>;
  forceContextLoss: ReturnType<typeof vi.fn<PreviewRenderer['forceContextLoss']>>;
}

/** A renderer stand-in: records each frame and watches the frame's resources instead of drawing. */
function fakeRenderer(canvas: HTMLCanvasElement): FakeRenderer {
  const frames: Frame[] = [];
  const resourceSpies: ReturnType<typeof vi.fn>[] = [];
  return {
    canvas,
    frames,
    resourceSpies,
    outputColorSpace: THREE.LinearSRGBColorSpace,
    setPixelRatio: vi.fn<PreviewRenderer['setPixelRatio']>(),
    setSize: vi.fn<PreviewRenderer['setSize']>(),
    setClearColor: vi.fn<PreviewRenderer['setClearColor']>(),
    dispose: vi.fn<PreviewRenderer['dispose']>(),
    forceContextLoss: vi.fn<PreviewRenderer['forceContextLoss']>(),
    render: vi.fn((scene: THREE.Object3D, camera: THREE.Camera) => {
      frames.push({ scene: scene as THREE.Scene, camera });
      const resources = new Set<{ dispose(): void }>();
      scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh || node instanceof THREE.LineSegments)) return;
        resources.add(node.geometry as THREE.BufferGeometry);
        const materials = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.Material[];
        materials.forEach((m) => resources.add(m));
      });
      resources.forEach((r) => resourceSpies.push(vi.spyOn(r, 'dispose') as unknown as ReturnType<typeof vi.fn>));
    }),
  };
}

let made: FakeRenderer[];
let toDataURL: MockInstance<HTMLCanvasElement['toDataURL']>;

function useFakes(): void {
  setPreviewRendererFactory((canvas) => {
    const fake = fakeRenderer(canvas);
    made.push(fake);
    return fake;
  });
}

function only(): FakeRenderer {
  const [fake] = made;
  if (!fake || made.length !== 1) throw new Error(`expected one renderer, got ${made.length}`);
  return fake;
}

function lastFrame(): Frame {
  const frame = only().frames.at(-1);
  if (!frame) throw new Error('nothing rendered');
  return frame;
}

function builtGroup(call = 0): THREE.Group {
  const result = vi.mocked(buildFurniture).mock.results[call];
  if (result?.type !== 'return') throw new Error('buildFurniture did not return');
  return result.value;
}

beforeEach(() => {
  made = [];
  toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG);
});

afterEach(() => {
  disposePreviewRenderer();
  setPreviewRendererFactory(null);
  vi.restoreAllMocks();
  vi.mocked(buildFurniture).mockClear();
});

describe('renderPieceSnapshot', () => {
  it('returns null without an error when WebGL is unavailable (jsdom)', () => {
    toDataURL.mockRestore();
    // jsdom answers every getContext with null and prints "Not implemented"; give the same answer
    // without the notice. The real THREE.WebGLRenderer then fails, and three reports it on the console.
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let result: string | null | undefined;
    expect(() => { result = renderPieceSnapshot(spec()); }).not.toThrow();
    expect(result).toBeNull();
    expect(getContext).toHaveBeenCalled();
  });

  it('returns null when constructing the renderer throws', () => {
    setPreviewRendererFactory(() => { throw new Error('Error creating WebGL context.'); });
    expect(renderPieceSnapshot(spec())).toBeNull();
  });

  it('returns null when rendering throws, still disposing the piece', () => {
    useFakes();
    renderPieceSnapshot(spec()); // creates the renderer
    const fake = only();
    const record = fake.render;
    // Watch the frame's resources as usual, then fail.
    fake.render = vi.fn((scene: THREE.Object3D, camera: THREE.Camera) => {
      record(scene, camera);
      throw new Error('render failed');
    });
    const before = fake.resourceSpies.length;
    expect(renderPieceSnapshot(spec('chair'))).toBeNull();
    const spies = fake.resourceSpies.slice(before);
    expect(spies.length).toBeGreaterThan(1);
    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('returns null when reading the picture out throws', () => {
    useFakes();
    toDataURL.mockImplementation(() => { throw new Error('tainted'); });
    expect(renderPieceSnapshot(spec())).toBeNull();
  });

  it('returns null when the picture is not a PNG data URL', () => {
    useFakes();
    toDataURL.mockReturnValue('data:,');
    expect(renderPieceSnapshot(spec())).toBeNull();
  });

  it('returns null for a size that is not a positive finite number', () => {
    useFakes();
    expect(renderPieceSnapshot(spec(), 0)).toBeNull();
    expect(renderPieceSnapshot(spec(), -10)).toBeNull();
    expect(renderPieceSnapshot(spec(), Number.NaN)).toBeNull();
    expect(renderPieceSnapshot(spec(), Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('returns the PNG data URL read from the renderer canvas', () => {
    useFakes();
    const url = renderPieceSnapshot(spec());
    expect(url).toBe(PNG);
    expect(url?.startsWith('data:image/png')).toBe(true);
    expect(toDataURL).toHaveBeenCalledWith('image/png');
    expect(toDataURL.mock.contexts[0]).toBe(only().canvas);
  });

  it('renders the group from buildFurniture(spec) with one hemisphere and one directional light', () => {
    useFakes();
    const s = spec();
    renderPieceSnapshot(s);
    expect(buildFurniture).toHaveBeenCalledWith(s);
    const { scene } = lastFrame();
    expect(scene.children).toContain(builtGroup());
    const hemis = scene.children.filter((c) => c instanceof THREE.HemisphereLight);
    const suns = scene.children.filter((c) => c instanceof THREE.DirectionalLight);
    expect(hemis).toHaveLength(1);
    expect(suns).toHaveLength(1);
    expect((hemis[0] as THREE.HemisphereLight).intensity).toBe(CONFIG.hemiIntensity);
    expect((suns[0] as THREE.DirectionalLight).intensity).toBe(CONFIG.sunIntensity);
    expect(scene.children.filter((c) => c instanceof THREE.Light)).toHaveLength(2);
  });

  it('draws a transparent sRGB square of 240 px at pixel ratio 1 by default', () => {
    useFakes();
    renderPieceSnapshot(spec());
    const fake = only();
    expect(fake.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(fake.setPixelRatio).toHaveBeenLastCalledWith(1);
    expect(fake.setSize).toHaveBeenLastCalledWith(240, 240, false);
    expect(fake.setClearColor.mock.lastCall?.[1]).toBe(0);
  });

  it('resizes the renderer to the requested size on each call', () => {
    useFakes();
    renderPieceSnapshot(spec(), 120);
    expect(only().setSize).toHaveBeenLastCalledWith(120, 120, false);
    renderPieceSnapshot(spec(), 320);
    expect(only().setSize).toHaveBeenLastCalledWith(320, 320, false);
  });

  it('frames the piece from the three-quarter direction, fitting its bounding sphere with a 15% margin', () => {
    useFakes();
    renderPieceSnapshot(spec('bed'));
    const { camera } = lastFrame();
    expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    const cam = camera as THREE.PerspectiveCamera;
    expect(cam.fov).toBe(FOV);
    expect(cam.aspect).toBe(1);

    // The piece's box: its visible meshes, leaving out the hidden selection outline.
    const group = builtGroup();
    group.updateMatrixWorld(true);
    const box = new THREE.Box3();
    group.children.filter((c) => c.visible).forEach((c) => box.expandByObject(c));
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const distance = (sphere.radius * MARGIN) / Math.sin(THREE.MathUtils.degToRad(FOV / 2));
    const expected = sphere.center.clone().addScaledVector(VIEW_DIRECTION, distance);
    expect(cam.position.x).toBeCloseTo(expected.x, 6);
    expect(cam.position.y).toBeCloseTo(expected.y, 6);
    expect(cam.position.z).toBeCloseTo(expected.z, 6);
    const looking = cam.getWorldDirection(new THREE.Vector3());
    expect(looking.x).toBeCloseTo(-VIEW_DIRECTION.x, 6);
    expect(looking.y).toBeCloseTo(-VIEW_DIRECTION.y, 6);
    expect(looking.z).toBeCloseTo(-VIEW_DIRECTION.z, 6);
    expect(cam.near).toBeLessThan(distance - sphere.radius);
    expect(cam.far).toBeGreaterThan(distance + sphere.radius);
  });

  it('disposes every geometry and material of the piece once after rendering', () => {
    useFakes();
    renderPieceSnapshot(spec());
    const { resourceSpies } = only();
    expect(resourceSpies.length).toBeGreaterThan(1);
    resourceSpies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });

  it('reuses one lazily created renderer on a canvas that is never attached', () => {
    const factory = vi.fn((canvas: HTMLCanvasElement) => fakeRenderer(canvas));
    setPreviewRendererFactory(factory);
    expect(factory).not.toHaveBeenCalled();
    renderPieceSnapshot(spec());
    renderPieceSnapshot(spec('chair'));
    renderPieceSnapshot(spec('desk'));
    expect(factory).toHaveBeenCalledTimes(1);
    const fake = factory.mock.results[0]?.value as FakeRenderer;
    expect(fake.render).toHaveBeenCalledTimes(3);
    expect(fake.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(fake.canvas.isConnected).toBe(false);
    expect(fake.dispose).not.toHaveBeenCalled();
  });
});

describe('disposePreviewRenderer', () => {
  it('disposes the renderer and loses its context once; the next snapshot makes a new one', () => {
    useFakes();
    renderPieceSnapshot(spec());
    const first = only();
    disposePreviewRenderer();
    disposePreviewRenderer();
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(first.forceContextLoss).toHaveBeenCalledTimes(1);

    expect(renderPieceSnapshot(spec())).toBe(PNG);
    expect(made).toHaveLength(2);
    const second = made[1] as FakeRenderer;
    expect(second).not.toBe(first);
    expect(second.canvas).not.toBe(first.canvas);
    expect(second.render).toHaveBeenCalledTimes(1);
    expect(first.render).toHaveBeenCalledTimes(1);
  });

  it('does nothing before any snapshot', () => {
    const factory = vi.fn((canvas: HTMLCanvasElement) => fakeRenderer(canvas));
    setPreviewRendererFactory(factory);
    expect(() => disposePreviewRenderer()).not.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });
});
