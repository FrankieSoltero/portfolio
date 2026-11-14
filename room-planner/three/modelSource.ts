import type * as THREE from 'three';
import type { Item } from '../domain/types';
import { buildFurniture } from './furnitureModels';

/**
 * Identifies the geometry an item needs: kind, size and model asset. Position, rotation,
 * name and price are excluded, so moving or renaming an item reuses its model.
 */
export function modelKey(item: Item): string {
  return JSON.stringify([item.kind, item.w, item.d, item.h, item.model.assetUrl]);
}

/** Returns the 3D model for an item. Today every item gets its parametric model. */
export function resolveModel(item: Item): THREE.Group {
  // Future: when `item.model.assetUrl` is set, load and return that GLB here instead.
  return buildFurniture(item);
}
