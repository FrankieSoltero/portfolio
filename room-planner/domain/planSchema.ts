import { z } from 'zod';
import { CONFIG } from '../config';
import { storedAngle } from './geometry';
import { validateObstacles } from './obstacles';
import { rehomeOpenings, validateOpenings, type OpeningsResult } from './openings';
import { normaliseOutline, validateOutline } from './outline';
import { round2 } from './polygon';
import type { Corner, Door, Item, Kind, ModelTier, Obstacle, Opening, PlanDocument, Units, WindowOpening } from './types';

/**
 * The one gate for a stored plan. Anything read from storage is untrusted, so `parsePlan` never
 * throws, never coerces, converts a version 1 document to version 2 and a version 2 document to
 * version 3, and returns a new document built field by field from validated values only (unknown
 * keys, including `__proto__`, are never copied). A refusal's `reason` is "<path>: <rule>" made of
 * known field names, array indices and fixed rule names; it never contains a value or key taken
 * from the input.
 *
 * Doors, windows and obstacles are checked in two steps: the schema below checks their structure
 * only (keys, types, enums, ids, list lengths, a first label-length check, obstacle coordinates),
 * and the built lists are then checked by `validateOpenings` and `validateObstacles`, the same
 * functions the editor uses, so the size limits have one source. The obstacle label limit, counted
 * in UTF-16 units, is enforced by `validateObstacles`.
 */

export type ParseResult = { ok: true; doc: PlanDocument } | { ok: false; newer: boolean; reason: string };

/** The version this planner writes; an integer above it is a plan from a newer planner. */
const CURRENT_VERSION = 3;

/**
 * Lengths, in characters, of the text a stored item takes from a looked-up product. Exported so
 * the lookup caps what it builds to what a saved plan accepts (see capProductText).
 */
export const PRODUCT_TEXT_LIMITS = {
  urlMax: 2048,
  nameMax: 200,
  hostMax: 255,
  labelMax: 200,
} as const;

/**
 * Limits of the stored format (Task 16 "Exact values"). The room size, coordinate, corner count
 * and item count limits are the planner's own (CONFIG), enforced when editing too, so a plan it can
 * draw is never refused on load; the rest are fixed by the format, not tunable.
 */
const LIMITS = {
  roomMin: CONFIG.roomMin,
  roomMax: CONFIG.roomMax,
  coordMax: CONFIG.coordMax,
  cornersMin: 3,
  cornersMax: CONFIG.maxCorners,
  itemsMax: CONFIG.maxItems,
  openingsMax: CONFIG.maxOpenings,
  obstaclesMax: CONFIG.maxObstacles,
  obstacleLabelMax: CONFIG.obstacleLabelMax,
  ...PRODUCT_TEXT_LIMITS,
  priceMax: 10_000_000,
  sizeMax: 720,
} as const;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Records keyed by the union make the compiler reject a missing or extra value.
const UNIT_SET: Record<Units, true> = { ft: true, m: true };
const KIND_SET: Record<Kind, true> = {
  sofa: true, chair: true, bed: true, desk: true, table: true, shelf: true, rug: true, box: true,
};
const TIER_SET: Record<ModelTier, true> = { retailer: true, generated: true, parametric: true, box: true };
const HINGE_SET: Record<Door['hinge'], true> = { start: true, end: true };
const SWING_SET: Record<Door['swing'], true> = { in: true, out: true };
const SHAPE_SET: Record<Obstacle['shape'], true> = { box: true, cylinder: true };
const UNITS = Object.keys(UNIT_SET) as [Units, ...Units[]];
const KINDS = Object.keys(KIND_SET) as [Kind, ...Kind[]];
const TIERS = Object.keys(TIER_SET) as [ModelTier, ...ModelTier[]];
const HINGES = Object.keys(HINGE_SET) as [Door['hinge'], ...Door['hinge'][]];
const SWINGS = Object.keys(SWING_SET) as [Door['swing'], ...Door['swing'][]];
const SHAPES = Object.keys(SHAPE_SET) as [Obstacle['shape'], ...Obstacle['shape'][]];

/** Rule names used in custom checks; a custom issue with any other message is reported as "custom". */
const RULE_NOT_FINITE = 'not-finite';
const RULE_URL = 'url';
const CUSTOM_RULES: ReadonlySet<string> = new Set([RULE_NOT_FINITE, RULE_URL]);

