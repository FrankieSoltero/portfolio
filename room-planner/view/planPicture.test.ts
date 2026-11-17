import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { obstacleFootprint, obstaclePolygon } from '../domain/obstacles';
import { footprintCorners, itemFootprint } from '../domain/shape';
import type { Conflicts, Corner, Door, Item, Obstacle, Opening, Point, Units, WindowOpening } from '../domain/types';
import { placedItem } from '../test/fixtures';
import { doorDrawing, windowDrawing } from './planFeatures';
import { labelBox, toPane } from './planLayout';
import { drawPlanPicture, PLAN_PICTURE_CREDIT, planPictureSize } from './planPicture';
import type { PlanPictureInput } from './planPicture';

/** Width of every character in the recording context's measureText, in pixels. */
const CHAR_W = 10;

/** A stand-in for Path2D, which jsdom does not have: it keeps the SVG path it was made from. */
class FakePath2D {
  constructor(readonly d?: string) {}
}

beforeAll(() => { vi.stubGlobal('Path2D', FakePath2D); });
afterAll(() => { vi.unstubAllGlobals(); });

type Rec =
  | { type: 'call'; name: string; args: unknown[] }
  | { type: 'set'; name: string; value: unknown };

/** A 2D context stand-in that records every method call and property set, in order. */
function recordingContext(): { g: CanvasRenderingContext2D; log: Rec[] } {
  const log: Rec[] = [];
  const proxy = new Proxy({}, {
    get(_t, name) {
      if (typeof name !== 'string') return undefined;
      return (...args: unknown[]) => {
        log.push({ type: 'call', name, args });
        if (name === 'measureText') return { width: Array.from(String(args[0])).length * CHAR_W };
        return undefined;
      };
    },
    set(_t, name, value) {
      if (typeof name === 'string') log.push({ type: 'set', name, value });
      return true;
    },
  });
  return { g: proxy as unknown as CanvasRenderingContext2D, log };
}

/** One painted path with the context state at the moment it was painted. */
interface Paint {
  op: 'fill' | 'stroke'; index: number; style: unknown; lineWidth: unknown; lineJoin: unknown;
  closed: boolean; coords: [number, number][]; args: unknown[];
}

interface Text {
  index: number; text: string; x: number; y: number; fillStyle: unknown; font: unknown;
  align: unknown; baseline: unknown; depth: number; translate: [number, number] | null; rotate: number | null;
}

interface Rect { index: number; args: unknown[]; fillStyle: unknown }

/** Replays the log, tracking context state, into paints, texts and filled rects. */
function replay(log: readonly Rec[]): { paints: Paint[]; texts: Text[]; rects: Rect[] } {
  const state: Record<string, unknown> = {};
  let coords: [number, number][] = [];
  let closed = false;
  let depth = 0;
  let translate: [number, number] | null = null;
  let rotate: number | null = null;
  const paints: Paint[] = [];
  const texts: Text[] = [];
  const rects: Rect[] = [];
  log.forEach((r, index) => {
    if (r.type === 'set') { state[r.name] = r.value; return; }
    switch (r.name) {
      case 'beginPath': coords = []; closed = false; break;
      case 'moveTo': case 'lineTo': coords.push([Number(r.args[0]), Number(r.args[1])]); break;
      case 'closePath': closed = true; break;
      case 'save': depth++; break;
      case 'restore': depth--; if (depth === 0) { translate = null; rotate = null; } break;
      case 'translate': translate = [Number(r.args[0]), Number(r.args[1])]; break;
      case 'rotate': rotate = Number(r.args[0]); break;
      case 'fill': case 'stroke':
        paints.push({ op: r.name, index, style: r.name === 'fill' ? state.fillStyle : state.strokeStyle,
          lineWidth: state.lineWidth, lineJoin: state.lineJoin, closed, coords: [...coords], args: r.args });
        break;
      case 'fillText':
        texts.push({ index, text: String(r.args[0]), x: Number(r.args[1]), y: Number(r.args[2]),
          fillStyle: state.fillStyle, font: state.font, align: state.textAlign, baseline: state.textBaseline,
          depth, translate, rotate });
        break;
      case 'fillRect': rects.push({ index, args: r.args, fillStyle: state.fillStyle }); break;
    }
  });
  return { paints, texts, rects };
}

