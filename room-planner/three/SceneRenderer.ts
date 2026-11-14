/**
 * On-demand WebGL renderer for the realistic 3D pane. Keeps one scene in sync with the plan:
 * the room is rebuilt when its dimensions change, each item's model is rebuilt when its
 * `modelKey` changes and otherwise only moved, and every removed subtree is disposed.
 * Each `update` renders exactly once. Ported from prototype lines 473–485 and 547–577.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { footprint } from '../domain/geometry';
import type { Conflicts, Item, Room } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import type { CameraPose } from '../view/camera';
import { modelKey, resolveModel } from './modelSource';
import { buildRoom, createFloorTexture } from './roomMesh';

export interface SceneInput { room: Room; items: readonly Item[]; selectedId: string | null;
  conflicts: Conflicts; pose: CameraPose; width: number; height: number; pixelRatio: number }

/** The slice of `THREE.WebGLRenderer` the scene renderer uses; tests inject a fake. */
export type RendererLike = Pick<THREE.WebGLRenderer,
  'setPixelRatio' | 'setSize' | 'render' | 'dispose' | 'forceContextLoss' | 'shadowMap' | 'outputColorSpace'>;

const SKY_COLOUR = 0xffffff;
const GROUND_COLOUR = 0xd8d2c8;
const SUN_COLOUR = 0xffffff;
const SHADOW_MAP_SIZE = 2048;
const SHADOW_BIAS = -0.0006;
const SHADOW_NORMAL_BIAS = 0.4;
const SHADOW_RADIUS = 3;
/** Sun height and distance behind the room, in room heights and room lengths. */
const SUN_HEIGHT_PER_H = 2.4;
const SUN_DEPTH_PER_L = 1.4;
/** Margin around the room's half-diagonal for the shadow camera, in inches. */
const SHADOW_MARGIN = 24;
/** Far planes, in multiples of the room diagonal (shadow) and of the camera distance (view). */
const FAR_FACTOR = 5;
const NEAR = 1;
const INITIAL_FOV = 40;
const INITIAL_FAR = 5000;
const ROOM_NAME = 'room';

/** Builds the real WebGL renderer; throws when the browser cannot create a WebGL context. */
function createWebGLRenderer(canvas: HTMLCanvasElement): RendererLike {
  return new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
}

/**
 * Releases every geometry, material and material texture under `root` (prototype line 473),
 * each once even when several meshes share it.
 */
function disposeTree(root: THREE.Object3D): void {
  const resources = new Set<{ dispose(): void }>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points)) return;
    resources.add(node.geometry as THREE.BufferGeometry);
    const materials = (Array.isArray(node.material) ? node.material : [node.material]) as THREE.Material[];
    for (const material of materials) {
      resources.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) resources.add(value);
      }
    }
  });
  resources.forEach((r) => r.dispose());
}

interface FurnitureEntry { key: string; group: THREE.Group }