/** Every key any schema below declares: the only strings a reason's path may contain. */
const FIELD_NAMES: ReadonlySet<string> = new Set([
  'schemaVersion', 'units', 'room', 'outline', 'height', 'w', 'l', 'h', 'items', 'id', 'kind', 'name', 'host',
  'sourceUrl', 'price', 'd', 'x', 'y', 'angle', 'rot', 'model', 'tier', 'label', 'assetUrl',
  'openings', 'obstacles', 'wallId', 'offset', 'width', 'depth', 'sill', 'hinge', 'swing', 'shape', 'rotation', 'elevation',
]);

/** A number (never a coerced string, boolean or null) that is finite and within [min, max]. */
function finiteIn(min: number, max: number) {
  return z.number().min(min).max(max).refine(Number.isFinite, { message: RULE_NOT_FINITE });
}

/** True when c is whitespace or a C0 control character, which the URL parser would silently strip. */
function isEdgeJunk(c: string): boolean {
  return c.charCodeAt(0) <= 0x20 || /\s/.test(c);
}

/** An absolute http: or https: URL with nothing the URL parser would strip at either end. */
function isWebUrl(s: string): boolean {
  if (s.length === 0 || isEdgeJunk(s[0]) || isEdgeJunk(s[s.length - 1])) return false;
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}

const idSchema = z.string().regex(ID_PATTERN);
const coordSchema = finiteIn(-LIMITS.coordMax, LIMITS.coordMax);
const roomLengthSchema = finiteIn(LIMITS.roomMin, LIMITS.roomMax);
const sizeSchema = z.number().gt(0).max(LIMITS.sizeMax).refine(Number.isFinite, { message: RULE_NOT_FINITE });
/** Any finite number; the opening and obstacle size limits are checked by their validators. */
const finiteSchema = z.number().refine(Number.isFinite, { message: RULE_NOT_FINITE });
const urlSchema = z.string().max(LIMITS.urlMax).refine(isWebUrl, { message: RULE_URL }).nullable();
const unitsSchema = z.enum(UNITS);

const modelSchema = z.object({
  tier: z.enum(TIERS),
  label: z.string().max(LIMITS.labelMax),
  assetUrl: urlSchema,
});

/** Fields shared by version 1, version 2 and version 3 items. */
const itemFields = {
  id: idSchema,
  kind: z.enum(KINDS),
  name: z.string().min(1).max(LIMITS.nameMax),
  host: z.string().max(LIMITS.hostMax),
  sourceUrl: urlSchema,
  price: finiteIn(0, LIMITS.priceMax).nullable(),
  w: sizeSchema,
  d: sizeSchema,
  h: sizeSchema,
  x: coordSchema,
  y: coordSchema,
  model: modelSchema,
};

/** Fields shared by version 2 and version 3 documents. */
const planV2Fields = {
  units: unitsSchema,
  room: z.object({
    outline: z.array(z.object({ id: idSchema, x: coordSchema, y: coordSchema })).min(LIMITS.cornersMin).max(LIMITS.cornersMax),
    height: roomLengthSchema,
  }),
  items: z.array(z.object({ ...itemFields, angle: finiteSchema })).max(LIMITS.itemsMax),
};

const planV2Schema = z.object({ schemaVersion: z.literal(2), ...planV2Fields });

/** Each opening kind has exactly its own keys; any other key (a window's hinge, say) is dropped. */
const doorSchema = z.object({
  id: idSchema,
  kind: z.literal('door'),
  wallId: idSchema,
  offset: finiteSchema,
  width: finiteSchema,
  height: finiteSchema,
  hinge: z.enum(HINGES),
  swing: z.enum(SWINGS),
});

const windowSchema = z.object({
  id: idSchema,
  kind: z.literal('window'),
  wallId: idSchema,
  offset: finiteSchema,
  width: finiteSchema,
  sill: finiteSchema,
  height: finiteSchema,
});

const obstacleSchema = z.object({
  id: idSchema,
  shape: z.enum(SHAPES),
  label: z.string().max(LIMITS.obstacleLabelMax),
  x: coordSchema,
  y: coordSchema,
  rotation: finiteSchema,
  width: finiteSchema,
  depth: finiteSchema,
  height: finiteSchema,
  elevation: finiteSchema,
});

// The list lengths are checked before any element is read, so a huge array costs nothing.
const planV3Schema = z.object({
  schemaVersion: z.literal(3),
  ...planV2Fields,
  openings: z.array(z.discriminatedUnion('kind', [doorSchema, windowSchema])).max(LIMITS.openingsMax),
  obstacles: z.array(obstacleSchema).max(LIMITS.obstaclesMax),
});

