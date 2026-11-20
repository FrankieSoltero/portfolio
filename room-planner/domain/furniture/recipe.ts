import type { ItemColours, Kind, StyleValues } from '../types';

/**
 * The furniture recipe: the style options each kind offers, their fallbacks, each kind's label,
 * typical size and default colours, and the colour helpers. Pure data and functions; a piece's
 * saved `style` and `colours` are checked against these tables (see planSchema).
 */

/** One style choice of a kind: its key in `Item.style`, the values it allows and the value used when it is missing. */
export interface StyleOption { key: string; label: string; values: readonly { value: string; label: string }[]; fallback: string }

/** A value and its label: the value in sentence case unless given. */
type ValueSpec = string | readonly [value: string, label: string];

/** "tvstand" → "Tvstand": the first letter upper case, the rest as given. */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Builds an option; its label is the key in sentence case unless `label` is given. */
function option(key: string, values: readonly ValueSpec[], fallback: string, label?: string): StyleOption {
  return {
    key,
    label: label ?? sentenceCase(key),
    values: values.map((v) => (typeof v === 'string' ? { value: v, label: sentenceCase(v) } : { value: v[0], label: v[1] })),
    fallback,
  };
}

const LEGS_LABEL: ValueSpec = ['legs', 'Four legs'];
const YES_NO: readonly ValueSpec[] = ['yes', 'no'];
const PLAIN_BASE = option('base', ['legs', 'plinth'], 'legs');

/** The style options of every kind, in the order the editor shows them. */
export const STYLE_OPTIONS: Readonly<Record<Kind, readonly StyleOption[]>> = {
  sofa: [
    option('seats', ['auto', '1', '2', '3', '4', '5'], 'auto'),
    option('arms', ['track', 'rounded', 'slim', 'none'], 'track'),
    option('back', ['low', 'standard', 'high'], 'standard'),
    option('cushions', ['loose', 'tight'], 'loose'),
    option('legs', ['block', 'tapered', 'metal', 'none'], 'block'),
    option('chaise', ['none', 'left', 'right'], 'none'),
  ],
  chair: [
    option('type', ['armchair', 'dining', 'office'], 'armchair', 'Kind'),
    option('arms', YES_NO, 'yes'),
    option('legs', ['block', 'tapered', 'metal', 'pedestal'], 'block'),
  ],
  bed: [
    option('headboard', ['none', 'low', 'tall'], 'low'),
    option('finish', ['panel', 'upholstered'], 'panel', 'Headboard finish'),
    option('footboard', YES_NO, 'no'),
    option('base', ['platform', 'legs', 'storage'], 'platform'),
  ],
  desk: [
    option('supports', [LEGS_LABEL, 'trestle', ['panels', 'Panel sides']], 'legs'),
    option('drawers', ['none', 'left', 'right', 'both'], 'right'),
  ],
  table: [
    option('top', ['rectangle', 'round'], 'rectangle'),
    option('base', [LEGS_LABEL, 'pedestal', 'trestle'], 'legs'),
    option('shelf', YES_NO, 'yes', 'Lower shelf'),
  ],
  shelf: [
    option('shelves', ['auto', '2', '3', '4', '5', '6', '7', '8'], 'auto'),
    option('back', YES_NO, 'yes', 'Back panel'),
    option('books', YES_NO, 'yes'),
  ],
  dresser: [
    option('columns', ['1', '2', '3'], '2'),
    option('rows', ['2', '3', '4', '5', '6'], '3'),
    PLAIN_BASE,
    option('handles', ['knob', 'bar', 'none'], 'knob'),
  ],
  nightstand: [option('drawers', ['0', '1', '2'], '1'), PLAIN_BASE],
  tvstand: [
    option('bays', ['2', '3', '4'], '3'),
    option('fronts', ['open', 'doors', 'drawers'], 'doors'),
    PLAIN_BASE,
  ],
  rug: [option('shape', ['rectangle', 'round'], 'rectangle'), option('border', YES_NO, 'yes')],
  box: [],
};

/** The name of each kind, as the sidebar shows it. */
export const KIND_LABELS: Readonly<Record<Kind, string>> = {
  sofa: 'Sofa', chair: 'Chair', bed: 'Bed', desk: 'Desk', table: 'Table', shelf: 'Shelf',
  dresser: 'Dresser', nightstand: 'Nightstand', tvstand: 'TV stand', rug: 'Rug', box: 'Box',
};

/** Every kind, in the order the planner lists them. */
export const KIND_ORDER: readonly Kind[] = [
  'sofa', 'chair', 'bed', 'desk', 'table', 'shelf', 'dresser', 'nightstand', 'tvstand', 'rug', 'box',
];

