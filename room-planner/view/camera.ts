/**
 * Shared orbit camera maths for the 3D pane (realistic and blueprint renderers).
 * Pure functions in plan space: x along the room width, y along its length, z up.
 * Ported from prototype lines 408 (orbit), 572–575 (pose) and 730 (zoom).
 */
import { CONFIG } from '../config';
import type { CameraState, Room } from '../domain/types';
import type { PaneRect } from './panes';

/** A point in plan space: plan x, plan y, height. */
export type Vec3 = readonly [number, number, number];

/** Everything a renderer needs to place and project through the orbit camera. */
export interface CameraPose { position: Vec3; target: Vec3; distance: number;
  focalPx: number; fovDeg: number; aspect: number; viewOffsetX: number }

/** Camera looks at this fraction of the room height. */
const TARGET_HEIGHT_FRACTION = 0.35;
/** Orbit radius at zoom 1, in room diagonals. */
const DISTANCE_PER_DIAGONAL = 1.55;
/** Focal length in pixels per pixel of the shorter safe-area side. */
const FOCAL_PER_PX = 1.25;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Camera pose for the room at the given orbit state, fitted to the 3D pane. */
export function computeCameraPose(room: Room, camera: CameraState, pane: PaneRect): CameraPose {
  const target: Vec3 = [room.w / 2, room.l / 2, room.h * TARGET_HEIGHT_FRACTION];
  const distance = Math.hypot(room.w, room.l, room.h) * DISTANCE_PER_DIAGONAL / camera.zoom;
  const cp = Math.cos(camera.pitch);
  const position: Vec3 = [
    target[0] + distance * cp * Math.sin(camera.yaw),
    target[1] + distance * cp * Math.cos(camera.yaw),
    target[2] + distance * Math.sin(camera.pitch),
  ];
  const focalPx = Math.min(pane.safeW, pane.h) * FOCAL_PER_PX;
  return {
    position,
    target,
    distance,
    focalPx,
    fovDeg: 2 * Math.atan(pane.h / 2 / focalPx) * 180 / Math.PI,
    aspect: pane.w / pane.h,
    viewOffsetX: (pane.w - pane.safeW) / 2,
  };
}

/** Orbit state after dragging (dx, dy) pixels from `start`; pitch stays within its limits. */
export function orbitCamera(start: CameraState, dx: number, dy: number): CameraState {
  return {
    ...start,
    yaw: start.yaw - dx * CONFIG.orbitYawPerPx,
    pitch: clamp(start.pitch + dy * CONFIG.orbitPitchPerPx, CONFIG.pitchMin, CONFIG.pitchMax),
  };
}

/** Orbit state after a wheel event of `deltaY`; zoom stays within its limits. */
export function zoomCamera(camera: CameraState, deltaY: number): CameraState {
  return {
    ...camera,
    zoom: clamp(camera.zoom * Math.exp(-deltaY * CONFIG.zoomPerDelta), CONFIG.zoomMin, CONFIG.zoomMax),
  };
}
