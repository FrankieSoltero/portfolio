/**
 * On-demand WebGL renderer for the realistic 3D pane. Keeps one scene in sync with the plan:
 * the room is rebuilt when its outline, height or wall holes (doors and windows) change by value,
 * each item's model is rebuilt when its `modelKey` changes and otherwise only moved, each obstacle
 * likewise when its shape, size or elevation changes, and every removed subtree is disposed.
 * Each `update` renders exactly once. Ported from prototype lines 473–485 and 547–577.
 */
import * as THREE from 'three';
import { CONFIG } from '../config';
import { obstacleFootprint } from '../domain/obstacles';
import { boundsOf } from '../domain/polygon';
import { itemFootprint } from '../domain/shape';
import type { Conflicts, Corner, Item, Obstacle, Opening } from '../domain/types';
import type { Tokens } from '../styles/tokens';
import type { CameraPose } from '../view/camera';
import { modelKey, resolveModel } from './modelSource';
import { buildObstacle } from './obstacleMesh';
import { buildRoom, createFloorTexture, wallHoles } from './roomMesh';

/**
 * Everything one frame needs. `outline` and `height` are the room's corners (plan space, positive
 * signed area; their ids match openings to walls) and ceiling height in inches; `viewWidth` and
 * `viewHeight` are the canvas size in CSS px.
 */
export interface SceneInput { outline: readonly Corner[]; height: number; items: readonly Item[];
  openings: readonly Opening[]; obstacles: readonly Obstacle[];
  selectedId: string | null; conflicts: Conflicts; pose: CameraPose; viewWidth: number;
  viewHeight: number; pixelRatio: number }

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
/** Sun height and distance behind the room, in room heights and bounding-box lengths. */
const SUN_HEIGHT_PER_H = 2.4;
const SUN_DEPTH_PER_L = 1.4;
/** Margin around the bounding box's half-diagonal for the shadow camera, in inches. */
const SHADOW_MARGIN = 24;
/** Far planes, in multiples of the room's bounding diagonal (shadow) and of the camera distance (view). */
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

/** What an obstacle's mesh is built from; a change to any of these rebuilds its group. */
function obstacleKey(o: Obstacle): string {
  return `${o.shape}|${o.width}|${o.depth}|${o.height}|${o.elevation}`;
}

export class SceneRenderer {
  private readonly renderer: RendererLike;
  private readonly tokens: Tokens;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(INITIAL_FOV, 1, NEAR, INITIAL_FAR);
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly furniture = new Map<string, FurnitureEntry>();
  private readonly obstacles = new Map<string, FurnitureEntry>();
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
    this.syncRoom(input.outline, input.height, input.openings);
    this.syncFurniture(input);
    this.syncObstacles(input);
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
    this.obstacles.forEach((entry) => disposeTree(entry.group));
    this.obstacles.clear();
    this.hemi.dispose();
    this.sun.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private syncSize({ viewWidth: width, viewHeight: height, pixelRatio }: SceneInput): void {
    const s = this.size;
    if (s.width === width && s.height === height && s.pixelRatio === pixelRatio) return;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.size = { width, height, pixelRatio };
  }

  /**
   * Rebuilds the room and refits the sun when the outline's coordinates, the height or the holes
   * the openings cut in the walls change by value.
   */
  private syncRoom(outline: readonly Corner[], height: number, openings: readonly Opening[]): void {
    const holes = wallHoles(outline, openings, height);
    const holesKey = holes.map((list) => list.map((h) => `${h.x0},${h.x1},${h.z0},${h.z1},${h.glass ? 1 : 0}`).join('/'))
      .join(';');
    const key = `${outline.map((p) => `${p.x},${p.y}`).join(';')}|${height}|${holesKey}`;
    if (key === this.roomKey) return;
    if (this.room) {
      this.scene.remove(this.room);
      disposeTree(this.room);
    }
    this.room = buildRoom(outline, height, this.tokens, createFloorTexture(), holes);
    this.room.name = ROOM_NAME;
    this.scene.add(this.room);
    this.roomKey = key;

    const { minX, minY, w: W, l: L } = boundsOf(outline);
    const H = height;
    const r = Math.hypot(W, L) / 2 + SHADOW_MARGIN;
    this.sun.position.set(minX, H * SUN_HEIGHT_PER_H, minY + L * SUN_DEPTH_PER_L);
    this.sun.target.position.set(minX + W / 2, 0, minY + L / 2);
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
      // Plan (cx, cy) maps to three (X, Z); a clockwise plan angle is a negative turn about +Y.
      const fp = itemFootprint(item);
      entry.group.position.set(fp.cx, 0, fp.cy);
      entry.group.rotation.y = -fp.angle * Math.PI / 180;

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

  /**
   * Creates a group per obstacle, rebuilds it when its shape, size or elevation changes, otherwise
   * only moves and turns it, and disposes the groups of removed obstacles. A conflicting obstacle
   * shows its outline box in the text colour, as conflicting furniture does.
   */
  private syncObstacles({ obstacles, conflicts }: SceneInput): void {
    const seen = new Set<string>();
    for (const o of obstacles) {
      seen.add(o.id);
      const key = obstacleKey(o);
      let entry = this.obstacles.get(o.id);
      if (!entry || entry.key !== key) {
        if (entry) this.removeGroup(entry.group);
        const group = buildObstacle(o, this.tokens);
        group.name = o.id;
        entry = { key, group };
        this.scene.add(group);
        this.obstacles.set(o.id, entry);
      }
      const fp = obstacleFootprint(o);
      entry.group.position.set(fp.cx, 0, fp.cy);
      entry.group.rotation.y = -fp.angle * Math.PI / 180;

      const outline: unknown = entry.group.userData.outline;
      if (outline instanceof THREE.LineSegments && outline.material instanceof THREE.LineBasicMaterial) {
        outline.visible = conflicts[o.id] !== undefined;
        outline.material.color.set(this.tokens.text);
      }
    }
    this.obstacles.forEach((entry, id) => {
      if (seen.has(id)) return;
      this.removeGroup(entry.group);
      this.obstacles.delete(id);
    });
  }

  private removeGroup(group: THREE.Group): void {
    this.scene.remove(group);
    disposeTree(group);
  }

  private syncCamera({ pose, viewWidth: width, viewHeight: height }: SceneInput): void {
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
