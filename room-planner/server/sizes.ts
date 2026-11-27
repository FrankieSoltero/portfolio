/**
 * Reads product sizes from shop page text (IKEA `31 1/2 "`, Wayfair `32.3'' H X 65.8'' W X 32.3'' D`,
 * Amazon `14.01 x 9.77 x 0.66 inches`) into inches. Page text is untrusted and may be any length:
 * every regular expression here is anchored or has no nested quantifiers, so matching stays linear,
 * and nothing here throws.
 */

/** The largest size kept, in inches. Anything above it is treated as a misread. */
const MAX_INCHES = 10000;

/** Invisible direction and joiner marks that shops put around numbers. */
const FORMAT_MARKS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * A whole or decimal number with an optional fraction (`31 1/2`), or a bare fraction (`3/4`),
 * then an optional unit. Groups: 1 number, 2–3 fraction after it, 4–5 bare fraction, 6 unit.
 */
const LENGTH = /^(?:(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?|(\d+)\/(\d+))\s*(inches|inch|in|cm|mm|feet|ft|''|")?$/i;

/** Inches per unit. A number with no unit is in inches. */
const INCHES_PER_UNIT: Record<string, number> = {
  inches: 1,
  inch: 1,
  in: 1,
  "''": 1,
  '"': 1,
  cm: 1 / 2.54,
  mm: 1 / 25.4,
  feet: 12,
  ft: 12,
};

/** A length as written: its amount and its unit word in lower case, or null when it has none. */
interface WrittenLength {
  amount: number;
  unit: string | null;
}

/** Text with the invisible marks removed and the ends trimmed. */
function clean(text: string): string {
  return text.replace(FORMAT_MARKS, '').trim();
}

/** The amount and unit of one written length, or null when the text is not one. */
function readWrittenLength(text: string): WrittenLength | null {
  const match = LENGTH.exec(clean(text));
  if (!match) return null;
  const [, whole, num, den, bareNum, bareDen, unit] = match;
  let amount: number;
  if (whole !== undefined) {
    amount = Number(whole);
    if (num !== undefined) {
      if (Number(den) === 0) return null;
      amount += Number(num) / Number(den);
    }
  } else {
    if (Number(bareDen) === 0) return null;
    amount = Number(bareNum) / Number(bareDen);
  }
  return { amount, unit: unit === undefined ? null : unit.toLowerCase() };
}

/** A written length in inches, rounded to 0.01, or null when it is not finite, 0 or below, or too large. */
function toInches(length: WrittenLength, fallbackUnit: string | null): number | null {
  const unit = length.unit ?? fallbackUnit ?? 'in';
  const inches = Math.round(length.amount * INCHES_PER_UNIT[unit] * 100) / 100;
  if (!Number.isFinite(inches) || inches <= 0 || inches > MAX_INCHES) return null;
  return inches;
}

/**
 * One length in inches, rounded to 0.01: `31 1/2 "`, `32.3''`, `66 inches`, `80 cm`, `800 mm`,
 * `6 ft` or a bare number (read as inches). Null when the text is not a length, or the length is
 * not finite, is 0 or below, or is above 10000 in.
 */
export function parseLength(text: string): number | null {
  const length = readWrittenLength(text);
  return length ? toInches(length, null) : null;
}

/** Width, depth and height in inches, each null when missing or refused. */
export interface ParsedSizes {
  w: number | null;
  d: number | null;
  h: number | null;
  /** True when the line's own labels, or an order hint, said which number is which. */
  labelled: boolean;
}

/** Size letters, upper case: L(ength), W(idth), D(epth), H(eight). */
const SIZE_LETTERS = new Set(['L', 'W', 'D', 'H']);

/** The number separator in a dimension line: `x`, `X` or `×`. */
const SEPARATOR = /[x×]/i;

/** One part of a dimension line split into its length text and its label letter, if any. */
interface LinePart {
  value: string;
  letter: string | null;
}

/** A part such as `35"D` or `32.3'' H` keeps its trailing letter as a label; `66 inch` does not. */
function splitLabel(part: string): LinePart {
  const last = part.slice(-1).toUpperCase();
  const before = part.slice(-2, -1);
  if (SIZE_LETTERS.has(last) && !/[a-z]/i.test(before)) {
    return { value: part.slice(0, -1).trim(), letter: last };
  }
  return { value: part, letter: null };
}

/** The letters of an order hint such as `LxWxH` or `D x W x H`, or null when it has others. */
function hintLetters(order: string): string[] | null {
  const letters = order.toUpperCase().split(/X|[^A-Z]+/).filter((piece) => piece !== '');
  return letters.every((letter) => SIZE_LETTERS.has(letter)) ? letters : null;
}

/**
 * The sizes in one dimension line, in inches. Labels on the numbers (`35"D x 80"W x 30"H`) say
 * which is which, in any case; when L is present it is the width and W becomes the depth. With no
 * labels, an order hint from the row label (`LxWxH`) is used the same way. With neither, three
 * numbers are depth, width, height and two are depth, width, and `labelled` is false. A unit word
 * at the end of the line (`inches`, `cm`) applies to every number that has no unit of its own. A
 * refused number leaves its size null. Null when the line does not have two or three numbers,
 * mixes labelled and unlabelled numbers, names one size twice, or yields no size at all.
 */
export function parseDimensionLine(text: string, order?: string): ParsedSizes | null {
  const parts = clean(text)
    .split(SEPARATOR)
    .map((part) => splitLabel(part.trim()));
  if (parts.length < 2 || parts.length > 3) return null;

  const lineUnit = readWrittenLength(parts[parts.length - 1].value)?.unit ?? null;
  const values = parts.map((part) => {
    const length = readWrittenLength(part.value);
    return length ? toInches(length, lineUnit) : null;
  });
  if (values.every((value) => value === null)) return null;

  const labels = parts.map((part) => part.letter);
  let letters: string[];
  let labelled = true;
  if (labels.every((letter) => letter !== null)) {
    letters = labels as string[];
  } else if (labels.some((letter) => letter !== null)) {
    return null;
  } else {
    const hinted = order === undefined ? null : hintLetters(order);
    if (hinted && hinted.length === parts.length) {
      letters = hinted;
    } else {
      letters = ['D', 'W', 'H'].slice(0, parts.length);
      labelled = false;
    }
  }

  const hasLength = letters.includes('L');
  const field: Record<string, 'w' | 'd' | 'h'> = { L: 'w', W: hasLength ? 'd' : 'w', D: 'd', H: 'h' };
  const sizes: ParsedSizes = { w: null, d: null, h: null, labelled };
  const seen = new Set<string>();
  for (let i = 0; i < letters.length; i += 1) {
    const key = field[letters[i]];
    if (seen.has(key)) return null;
    seen.add(key);
    sizes[key] = values[i];
  }
  return sizes;
}