/** Version 1: a w × l × h rectangle room; items at their top-left with quarter turns `rot`. */
const planV1Schema = z.object({
  schemaVersion: z.literal(1),
  units: unitsSchema,
  room: z.object({ w: roomLengthSchema, l: roomLengthSchema, h: roomLengthSchema }),
  items: z.array(z.object({ ...itemFields, rot: z.literal([0, 1, 2, 3]) })).max(LIMITS.itemsMax),
});

type PlanV1 = z.infer<typeof planV1Schema>;
type PlanV2 = z.infer<typeof planV2Schema>;
type PlanV3 = z.infer<typeof planV3Schema>;

function refuse(path: string, rule: string): ParseResult {
  return { ok: false, newer: false, reason: `${path}: ${rule}` };
}

/** "<path>: <rule>" for the first issue, from its path segments and code only — never its message text. */
function issueReason(issues: readonly z.core.$ZodIssue[]): ParseResult {
  const issue = issues[0];
  if (issue === undefined) return refuse('document', 'invalid');
  const path = issue.path
    .map((seg) => (typeof seg === 'number' && Number.isInteger(seg) ? String(seg) : typeof seg === 'string' && FIELD_NAMES.has(seg) ? seg : '?'))
    .join('.');
  const rule = issue.code === 'custom' ? (CUSTOM_RULES.has(issue.message) ? issue.message : 'custom') : issue.code;
  return refuse(path === '' ? 'document' : path, rule);
}

function hasDuplicateId(list: readonly { id: string }[]): boolean {
  return new Set(list.map((entry) => entry.id)).size !== list.length;
}

/**
 * The path of the first list holding an id already used earlier in the document (corners, then
 * items, openings and obstacles), or null when every id is distinct.
 */
function firstRepeatedIdList(lists: readonly [string, readonly { id: string }[]][]): string | null {
  const seen = new Set<string>();
  for (const [path, list] of lists) {
    for (const { id } of list) {
      if (seen.has(id)) return path;
      seen.add(id);
    }
  }
  return null;
}

/** A version 2 document in the raw shape planV2Schema reads; positions move from top-left to centre. */
function migrateV1(v1: PlanV1): unknown {
  const { w, l, h } = v1.room;
  return {
    schemaVersion: 2,
    units: v1.units,
    room: {
      outline: [{ id: 'c1', x: 0, y: 0 }, { id: 'c2', x: w, y: 0 }, { id: 'c3', x: w, y: l }, { id: 'c4', x: 0, y: l }],
      height: h,
    },
    items: v1.items.map((item) => {
      const [fw, fd] = item.rot % 2 === 1 ? [item.d, item.w] : [item.w, item.d];
      return {
        id: item.id, kind: item.kind, name: item.name, host: item.host, sourceUrl: item.sourceUrl, price: item.price,
        w: item.w, d: item.d, h: item.h, x: item.x + fw / 2, y: item.y + fd / 2, angle: item.rot * 90,
        model: { tier: item.model.tier, label: item.model.label, assetUrl: item.model.assetUrl },
      };
    }),
  };
}

/**
 * A version 3 document in the raw shape planV3Schema reads: the validated version 2 fields, copied
 * one by one, and no doors, windows or obstacles.
 */
function migrateV2(v2: PlanV2): unknown {
  return { schemaVersion: 3, units: v2.units, room: v2.room, items: v2.items, openings: [], obstacles: [] };
}

/** Builds the stored item from validated fields only, in the declared key order. */
function buildItem(item: PlanV3['items'][number]): Item {
  return {
    id: item.id, kind: item.kind, name: item.name, host: item.host, sourceUrl: item.sourceUrl, price: item.price,
    w: item.w, d: item.d, h: item.h, x: item.x, y: item.y, angle: storedAngle(item.angle),
    model: { tier: item.model.tier, label: item.model.label, assetUrl: item.model.assetUrl },
  };
}

/** Builds the stored door or window from validated fields only, in its kind's key order, numbers to 0.01. */
function buildOpening(o: PlanV3['openings'][number]): Opening {
  if (o.kind === 'door') {
    const door: Door = {
      id: o.id, kind: o.kind, wallId: o.wallId, offset: round2(o.offset), width: round2(o.width),
      height: round2(o.height), hinge: o.hinge, swing: o.swing,
    };
    return door;
  }
  const win: WindowOpening = {
    id: o.id, kind: o.kind, wallId: o.wallId, offset: round2(o.offset), width: round2(o.width),
    sill: round2(o.sill), height: round2(o.height),
  };
  return win;
}

