import * as THREE from 'three';
import { openingSpan } from '../domain/openings';
import { wallsOf } from '../domain/outline';
import type { Corner, Opening, Point } from '../domain/types';
import type { Tokens } from '../styles/tokens';

/** Side of the square plank canvas, in px. */
const FLOOR_CANVAS = 512;
/** Height of one plank row on the canvas, in px; also the inches one texture repeat covers. */
const PLANK_ROW = 64;
const LCG_MODULUS = 2147483647;
const LCG_MULTIPLIER = 16807;
const FLOOR_SEED = 7;

/** Narrowest hole kept after clamping into its wall, in inches. */
const MIN_HOLE_WIDTH = 0.01;

/**
 * A door or window hole in one wall, in the wall's own frame: `x` is the distance along the wall
 * from its start corner, `z` the height above the floor (inches). `glass` marks a window.
 */
export interface WallHole { x0: number; x1: number; z0: number; z1: number; glass: boolean }

/**
 * The holes the openings cut in each wall: one list per wall, in wall order, each sorted by `x0`.
 * A door runs from the floor to its height, a window from its sill to sill + height; both are
 * clamped to the ceiling and into the wall's length, and a hole left empty (`z1 ≤ z0`) or narrower
 * than 0.01 is dropped. Openings whose wall is not in the outline are ignored.
 */
export function wallHoles(outline: readonly Corner[], openings: readonly Opening[],
  height: number): WallHole[][] {
  const walls = wallsOf(outline);
  const holes: WallHole[][] = walls.map(() => []);
  for (const o of openings) {
    const span = openingSpan(outline, o);
    if (span === null) continue;
    const wall = walls[span.wallIndex];
    const list = holes[span.wallIndex];
    if (wall === undefined || list === undefined) continue;
    const bottom = o.kind === 'window' ? o.sill : 0;
    const z0 = Math.max(0, bottom);
    const z1 = Math.min(bottom + o.height, height);
    const x0 = Math.max(0, o.offset);
    const x1 = Math.min(wall.length, o.offset + o.width);
    if (z1 <= z0 || x1 - x0 < MIN_HOLE_WIDTH) continue;
    list.push({ x0, x1, z0, z1, glass: o.kind === 'window' });
  }
  for (const list of holes) list.sort((p, q) => p.x0 - q.x0);
  return holes;
}

/**
 * Paints the wood-plank floor canvas (prototype lines 488–495) and wraps it in a repeating
 * sRGB texture. The floor's UVs are in inches, so one repeat covers 64 in.
 * Returns null when no 2D context exists (jsdom).
 */
