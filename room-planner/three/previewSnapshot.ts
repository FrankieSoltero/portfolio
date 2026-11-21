/**
 * One-off still pictures of a single piece, as the furniture generator draws it, for the product
 * lookup's preview card. One module-level WebGL renderer, created on the first snapshot on a canvas
 * that is never attached to the page, is reused for every snapshot until `disposePreviewRenderer`.
 * Each snapshot builds its own scene and disposes the piece's geometries and materials afterwards.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { buildFurniture } from './furnitureModels';

/** What `buildFurniture` takes: the item fields the model is built from. */
type FurnitureSpec = Parameters<typeof buildFurniture>[0];

/** The slice of `THREE.WebGLRenderer` the snapshot uses; tests inject a fake. */
export type PreviewRenderer = Pick<THREE.WebGLRenderer,
  'setPixelRatio' | 'setSize' | 'setClearColor' | 'render' | 'dispose' | 'forceContextLoss' | 'outputColorSpace'>;

/** Makes the renderer that draws into `canvas`; may throw when WebGL is unavailable. */
export type PreviewRendererFactory = (canvas: HTMLCanvasElement) => PreviewRenderer;

const DEFAULT_SIZE_PX = 240;
const FOV_DEG = 35;
/** Room left around the piece's bounding sphere, as a factor of its radius. */
const FRAME_MARGIN = 1.15;
/** The three-quarter view: from the front right, a little above (normalised before use). */
const VIEW_DIRECTION = new THREE.Vector3(1, 0.8, 1.4).normalize();
/** Where the sun sits relative to the piece's centre, in bounding-sphere radii (normalised first). */
const SUN_DIRECTION = new THREE.Vector3(-0.6, 2, 1.2).normalize();
const SUN_DISTANCE_PER_RADIUS = 4;
/** Near and far planes, in bounding-sphere radii in front of and behind the centre. */
const DEPTH_PER_RADIUS = 2;
const MIN_NEAR = 0.1;
const SKY_COLOUR = 0xffffff;
const GROUND_COLOUR = 0xd8d2c8;
const SUN_COLOUR = 0xffffff;
const CLEAR_COLOUR = 0x000000;
const PNG_PREFIX = 'data:image/png';

/** Builds the real WebGL renderer; throws when the browser cannot create a WebGL context. */
function createWebGLRenderer(canvas: HTMLCanvasElement): PreviewRenderer {
  return new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
}

let factory: PreviewRendererFactory = createWebGLRenderer;
let current: { canvas: HTMLCanvasElement; renderer: PreviewRenderer } | null = null;

/**
 * For tests only: replaces how the renderer is made (jsdom has no WebGL), or restores the real
 * WebGL renderer when given null. Takes effect the next time a renderer is created.
 */
export function setPreviewRendererFactory(next: PreviewRendererFactory | null): void {
  factory = next ?? createWebGLRenderer;
}

/** The shared renderer, made on first use on a detached canvas; throws when it cannot be made. */
function sharedRenderer(): { canvas: HTMLCanvasElement; renderer: PreviewRenderer } {
  if (current) return current;
  const canvas = document.createElement('canvas');
  const renderer = factory(canvas);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(CLEAR_COLOUR, 0);
  current = { canvas, renderer };
  return current;
}

/** Releases every geometry and material under `root`, each once even when meshes share it. */
function disposeGeometryAndMaterials(root: THREE.Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)) return;
    resources.add(node.geometry as THREE.BufferGeometry);
    const materials = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.Material[];
    materials.forEach((material) => resources.add(material));
  });
  resources.forEach((r) => r.dispose());
}

/** The piece's bounding box over its visible parts, leaving out the hidden selection outline. */
function visibleBounds(group: THREE.Group): THREE.Box3 {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  for (const child of group.children) {
    if (child.visible) box.expandByObject(child);
  }
  return box;
}

/** A square camera looking at the sphere's centre along the three-quarter view, fitting it with the margin. */
function framingCamera(sphere: THREE.Sphere): THREE.PerspectiveCamera {
  const distance = (sphere.radius * FRAME_MARGIN) / Math.sin(THREE.MathUtils.degToRad(FOV_DEG / 2));
  const depth = sphere.radius * DEPTH_PER_RADIUS;
  const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, Math.max(MIN_NEAR, distance - depth), distance + depth);
  camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance);
  camera.lookAt(sphere.center);
  camera.updateMatrixWorld();
  return camera;
}

/**
 * A PNG data URL of `spec`'s model as the generator builds it, seen in three-quarter view and framed
 * to its bounding box, `sizePx` square (default 240) on a transparent background. Returns null when
 * WebGL is unavailable, the size is not a positive finite number, or anything else fails; never throws.
 */
export function renderPieceSnapshot(spec: FurnitureSpec, sizePx: number = DEFAULT_SIZE_PX): string | null {
  if (!Number.isFinite(sizePx) || sizePx <= 0) return null;
  let group: THREE.Group | null = null;
  try {
    const { canvas, renderer } = sharedRenderer();
    group = buildFurniture(spec);
    const box = visibleBounds(group);
    if (box.isEmpty()) return null;
    const sphere = box.getBoundingSphere(new THREE.Sphere());

    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(SKY_COLOUR, GROUND_COLOUR, CONFIG.hemiIntensity);
    const sun = new THREE.DirectionalLight(SUN_COLOUR, CONFIG.sunIntensity);
    sun.position.copy(sphere.center).addScaledVector(SUN_DIRECTION, sphere.radius * SUN_DISTANCE_PER_RADIUS);
    // The target is not in the scene, so its world matrix is brought up to date here.
    sun.target.position.copy(sphere.center);
    sun.target.updateMatrixWorld();
    scene.add(group, hemi, sun);

    renderer.setPixelRatio(1);
    renderer.setSize(sizePx, sizePx, false);
    renderer.render(scene, framingCamera(sphere));
    const url = canvas.toDataURL('image/png');
    return typeof url === 'string' && url.startsWith(PNG_PREFIX) ? url : null;
  } catch {
    return null;
  } finally {
    if (group) disposeGeometryAndMaterials(group);
  }
}

/**
 * Releases the shared renderer and its WebGL context (called when the preview card unmounts); the
 * next snapshot makes a new one. `dispose()` alone keeps the context alive until garbage collection,
 * so the context is lost explicitly. Does nothing when there is no renderer.
 */
export function disposePreviewRenderer(): void {
  if (!current) return;
  const { renderer } = current;
  current = null;
  renderer.dispose();
  renderer.forceContextLoss();
}