export class SceneRenderer {
  private readonly renderer: RendererLike;
  private readonly tokens: Tokens;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(INITIAL_FOV, 1, NEAR, INITIAL_FAR);
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly furniture = new Map<string, FurnitureEntry>();
  private room: THREE.Group | null = null;
  private roomKey = '';
  private size = { width: 0, height: 0, pixelRatio: 0 };
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, tokens: Tokens,
    createRenderer: (canvas: HTMLCanvasElement) => RendererLike = createWebGLRenderer) {
    this.tokens = tokens;
    this.renderer = createRenderer(canvas);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.hemi = new THREE.HemisphereLight(SKY_COLOUR, GROUND_COLOUR, CONFIG.hemiIntensity);
    this.sun = new THREE.DirectionalLight(SUN_COLOUR, CONFIG.sunIntensity);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.sun.shadow.bias = SHADOW_BIAS;
    this.sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
    this.sun.shadow.radius = SHADOW_RADIUS;
    this.scene.add(this.hemi, this.sun, this.sun.target);
  }

  /** Brings the scene in line with `input`, then renders exactly once. */
  update(input: SceneInput): void {
    if (this.disposed) return;
    this.syncSize(input);
    this.syncRoom(input.room);
    this.syncFurniture(input);
    this.syncCamera(input);
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Releases the renderer, its WebGL context and everything in the scene. `WebGLRenderer.dispose()`
   * alone keeps the context alive until garbage collection, so the context is lost explicitly;
   * otherwise each remount leaks one and the browser's live-context cap is soon reached.
   * Later calls do nothing.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.room) disposeTree(this.room);
    this.room = null;
    this.roomKey = '';
    this.furniture.forEach((entry) => disposeTree(entry.group));
    this.furniture.clear();
    this.hemi.dispose();
    this.sun.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private syncSize({ width, height, pixelRatio }: SceneInput): void {
    const s = this.size;
    if (s.width === width && s.height === height && s.pixelRatio === pixelRatio) return;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.size = { width, height, pixelRatio };
  }

  private syncRoom(room: Room): void {
    const { w: W, l: L, h: H } = room;
    const key = `${W}|${L}|${H}`;
    if (key === this.roomKey) return;
    if (this.room) {
      this.scene.remove(this.room);
      disposeTree(this.room);
    }
    this.room = buildRoom(room, this.tokens, createFloorTexture(room));
    this.room.name = ROOM_NAME;
    this.scene.add(this.room);
    this.roomKey = key;

    const r = Math.hypot(W, L) / 2 + SHADOW_MARGIN;
    this.sun.position.set(0, H * SUN_HEIGHT_PER_H, L * SUN_DEPTH_PER_L);
    this.sun.target.position.set(W / 2, 0, L / 2);
    this.sun.target.updateMatrixWorld();
    const sc = this.sun.shadow.camera;
    sc.left = -r;
    sc.right = r;
    sc.top = r;
    sc.bottom = -r;
    sc.near = NEAR;
    sc.far = Math.hypot(W, L, H) * FAR_FACTOR;
    sc.updateProjectionMatrix();
  }

  private syncFurniture({ items, selectedId, conflicts }: SceneInput): void {
    const seen = new Set<string>();
    for (const item of items) {
      seen.add(item.id);
      const key = modelKey(item);
      let entry = this.furniture.get(item.id);
      if (!entry || entry.key !== key) {
        if (entry) this.removeGroup(entry.group);
        const group = resolveModel(item);
        group.name = item.id;
        entry = { key, group };
        this.scene.add(group);
        this.furniture.set(item.id, entry);
      }
      const [fw, fd] = footprint(item);
      entry.group.position.set(item.x + fw / 2, 0, item.y + fd / 2);
      entry.group.rotation.y = -item.rot * Math.PI / 2;

      const outline: unknown = entry.group.userData.outline;
      if (outline instanceof THREE.LineSegments && outline.material instanceof THREE.LineBasicMaterial) {
        const selected = item.id === selectedId;
        outline.visible = selected || conflicts[item.id] !== undefined;
        outline.material.color.set(selected ? this.tokens.a700 : this.tokens.text);
      }
    }
    this.furniture.forEach((entry, id) => {
      if (seen.has(id)) return;
      this.removeGroup(entry.group);
      this.furniture.delete(id);
    });
  }

  private removeGroup(group: THREE.Group): void {
    this.scene.remove(group);
    disposeTree(group);
  }

  private syncCamera({ pose, width, height }: SceneInput): void {
    const cam = this.camera;
    cam.fov = pose.fovDeg;
    cam.aspect = pose.aspect;
    cam.near = NEAR;
    cam.far = pose.distance * FAR_FACTOR;
    // Plan space (x, y, height) maps to three as (X, Z, Y).
    cam.position.set(pose.position[0], pose.position[2], pose.position[1]);
    cam.lookAt(pose.target[0], pose.target[2], pose.target[1]);
    if (pose.viewOffsetX > 0) cam.setViewOffset(width, height, pose.viewOffsetX, 0, width, height);
    else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
}
