import * as THREE from 'three';
import type { Room } from '../domain/types';
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
 * sRGB texture, one repeat per 64 in of room. Returns null when no 2D context exists (jsdom).
 */
export function createFloorTexture(room: Room): THREE.CanvasTexture | null {
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
  texture.repeat.set(room.w / PLANK_ROW, room.l / PLANK_ROW);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Builds the floor and four inward-facing walls (prototype lines 496–500). The room's corner
 * sits at the origin: plan x → X, plan y → Z, height → Y. Walls are single-sided so a wall
 * between the camera and the room is culled.
 */
export function buildRoom(room: Room, tokens: Tokens, floorMap: THREE.Texture | null): THREE.Group {
  const { w: W, l: L, h: H } = room;
  const group = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ map: floorMap, roughness: 0.75 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, L / 2);
  floor.receiveShadow = true;
  group.add(floor);

  const wall = (len: number, px: number, pz: number, ry: number) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(len, H),
      new THREE.MeshStandardMaterial({ color: tokens.n100, roughness: 1, side: THREE.FrontSide }),
    );
    mesh.position.set(px, H / 2, pz);
    mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  wall(W, W / 2, 0, 0);
  wall(W, W / 2, L, Math.PI);
  wall(L, 0, L / 2, Math.PI / 2);
  wall(L, W, L / 2, -Math.PI / 2);

  return group;
}