/** The size, in inches, a new piece of each kind starts at. */
export const TYPICAL_SIZE: Readonly<Record<Kind, { w: number; d: number; h: number }>> = {
  sofa: { w: 84, d: 36, h: 33 },
  chair: { w: 30, d: 32, h: 31 },
  bed: { w: 64, d: 85, h: 38 },
  desk: { w: 55, d: 26, h: 30 },
  table: { w: 44, d: 24, h: 16 },
  shelf: { w: 36, d: 13, h: 78 },
  dresser: { w: 60, d: 18, h: 34 },
  nightstand: { w: 22, d: 16, h: 24 },
  tvstand: { w: 60, d: 16, h: 22 },
  rug: { w: 60, d: 96, h: 0.5 },
  box: { w: 36, d: 24, h: 30 },
};

/** The colours the editor offers. */
export const SWATCHES: readonly { label: string; colour: string }[] = [
  { label: 'Slate', colour: '#6f7f8c' },
  { label: 'Sage', colour: '#8a9a8b' },
  { label: 'Rust', colour: '#b5673f' },
  { label: 'Sand', colour: '#c9b8a3' },
  { label: 'Cream', colour: '#ddd8ce' },
  { label: 'Charcoal', colour: '#3a3d42' },
  { label: 'Navy', colour: '#2f4057' },
  { label: 'Oak', colour: '#b98d5e' },
  { label: 'Walnut', colour: '#6b4a33' },
  { label: 'Espresso', colour: '#3b2f27' },
  { label: 'Black metal', colour: '#2b2b2d' },
  { label: 'Brass', colour: '#b08d57' },
  { label: 'White', colour: '#f3f1ec' },
];

/** A stored colour: `#rrggbb`, lower case. */
export const COLOUR_PATTERN = /^#[0-9a-f]{6}$/;

/** Either case, for reading a colour before it is lower-cased. */
const ANY_CASE_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** Each kind's former fixed colours (from catalog LOOKS), so an upgraded plan keeps its look. */
const DEFAULT_COLOURS: Readonly<Record<Kind, ItemColours>> = {
  sofa: { main: '#6f7f8c', accent: '#3b2f27' },
  chair: { main: '#b5673f', accent: '#2e2a27' },
  bed: { main: '#8a9a8b', accent: '#a67c52' },
  desk: { main: '#b98d5e', accent: '#2b2b2d' },
  table: { main: '#6b4a33', accent: '#6b4a33' },
  shelf: { main: '#ddd8ce', accent: '#ddd8ce' },
  dresser: { main: '#b98d5e', accent: '#2b2b2d' },
  nightstand: { main: '#b98d5e', accent: '#2b2b2d' },
  tvstand: { main: '#6b4a33', accent: '#2b2b2d' },
  rug: { main: '#c9b8a3', accent: '#ded2c2' },
  box: { main: '#c9ccd1', accent: '#c9ccd1' },
};

/** Every option of `kind` at its fallback, in option order. Returns a fresh object every call. */
export function defaultStyle(kind: Kind): StyleValues {
  return Object.fromEntries(STYLE_OPTIONS[kind].map((o) => [o.key, o.fallback]));
}

/** The colours a new or upgraded piece of `kind` gets. Returns a fresh object every call. */
export function defaultColours(kind: Kind): ItemColours {
  const { main, accent } = DEFAULT_COLOURS[kind];
  return { main, accent };
}

/**
 * Full style for `kind`: `given` values where valid, the fallback for a missing key. Null when
 * `given` has an unknown key or a value not in the option's list. Only `given`'s own keys are
 * read, and each is looked up in the kind's option list, so a key such as `__proto__` or
 * `constructor` is simply unknown. Returns a fresh object, in option order.
 */
export function completeStyle(kind: Kind, given: Readonly<Record<string, string>>): StyleValues | null {
  const options = STYLE_OPTIONS[kind];
  for (const key of Object.keys(given)) {
    const opt = options.find((o) => o.key === key);
    if (opt === undefined) return null;
    const value = given[key];
    if (!opt.values.some((v) => v.value === value)) return null;
  }
  return Object.fromEntries(
    options.map((o) => [o.key, Object.prototype.hasOwnProperty.call(given, o.key) ? given[o.key] : o.fallback]),
  );
}

/** Lower-cases a `#rrggbb` colour; null when it is not one. */
export function normaliseColour(text: string): string | null {
  return ANY_CASE_COLOUR.test(text) ? text.toLowerCase() : null;
}

/**
 * Mixes `colour` toward white by `amount` in [0, 1] (clamped; a non-finite amount counts as 0);
 * returns `#rrggbb`. Throws a RangeError when `colour` is not `#rrggbb`: callers pass stored
 * colours, which parsePlan and the editor have already checked.
 */
export function lighten(colour: string, amount: number): string {
  const hex = normaliseColour(colour);
  if (hex === null) throw new RangeError('lighten: not a #rrggbb colour');
  const t = Number.isFinite(amount) ? Math.min(1, Math.max(0, amount)) : 0;
  const channels = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16);
    return Math.round(c + (255 - c) * t).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}
