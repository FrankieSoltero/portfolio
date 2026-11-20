import { describe, expect, it } from 'vitest';
import { newObstacle } from '../domain/obstacles';
import { itemFootprint, roomHeight, roomOutline } from '../domain/shape';
import { defaultColours, defaultStyle } from '../domain/furniture/recipe';
import type { Opening } from '../domain/types';
import { furnishedDocument, placedItem, planDoc, rectRoom } from './fixtures';

describe('rectRoom', () => {
  it('outlines the rectangle from (0,0) clockwise with corners c1…c4 and keeps the height', () => {
    const room = rectRoom(144, 168, 96);
    expect(roomOutline(room)).toEqual([
      { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 },
    ]);
    expect(roomHeight(room)).toBe(96);
  });

  it('stores the outline and height', () => {
    const room = rectRoom(144, 168, 96);
    expect(room).toEqual({ outline: roomOutline(room), height: 96 });
  });
});

describe('placedItem', () => {
  it('round-trips a turned item through itemFootprint', () => {
    const item = placedItem({ w: 55, d: 26, h: 30, cx: 131, cy: 131.5, angle: 90 });
    expect(itemFootprint(item)).toEqual({ cx: 131, cy: 131.5, w: 55, d: 26, angle: 90 });
  });

  it.each([0, 90, 180, 270])('round-trips angle %i', (angle) => {
    const item = placedItem({ w: 64, d: 85, h: 38, cx: 72, cy: 42.5, angle });
    expect(itemFootprint(item)).toEqual({ cx: 72, cy: 42.5, w: 64, d: 85, angle });
  });

  it('defaults the angle to 0', () => {
    const item = placedItem({ w: 20, d: 10, h: 5, cx: 30, cy: 20 });
    expect(itemFootprint(item)).toEqual({ cx: 30, cy: 20, w: 20, d: 10, angle: 0 });
  });

  it('accepts an angle that is not a quarter turn', () => {
    const item = placedItem({ w: 20, d: 20, h: 20, cx: 0, cy: 0, angle: 45 });
    expect(itemFootprint(item)).toEqual({ cx: 0, cy: 0, w: 20, d: 20, angle: 45 });
  });

  it('stores the footprint centre as x, y and the angle', () => {
    const item = placedItem({ w: 55, d: 26, h: 30, cx: 131, cy: 131.5, angle: 90 });
    expect(item).toMatchObject({ x: 131, y: 131.5, angle: 90 });
    expect(item).not.toHaveProperty('rot');
  });

  it('fills the other fields with fixed defaults and honours overrides', () => {
    const plain = placedItem({ w: 20, d: 20, h: 20, cx: 10, cy: 10 });
    expect(plain).toMatchObject({ kind: 'box', price: null, sourceUrl: null, w: 20, d: 20, h: 20 });
    expect([plain.style, plain.colours]).toEqual([defaultStyle('box'), defaultColours('box')]);
    expect(placedItem({ w: 20, d: 20, h: 20, cx: 10, cy: 10 })).toEqual(plain);
    const named = placedItem({ id: 'rug-1', kind: 'rug', name: 'Wool rug', price: 100, w: 60, d: 40, h: 1, cx: 40, cy: 120 });
    expect(named).toMatchObject({ id: 'rug-1', kind: 'rug', name: 'Wool rug', price: 100 });
    expect([named.style, named.colours]).toEqual([defaultStyle('rug'), defaultColours('rug')]);
  });

  it('returns a fresh object each call', () => {
    const spec = { w: 20, d: 20, h: 20, cx: 10, cy: 10 };
    const a = placedItem(spec);
    const b = placedItem(spec);
    expect(a).not.toBe(b);
    expect(a.model).not.toBe(b.model);
    expect(a.style).not.toBe(b.style);
    expect(a.colours).not.toBe(b.colours);
  });
});

describe('planDoc', () => {
  it('assembles a version 4 document, in feet unless told otherwise, with no openings or obstacles by default', () => {
    const room = rectRoom(144, 168, 96);
    const items = [placedItem({ w: 20, d: 20, h: 20, cx: 10, cy: 10 })];
    expect(planDoc(room, items)).toEqual({ schemaVersion: 4, units: 'ft', room, items, openings: [], obstacles: [] });
    expect(planDoc(room, items, 'm').units).toBe('m');
  });

  it('takes the openings and obstacles it is given', () => {
    const room = rectRoom(144, 168, 96);
    const openings: Opening[] = [{ id: 'd1', kind: 'door', wallId: 'c1', offset: 20, width: 32, height: 80, hinge: 'start', swing: 'in' }];
    const obstacles = [newObstacle('box', { x: 40, y: 120 }, 96, 'b1')];
    const doc = planDoc(room, [], 'ft', openings, obstacles);
    expect(doc).toEqual({ schemaVersion: 4, units: 'ft', room, items: [], openings, obstacles });
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'units', 'room', 'items', 'openings', 'obstacles']);
  });
});

describe('furnishedDocument', () => {
  it('is the old seeded plan at version 4: the 144 x 168 in room with the bed and the desk in their default style and colours', () => {
    const model = { tier: 'retailer', label: '3D model from retailer', assetUrl: null };
    expect(furnishedDocument()).toEqual({
      schemaVersion: 4,
      units: 'ft',
      room: rectRoom(144, 168, 96),
      items: [
        {
          id: 'seed-bed', kind: 'bed', name: 'Low platform bed, queen', host: 'shop.example', sourceUrl: null, price: 890, w: 64, d: 85, h: 38, x: 72, y: 42.5, angle: 0, model,
          style: { headboard: 'low', finish: 'panel', footboard: 'no', base: 'platform' }, colours: { main: '#8a9a8b', accent: '#a67c52' },
        },
        {
          id: 'seed-desk', kind: 'desk', name: 'Tack writing desk', host: 'shop.example', sourceUrl: null, price: 420, w: 55, d: 26, h: 30, x: 131, y: 131.5, angle: 90, model,
          style: { supports: 'legs', drawers: 'right' }, colours: { main: '#b98d5e', accent: '#2b2b2d' },
        },
      ],
      openings: [],
      obstacles: [],
    });
    expect(Object.keys(furnishedDocument())).toEqual(['schemaVersion', 'units', 'room', 'items', 'openings', 'obstacles']);
  });

  it('returns a fresh object each call', () => {
    const a = furnishedDocument();
    const b = furnishedDocument();
    expect(a).not.toBe(b);
    expect(a.items).not.toBe(b.items);
    expect(a.items[0]).not.toBe(b.items[0]);
    expect(a.items[0]?.model).not.toBe(b.items[0]?.model);
    expect(a.items[0]?.style).not.toBe(b.items[0]?.style);
    expect(a.items[0]?.colours).not.toBe(b.items[0]?.colours);
    expect(a.room.outline).not.toBe(b.room.outline);
    expect(a.openings).not.toBe(b.openings);
    expect(a.obstacles).not.toBe(b.obstacles);
  });
});
