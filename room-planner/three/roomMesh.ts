import * as THREE from 'three';
import type { Point } from '../domain/types';
import type { Tokens } from '../styles/tokens';

/** Side of the square plank canvas, in px. */
const FLOOR_CANVAS = 512;
/** Height of one plank row on the canvas, in px; also the inches one texture repeat covers. */
const PLANK_ROW = 64;
const LCG_MODULUS = 2147483647;
const LCG_MULTIPLIER = 16807;
const FLOOR_SEED = 7;

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

/**
 * Builds the floor and one inward-facing wall per outline edge (prototype lines 496–500).
 * Plan x → X, plan y → Z, height → Y. Each wall is a single-sided plane spanning its two
 * corners whose normal is the wall's inward normal, so a wall between the camera and the
 * room is culled.
 */
export function buildRoom(outline: readonly Point[], height: number, tokens: Tokens,
  floorMap: THREE.Texture | null): THREE.Group {
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
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, height),
      new THREE.MeshStandardMaterial({ color: tokens.n100, roughness: 1, side: THREE.FrontSide }),
    );
    mesh.position.set((a.x + b.x) / 2, height / 2, (a.y + b.y) / 2);
    mesh.rotation.y = Math.atan2(nx, ny);
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
}