export function createFloorTexture(): THREE.CanvasTexture | null {
  const canvas = document.createElement('canvas');
  canvas.width = FLOOR_CANVAS;
  canvas.height = FLOOR_CANVAS;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let seed = FLOOR_SEED;
  const rnd = () => (seed = (seed * LCG_MULTIPLIER) % LCG_MODULUS) / LCG_MODULUS;
  const rows = FLOOR_CANVAS / PLANK_ROW;
  for (let r = 0; r < rows; r++) {
    const top = r * PLANK_ROW;
    let px = -rnd() * 200;
    while (px < FLOOR_CANVAS) {
      const len = 160 + rnd() * 200;
      ctx.fillStyle = `hsl(30, 30%, ${63 + rnd() * 8}%)`;
      ctx.fillRect(px, top, len, PLANK_ROW);
      ctx.fillStyle = 'rgba(60,40,20,0.18)';
      ctx.fillRect(px, top, 1.5, PLANK_ROW);
      px += len;
    }
    ctx.fillStyle = 'rgba(60,40,20,0.22)';
    ctx.fillRect(0, top, FLOOR_CANVAS, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1 / PLANK_ROW, 1 / PLANK_ROW);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * The floor polygon on y = 0: one vertex per outline corner at (x, 0, y), UV (x, y) in inches,
 * and every triangle wound to face up (+Y).
 */
function floorGeometry(outline: readonly Point[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  for (const p of outline) {
    positions.push(p.x, 0, p.y);
    uvs.push(p.x, p.y);
    normals.push(0, 1, 0);
  }
  const index: number[] = [];
  const contour = outline.map((p) => new THREE.Vector2(p.x, p.y));
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(contour, [])) {
    if (a === undefined || b === undefined || c === undefined) continue;
    const pa = outline[a] as Point;
    const pb = outline[b] as Point;
    const pc = outline[c] as Point;
    // Three's front face is counter-clockwise seen from +Y, which is a negative plan-space
    // cross product because plan y maps to +Z.
    const cross = (pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x);
    if (cross < 0) index.push(a, b, c);
    else index.push(a, c, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/** Opacity and roughness of a window pane. */
const GLASS_OPACITY = 0.3;
const GLASS_ROUGHNESS = 0.1;

/** Axis-aligned rectangle in a wall's frame: `x` along the wall, `z` up (inches). */
interface WallRect { x0: number; x1: number; z0: number; z1: number }

/**
 * The parts of a `length` × `height` wall left once `holes` are cut out, as rectangles.
 *
 * Approach: the wall is cut into vertical strips at every hole edge; in each strip the height
 * ranges the holes leave free become rectangles (below a window, above a door, the full height
 * beside a hole). One approach serves every case: earcut (ShapeGeometry with hole paths) needs
 * holes strictly inside the outline, which a door (touching the floor) or a full-height opening
 * (touching both floor and ceiling, splitting the wall in two) is not. The rectangles tile the
 * wall minus the holes exactly once, so there is no overlap to z-fight.
 */
function wallRects(length: number, height: number, holes: readonly WallHole[]): WallRect[] {
  const xs = [...new Set([0, length, ...holes.flatMap((h) => [h.x0, h.x1])])]
    .filter((x) => x >= 0 && x <= length)
    .sort((p, q) => p - q);
  const rects: WallRect[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i] as number;
    const x1 = xs[i + 1] as number;
    const mid = (x0 + x1) / 2;
    const cut = holes.filter((h) => h.x0 < mid && mid < h.x1).sort((p, q) => p.z0 - q.z0);
    let z = 0;
    for (const h of cut) {
      if (h.z0 > z) rects.push({ x0, x1, z0: z, z1: h.z0 });
      z = Math.max(z, h.z1);
    }
    if (z < height) rects.push({ x0, x1, z0: z, z1: height });
  }
  return rects;
}

/**
 * Geometry of the rectangles in the frame of a `length` × `height` PlaneGeometry: centred on the
 * origin, `x` along local +X and `z` up local +Y, every triangle facing +Z like the plane's.
 */
function rectsGeometry(rects: readonly WallRect[], length: number, height: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const index: number[] = [];
  for (const r of rects) {
    const base = positions.length / 3;
    for (const [x, z] of [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]] as const) {
      positions.push(x - length / 2, z - height / 2, 0);
      normals.push(0, 0, 1);
      uvs.push(x / length, z / height);
    }
    // Counter-clockwise seen from +Z.
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Builds the floor and one inward-facing wall per outline edge (prototype lines 496–500).
 * Plan x → X, plan y → Z, height → Y. Each wall is a single-sided plane spanning its two
 * corners whose normal is the wall's inward normal, so a wall between the camera and the
 * room is culled. `holes` (one list per wall, from `wallHoles`) cuts doors and windows out of
 * the walls and fills each window with a translucent pane; without it the walls are whole.
 */
export function buildRoom(outline: readonly Point[], height: number, tokens: Tokens,
  floorMap: THREE.Texture | null, holes?: readonly (readonly WallHole[])[]): THREE.Group {
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    floorGeometry(outline),
    new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.75 }),
  );
  floor.receiveShadow = true;
  group.add(floor);

  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length] as Point;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) return;
    // Inward normal in plan space; a plane's +Z normal turned by ry about Y is (sin ry, 0, cos ry).
    // The same turn takes the plane's +X to the wall's direction from a to b.
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const ry = Math.atan2(nx, ny);
    const cut = holes?.[i] ?? [];
    const mesh = new THREE.Mesh(
      cut.length === 0 ? new THREE.PlaneGeometry(len, height) : rectsGeometry(wallRects(len, height, cut), len, height),
      new THREE.MeshStandardMaterial({ color: tokens.n100, roughness: 1, side: THREE.FrontSide }),
    );
    mesh.position.set((a.x + b.x) / 2, height / 2, (a.y + b.y) / 2);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);

    for (const h of cut) {
      if (!h.glass) continue;
      // A pane in the wall's plane spanning the hole, facing inward like the wall.
      const pane = new THREE.Mesh(
        new THREE.PlaneGeometry(h.x1 - h.x0, h.z1 - h.z0),
        new THREE.MeshStandardMaterial({
          color: tokens.a200, roughness: GLASS_ROUGHNESS, transparent: true, opacity: GLASS_OPACITY,
          depthWrite: false, side: THREE.FrontSide,
        }),
      );
      const along = (h.x0 + h.x1) / 2;
      pane.position.set(a.x + ny * along, (h.z0 + h.z1) / 2, a.y - nx * along);
      pane.rotation.y = ry;
      pane.castShadow = false;
      group.add(pane);
    }
  });

  return group;
}