function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no element at ${i}`);
  return v;
}

/** The 144 × 168 in room of the golden size values. */
const RECT: readonly Corner[] = [
  { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 },
];
/** The same room with its corners in the opposite order. */
const RECT_REVERSED: readonly Corner[] = [...RECT].reverse();
/** An L-shaped room in the same bounding box; the notch is at the bottom right. */
const L_ROOM: readonly Corner[] = [
  { id: 'l1', x: 0, y: 0 }, { id: 'l2', x: 144, y: 0 }, { id: 'l3', x: 144, y: 96 }, { id: 'l4', x: 72, y: 96 },
  { id: 'l5', x: 72, y: 168 }, { id: 'l6', x: 0, y: 168 },
];
/** The golden layout: scale 10, origin at (160, 160). */
const LAYOUT = { scale: 10, ox: 160, oy: 160 };

const SOFA = placedItem({ id: 'sofa-1', kind: 'sofa', name: 'Sofa', w: 80, d: 36, h: 30, cx: 60, cy: 40 });
const RUG = placedItem({ id: 'rug-1', kind: 'rug', name: 'Rug', w: 60, d: 40, h: 1, cx: 72, cy: 90 });
const DESK = placedItem({ id: 'desk-1', kind: 'desk', name: 'Desk', w: 48, d: 24, h: 30, cx: 100, cy: 140, angle: 30 });
const BOX: Obstacle = { id: 'ob-1', shape: 'box', label: 'Radiator', x: 20, y: 120, rotation: 0, width: 24,
  depth: 10, height: 30, elevation: 0 };
const COLUMN: Obstacle = { id: 'ob-2', shape: 'cylinder', label: '', x: 120, y: 60, rotation: 0, width: 12,
  depth: 12, height: 96, elevation: 0 };
const DOOR: Door = { id: 'd-1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' };
const WINDOW: WindowOpening = { id: 'w-1', kind: 'window', wallId: 'c2', offset: 40, width: 36, sill: 36, height: 48 };

function input(over: Partial<{ outline: readonly Corner[]; items: readonly Item[]; openings: readonly Opening[];
  obstacles: readonly Obstacle[]; conflicts: Conflicts; units: Units }> = {}): PlanPictureInput {
  return {
    outline: over.outline ?? RECT,
    items: over.items ?? [],
    openings: over.openings ?? [],
    obstacles: over.obstacles ?? [],
    conflicts: over.conflicts ?? {},
    units: over.units ?? 'ft',
  };
}

function draw(inp: PlanPictureInput) {
  const { g, log } = recordingContext();
  drawPlanPicture(g, inp);
  return { log, ...replay(log) };
}

function pane(pts: readonly Point[]): [number, number][] {
  return pts.map((p) => {
    const q = toPane(p, LAYOUT);
    return [q.x, q.y];
  });
}

/** The same pane points in the same order, to 6 decimal places. */
function expectPoints(actual: readonly [number, number][], expected: readonly [number, number][]): void {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((q, i) => {
    expect(q[0]).toBeCloseTo(expected[i]?.[0] ?? NaN, 6);
    expect(q[1]).toBeCloseTo(expected[i]?.[1] ?? NaN, 6);
  });
}

function itemPane(item: Item): [number, number][] {
  return pane(footprintCorners(itemFootprint(item)));
}

/** The paints whose path runs through exactly these points. */
function paintsAt(paints: readonly Paint[], coords: readonly [number, number][]): Paint[] {
  const key = (c: readonly [number, number][]) => c.map((q) => `${q[0].toFixed(6)},${q[1].toFixed(6)}`).join(' ');
  return paints.filter((p) => key(p.coords) === key(coords));
}

describe('planPictureSize', () => {
  it('gives scale 10, 1760 × 2000 and origin (160, 160) for the 144 × 168 room', () => {
    expect(planPictureSize(RECT)).toEqual({ width: 1760, height: 2000, layout: { scale: 10, ox: 160, oy: 160 } });
  });

  it('fits the longer side into 1680 px and moves the bounds\' min corner to (160, 160)', () => {
    const outline = [{ x: -20, y: 10 }, { x: 220, y: 10 }, { x: 220, y: 130 }, { x: -20, y: 130 }];
    expect(planPictureSize(outline)).toEqual({ width: 2000, height: 1160, layout: { scale: 7, ox: 300, oy: 90 } });
  });

  it('rounds the scaled sides to whole pixels', () => {
    const outline = [{ x: 0, y: 0 }, { x: 144, y: 0 }, { x: 144, y: 169 }, { x: 0, y: 169 }];
    const s = planPictureSize(outline);
    expect(s.layout.scale).toBeCloseTo(1680 / 169, 12);
    expect(s.width).toBe(Math.round(144 * (1680 / 169)) + 320);
    expect(s.width).toBe(1751);
    expect(s.height).toBe(2000);
  });
});

describe('drawPlanPicture', () => {
  it('exports the credit line exactly', () => {
    expect(PLAN_PICTURE_CREDIT).toBe('Room Planner · frankiesoltero.com/room-planner');
  });

  it('1. fills the whole canvas white before anything else', () => {
    const { rects, paints, texts } = draw(input());
    expect(rects).toHaveLength(1);
    const page = at(rects, 0);
    expect(page.args).toEqual([0, 0, 1760, 2000]);
    expect(page.fillStyle).toBe('#ffffff');
    expect(page.index).toBeLessThan(Math.min(...paints.map((p) => p.index), ...texts.map((t) => t.index)));
  });

  it('2. fills the closed outline with the floor colour', () => {
    const { paints } = draw(input());
    const floor = at(paints, 0);
    expect(floor.op).toBe('fill');
    expect(floor.style).toBe('#f7f5f0');
    expect(floor.closed).toBe(true);
    expectPoints(floor.coords, [[160, 160], [1600, 160], [1600, 1840], [160, 1840]]);
  });

  it('3. fills and strokes every turned footprint, rugs first, each group in stored order', () => {
    const { paints } = draw(input({ items: [SOFA, RUG, DESK] }));
    const furniture = paints.slice(1, 7);
    expect(furniture.map((p) => p.op)).toEqual(['fill', 'stroke', 'fill', 'stroke', 'fill', 'stroke']);
    [RUG, SOFA, DESK].forEach((item, k) => {
      const [fill, stroke] = [at(furniture, 2 * k), at(furniture, 2 * k + 1)];
      expectPoints(fill.coords, itemPane(item));
      expect(fill.closed).toBe(true);
      expect(fill.style).toBe('#e4e8ee');
      expect(stroke.coords).toEqual(fill.coords);
      expect(stroke.style).toBe('#3d4a63');
      expect(stroke.lineWidth).toBe(3);
    });
  });

  it('3. paints a conflicting item in the conflict colours', () => {
    const { paints } = draw(input({ items: [SOFA, DESK], conflicts: { 'desk-1': 'Overlaps the sofa.' } }));
    const [fill, stroke] = paintsAt(paints, itemPane(DESK));
    expect(fill?.style).toBe('#fbdada');
    expect(stroke?.style).toBe('#b3261e');
    expect(stroke?.lineWidth).toBe(3);
    const [sofaFill, sofaStroke] = paintsAt(paints, itemPane(SOFA));
    expect(sofaFill?.style).toBe('#e4e8ee');
    expect(sofaStroke?.style).toBe('#3d4a63');
  });

  it('4. fills and strokes every obstacle polygon after the furniture', () => {
    const { paints } = draw(input({ items: [SOFA], obstacles: [BOX, COLUMN] }));
    const obstacles = paints.slice(3, 7);
    [BOX, COLUMN].forEach((o, k) => {
      const [fill, stroke] = [at(obstacles, 2 * k), at(obstacles, 2 * k + 1)];
      expectPoints(fill.coords, pane(obstaclePolygon(o)));
      expect(fill.closed).toBe(true);
      expect([fill.op, fill.style]).toEqual(['fill', '#c5cad3']);
      expect([stroke.op, stroke.style, stroke.lineWidth]).toEqual(['stroke', '#3d4a63', 3]);
      expect(stroke.coords).toEqual(fill.coords);
    });
    expect(at(obstacles, 2).coords).toHaveLength(16);
  });

  it('4. paints a conflicting obstacle in the conflict colours', () => {
    const { paints } = draw(input({ obstacles: [BOX, COLUMN], conflicts: { 'ob-2': 'Blocks the door.' } }));
    const [fill, stroke] = paintsAt(paints, pane(obstaclePolygon(COLUMN)));
    expect(fill?.style).toBe('#fbdada');
    expect(stroke?.style).toBe('#b3261e');
    const [boxFill, boxStroke] = paintsAt(paints, pane(obstaclePolygon(BOX)));
    expect(boxFill?.style).toBe('#c5cad3');
    expect(boxStroke?.style).toBe('#3d4a63');
  });

  it('5. strokes the closed outline as walls, width 10 with mitred joins, after the obstacles', () => {
    const { paints } = draw(input({ items: [SOFA], obstacles: [BOX] }));
    const walls = at(paints, 5);
    expect(paints).toHaveLength(6);
    expect([walls.op, walls.style, walls.lineWidth, walls.lineJoin, walls.closed])
      .toEqual(['stroke', '#1a1c2c', 10, 'miter', true]);
    expectPoints(walls.coords, [[160, 160], [1600, 160], [1600, 1840], [160, 1840]]);
  });

  it('6. draws each window\'s segment as a white gap, then as the window line', () => {
    const wd = windowDrawing(WINDOW, RECT, LAYOUT);
    if (!wd) throw new Error('window not on its wall');
    const { paints } = draw(input({ openings: [WINDOW] }));
    expect(paints).toHaveLength(4);
    const [gap, line] = [at(paints, 2), at(paints, 3)];
    expect([gap.op, gap.style, gap.lineWidth]).toEqual(['stroke', '#ffffff', 10]);
    expect([line.op, line.style, line.lineWidth]).toEqual(['stroke', '#2f6fb0', 4]);
    expectPoints(gap.coords, [[wd.a.x, wd.a.y], [wd.b.x, wd.b.y]]);
    expectPoints(line.coords, [[wd.a.x, wd.a.y], [wd.b.x, wd.b.y]]);
  });

  it('7. draws each door\'s gap, its leaf, then its arc through Path2D, after the windows', () => {
    const dd = doorDrawing(DOOR, RECT, LAYOUT);
    if (!dd) throw new Error('door not on its wall');
    const { paints } = draw(input({ openings: [DOOR, WINDOW] }));
    expect(paints).toHaveLength(7);
    const [gap, leaf, arc] = [at(paints, 4), at(paints, 5), at(paints, 6)];
    expect([gap.op, gap.style, gap.lineWidth]).toEqual(['stroke', '#ffffff', 10]);
    expectPoints(gap.coords, dd.gap.map((p): [number, number] => [p.x, p.y]));
    expect([leaf.op, leaf.style, leaf.lineWidth]).toEqual(['stroke', '#1a1c2c', 3]);
    expectPoints(leaf.coords, dd.leaf.map((p): [number, number] => [p.x, p.y]));
    expect([arc.op, arc.style, arc.lineWidth]).toEqual(['stroke', '#1a1c2c', 2]);
    const path = arc.args[0];
    expect(path).toBeInstanceOf(FakePath2D);
    expect((path as FakePath2D).d).toBe(dd.arc);
  });

  it('skips an opening whose wall is missing', () => {
    const lost: Opening[] = [{ ...DOOR, wallId: 'gone' }, { ...WINDOW, wallId: 'gone' }];
    const bare = draw(input()).log;
    expect(draw(input({ openings: [DOOR] })).log).not.toEqual(bare);
    expect(draw(input({ openings: [WINDOW] })).log).not.toEqual(bare);
    expect(draw(input({ openings: lost })).log).toEqual(bare);
  });

  it('8. writes each item\'s name centred on its footprint, turned by labelBox, after the doors', () => {
    const { paints, texts } = draw(input({ items: [SOFA, DESK], openings: [DOOR] }));
    const lastPaint = Math.max(...paints.map((p) => p.index));
    const names = texts.slice(0, 2);
    [SOFA, DESK].forEach((item, k) => {
      const t = at(names, k);
      const fp = itemFootprint(item);
      const c = toPane({ x: fp.cx, y: fp.cy }, LAYOUT);
      expect(t.text).toBe(item.name);
      expect([t.x, t.y]).toEqual([0, 0]);
      expect(t.translate?.[0]).toBeCloseTo(c.x, 6);
      expect(t.translate?.[1]).toBeCloseTo(c.y, 6);
      expect(t.rotate).toBeCloseTo((labelBox(fp, LAYOUT).rotateDeg * Math.PI) / 180, 12);
      expect([t.font, t.align, t.baseline, t.fillStyle])
        .toEqual(['500 26px Barlow, sans-serif', 'center', 'middle', '#1a1c2c']);
      expect(t.index).toBeGreaterThan(lastPaint);
    });
    expect(at(names, 1).rotate).toBeCloseTo((30 * Math.PI) / 180, 12);
  });

  it('8. turns a name by the label box\'s tilt, not the item\'s whole angle', () => {
    const turned = placedItem({ id: 't', name: 'Bench', w: 40, d: 20, h: 18, cx: 72, cy: 84, angle: 100 });
    const t = at(draw(input({ items: [turned] })).texts, 0);
    expect(t.rotate).toBeCloseTo((10 * Math.PI) / 180, 12);
  });

  it('8. writes a non-empty obstacle label after the item names, and none for an empty label', () => {
    const { texts } = draw(input({ items: [SOFA], obstacles: [BOX, COLUMN] }));
    const names = texts.filter((t) => t.font === '500 26px Barlow, sans-serif');
    expect(names.map((t) => t.text)).toEqual(['Sofa', 'Radiator']);
    const box = at(names, 1);
    const c = toPane({ x: BOX.x, y: BOX.y }, LAYOUT);
    expect(box.translate?.[0]).toBeCloseTo(c.x, 6);
    expect(box.translate?.[1]).toBeCloseTo(c.y, 6);
    expect(box.rotate).toBeCloseTo((labelBox(obstacleFootprint(BOX), LAYOUT).rotateDeg * Math.PI) / 180, 12);
    expect([box.align, box.baseline, box.fillStyle]).toEqual(['center', 'middle', '#1a1c2c']);
  });

  it('8. writes a conflicting item\'s or obstacle\'s name in the conflict colour', () => {
    const { texts } = draw(input({ items: [SOFA, DESK], obstacles: [BOX],
      conflicts: { 'desk-1': 'Overlaps.', 'ob-1': 'Overlaps.' } }));
    const colour = (text: string) => texts.find((t) => t.text === text)?.fillStyle;
    expect(colour('Sofa')).toBe('#1a1c2c');
    expect(colour('Desk')).toBe('#b3261e');
    expect(colour('Radiator')).toBe('#b3261e');
  });

  describe('8. fitting a name to the label box width less 16 px', () => {
    // A 30 in wide item at scale 10 has a 300 px label box: names up to 284 px (28 characters) fit.
    const named = (name: string, w = 30, d = 10, angle = 0) =>
      placedItem({ id: 'n', name, w, d, h: 10, cx: 72, cy: 84, angle });
    const nameOf = (item: Item) => draw(input({ items: [item] })).texts.filter((t) => t.font === '500 26px Barlow, sans-serif');

    it('keeps a name that just fits', () => {
      const name = 'A'.repeat(28);
      expect(nameOf(named(name)).map((t) => t.text)).toEqual([name]);
    });

    it('cuts a name that is too wide and ends it with …', () => {
      const name = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD';
      expect(nameOf(named(name)).map((t) => t.text)).toEqual([`${name.slice(0, 27)}…`]);
    });

    it('uses the label box width, which swaps to the depth at a quarter turn', () => {
      // At 90° the box is 10 in × 10 = 100 px wide: 84 px fits 8 characters, so 7 plus the ….
      expect(nameOf(named('Bookshelf unit', 30, 10, 90)).map((t) => t.text)).toEqual(['Bookshe…']);
    });

    it('draws nothing when not even one character and … fit', () => {
      // 3 in at scale 10 is 30 px, less 16 leaves 14 px: one character fits, two do not.
      expect(nameOf(named('A', 3)).map((t) => t.text)).toEqual(['A']);
      expect(nameOf(named('AB', 3))).toEqual([]);
    });

    it('cuts an obstacle label the same way', () => {
      const shelf: Obstacle = { ...BOX, label: 'Built-in shelving', width: 10 };
      const { texts } = draw(input({ obstacles: [shelf] }));
      // 100 px less 16 leaves 84 px: 7 characters and the ….
      expect(texts.filter((t) => t.font === '500 26px Barlow, sans-serif').map((t) => t.text)).toEqual(['Built-i…']);
    });
  });

  it('9. writes every wall\'s length level, 34 px outside its midpoint, after the names', () => {
    const { texts } = draw(input({ items: [SOFA] }));
    const name = at(texts, 0);
    const lengths = texts.filter((t) => t.font === '600 28px Barlow, sans-serif');
    expect(lengths.map((t) => [t.text, t.x, t.y])).toEqual([
      ['12′ 0″', 880, 126], ['14′ 0″', 1634, 1000], ['12′ 0″', 880, 1874], ['14′ 0″', 126, 1000],
    ]);
    for (const t of lengths) {
      expect([t.align, t.baseline, t.fillStyle, t.depth, t.rotate]).toEqual(['center', 'middle', '#1a1c2c', 0, null]);
      expect(t.index).toBeGreaterThan(name.index);
    }
  });

  it('9. finds the outside of each wall from the room, not from the corner order', () => {
    const lengths = draw(input({ outline: RECT_REVERSED })).texts.filter((t) => t.font === '600 28px Barlow, sans-serif');
    expect(lengths.map((t) => [t.x, t.y]).sort()).toEqual([[126, 1000], [1634, 1000], [880, 126], [880, 1874]].sort());
  });

  it('9. puts the lengths of an L-shaped room\'s notch walls in the notch', () => {
    const lengths = draw(input({ outline: L_ROOM, units: 'm' })).texts
      .filter((t) => t.font === '600 28px Barlow, sans-serif');
    expect(lengths.map((t) => [t.text, t.x, t.y])).toEqual([
      ['3.66 m', 880, 126], ['2.44 m', 1634, 640], ['1.83 m', 1240, 1154], ['1.83 m', 914, 1480],
      ['1.83 m', 520, 1874], ['4.27 m', 126, 1000],
    ]);
  });

  it('10. writes the credit last, left-aligned at (160, height − 36)', () => {
    const { texts, log } = draw(input({ items: [SOFA], obstacles: [BOX], openings: [DOOR, WINDOW] }));
    const credit = at(texts, texts.length - 1);
    expect([credit.text, credit.x, credit.y, credit.align, credit.font, credit.fillStyle])
      .toEqual([PLAN_PICTURE_CREDIT, 160, 1964, 'left', '400 22px Barlow, sans-serif', '#6b7280']);
    const lastDraw = log.reduce((m, r, i) => (r.type === 'call' && ['fill', 'stroke', 'fillText', 'fillRect'].includes(r.name) ? i : m), -1);
    expect(credit.index).toBe(lastDraw);
  });

  it('draws the steps in order: page, floor, furniture, obstacles, walls, windows, doors, names, lengths, credit', () => {
    const { rects, paints, texts } = draw(input({ items: [SOFA, RUG], obstacles: [BOX], openings: [DOOR, WINDOW] }));
    const step = [
      at(rects, 0).index,
      at(paints, 0).index,
      paintsAt(paints, itemPane(RUG))[0]?.index,
      paintsAt(paints, itemPane(SOFA))[0]?.index,
      paintsAt(paints, pane(obstaclePolygon(BOX)))[0]?.index,
      paints.find((p) => p.lineWidth === 10 && p.style === '#1a1c2c')?.index,
      paints.find((p) => p.style === '#2f6fb0')?.index,
      paints.find((p) => p.lineWidth === 3 && p.style === '#1a1c2c')?.index,
      texts.find((t) => t.text === 'Rug')?.index,
      texts.find((t) => t.text === 'Radiator')?.index,
      texts.find((t) => t.font === '600 28px Barlow, sans-serif')?.index,
      texts.find((t) => t.text === PLAN_PICTURE_CREDIT)?.index,
    ];
    step.forEach((s) => expect(s).toBeTypeOf('number'));
    expect([...step].sort((a, b) => Number(a) - Number(b))).toEqual(step);
  });

  it('uses no selection colour: every colour is one of the picture\'s own', () => {
    const { log } = draw(input({ items: [SOFA, RUG, DESK], obstacles: [BOX, COLUMN], openings: [DOOR, WINDOW],
      conflicts: { 'desk-1': 'x', 'ob-2': 'y' } }));
    const palette = ['#ffffff', '#f7f5f0', '#e4e8ee', '#3d4a63', '#c5cad3', '#fbdada', '#b3261e', '#1a1c2c',
      '#2f6fb0', '#6b7280'];
    const colours = log.filter((r) => r.type === 'set' && (r.name === 'fillStyle' || r.name === 'strokeStyle'))
      .map((r) => (r.type === 'set' ? r.value : null));
    expect(colours.length).toBeGreaterThan(0);
    expect(colours.every((c) => palette.includes(String(c)))).toBe(true);
  });

  it('restores every save and leaves no transform on the context', () => {
    const { log } = draw(input({ items: [SOFA, RUG, DESK], obstacles: [BOX, COLUMN], openings: [DOOR, WINDOW] }));
    let depth = 0;
    let saves = 0;
    for (const r of log) {
      if (r.type !== 'call') continue;
      if (r.name === 'save') { depth++; saves++; }
      if (r.name === 'restore') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
      if (['translate', 'rotate', 'scale', 'transform', 'setTransform', 'resetTransform'].includes(r.name)) {
        expect(depth).toBeGreaterThan(0);
      }
    }
    expect(saves).toBeGreaterThan(0);
    expect(depth).toBe(0);
  });
});
