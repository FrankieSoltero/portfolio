import { describe, expect, it } from 'vitest';
import type { Kind } from '../types';
import {
  COLOUR_PATTERN,
  KIND_LABELS,
  KIND_ORDER,
  STYLE_OPTIONS,
  SWATCHES,
  TYPICAL_SIZE,
  completeStyle,
  defaultColours,
  defaultStyle,
  lighten,
  normaliseColour,
} from './recipe';

const ALL_KINDS: Kind[] = ['sofa', 'chair', 'bed', 'desk', 'table', 'shelf', 'dresser', 'nightstand', 'tvstand', 'rug', 'box'];

/** Each kind's options as `key: values` with the fallback marked `*`, for a compact exact check. */
function optionSummary(kind: Kind): string[] {
  return STYLE_OPTIONS[kind].map((o) => `${o.key}: ${o.values.map((v) => (v.value === o.fallback ? `*${v.value}` : v.value)).join(' ')}`);
}

describe('kind tables', () => {
  it('lists the kinds in order with their labels', () => {
    expect(KIND_ORDER).toEqual(ALL_KINDS);
    expect(KIND_ORDER.map((k) => KIND_LABELS[k])).toEqual([
      'Sofa', 'Chair', 'Bed', 'Desk', 'Table', 'Shelf', 'Dresser', 'Nightstand', 'TV stand', 'Rug', 'Box',
    ]);
  });

  it('has the typical size of every kind', () => {
    expect(TYPICAL_SIZE).toEqual({
      sofa: { w: 84, d: 36, h: 33 }, chair: { w: 30, d: 32, h: 31 }, bed: { w: 64, d: 85, h: 38 },
      desk: { w: 55, d: 26, h: 30 }, table: { w: 44, d: 24, h: 16 }, shelf: { w: 36, d: 13, h: 78 },
      dresser: { w: 60, d: 18, h: 34 }, nightstand: { w: 22, d: 16, h: 24 }, tvstand: { w: 60, d: 16, h: 22 },
      rug: { w: 60, d: 96, h: 0.5 }, box: { w: 36, d: 24, h: 30 },
    });
  });

  it('has the swatches', () => {
    expect(SWATCHES).toEqual([
      { label: 'Slate', colour: '#6f7f8c' }, { label: 'Sage', colour: '#8a9a8b' }, { label: 'Rust', colour: '#b5673f' },
      { label: 'Sand', colour: '#c9b8a3' }, { label: 'Cream', colour: '#ddd8ce' }, { label: 'Charcoal', colour: '#3a3d42' },
      { label: 'Navy', colour: '#2f4057' }, { label: 'Oak', colour: '#b98d5e' }, { label: 'Walnut', colour: '#6b4a33' },
      { label: 'Espresso', colour: '#3b2f27' }, { label: 'Black metal', colour: '#2b2b2d' }, { label: 'Brass', colour: '#b08d57' },
      { label: 'White', colour: '#f3f1ec' },
    ]);
    for (const s of SWATCHES) expect(s.colour).toMatch(COLOUR_PATTERN);
  });
});

describe('STYLE_OPTIONS', () => {
  it('has exactly the listed options, values and fallbacks', () => {
    expect(Object.fromEntries(ALL_KINDS.map((k) => [k, optionSummary(k)]))).toEqual({
      sofa: [
        'seats: *auto 1 2 3 4 5', 'arms: *track rounded slim none', 'back: low *standard high',
        'cushions: *loose tight', 'legs: *block tapered metal none', 'chaise: *none left right',
      ],
      chair: ['type: *armchair dining office', 'arms: *yes no', 'legs: *block tapered metal pedestal'],
      bed: ['headboard: none *low tall', 'finish: *panel upholstered', 'footboard: yes *no', 'base: *platform legs storage'],
      desk: ['supports: *legs trestle panels', 'drawers: none left *right both'],
      table: ['top: *rectangle round', 'base: *legs pedestal trestle', 'shelf: *yes no'],
      shelf: ['shelves: *auto 2 3 4 5 6 7 8', 'back: *yes no', 'books: *yes no'],
      dresser: ['columns: 1 *2 3', 'rows: 2 *3 4 5 6', 'base: *legs plinth', 'handles: *knob bar none'],
      nightstand: ['drawers: 0 *1 2', 'base: *legs plinth'],
      tvstand: ['bays: 2 *3 4', 'fronts: open *doors drawers', 'base: *legs plinth'],
      rug: ['shape: *rectangle round', 'border: *yes no'],
      box: [],
    });
  });

  it('labels options and values in sentence case unless given', () => {
    const labels = (kind: Kind) => STYLE_OPTIONS[kind].map((o) => [o.label, o.values.map((v) => v.label)]);
    expect(labels('sofa')).toEqual([
      ['Seats', ['Auto', '1', '2', '3', '4', '5']], ['Arms', ['Track', 'Rounded', 'Slim', 'None']],
      ['Back', ['Low', 'Standard', 'High']], ['Cushions', ['Loose', 'Tight']],
      ['Legs', ['Block', 'Tapered', 'Metal', 'None']], ['Chaise', ['None', 'Left', 'Right']],
    ]);
    expect(labels('chair')[0]).toEqual(['Kind', ['Armchair', 'Dining', 'Office']]);
    expect(labels('bed')[1]).toEqual(['Headboard finish', ['Panel', 'Upholstered']]);
    expect(labels('desk')[0]).toEqual(['Supports', ['Four legs', 'Trestle', 'Panel sides']]);
    expect(labels('table')).toEqual([
      ['Top', ['Rectangle', 'Round']], ['Base', ['Four legs', 'Pedestal', 'Trestle']], ['Lower shelf', ['Yes', 'No']],
    ]);
    expect(labels('shelf')[1]).toEqual(['Back panel', ['Yes', 'No']]);
    expect(labels('tvstand')[1]).toEqual(['Fronts', ['Open', 'Doors', 'Drawers']]);
  });
});

