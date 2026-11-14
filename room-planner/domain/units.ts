/**
 * Unit formatting and parsing. All stored lengths are inches; these helpers
 * only convert for display and input. Ported from prototype lines 300–312,
 * 321–322, 328–329, 700 and 707.
 */
import { CONFIG } from '../config';
import type { Room, Units } from './types';

const CM_PER_INCH = 2.54;
const M_PER_INCH = 0.0254;
const SQ_M_PER_SQ_INCH = 0.00064516;
const SQ_INCH_PER_SQ_FT = 144;
const INCH_PER_FT = 12;

/** Human-readable length: `12′ 6″`, `8″`, `3.66 m` or `76 cm`. */
export function fmtLen(inches: number, units: Units): string {
  if (units === 'm') {
    const cm = inches * CM_PER_INCH;
    return cm >= 100 ? `${(cm / 100).toFixed(2)} m` : `${Math.round(cm)} cm`;
  }
  let ft = Math.floor(inches / INCH_PER_FT);
  let inch = Math.round(inches - ft * INCH_PER_FT);
  if (inch === INCH_PER_FT) {
    ft++;
    inch = 0;
  }
  return ft ? `${ft}′ ${inch}″` : `${inch}″`;
}

/** Room dimension input value: feet or metres, at most two decimals. */
export function roomInputStr(inches: number, units: Units): string {
  const v = units === 'm' ? inches * M_PER_INCH : inches / INCH_PER_FT;
  return String(+v.toFixed(2));
}

/** Furniture dimension value: inches to one decimal, or whole centimetres. */
function furnValue(inches: number, units: Units): number {
  return units === 'm' ? Math.round(inches * CM_PER_INCH) : +inches.toFixed(1);
}

/** Furniture dimension input value: inches to one decimal, or whole centimetres. */
export function furnInputStr(inches: number, units: Units): string {
  return String(furnValue(inches, units));
}

/** Furniture footprint and height: `64 × 85 × 38 in` or `163 × 216 × 97 cm`. */
export function fmtFurnDims(dims: { w: number; d: number; h: number }, units: Units): string {
  const parts = [dims.w, dims.d, dims.h].map((v) => furnValue(v, units));
  return `${parts.join(' × ')} ${furnUnitLabel(units)}`;
}

/** Parses a room input (feet or metres) to inches; null if not finite or outside room limits. */
export function parseRoomInput(raw: string, units: Units): number | null {
  const n = parseFloat(raw);
  const v = units === 'm' ? n / M_PER_INCH : n * INCH_PER_FT;
  return Number.isFinite(v) && v >= CONFIG.roomMin && v <= CONFIG.roomMax ? v : null;
}

/** Parses a furniture input (inches or centimetres) to inches; null unless 0 < v <= previewDimMax. */
export function parseFurnInput(raw: string, units: Units): number | null {
  const n = parseFloat(raw);
  const v = units === 'm' ? n / CM_PER_INCH : n;
  return Number.isFinite(v) && v > 0 && v <= CONFIG.previewDimMax ? v : null;
}

/** Floor area: `168 sq ft` or `15.6 m²`. */
export function fmtArea(room: Room, units: Units): string {
  const areaIn = room.w * room.l;
  return units === 'm'
    ? `${(areaIn * SQ_M_PER_SQ_INCH).toFixed(1)} m²`
    : `${Math.round(areaIn / SQ_INCH_PER_SQ_FT)} sq ft`;
}

/** Price in US dollars, or `No price` when unknown. */
export function fmtMoney(price: number | null): string {
  return price === null ? 'No price' : `$${price.toLocaleString('en-US')}`;
}

/** Plan grid spacing in inches: one foot, or 50 cm. */
export function gridStepInches(units: Units): number {
  return units === 'm' ? 50 / CM_PER_INCH : INCH_PER_FT;
}

export function roomUnitLabel(units: Units): 'ft' | 'm' {
  return units === 'm' ? 'm' : 'ft';
}

export function furnUnitLabel(units: Units): 'in' | 'cm' {
  return units === 'm' ? 'cm' : 'in';
}

export function roomInputStep(units: Units): 0.25 | 0.05 {
  return units === 'm' ? 0.05 : 0.25;
}