/** Builds the stored obstacle from validated fields only, in the declared key order, numbers to 0.01. */
function buildObstacle(o: PlanV3['obstacles'][number]): Obstacle {
  return {
    id: o.id, shape: o.shape, label: o.label, x: round2(o.x), y: round2(o.y), rotation: storedAngle(o.rotation),
    width: round2(o.width), depth: round2(o.depth), height: round2(o.height), elevation: round2(o.elevation),
  };
}

/** True when `normalised` holds the corners of `given` in the opposite order. */
function wasReversed(given: readonly Corner[], normalised: readonly Corner[]): boolean {
  return given.length > 1 && normalised.every((c, i) => c.id === given[given.length - 1 - i].id);
}

/**
 * The openings as they sit on the stored outline. normaliseOutline either keeps the corners' order
 * or reverses it; when it reversed them, every wall id now names a different physical wall, so each
 * opening is moved to the same physical wall (rehomeOpenings: the wall's other end corner, the offset
 * measured from that end, a door's hinge flipped), which may refuse it.
 */
function carryOpenings(given: readonly Corner[], normalised: readonly Corner[], openings: Opening[]): OpeningsResult {
  return wasReversed(given, normalised) ? rehomeOpenings(given, normalised, openings) : { ok: true, openings };
}

/** Validates a raw version 3 document, applies the cross-field rules and builds a fresh one. */
function parseV3(raw: unknown): ParseResult {
  const parsed = planV3Schema.safeParse(raw);
  if (!parsed.success) return issueReason(parsed.error.issues);
  const { units, room, items } = parsed.data;
  if (hasDuplicateId(room.outline)) return refuse('room.outline', 'duplicate-id');
  const given: Corner[] = room.outline.map((c) => ({ id: c.id, x: c.x, y: c.y }));
  const outline: Corner[] = normaliseOutline(given);
  const problem = validateOutline(outline);
  if (problem !== null) return refuse('room.outline', problem);
  const repeated = firstRepeatedIdList([
    ['room.outline', outline], ['items', items], ['openings', parsed.data.openings], ['obstacles', parsed.data.obstacles],
  ]);
  if (repeated !== null) return refuse(repeated, 'duplicate-id');
  // The editor's own checks, on the lists exactly as they will be stored.
  const carried = carryOpenings(given, outline, parsed.data.openings.map(buildOpening));
  if (!carried.ok) return refuse('openings', carried.problem);
  const { openings } = carried;
  const openingProblem = validateOpenings(outline, openings);
  if (openingProblem !== null) return refuse('openings', openingProblem);
  const obstacles = parsed.data.obstacles.map(buildObstacle);
  const obstacleProblem = validateObstacles(obstacles);
  if (obstacleProblem !== null) return refuse('obstacles', obstacleProblem);
  return {
    ok: true,
    doc: {
      schemaVersion: CURRENT_VERSION, units, room: { outline, height: room.height }, items: items.map(buildItem), openings, obstacles,
    },
  };
}

/** Validates a raw version 2 document and reads it as version 3, with no doors, windows or obstacles. */
function parseV2(raw: unknown): ParseResult {
  const parsed = planV2Schema.safeParse(raw);
  return parsed.success ? parseV3(migrateV2(parsed.data)) : issueReason(parsed.error.issues);
}

function parseUntrusted(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return refuse('document', 'not-an-object');
  const version: unknown = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version === CURRENT_VERSION) return parseV3(input);
  if (version === 2) return parseV2(input);
  if (version === 1) {
    const v1 = planV1Schema.safeParse(input);
    // The converted document passes every version 2 rule too (a converted centre can exceed 1440).
    return v1.success ? parseV2(migrateV1(v1.data)) : issueReason(v1.error.issues);
  }
  if (typeof version === 'number' && Number.isInteger(version) && version > CURRENT_VERSION) {
    return { ok: false, newer: true, reason: 'schemaVersion: newer' };
  }
  return refuse('schemaVersion', 'unsupported');
}

/**
 * Validates an untrusted stored plan and returns a fresh version 3 document, or a refusal.
 * `newer` is true only for an integer `schemaVersion` above 3. Never throws: a getter or proxy
 * trap that throws while the input is read is refused as "document: unreadable".
 */
export function parsePlan(input: unknown): ParseResult {
  try {
    return parseUntrusted(input);
  } catch {
    return refuse('document', 'unreadable');
  }
}
