import * as THREE from 'three';
import { BOOK_COLOURS, LINEN, LOOKS } from '../domain/catalog';
import type { Item } from '../domain/types';

const LCG_MODULUS = 2147483647;
const LCG_MULTIPLIER = 16807;
const ROUGH_DEFAULT = 0.92;
const ROUGH_WOOD = 0.6;
const ROUGH_METAL = 0.5;
const ROUGH_BOOKS = 0.85;

/**
 * Stable seed for the bookshelf LCG: FNV-1a over the id's UTF-16 code units, folded into
 * 1..2147483646 so the LCG never sticks at 0 (0 and the modulus itself are excluded).
 */
export function hashSeed(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % (LCG_MODULUS - 1)) + 1;
}

/** Undefined colour keeps three's default (white), as the prototype did for absent looks. */
function material(colour: string | undefined, roughness = ROUGH_DEFAULT): THREE.MeshStandardMaterial {
  return colour === undefined
    ? new THREE.MeshStandardMaterial({ roughness })
    : new THREE.MeshStandardMaterial({ color: colour, roughness });
}

/**
 * Builds a parametric model (prototype lines 502–543). The origin is the footprint centre on
 * the floor; x = width, z = depth (back edge at −z), y = height. `userData.outline` holds a
 * hidden selection box whose colour the renderer sets.
 */
export function buildFurniture(item: Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h'>): THREE.Group {
  const group = new THREE.Group();
  const { w, d, h, kind: k } = item;
  const c = LOOKS[k];
  const hw = w / 2;
  const hd = d / 2;

  /** Adds an axis-aligned box spanning [x0,x1] × [y0,y1] × [z0,z1]. */
  const B = (
    m: THREE.Material,
    x0: number, x1: number, z0: number, z1: number, y0: number, y1: number,
    noShadow = false,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = !noShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  /** Four square legs of half-width r, inset from the footprint corners, from the floor to `top`. */
  const legs = (m: THREE.Material, inx: number, inz: number, top: number, r: number) => {
    const corners: [number, number][] = [
      [-hw + inx, -hd + inz], [hw - inx, -hd + inz], [-hw + inx, hd - inz], [hw - inx, hd - inz],
    ];
    for (const [px, pz] of corners) B(m, px - r, px + r, pz - r, pz + r, 0, top);
  };

  if (k === 'sofa' || k === 'chair') {
    const main = material(c.main);
    const soft = material(c.soft ?? c.main);
    const wood = material(c.wood ?? c.main, ROUGH_WOOD);
    const lg = Math.min(5, h * 0.15), seat = h * 0.52, aw = Math.min(8, w * 0.1), bd = d * 0.26;
    const n = k === 'chair' ? 1 : 3, cw = (w - 2 * aw) / n;
    legs(wood, 2.5, 2.5, lg, 1);
    B(main, -hw, hw, -hd, hd - 1, lg, seat - 5);
    B(main, -hw, hw, -hd, -hd + bd * 0.45, lg, h * 0.9);
    B(main, -hw, -hw + aw, -hd, hd - 1, lg, h * 0.72);
    B(main, hw - aw, hw, -hd, hd - 1, lg, h * 0.72);
    for (let i = 0; i < n; i++) {
      const x0 = -hw + aw + i * cw;
      B(soft, x0 + 0.4, x0 + cw - 0.4, -hd + bd, hd, seat - 5, seat);
      B(soft, x0 + 0.4, x0 + cw - 0.4, -hd + bd * 0.45, -hd + bd, seat, h);
    }
  } else if (k === 'bed') {
    const main = material(c.main);
    const wood = material(c.wood ?? c.main, ROUGH_WOOD);
    const white = material(LINEN);
    const ft = h * 0.3, mt = h * 0.55;
    legs(wood, 3, 3, 3, 1.2);
    B(wood, -hw, hw, -hd + 2, hd, 3, ft);
    B(wood, -hw, hw, -hd, -hd + 2, 0, h);
    B(white, -hw + 1.5, hw - 1.5, -hd + 2, hd - 1.5, ft, mt);
    B(main, -hw + 1, hw - 1, -hd + d * 0.32, hd - 1, ft + 2, mt + 1);
    B(white, -hw + w * 0.08, -w * 0.04, -hd + 4, -hd + d * 0.24, mt, mt + 4);
    B(white, w * 0.04, hw - w * 0.08, -hd + 4, -hd + d * 0.24, mt, mt + 4);
  } else if (k === 'desk') {
    const wood = material(c.wood ?? c.main, ROUGH_WOOD);
    B(wood, -hw, hw, -hd, hd, h - 1.5, h);
    legs(material(c.metal, ROUGH_METAL), 2, 2, h - 1.5, 0.9);
    B(wood, hw - w * 0.34, hw - 3, -hd + 2, hd - 1, h - 6.5, h - 1.5);
  } else if (k === 'table') {
    const wood = material(c.wood ?? c.main, ROUGH_WOOD);
    B(wood, -hw, hw, -hd, hd, h - 1.5, h);
    legs(wood, 2.5, 2.5, h - 1.5, 1);
    B(wood, -hw + 3, hw - 3, -hd + 3, hd - 3, h * 0.3, h * 0.3 + 0.8);
  } else if (k === 'shelf') {
    const wood = material(c.wood ?? c.main, ROUGH_WOOD);
    const t = 0.8, n = Math.max(2, Math.round(h / 14)), gap = (h - 2 - t) / n;
    const books = BOOK_COLOURS.map((b) => material(b, ROUGH_BOOKS));
    let seed = hashSeed(item.id);
    const rnd = () => (seed = (seed * LCG_MULTIPLIER) % LCG_MODULUS) / LCG_MODULUS;
    B(wood, -hw, -hw + t, -hd, hd, 0, h);
    B(wood, hw - t, hw, -hd, hd, 0, h);
    B(wood, -hw + t, hw - t, -hd, -hd + 0.4, 0, h);
    for (let i = 0; i <= n; i++) {
      const y = 2 + gap * i;
      B(wood, -hw + t, hw - t, -hd, hd, y, y + t);
      if (i === n) break;
      let x = -hw + t + 0.5;
      const lim = hw - t - 2 - rnd() * w * 0.3;
      while (x < lim) {
        const bw = 1 + rnd() * 1.6, bh = (gap - t - 1) * (0.6 + rnd() * 0.35);
        // rnd() < 1, so the index is 0..4; the fallback only satisfies the type checker.
        const book = books[Math.floor(rnd() * books.length)] ?? wood;
        B(book, x, x + bw, -hd + 1, hd - 1 - rnd() * 2, y + t, y + t + bh);
        x += bw + 0.08;
      }
    }
  } else if (k === 'rug') {
    const main = material(c.main);
    const soft = material(c.soft ?? c.main);
    B(main, -hw, hw, -hd, hd, 0, 0.4, true);
    B(soft, -hw + 4, hw - 4, -hd + 4, hd - 4, 0.4, 0.5, true);
  } else {
    B(material(c.main), -hw, hw, -hd, hd, 0, h);
  }

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(w + 1.2, h + 0.6, d + 1.2)),
    new THREE.LineBasicMaterial(),
  );
  outline.position.y = h / 2 + 0.3;
  outline.visible = false;
  group.add(outline);
  group.userData.outline = outline;
  return group;
}
