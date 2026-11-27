import type * as THREE from 'three';
import type { Item } from '../domain/types';
import { buildFurniture } from './furnitureModels';

/**
 * Identifies the geometry an item needs: kind, size, model asset and recipe (style, by sorted key,
 * and both colours). Position, rotation, name and price are excluded, so moving or renaming an item
 * reuses its model.
 */
export function modelKey(item: Item): string {
  const style = Object.keys(item.style).sort().map((key) => [key, item.style[key]]);
  return JSON.stringify([item.kind, item.w, item.d, item.h, item.model.assetUrl, style, item.colours.main, item.colours.accent]);
}

/** Returns the 3D model for an item. Today every item gets its parametric model. */
export function resolveModel(item: Item): THREE.Group {
  // Future: when `item.model.assetUrl` is set, load and return that GLB here instead.
  return buildFurniture(item);
}