describe('defaultStyle and completeStyle', () => {
  it.each(ALL_KINDS)('the %s default has exactly its option keys, each the fallback, and equals completeStyle of {}', (kind) => {
    const style = defaultStyle(kind);
    expect(Object.keys(style)).toEqual(STYLE_OPTIONS[kind].map((o) => o.key));
    for (const o of STYLE_OPTIONS[kind]) expect(style[o.key]).toBe(o.fallback);
    expect(completeStyle(kind, {})).toEqual(style);
  });

  it('returns a fresh default each call', () => {
    expect(defaultStyle('sofa')).not.toBe(defaultStyle('sofa'));
  });

  it('fills a missing key with its fallback', () => {
    expect(completeStyle('sofa', { arms: 'slim' })).toEqual({ ...defaultStyle('sofa'), arms: 'slim' });
  });

  it.each<[string, Kind, Record<string, string>]>([
    ['an unknown key', 'sofa', { wheels: 'yes' }],
    ['an unknown value', 'sofa', { arms: 'huge' }],
    ['a key of another kind', 'rug', { arms: 'slim' }],
    ['any key on a box', 'box', { arms: 'slim' }],
  ])('refuses %s', (_name, kind, given) => {
    expect(completeStyle(kind, given)).toBeNull();
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])('refuses %s given as an own key of parsed JSON, without throwing', (key) => {
    const given = JSON.parse(`{"${key}":"x"}`) as Record<string, string>;
    expect(Object.keys(given)).toEqual([key]);
    for (const kind of ALL_KINDS) expect(completeStyle(kind, given)).toBeNull();
  });
});

describe('defaultColours', () => {
  it('keeps each kind’s former fixed colours', () => {
    expect(Object.fromEntries(ALL_KINDS.map((k) => [k, defaultColours(k)]))).toEqual({
      sofa: { main: '#6f7f8c', accent: '#3b2f27' }, chair: { main: '#b5673f', accent: '#2e2a27' },
      bed: { main: '#8a9a8b', accent: '#a67c52' }, desk: { main: '#b98d5e', accent: '#2b2b2d' },
      table: { main: '#6b4a33', accent: '#6b4a33' }, shelf: { main: '#ddd8ce', accent: '#ddd8ce' },
      dresser: { main: '#b98d5e', accent: '#2b2b2d' }, nightstand: { main: '#b98d5e', accent: '#2b2b2d' },
      tvstand: { main: '#6b4a33', accent: '#2b2b2d' }, rug: { main: '#c9b8a3', accent: '#ded2c2' },
      box: { main: '#c9ccd1', accent: '#c9ccd1' },
    });
  });

  it('returns a fresh object each call', () => {
    expect(defaultColours('bed')).not.toBe(defaultColours('bed'));
  });
});

describe('normaliseColour', () => {
  it('lower-cases a #rrggbb colour', () => {
    expect(normaliseColour('#6F7F8C')).toBe('#6f7f8c');
    expect(normaliseColour('#6f7f8c')).toBe('#6f7f8c');
  });

  it.each(['6f7f8c', '#fff', '#6f7f8g', 'red', '#6f7f8c ', ' #6f7f8c', '#6f7f8c\n', '', 'url(x)'])('refuses %j', (text) => {
    expect(normaliseColour(text)).toBeNull();
  });

  it('matches the colour pattern', () => {
    expect(COLOUR_PATTERN.source).toBe('^#[0-9a-f]{6}$');
  });
});

describe('lighten', () => {
  it('keeps the colour at 0 and reaches white at 1', () => {
    expect(lighten('#000000', 0)).toBe('#000000');
    expect(lighten('#000000', 1)).toBe('#ffffff');
  });

  it('mixes toward white: a valid colour with every channel at least the input’s', () => {
    const out = lighten('#6f7f8c', 0.08);
    expect(out).toMatch(COLOUR_PATTERN);
    const channels = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const before = channels('#6f7f8c');
    channels(out).forEach((v, i) => expect(v).toBeGreaterThanOrEqual(before[i]));
    expect(out).not.toBe('#6f7f8c');
  });
});
