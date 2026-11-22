import type { ItemColours, Kind, StyleValues } from '../types';
import { completeStyle, defaultColours, defaultStyle } from './recipe';

/**
 * Turns a shop product's name and description into a furniture recipe: its kind, its style
 * options and its two colours. The text is untrusted page text, so every rule is data below,
 * matched as whole lower-cased words with linear regular expressions, and no matched word is
 * ever used as an object key.
 */

/** A pair of a style option key and the value a rule gives it. */
type Setting = readonly [key: string, value: string];

/** Lower-cases `text` and turns every run of whitespace into one space, so phrases match across line breaks. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ');
}

/** Escapes the characters a regular expression treats specially. */
function escapeWord(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A rule word as a pattern source: the words of a phrase may be joined by a space or a hyphen. */
function phraseSource(word: string): string {
  return word.split(/[ -]/).map(escapeWord).join('[ -]');
}

/**
 * A pattern matching any of `words` as a whole word or phrase, followed by `suffix` (a pattern
 * source such as `s?` for an optional plural).
 */
function wordsPattern(words: readonly string[], suffix = ''): RegExp {
  return new RegExp(`\\b(?:${words.map(phraseSource).join('|')})${suffix}\\b`);
}

// ---------------------------------------------------------------- kind

/** Kind rules, in order: the first row with a matching word decides the kind. */
const KIND_RULES: readonly { words: readonly string[]; kind: Kind }[] = [
  { words: ['desk chair', 'office chair', 'task chair', 'gaming chair'], kind: 'chair' },
  { words: ['nightstand', 'night stand', 'bedside table', 'bedside'], kind: 'nightstand' },
  {
    words: ['tv stand', 'tv unit', 'tv console', 'tv bench', 'media console', 'media stand', 'entertainment center'],
    kind: 'tvstand',
  },
  { words: ['dresser', 'chest of drawers', 'drawer chest'], kind: 'dresser' },
  {
    words: ['sofa table', 'console table', 'coffee table', 'side table', 'end table', 'dining table', 'accent table', 'kitchen table'],
    kind: 'table',
  },
  { words: ['rug', 'carpet'], kind: 'rug' },
  { words: ['sofa', 'couch', 'couches', 'loveseat', 'sectional', 'settee', 'futon'], kind: 'sofa' },
  { words: ['desk'], kind: 'desk' },
  { words: ['bookcase', 'bookshelf', 'bookshelves', 'shelving unit', 'shelf unit'], kind: 'shelf' },
  { words: ['bed', 'beds', 'bed frame', 'daybed'], kind: 'bed' },
  { words: ['table', 'tables'], kind: 'table' },
  { words: ['chair', 'chairs', 'armchair', 'stool', 'recliner', 'barstool', 'bar stool'], kind: 'chair' },
  { words: ['shelf', 'shelves'], kind: 'shelf' },
];

/** Each kind row compiled once; every kind word also matches its plural with `s` added. */
const KIND_PATTERNS = KIND_RULES.map((r) => ({ pattern: wordsPattern(r.words, 's?'), kind: r.kind }));

/** The kind a product name names, by the first matching rule; null when no rule matches. */
export function kindFromName(name: string): Kind | null {
  const text = normalise(name);
  return KIND_PATTERNS.find((r) => r.pattern.test(text))?.kind ?? null;
}

// ---------------------------------------------------------------- style

/** A count read from the text ("6-drawer", "4 shelves"), turned into settings; null when it changes nothing. */
type CountSettings = (count: number, size: { w: number; h: number } | undefined) => readonly Setting[] | null;

/** One style rule: a set of words giving fixed settings, or a counted phrase giving computed ones. */
type StyleRule =
  | { kinds: readonly Kind[]; words: readonly string[]; sets: readonly Setting[] }
  | { kinds: readonly Kind[]; count: RegExp; sets: CountSettings };

/** "N-drawer", "N drawer", "N-drawers" or "N drawers", N in digits (captured). */
const DRAWER_COUNT = /\b(\d+)[- ]drawers?\b/;

/** "N shelf", "N-shelves", "N tier", "N-tiers" and the like, N a single digit (captured). */
const SHELF_COUNT = /\b(\d)[ -](?:shelf|shelves|tiers?)\b/;

/** "N tier", "N-tier", "N tiers" or "N-tiers", N a single digit (captured). */
const TIER_COUNT = /\b(\d)[ -]tiers?\b/;

/**
 * "N seat", "N-seater", "N seats", "N-seaters" and the like, and "N person" or "N-person", N `2`–`5`
 * or `two`–`five` (captured).
 */
const SEAT_COUNT = /\b([2-5]|two|three|four|five)[ -](?:seat(?:er)?s?|person)\b/;

/** The number words a count may be written as. A Map, so text such as `__proto__` is just missing. */
const NUMBER_WORDS: ReadonlyMap<string, number> = new Map([['two', 2], ['three', 3], ['four', 4], ['five', 5]]);

/** `value` limited to [low, high]. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** A dresser's drawer grid from its drawer count; a piece taller than wide has one column. */
function dresserGrid(count: number, size: { w: number; h: number } | undefined): readonly Setting[] {
  const tall = size !== undefined && size.h > size.w;
  const columns = tall ? 1 : count >= 9 ? 3 : count >= 4 ? 2 : 1;
  const rows = clamp(tall ? count : Math.round(count / columns), 2, 6);
  return [['columns', String(columns)], ['rows', String(rows)]];
}

/** Where a kind starts before its rules, for the "no ... word" rows of the brief. */
const STARTING_POINTS: readonly { kind: Kind; sets: readonly Setting[] }[] = [
  { kind: 'desk', sets: [['drawers', 'none']] },
  { kind: 'table', sets: [['shelf', 'no']] },
  { kind: 'rug', sets: [['border', 'no']] },
];

/** Style rules, applied top to bottom; a later matching rule overrides an earlier one. */
const STYLE_RULES: readonly StyleRule[] = [
  { kinds: ['sofa'], words: ['loveseat'], sets: [['seats', '2']] },
  { kinds: ['sofa'], count: SEAT_COUNT, sets: (n) => [['seats', String(n)]] },
  { kinds: ['sofa'], words: ['sectional', 'chaise'], sets: [['chaise', 'right']] },
  {
    kinds: ['sofa'],
    words: ['left-facing', 'left facing', 'left-hand', 'left arm', 'left chaise', 'laf'],
    sets: [['chaise', 'left']],
  },
  { kinds: ['sofa'], words: ['armless'], sets: [['arms', 'none']] },
  { kinds: ['sofa'], words: ['rolled arm', 'round arm', 'rounded arm'], sets: [['arms', 'rounded']] },
  { kinds: ['sofa'], words: ['slim arm', 'narrow arm', 'thin arm'], sets: [['arms', 'slim']] },
  { kinds: ['sofa'], words: ['tufted', 'tight back', 'tight-back'], sets: [['cushions', 'tight']] },
  { kinds: ['sofa'], words: ['high back', 'high-back'], sets: [['back', 'high']] },
  { kinds: ['sofa'], words: ['low back', 'low-back', 'low profile', 'low-profile'], sets: [['back', 'low']] },
  { kinds: ['sofa', 'chair'], words: ['metal leg', 'steel leg', 'chrome leg', 'iron leg'], sets: [['legs', 'metal']] },
  { kinds: ['sofa', 'chair'], words: ['tapered', 'mid-century', 'mid century', 'splayed'], sets: [['legs', 'tapered']] },
  { kinds: ['chair'], words: ['dining', 'side chair'], sets: [['type', 'dining'], ['arms', 'no']] },
  { kinds: ['chair'], words: ['office', 'task', 'desk', 'gaming', 'swivel'], sets: [['type', 'office'], ['legs', 'pedestal']] },
  { kinds: ['chair'], words: ['armchair', 'accent', 'lounge', 'club', 'recliner'], sets: [['type', 'armchair']] },
  { kinds: ['chair'], words: ['armless', 'stool'], sets: [['arms', 'no']] },
  { kinds: ['chair'], words: ['with arms', 'armrest', 'armrests'], sets: [['arms', 'yes']] },
  { kinds: ['bed'], words: ['upholstered', 'fabric', 'velvet', 'linen', 'tufted'], sets: [['finish', 'upholstered']] },
  { kinds: ['bed'], words: ['platform'], sets: [['base', 'platform']] },
  { kinds: ['bed'], words: ['storage', 'drawer', 'drawers'], sets: [['base', 'storage']] },
  { kinds: ['bed'], words: ['tall headboard', 'high headboard', 'wingback'], sets: [['headboard', 'tall']] },
  { kinds: ['bed'], words: ['no headboard', 'without headboard', 'frame only'], sets: [['headboard', 'none']] },
  { kinds: ['bed'], words: ['footboard'], sets: [['footboard', 'yes']] },
  { kinds: ['bed'], words: ['no footboard', 'without footboard'], sets: [['footboard', 'no']] },
  { kinds: ['desk'], words: ['drawer', 'drawers', '1-drawer', '2-drawer'], sets: [['drawers', 'right']] },
  { kinds: ['desk'], count: DRAWER_COUNT, sets: (n) => (n >= 3 ? [['drawers', 'both']] : null) },
  { kinds: ['desk'], words: ['no drawer', 'no drawers', 'without drawer', 'without drawers'], sets: [['drawers', 'none']] },
  { kinds: ['desk'], words: ['trestle', 'sawhorse'], sets: [['supports', 'trestle']] },
  { kinds: ['desk'], words: ['panel sides', 'panel legs', 'slab legs'], sets: [['supports', 'panels']] },
  { kinds: ['table'], words: ['shelf', 'shelves', '2-tier', 'two-tier', 'tiered'], sets: [['shelf', 'yes']] },
  { kinds: ['table'], count: TIER_COUNT, sets: () => [['shelf', 'yes']] },
  { kinds: ['table'], words: ['round', 'circular'], sets: [['top', 'round']] },
  { kinds: ['table'], words: ['pedestal', 'tulip'], sets: [['base', 'pedestal']] },
  { kinds: ['table'], words: ['trestle'], sets: [['base', 'trestle']] },
  { kinds: ['shelf'], count: SHELF_COUNT, sets: (n) => [['shelves', String(clamp(n, 2, 8))]] },
  { kinds: ['shelf'], words: ['open back', 'open-back', 'backless', 'ladder', 'etagere'], sets: [['back', 'no']] },
  { kinds: ['dresser'], count: DRAWER_COUNT, sets: dresserGrid },
  { kinds: ['dresser'], words: ['bar pull', 'bar handle'], sets: [['handles', 'bar']] },
  { kinds: ['dresser'], words: ['handleless', 'handle-free', 'push to open', 'push-to-open'], sets: [['handles', 'none']] },
  { kinds: ['dresser'], words: ['knob', 'knobs'], sets: [['handles', 'knob']] },
  { kinds: ['dresser', 'nightstand', 'tvstand'], words: ['plinth', 'no legs'], sets: [['base', 'plinth']] },
  { kinds: ['nightstand'], words: ['open'], sets: [['drawers', '0']] },
  { kinds: ['nightstand'], words: ['drawer', 'drawers'], sets: [['drawers', '1']] },
  { kinds: ['nightstand'], words: ['no drawer', 'no drawers', 'without drawer', 'without drawers'], sets: [['drawers', '0']] },
  { kinds: ['nightstand'], count: DRAWER_COUNT, sets: (n) => [['drawers', String(clamp(n, 0, 2))]] },
  { kinds: ['tvstand'], words: ['open'], sets: [['fronts', 'open']] },
  { kinds: ['tvstand'], words: ['drawer', 'drawers'], sets: [['fronts', 'drawers']] },
  { kinds: ['tvstand'], words: ['door', 'doors', 'cabinet', 'cabinets'], sets: [['fronts', 'doors']] },
  { kinds: ['rug'], words: ['border', 'bordered'], sets: [['border', 'yes']] },
  { kinds: ['rug'], words: ['round', 'circular'], sets: [['shape', 'round']] },
];

/** Each rule with its words compiled once; a counted rule keeps its own pattern. */
const COMPILED_STYLE_RULES = STYLE_RULES.map((rule) =>
  'words' in rule ? { kinds: rule.kinds, pattern: wordsPattern(rule.words), fixed: rule.sets } : rule,
);

/** The settings `rule` gives for `text`, or null when it does not match. */
function settingsOf(
  rule: (typeof COMPILED_STYLE_RULES)[number],
  text: string,
  size: { w: number; h: number } | undefined,
): readonly Setting[] | null {
  if ('fixed' in rule) return rule.pattern.test(text) ? rule.fixed : null;
  const found = rule.count.exec(text);
  return found === null ? null : rule.sets(NUMBER_WORDS.get(found[1]) ?? Number(found[1]), size);
}

/**
 * The style of a `kind` piece described by `text` (name and description). Rules apply top to
 * bottom and a later match overrides an earlier one. `size` (width and height, inches) tells a
 * tall dresser from a wide one; unknown counts as wide. Always a complete style accepted by
 * completeStyle; the kind's default style if the rules ever produced one it refuses.
 */
export function styleFromText(kind: Kind, text: string, size?: { w: number; h: number }): StyleValues {
  const lower = normalise(text);
  const values = new Map<string, string>();
  for (const start of STARTING_POINTS) {
    if (start.kind === kind) for (const [key, value] of start.sets) values.set(key, value);
  }
  for (const rule of COMPILED_STYLE_RULES) {
    if (!rule.kinds.includes(kind)) continue;
    const settings = settingsOf(rule, lower, size);
    if (settings !== null) for (const [key, value] of settings) values.set(key, value);
  }
  return completeStyle(kind, Object.fromEntries(values)) ?? defaultStyle(kind);
}

// ---------------------------------------------------------------- colours

/** A colour word table: each row's words and the colour they stand for. */
type ColourTable = readonly { words: readonly string[]; colour: string }[];

/** Main colour words, as found in a product name. */
const MAIN_COLOURS: ColourTable = [
  { words: ['white'], colour: '#f3f1ec' },
  { words: ['ivory'], colour: '#ece6d8' },
  { words: ['cream', 'off-white', 'off white'], colour: '#ddd8ce' },
  { words: ['beige'], colour: '#cdbfa8' },
  { words: ['sand'], colour: '#c9b8a3' },
  { words: ['tan'], colour: '#b89b78' },
  { words: ['taupe'], colour: '#9a8b7c' },
  { words: ['camel'], colour: '#b58a5a' },
  { words: ['brown'], colour: '#6b4a33' },
  { words: ['chocolate'], colour: '#4a3428' },
  { words: ['espresso'], colour: '#3b2f27' },
  { words: ['black'], colour: '#232325' },
  { words: ['charcoal'], colour: '#3a3d42' },
  { words: ['dark gray', 'dark grey'], colour: '#55595f' },
  { words: ['light gray', 'light grey'], colour: '#b9bcc0' },
  { words: ['gray', 'grey'], colour: '#8a8d91' },
  { words: ['slate'], colour: '#6f7f8c' },
  { words: ['silver'], colour: '#b8bcc2' },
  { words: ['navy'], colour: '#2f4057' },
  { words: ['dark blue'], colour: '#2b3f63' },
  { words: ['light blue'], colour: '#a9c1d6' },
  { words: ['blue'], colour: '#4a6fa5' },
  { words: ['teal'], colour: '#2f7f7b' },
  { words: ['turquoise'], colour: '#3aa7a3' },
  { words: ['dark green', 'forest green'], colour: '#2f4f3a' },
  { words: ['emerald'], colour: '#2e7d5b' },
  { words: ['olive'], colour: '#6f7242' },
  { words: ['sage'], colour: '#8a9a8b' },
  { words: ['green'], colour: '#5c7a55' },
  { words: ['mustard'], colour: '#c79a2b' },
  { words: ['yellow'], colour: '#d9b53f' },
  { words: ['gold'], colour: '#b08d57' },
  { words: ['orange'], colour: '#cf7a35' },
  { words: ['rust', 'terracotta'], colour: '#b5673f' },
  { words: ['burgundy', 'wine', 'maroon'], colour: '#6b2331' },
  { words: ['red'], colour: '#a8322d' },
  { words: ['blush'], colour: '#e0bdb8' },
  { words: ['pink'], colour: '#d7a1a8' },
  { words: ['lavender'], colour: '#b3a4cf' },
  { words: ['purple'], colour: '#6a4c8c' },
  { words: ['oak'], colour: '#b98d5e' },
  { words: ['walnut'], colour: '#6b4a33' },
  { words: ['natural', 'birch', 'pine', 'bamboo', 'rattan'], colour: '#caa877' },
  { words: ['mahogany', 'cherry'], colour: '#7a3b2a' },
];

/** Accent colour words (legs, frames, trim), as found in a name or description. */
const ACCENT_COLOURS: ColourTable = [
  { words: ['black metal', 'black steel', 'black legs', 'matte black'], colour: '#2b2b2d' },
  { words: ['brass', 'gold'], colour: '#b08d57' },
  { words: ['chrome', 'silver', 'stainless', 'nickel'], colour: '#b8bcc2' },
  { words: ['oak', 'natural wood', 'light wood', 'birch', 'beech', 'pine', 'ash'], colour: '#b98d5e' },
  { words: ['walnut', 'dark wood', 'acacia', 'mango wood'], colour: '#6b4a33' },
  { words: ['espresso', 'wenge'], colour: '#3b2f27' },
];

/** One colour word compiled to its own pattern. */
interface ColourWord { pattern: RegExp; length: number; colour: string }

/** Every word of `table` with its own whole-word pattern. */
function compileColours(table: ColourTable): readonly ColourWord[] {
  return table.flatMap((row) => row.words.map((w) => ({ pattern: wordsPattern([w]), length: w.length, colour: row.colour })));
}

const MAIN_WORDS = compileColours(MAIN_COLOURS);
const ACCENT_WORDS = compileColours(ACCENT_COLOURS);

/**
 * The colour of the word in `text` that starts earliest (the longest at the same start), among
 * `words` whose colour `accept` allows; null when none is found.
 */
function firstColour(words: readonly ColourWord[], text: string, accept: (colour: string) => boolean): string | null {
  let best: { start: number; length: number; colour: string } | null = null;
  for (const word of words) {
    if (!accept(word.colour)) continue;
    const found = word.pattern.exec(text);
    if (found === null) continue;
    if (best === null || found.index < best.start || (found.index === best.start && word.length > best.length)) {
      best = { start: found.index, length: word.length, colour: word.colour };
    }
  }
  return best?.colour ?? null;
}

/** The main colour a product name states, as `#rrggbb`; null when it names none. */
export function mainColourFromName(name: string): string | null {
  return firstColour(MAIN_WORDS, normalise(name), () => true);
}

/** The first accent colour `text` states that differs from `main`, as `#rrggbb`; null when none. */
export function accentColourFromText(text: string, main: string | null): string | null {
  const skip = main?.toLowerCase() ?? null;
  return firstColour(ACCENT_WORDS, normalise(text), (colour) => colour !== skip);
}

/**
 * A piece's colours: `main` or the kind's default main; `accent`, else `main` for a kind whose
 * default main and accent are the same colour (table, shelf, box), else the kind's default accent.
 */
export function recipeColours(kind: Kind, main: string | null, accent: string | null): ItemColours {
  const fallback = defaultColours(kind);
  const mainColour = main ?? fallback.main;
  if (accent !== null) return { main: mainColour, accent };
  const sameByDefault = fallback.main === fallback.accent;
  return { main: mainColour, accent: sameByDefault && main !== null ? main : fallback.accent };
}
