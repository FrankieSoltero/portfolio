import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOOK_COLOURS, LINEN } from '../domain/catalog';
import { buildParts } from '../domain/furniture/parts';
import type { Part, PartSlot } from '../domain/furniture/parts/types';
import { lighten, normaliseColour } from '../domain/furniture/recipe';
import type { Item, ItemColours } from '../domain/types';

const LCG_MODULUS = 2147483647;
const ROUGH_DEFAULT = 0.92;
const ROUGH_ACCENT = 0.6;
const ROUGH_BOOKS = 0.85;
/** How far the soft slot (cushions) mixes the main colour toward white. */
const SOFT_LIGHTEN = 0.08;
/** Colour of the fallback box when the item's main colour cannot be read. */
const NEUTRAL = '#c9ccd1';
/** Segments per rounded edge of a rounded box. */
const ROUNDED_SEGMENTS = 2;
/** Segments around a cylinder. */
const CYLINDER_SEGMENTS = 20;
const BOOK_INDEX = { book0: 0, book1: 1, book2: 2, book3: 3, book4: 4 } as const;

type FurnitureSpec = Pick<Item, 'id' | 'kind' | 'w' | 'd' | 'h' | 'style' | 'colours'>;

/**
 * Stable seed for the parts kit: FNV-1a over the id's UTF-16 code units, folded into
 * 1..2147483646 so an LCG seeded with it never sticks at 0 (0 and the modulus itself are excluded).
 */
export function hashSeed(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % (LCG_MODULUS - 1)) + 1;
}

/** `colour` lower-cased when it is `#rrggbb`; throws a RangeError otherwise, which sends the build to the fallback box. */
function checkedColour(colour: string): string {
  const hex = normaliseColour(colour);
  if (hex === null) throw new RangeError('buildFurniture: not a #rrggbb colour');
  return hex;
}

/** The material of a slot: its colour from the item's colours and its roughness. */
function slotMaterial(slot: PartSlot, colours: ItemColours): THREE.MeshStandardMaterial {
  switch (slot) {
    case 'main':
      return new THREE.MeshStandardMaterial({ color: checkedColour(colours.main), roughness: ROUGH_DEFAULT });
    case 'soft':
      return new THREE.MeshStandardMaterial({ color: lighten(colours.main, SOFT_LIGHTEN), roughness: ROUGH_DEFAULT });
    case 'accent':
      return new THREE.MeshStandardMaterial({ color: checkedColour(colours.accent), roughness: ROUGH_ACCENT });
    case 'linen':
      return new THREE.MeshStandardMaterial({ color: LINEN, roughness: ROUGH_DEFAULT });
    default:
      return new THREE.MeshStandardMaterial({ color: BOOK_COLOURS[BOOK_INDEX[slot]], roughness: ROUGH_BOOKS });
  }
}

/**
 * A part as a mesh. Local part axes map to three as x → x, y (depth) → z, z (up) → y. A cylinder
 * is a unit cylinder scaled to the part, its top radius first so a taper narrows the bottom.
 */
function partMesh(part: Part, material: THREE.Material): THREE.Mesh {
  let mesh: THREE.Mesh;
  if (part.shape === 'cylinder') {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5 * (part.taper ?? 1), 1, CYLINDER_SEGMENTS);
    mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(part.sx, part.sz, part.sy);
  } else {
    const geometry = part.shape === 'rounded'
      ? new RoundedBoxGeometry(part.sx, part.sz, part.sy, ROUNDED_SEGMENTS, part.radius ?? 0)
      : new THREE.BoxGeometry(part.sx, part.sz, part.sy);
    mesh = new THREE.Mesh(geometry, material);
  }
  mesh.position.set(part.cx, part.z0 + part.sz / 2, part.cy);
  return mesh;
}

/** One mesh per part, sharing one material per slot. Throws when a part or colour cannot be built. */
function partMeshes(item: FurnitureSpec): THREE.Mesh[] {
  const { w, d, h } = item;
  const parts = buildParts(item.kind, { w, d, h }, item.style, hashSeed(item.id));
  const materials = new Map<PartSlot, THREE.MeshStandardMaterial>();
  return parts.map((part) => {
    let material = materials.get(part.slot);
    if (!material) {
      material = slotMaterial(part.slot, item.colours);
      materials.set(part.slot, material);
    }
    return partMesh(part, material);
  });
}

/** A plain box of the item's size, standing on the floor, in its main colour or a neutral grey. */
function fallbackMesh(item: FurnitureSpec): THREE.Mesh {
  const colour = normaliseColour(item.colours.main) ?? NEUTRAL;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(item.w, item.h, item.d),
    new THREE.MeshStandardMaterial({ color: colour, roughness: ROUGH_DEFAULT }),
  );
  mesh.position.set(0, item.h / 2, 0);
  return mesh;
}

/**
 * Builds the piece's model from its parts. Never throws: when the parts or a geometry fail,
 * returns a plain box of the item's size in its main colour. The origin is the footprint centre
 * on the floor; x = width, z = depth (back edge at −z), y = height. `userData.outline` holds the
 * hidden selection box, whose colour the renderer sets.
 */
export function buildFurniture(item: FurnitureSpec): THREE.Group {
  const group = new THREE.Group();
  const { w, d, h } = item;

  // Resources made before a failure were never rendered, so they hold no GPU memory to release.
  let meshes: THREE.Mesh[];
  try {
    meshes = partMeshes(item);
  } catch {
    meshes = [fallbackMesh(item)];
  }
  const casts = item.kind !== 'rug';
  for (const mesh of meshes) {
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    group.add(mesh);
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
