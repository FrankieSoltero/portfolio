import { z } from 'zod';
import { CONFIG } from '../config';
import { normaliseOutline, validateOutline } from './outline';
import { round2 } from './polygon';
import { normaliseAngle } from './shape';
import type { Corner, Item, Kind, ModelTier, PlanDocument, Units } from './types';

/**
 * The one gate for a stored plan. Anything read from storage is untrusted, so `parsePlan` never
 * throws, never coerces, converts a version 1 document to version 2, and returns a new document
 * built field by field from validated values only (unknown keys, including `__proto__`, are never
 * copied). A refusal's `reason` is "<path>: <rule>" made of known field names, array indices and
 * fixed rule names; it never contains a value or key taken from the input.
 */

export type ParseResult = { ok: true; doc: PlanDocument } | { ok: false; newer: boolean; reason: string };

/** The version this planner writes; an integer above it is a plan from a newer planner. */
const CURRENT_VERSION = 2;

/**
 * Limits of the stored format (Task 16 "Exact values"). The room size and corner count limits are
 * the planner's own (CONFIG), so a plan it can draw is never refused on load; the rest are fixed by
 * the format, not tunable.
 */
const LIMITS = {
  roomMin: CONFIG.roomMin,
  roomMax: CONFIG.roomMax,
  coordMax: 1440,
  cornersMin: 3,
  cornersMax: CONFIG.maxCorners,
  itemsMax: 200,
  nameMax: 200,
  hostMax: 255,
  urlMax: 2048,
  priceMax: 10_000_000,
  sizeMax: 720,
  labelMax: 200,
} as const;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Records keyed by the union make the compiler reject a missing or extra value.
const UNIT_SET: Record<Units, true> = { ft: true, m: true };
const KIND_SET: Record<Kind, true> = {
  sofa: true, chair: true, bed: true, desk: true, table: true, shelf: true, rug: true, box: true,
};
const TIER_SET: Record<ModelTier, true> = { retailer: true, generated: true, parametric: true, box: true };
const UNITS = Object.keys(UNIT_SET) as [Units, ...Units[]];
const KINDS = Object.keys(KIND_SET) as [Kind, ...Kind[]];
const TIERS = Object.keys(TIER_SET) as [ModelTier, ...ModelTier[]];

/** Rule names used in custom checks; a custom issue with any other message is reported as "custom". */
const RULE_NOT_FINITE = 'not-finite';
const RULE_URL = 'url';
const CUSTOM_RULES: ReadonlySet<string> = new Set([RULE_NOT_FINITE, RULE_URL]);

/** Every key any schema below declares: the only strings a reason's path may contain. */
const FIELD_NAMES: ReadonlySet<string> = new Set([
  'schemaVersion', 'units', 'room', 'outline', 'height', 'w', 'l', 'h', 'items', 'id', 'kind', 'name', 'host',
  'sourceUrl', 'price', 'd', 'x', 'y', 'angle', 'rot', 'model', 'tier', 'label', 'assetUrl',
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
const urlSchema = z.string().max(LIMITS.urlMax).refine(isWebUrl, { message: RULE_URL }).nullable();
const unitsSchema = z.enum(UNITS);

const modelSchema = z.object({
  tier: z.enum(TIERS),
  label: z.string().max(LIMITS.labelMax),
  assetUrl: urlSchema,
});

/** Fields shared by version 1 and version 2 items. */
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

const planV2Schema = z.object({
  schemaVersion: z.literal(2),
  units: unitsSchema,
  room: z.object({
    outline: z.array(z.object({ id: idSchema, x: coordSchema, y: coordSchema })).min(LIMITS.cornersMin).max(LIMITS.cornersMax),
    height: roomLengthSchema,
  }),
  items: z.array(z.object({ ...itemFields, angle: z.number().refine(Number.isFinite, { message: RULE_NOT_FINITE }) })).max(LIMITS.itemsMax),
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

/** The angle wrapped into [0, 360) and rounded to 0.01; wrapped again so 359.996 stores as 0, not 360. */
function storedAngle(deg: number): number {
  return round2(normaliseAngle(round2(normaliseAngle(deg))));
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

/** Builds the stored item from validated fields only, in the declared key order. */
function buildItem(item: PlanV2['items'][number]): Item {
  return {
    id: item.id, kind: item.kind, name: item.name, host: item.host, sourceUrl: item.sourceUrl, price: item.price,
    w: item.w, d: item.d, h: item.h, x: item.x, y: item.y, angle: storedAngle(item.angle),
    model: { tier: item.model.tier, label: item.model.label, assetUrl: item.model.assetUrl },
  };
}

/** Validates a raw version 2 document, applies the cross-field rules and builds a fresh one. */
function parseV2(raw: unknown): ParseResult {
  const parsed = planV2Schema.safeParse(raw);
  if (!parsed.success) return issueReason(parsed.error.issues);
  const { units, room, items } = parsed.data;
  if (hasDuplicateId(room.outline)) return refuse('room.outline', 'duplicate-id');
  const outline: Corner[] = normaliseOutline(room.outline.map((c) => ({ id: c.id, x: c.x, y: c.y })));
  const problem = validateOutline(outline);
  if (problem !== null) return refuse('room.outline', problem);
  if (hasDuplicateId(items)) return refuse('items', 'duplicate-id');
  return {
    ok: true,
    doc: { schemaVersion: CURRENT_VERSION, units, room: { outline, height: room.height }, items: items.map(buildItem) },
  };
}

function parseUntrusted(input: unknown): ParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return refuse('document', 'not-an-object');
  const version: unknown = (input as { schemaVersion?: unknown }).schemaVersion;
  if (version === CURRENT_VERSION) return parseV2(input);
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
 * Validates an untrusted stored plan and returns a fresh version 2 document, or a refusal.
 * `newer` is true only for an integer `schemaVersion` above 2. Never throws: a getter or proxy
 * trap that throws while the input is read is refused as "document: unreadable".
 */
export function parsePlan(input: unknown): ParseResult {
  try {
    return parseUntrusted(input);
  } catch {
    return refuse('document', 'unreadable');
  }
}
