import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { roomBounds } from '../domain/shape';
import type { Bounds, CameraState, Room } from '../domain/types';
import { computeCameraPose, orbitCamera, zoomCamera } from './camera';
import type { PaneRect } from './panes';

const ROOM: Room = { w: 144, l: 168, h: 96 };
const BOUNDS: Bounds = roomBounds(ROOM);
const HEIGHT = 96;
const DEFAULT_CAMERA: CameraState = { ...CONFIG.camera };

function pane(over: Partial<PaneRect>): PaneRect {
  return { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 1000, ...over };
}

describe('computeCameraPose', () => {
  it('targets the bounds centre at 35% of the room height', () => {
    const pose = computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({}));
    expect(pose.target[0]).toBeCloseTo(72, 10);
    expect(pose.target[1]).toBeCloseTo(84, 10);
    expect(pose.target[2]).toBeCloseTo(33.6, 10);
  });

  it('sits 1.55 room diagonals from the target at zoom 1', () => {
    const pose = computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({}));
    expect(pose.distance).toBeCloseTo(Math.hypot(144, 168, 96) * 1.55, 10);
    expect(pose.distance).toBeCloseTo(373.86, 2);
  });

  it('halves the distance at zoom 2', () => {
    const near = computeCameraPose(BOUNDS, HEIGHT, { ...DEFAULT_CAMERA, zoom: 2 }, pane({}));
    const far = computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({}));
    expect(near.distance).toBeCloseTo(far.distance / 2, 10);
  });

  it('places the camera on the orbit sphere given by yaw and pitch', () => {
    const pose = computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({}));
    const { yaw, pitch } = DEFAULT_CAMERA;
    const d = pose.distance;
    expect(pose.position[0]).toBeCloseTo(72 + d * Math.cos(pitch) * Math.sin(yaw), 10);
    expect(pose.position[1]).toBeCloseTo(84 + d * Math.cos(pitch) * Math.cos(yaw), 10);
    expect(pose.position[2]).toBeCloseTo(33.6 + d * Math.sin(pitch), 10);
  });

  it('derives focal length and vertical FOV from the safe width and pane height', () => {
    const pose = computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({ w: 1000, safeW: 608, h: 600 }));
    expect(pose.focalPx).toBeCloseTo(750, 10);
    expect(pose.fovDeg).toBeCloseTo(43.60, 2);
  });

  it('uses the full pane width for the aspect ratio', () => {
    const pose = computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({ w: 1000, safeW: 608, h: 600 }));
    expect(pose.aspect).toBeCloseTo(1000 / 600, 10);
  });

  it('offsets the view by half the width the safe area gives up', () => {
    expect(computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({ w: 1000, safeW: 608 })).viewOffsetX).toBeCloseTo(196, 10);
    expect(computeCameraPose(BOUNDS, HEIGHT, DEFAULT_CAMERA, pane({ w: 1000, safeW: 1000 })).viewOffsetX).toBe(0);
  });

  it('centres on an offset outline and sizes the orbit from its bounds and the height', () => {
    const offset: Bounds = { minX: 20, minY: 10, maxX: 120, maxY: 60, w: 100, l: 50 };
    const pose = computeCameraPose(offset, HEIGHT, DEFAULT_CAMERA, pane({}));
    expect(pose.target[0]).toBeCloseTo(70, 10);
    expect(pose.target[1]).toBeCloseTo(35, 10);
    expect(pose.target[2]).toBeCloseTo(33.6, 10);
    expect(pose.distance).toBeCloseTo(Math.hypot(100, 50, 96) * 1.55, 10);
  });
});

describe('orbitCamera', () => {
  it('turns yaw against dx and tilts pitch with dy', () => {
    const next = orbitCamera(DEFAULT_CAMERA, 100, 10);
    expect(next.yaw).toBeCloseTo(-1.45, 10);
    expect(next.pitch).toBeCloseTo(0.61, 10);
    expect(next.zoom).toBe(DEFAULT_CAMERA.zoom);
  });

  it('clamps pitch to [0.12, 1.45]', () => {
    expect(orbitCamera(DEFAULT_CAMERA, 0, 1000).pitch).toBe(1.45);
    expect(orbitCamera(DEFAULT_CAMERA, 0, -1000).pitch).toBe(0.12);
  });
});

describe('zoomCamera', () => {
  it('scales zoom exponentially with the wheel delta', () => {
    const next = zoomCamera(DEFAULT_CAMERA, -100);
    expect(next.zoom).toBeCloseTo(Math.exp(0.1), 10);
    expect(next.zoom).toBeCloseTo(1.1052, 4);
    expect(next.yaw).toBe(DEFAULT_CAMERA.yaw);
    expect(next.pitch).toBe(DEFAULT_CAMERA.pitch);
  });

  it('clamps zoom to [0.6, 2.5]', () => {
    expect(zoomCamera(DEFAULT_CAMERA, -100000).zoom).toBe(2.5);
    expect(zoomCamera(DEFAULT_CAMERA, 100000).zoom).toBe(0.6);
  });
});
