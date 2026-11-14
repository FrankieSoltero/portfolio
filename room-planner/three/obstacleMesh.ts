import * as THREE from 'three';
import { obstacleFootprint } from '../domain/obstacles';
import type { Obstacle } from '../domain/types';
import type { Tokens } from '../styles/tokens';

/** Roughness of an obstacle's plain material (walls are 1, furniture fabric 0.92). */
const OBSTACLE_ROUGHNESS = 0.95;
/** Sides of a column's true cylinder in the Styled view (the plan checks use a 16-gon). */
const CYLINDER_SEGMENTS = 48;
/** How much larger than the solid the outline box is, in inches (as furniture outlines). */
const OUTLINE_PAD_XZ = 1.2;
const OUTLINE_PAD_Y = 0.6;

/**
 * Builds a fixed obstacle: a plain grey box (`width` × `height` × `depth`) or a true cylinder of
 * radius `width / 2`, sitting `elevation` inches above the floor. The group is placed at the
 * obstacle's centre on the floor (plan (x, y) → (X, Z)) and turned by its clockwise rotation, the
 * same way the renderer poses furniture. `userData.outline` holds a hidden outline box the renderer
 * shows when the obstacle is in conflict.
 */
export function buildObstacle(o: Obstacle, tokens: Tokens): THREE.Group {
  const group = new THREE.Group();
  const fp = obstacleFootprint(o);
  const depth = o.shape === 'cylinder' ? o.width : fp.d;
  const centreY = o.elevation + o.height / 2;

  const geometry = o.shape === 'cylinder'
    ? new THREE.CylinderGeometry(o.width / 2, o.width / 2, o.height, CYLINDER_SEGMENTS)
    : new THREE.BoxGeometry(fp.w, o.height, fp.d);
  const solid = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: tokens.n200, roughness: OBSTACLE_ROUGHNESS }),
  );
  solid.position.y = centreY;
  solid.castShadow = true;
  solid.receiveShadow = true;
  group.add(solid);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(fp.w + OUTLINE_PAD_XZ, o.height + OUTLINE_PAD_Y, depth + OUTLINE_PAD_XZ)),
    new THREE.LineBasicMaterial(),
  );
  outline.position.y = centreY;
  outline.visible = false;
  group.add(outline);
  group.userData.outline = outline;

  group.position.set(fp.cx, 0, fp.cy);
  group.rotation.y = -fp.angle * Math.PI / 180;
  return group;
}
