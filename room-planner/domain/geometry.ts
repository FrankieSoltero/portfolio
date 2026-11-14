import { CONFIG } from '../config';
import type { Item, PartRect, Room, Rot } from './types';

/** Plan-space footprint [width along x, depth along y]; odd rotations swap w and d. */
export function footprint(item: Pick<Item, 'w' | 'd' | 'rot'>): [number, number] {
  return item.rot % 2 ? [item.d, item.w] : [item.w, item.d];
}

/** Rotates a part's [u0,u1,v0,v1] fractions into footprint space for the given quarter turn. */
export function mapPart(part: PartRect, rot: Rot): [number, number, number, number] {
  const [u0, u1, v0, v1] = part;
  if (rot === 1) return [1 - v1, 1 - v0, u0, u1];
  if (rot === 2) return [1 - u1, 1 - u0, 1 - v1, 1 - v0];
  if (rot === 3) return [v0, v1, 1 - u1, 1 - u0];
  return [u0, u1, v0, v1];
}

/** Rounds v to the nearest multiple of snap, then clamps into [0, max]; a negative max clamps to 0. */
export function clampSnap(v: number, max: number, snap: number): number {
  const snapped = Math.round(v / snap) * snap;
  return Math.max(0, Math.min(snapped, Math.max(0, max)));
}

/** Returns a copy of item moved to (x, y), snapped and kept inside the room by its footprint. */
export function moveItem(item: Item, x: number, y: number, room: Room, snap: number): Item {
  const [fw, fd] = footprint(item);
  return { ...item, x: clampSnap(x, room.w - fw, snap), y: clampSnap(y, room.l - fd, snap) };
}

/** Returns a copy of item turned a quarter turn about its footprint centre, re-snapped into the room. */
export function rotateItem(item: Item, room: Room, snap: number): Item {
  const [fw, fd] = footprint(item);
  const cx = item.x + fw / 2;
  const cy = item.y + fd / 2;
  return {
    ...item,
    rot: ((item.rot + 1) % 4) as Rot,
    x: clampSnap(cx - fd / 2, room.w - fd, snap),
    y: clampSnap(cy - fw / 2, room.l - fw, snap),
  };
}

/** Snapped top-left position that centres an unrotated w×d footprint in the room. */
export function centrePosition(dims: { w: number; d: number }, room: Room, snap: number): { x: number; y: number } {
  return {
    x: clampSnap((room.w - dims.w) / 2, room.w - dims.w, snap),
    y: clampSnap((room.l - dims.d) / 2, room.l - dims.d, snap),
  };
}

/** Snaps a room dimension to the room-handle step and clamps it to the allowed room size. */
export function snapRoomDim(inches: number): number {
  const step = CONFIG.roomHandleSnap;
  return Math.max(CONFIG.roomMin, Math.min(CONFIG.roomMax, Math.round(inches / step) * step));
}
