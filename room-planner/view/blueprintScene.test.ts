import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument, PARTS } from '../domain/catalog';
import { mapPart } from '../domain/geometry';
import type { Item } from '../domain/types';
import { computeCameraPose } from './camera';
import type { Vec3 } from './camera';
import { buildBoxes, frontOf, makeProjector, sortBoxes } from './blueprintScene';
import type { Box } from './blueprintScene';
import type { PaneRect } from './panes';

function seed(id: string): Item {
  const found = createInitialDocument().items.find(i => i.id === id);
  if (!found) throw new Error(`missing seed item ${id}`);
  return found;
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}

function box(id: string, x0: number, x1: number, y0: number, y1: number, z0 = 0, z1 = 10): Box {
  return { x0, x1, y0, y1, z0, z1, itemId: id, kind: 'box' };
}

describe('buildBoxes', () => {
  it('turns each bed part into a box scaled by height and offset by position', () => {
    const bed = seed('seed-bed');
    const { boxes, rugs } = buildBoxes([bed]);
    expect(rugs).toHaveLength(0);
    expect(boxes).toHaveLength(4);
    PARTS.bed.forEach((p, i) => {
      const b = at(boxes, i);
      expect(b.itemId).toBe('seed-bed');
      expect(b.kind).toBe('bed');
      expect(b.z0).toBeCloseTo(p[4] * 38, 10);
      expect(b.z1).toBeCloseTo(p[5] * 38, 10);
      expect(b.x0).toBeCloseTo(40 + p[0] * 64, 10);
      expect(b.x1).toBeCloseTo(40 + p[1] * 64, 10);
      expect(b.y0).toBeCloseTo(0 + p[2] * 85, 10);
      expect(b.y1).toBeCloseTo(0 + p[3] * 85, 10);
    });
    expect(at(boxes, 0)).toMatchObject({ x0: 40, x1: 104 });
    expect(at(boxes, 0).y0).toBeCloseTo(3.4, 10);
    expect(at(boxes, 0).z1).toBeCloseTo(15.96, 10);
  });

  it('rotates parts with mapPart over the rotated footprint', () => {
    const desk = seed('seed-desk');
    const { boxes } = buildBoxes([desk]);
    expect(boxes).toHaveLength(PARTS.desk.length);
    PARTS.desk.forEach((part, i) => {
      const b = at(boxes, i);
      const m = mapPart(part, 1);
      expect(b.x0).toBeCloseTo(118 + m[0] * 26, 10);
      expect(b.x1).toBeCloseTo(118 + m[1] * 26, 10);
      expect(b.y0).toBeCloseTo(104 + m[2] * 55, 10);
      expect(b.y1).toBeCloseTo(104 + m[3] * 55, 10);
    });
    expect(at(boxes, 1).x0).toBeCloseTo(119.56, 10);
    expect(at(boxes, 1).y1).toBeCloseTo(107.3, 10);
  });

  it('puts rug parts in rugs and not in boxes', () => {
    const rug: Item = { ...seed('seed-bed'), id: 'rug-1', kind: 'rug', h: 0.5 };
    const { boxes, rugs } = buildBoxes([rug, seed('seed-desk')]);
    expect(rugs).toHaveLength(1);
    expect(at(rugs, 0).itemId).toBe('rug-1');
    expect(boxes.some(b => b.itemId === 'rug-1')).toBe(false);
    expect(boxes).toHaveLength(PARTS.desk.length);
  });
});

describe('frontOf', () => {
  it('puts a in front when it is entirely left of b and the camera is left of a', () => {
    const a = box('a', 0, 10, 0, 10);
    const b = box('b', 20, 30, 0, 10);
    expect(frontOf(a, b, [-50, 5, 5])).toBe(1);
    expect(frontOf(b, a, [-50, 5, 5])).toBe(-1);
  });

  it('returns 0 for overlapping boxes', () => {
    const a = box('a', 0, 10, 0, 10);
    const b = box('b', 5, 15, 5, 15, 5, 15);
    expect(frontOf(a, b, [-50, -50, 50])).toBe(0);
  });
});

describe('sortBoxes', () => {
  it('orders boxes far to near along a line from the camera', () => {
    const cam: Vec3 = [-100, 5, 5];
    const near = box('near', 0, 10, 0, 10);
    const far = box('far', 40, 50, 0, 10);
    expect(sortBoxes([near, far], cam).map(b => b.itemId)).toEqual(['far', 'near']);
  });

  it('terminates on a cyclic set and returns every box exactly once', () => {
    // Pinwheel: each box is in front of the next, so every box is blocked.
    const cam: Vec3 = [15, 15, 100];
    const a = box('a', 0, 10, 0, 20);
    const b = box('b', 10, 30, 0, 10);
    const c = box('c', 20, 30, 10, 30);
    const d = box('d', 0, 20, 20, 30);
    expect([frontOf(b, a, cam), frontOf(c, b, cam), frontOf(d, c, cam), frontOf(a, d, cam)]).toEqual([1, 1, 1, 1]);
    const sorted = sortBoxes([a, b, c, d], cam);
    expect(sorted).toHaveLength(4);
    expect(new Set(sorted)).toEqual(new Set([a, b, c, d]));
  });
});

describe('makeProjector', () => {
  const pane: PaneRect = { left: 0, top: 0, w: 1000, h: 600, z: 1, inset: false, divider: false, safeW: 608 };
  const pose = computeCameraPose({ w: 144, l: 168, h: 96 }, { ...CONFIG.camera }, pane);

  it('maps the camera target to the centre of the safe area', () => {
    const project = makeProjector(pose, pane.safeW, pane.h);
    const [x, y] = project(pose.target);
    expect(x).toBeCloseTo(304, 6);
    expect(y).toBeCloseTo(300, 6);
  });

  it('projects a point above the target higher on screen', () => {
    const project = makeProjector(pose, pane.safeW, pane.h);
    const [x, y] = project([pose.target[0], pose.target[1], pose.target[2] + 10]);
    expect(x).toBeCloseTo(304, 6);
    expect(y).toBeLessThan(300);
  });
});
