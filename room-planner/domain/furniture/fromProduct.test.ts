import { describe, expect, it } from 'vitest';
import type { Kind } from '../types';
import { accentColourFromText, kindFromName, mainColourFromName, recipeColours, styleFromText } from './fromProduct';
import { completeStyle, defaultColours, defaultStyle } from './recipe';

const ALL_KINDS: Kind[] = ['sofa', 'chair', 'bed', 'desk', 'table', 'shelf', 'dresser', 'nightstand', 'tvstand', 'rug', 'box'];

/** Each kind's style when no rule word matches: the default, with the "no ... word" starting points. */
function plain(kind: Kind): Record<string, string> {
  const start: Partial<Record<Kind, Record<string, string>>> = {
    desk: { drawers: 'none' },
    table: { shelf: 'no' },
    rug: { border: 'no' },
  };
  return { ...defaultStyle(kind), ...start[kind] };
}

describe('kindFromName', () => {
  const ROWS: [row: string, words: string[], kind: Kind][] = [
    ['1', ['desk chair', 'office chair', 'task chair', 'gaming chair'], 'chair'],
    ['2', ['nightstand', 'night stand', 'bedside table', 'bedside'], 'nightstand'],
    ['3', ['tv stand', 'tv unit', 'tv console', 'tv bench', 'media console', 'media stand', 'entertainment center'], 'tvstand'],
    ['4', ['dresser', 'chest of drawers', 'drawer chest'], 'dresser'],
    ['5', ['sofa table', 'console table', 'coffee table', 'side table', 'end table', 'dining table', 'accent table', 'kitchen table'], 'table'],
    ['6', ['rug', 'carpet'], 'rug'],
    ['7', ['sofa', 'couch', 'loveseat', 'sectional', 'settee', 'futon'], 'sofa'],
    ['8', ['desk'], 'desk'],
    ['9', ['bookcase', 'bookshelf', 'shelving unit', 'shelf unit'], 'shelf'],
    ['10', ['bed', 'beds', 'bed frame', 'daybed'], 'bed'],
    ['11', ['table', 'tables'], 'table'],
    ['12', ['chair', 'chairs', 'armchair', 'stool', 'recliner'], 'chair'],
    ['13', ['shelf', 'shelves'], 'shelf'],
  ];
  const CASES = ROWS.flatMap(([row, words, kind]) => words.map((w) => [row, w, kind] as const));

  it.each(CASES)('row %s: "%s" → %s', (_row, word, kind) => {
    expect(kindFromName(word)).toBe(kind);
    expect(kindFromName(`Modern ${word.toUpperCase()} in grey`)).toBe(kind);
  });

  it('row —: no rule word → null', () => {
    expect(kindFromName('Ceramic vase')).toBeNull();
    expect(kindFromName('')).toBeNull();
  });

  it.each<[string, Kind | null]>([
    ['Sofa bed', 'sofa'],
    ['Bedside table with drawer', 'nightstand'],
    ['TV stand with 2 drawers', 'tvstand'],
    ['Coffee table with shelf', 'table'],
    ['Office chair', 'chair'],
    ['BILLY Bookcase - black oak effect', 'shelf'],
    ['Jadier 66" Upholstered Loveseat Square Sofa', 'sofa'],
    ['Bedding set', null],
    ['Tablet stand', null],
    ['MacBook Pro Laptop', null],
  ])('named case: "%s" → %s', (name, kind) => {
    expect(kindFromName(name)).toBe(kind);
  });
});

/** One style row: its label, the kind, the texts that trigger it, an optional size and the values it leaves. */
type StyleRow = [label: string, kind: Kind, texts: string[], sets: Record<string, string>, size?: { w: number; h: number }];

const STYLE_ROWS: StyleRow[] = [
  ['sofa seats 2', 'sofa', ['loveseat', '2-seat', '2 seater', 'two-seat'], { seats: '2' }],
  ['sofa seats 3', 'sofa', ['3-seat', '3 seater', 'three-seat'], { seats: '3' }],
  ['sofa seats 4', 'sofa', ['4-seat', '4 seater'], { seats: '4' }],
  ['sofa chaise right', 'sofa', ['sectional', 'chaise'], { chaise: 'right' }],
  ['sofa chaise left', 'sofa', ['left-facing', 'left facing', 'left-hand', 'left arm', 'left chaise', 'laf'], { chaise: 'left' }],
  ['sofa arms none', 'sofa', ['armless'], { arms: 'none' }],
  ['sofa arms rounded', 'sofa', ['rolled arm', 'round arm', 'rounded arm'], { arms: 'rounded' }],
  ['sofa arms slim', 'sofa', ['slim arm', 'narrow arm', 'thin arm'], { arms: 'slim' }],
  ['sofa cushions tight', 'sofa', ['tufted', 'tight back', 'tight-back'], { cushions: 'tight' }],
  ['sofa back high', 'sofa', ['high back', 'high-back'], { back: 'high' }],
  ['sofa back low', 'sofa', ['low back', 'low-back', 'low profile', 'low-profile'], { back: 'low' }],
  ['sofa legs metal', 'sofa', ['metal leg', 'steel leg', 'chrome leg', 'iron leg'], { legs: 'metal' }],
  ['chair legs metal', 'chair', ['metal leg', 'steel leg', 'chrome leg', 'iron leg'], { legs: 'metal' }],
  ['sofa legs tapered', 'sofa', ['tapered', 'mid-century', 'mid century', 'splayed'], { legs: 'tapered' }],
  ['chair legs tapered', 'chair', ['tapered', 'mid-century', 'mid century', 'splayed'], { legs: 'tapered' }],
  ['chair dining', 'chair', ['dining', 'side chair'], { type: 'dining', arms: 'no' }],
  ['chair office', 'chair', ['office', 'task', 'desk', 'gaming', 'swivel'], { type: 'office', legs: 'pedestal' }],
  // "dining" first sets type dining, so the armchair row is seen to change it back.
  ['chair armchair', 'chair', ['dining armchair', 'dining accent', 'dining lounge', 'dining club', 'dining recliner'], { type: 'armchair', arms: 'no' }],
  ['chair arms no', 'chair', ['armless', 'stool'], { arms: 'no' }],
  // "dining" first sets arms no, so the arms row is seen to change it back.
  ['chair arms yes', 'chair', ['dining with arms', 'dining armrest', 'dining armrests'], { type: 'dining', arms: 'yes' }],
  ['bed finish upholstered', 'bed', ['upholstered', 'fabric', 'velvet', 'linen', 'tufted'], { finish: 'upholstered' }],
  ['bed base platform', 'bed', ['platform'], { base: 'platform' }],
  ['bed base storage', 'bed', ['storage', 'drawer', 'drawers'], { base: 'storage' }],
  ['bed headboard tall', 'bed', ['tall headboard', 'high headboard', 'wingback'], { headboard: 'tall' }],
  ['bed headboard none', 'bed', ['no headboard', 'without headboard', 'frame only'], { headboard: 'none' }],
  ['bed footboard yes', 'bed', ['footboard'], { footboard: 'yes' }],
  ['bed footboard no', 'bed', ['footboard and no footboard', 'without footboard'], { footboard: 'no' }],
  ['desk no drawer word', 'desk', ['writing desk', ''], { drawers: 'none' }],
  ['desk drawers right', 'desk', ['drawer', 'drawers', '1-drawer', '2-drawer', '2 drawers'], { drawers: 'right' }],
  ['desk drawers both', 'desk', ['3-drawer', '3 drawer', '3-drawers', '4 drawers', '12-drawer'], { drawers: 'both' }],
  ['desk no drawers', 'desk', ['no drawers', 'without drawers', '3-drawer return, no drawers'], { drawers: 'none' }],
  ['desk supports trestle', 'desk', ['trestle', 'sawhorse'], { supports: 'trestle' }],
  ['desk supports panels', 'desk', ['panel sides', 'panel legs', 'slab legs'], { supports: 'panels' }],
  ['table no shelf word', 'table', ['coffee table', ''], { shelf: 'no' }],
  ['table shelf yes', 'table', ['shelf', '2-tier', 'two-tier', 'tiered'], { shelf: 'yes' }],
  ['table top round', 'table', ['round', 'circular'], { top: 'round' }],
  ['table base pedestal', 'table', ['pedestal', 'tulip'], { base: 'pedestal' }],
  ['table base trestle', 'table', ['trestle'], { base: 'trestle' }],
  ['shelf shelves 5', 'shelf', ['5-shelf', '5 shelves', '5-tier'], { shelves: '5' }],
  ['shelf shelves clamped up to 2', 'shelf', ['1-shelf', '0 shelves', '1-tier'], { shelves: '2' }],
  ['shelf shelves clamped down to 8', 'shelf', ['9-shelf', '9 shelves', '9-tier'], { shelves: '8' }],
  ['shelf back no', 'shelf', ['open back', 'open-back', 'backless', 'ladder', 'etagere'], { back: 'no' }],
  ['dresser 6 drawers, 60 × 34', 'dresser', ['6-drawer', '6 drawer', '6-drawers', '6 drawers'], { columns: '2', rows: '3' }, { w: 60, h: 34 }],
  ['dresser 6 drawers, size unknown', 'dresser', ['6-drawer'], { columns: '2', rows: '3' }],
  ['dresser 9 drawers, wide', 'dresser', ['9-drawer'], { columns: '3', rows: '3' }, { w: 60, h: 34 }],
  ['dresser 5 drawers, wide', 'dresser', ['5-drawer'], { columns: '2', rows: '3' }, { w: 60, h: 34 }],
  ['dresser 3 drawers, wide', 'dresser', ['3-drawer'], { columns: '1', rows: '3' }, { w: 60, h: 34 }],
  ['dresser 12 drawers, wide', 'dresser', ['12 drawers'], { columns: '3', rows: '4' }, { w: 60, h: 34 }],
  ['dresser 30 drawers, wide (rows clamped to 6)', 'dresser', ['30 drawers'], { columns: '3', rows: '6' }, { w: 60, h: 34 }],
  ['dresser 1 drawer, wide (rows clamped to 2)', 'dresser', ['1-drawer'], { columns: '1', rows: '2' }, { w: 60, h: 34 }],
  ['dresser 6 drawers, 30 × 50', 'dresser', ['6-drawer'], { columns: '1', rows: '6' }, { w: 30, h: 50 }],
  ['dresser 8 drawers, tall (rows clamped to 6)', 'dresser', ['8 drawers'], { columns: '1', rows: '6' }, { w: 30, h: 50 }],
  ['dresser 1 drawer, tall (rows clamped to 2)', 'dresser', ['1 drawer'], { columns: '1', rows: '2' }, { w: 30, h: 50 }],
  ['dresser handles bar', 'dresser', ['bar pull', 'bar handle'], { handles: 'bar' }],
  ['dresser handles none', 'dresser', ['handleless', 'handle-free', 'push to open', 'push-to-open'], { handles: 'none' }],
  // "bar pull" first sets bar, so the knob row is seen to change it back.
  ['dresser handles knob', 'dresser', ['bar pull with knob', 'bar pull, knobs'], { handles: 'knob' }],
  ['dresser base plinth', 'dresser', ['plinth', 'no legs'], { base: 'plinth' }],
  ['nightstand base plinth', 'nightstand', ['plinth', 'no legs'], { base: 'plinth' }],
  ['tvstand base plinth', 'tvstand', ['plinth', 'no legs'], { base: 'plinth' }],
  ['nightstand open', 'nightstand', ['open'], { drawers: '0' }],
  // "open" first sets 0, so the drawer row is seen to change it back.
  ['nightstand drawer', 'nightstand', ['open shelf and drawer', 'open shelf, drawers'], { drawers: '1' }],
  ['nightstand 2 drawers', 'nightstand', ['2-drawer', '2 drawer', '2-drawers', '2 drawers'], { drawers: '2' }],
  ['nightstand 0 drawers', 'nightstand', ['0 drawers'], { drawers: '0' }],
  ['nightstand drawers clamped to 2', 'nightstand', ['5 drawers'], { drawers: '2' }],
  ['tvstand fronts open', 'tvstand', ['open'], { fronts: 'open' }],
  // "open" first sets open, so the drawer row is seen to change it.
  ['tvstand fronts drawers', 'tvstand', ['open shelf and drawer', 'open shelf, drawers'], { fronts: 'drawers' }],
  ['tvstand fronts doors', 'tvstand', ['open drawers door', 'drawers and doors', 'open cabinet', 'open cabinets'], { fronts: 'doors' }],
  ['rug no border word', 'rug', ['area rug', ''], { border: 'no' }],
  ['rug border yes', 'rug', ['border', 'bordered'], { border: 'yes' }],
  ['rug shape round', 'rug', ['round', 'circular'], { shape: 'round' }],
  ['box anything', 'box', ['round tufted 3-drawer open box with border', ''], {}],
];

describe('styleFromText', () => {
  const CASES = STYLE_ROWS.flatMap(([label, kind, texts, sets, size]) => texts.map((t) => [label, t, kind, sets, size] as const));

  it.each(CASES)('%s: "%s"', (_label, text, kind, sets, size) => {
    expect(styleFromText(kind, text, size)).toEqual({ ...plain(kind), ...sets });
    expect(styleFromText(kind, `Some Brand ${text.toUpperCase()} piece`, size)).toEqual({ ...plain(kind), ...sets });
  });

  it.each(ALL_KINDS)('every %s style rule gives a style that completeStyle accepts unchanged', (kind) => {
    const rows = STYLE_ROWS.filter((r) => r[1] === kind);
    expect(rows.length).toBeGreaterThan(0);
    for (const [, , texts, , size] of rows) {
      for (const text of texts) {
        const style = styleFromText(kind, text, size);
        expect(completeStyle(kind, style)).toEqual(style);
        expect(Object.keys(style)).toEqual(Object.keys(defaultStyle(kind)));
      }
    }
  });

  it('named case: sofa "left-facing sectional" → chaise left', () => {
    expect(styleFromText('sofa', 'Left-facing sectional')).toEqual({ ...defaultStyle('sofa'), chaise: 'left' });
  });

  it('named case: sofa with no matching word → defaultStyle(sofa) unchanged', () => {
    expect(styleFromText('sofa', 'Jadier 66" Square Sofa in navy')).toEqual(defaultStyle('sofa'));
  });

  it('does not match a rule word inside another word', () => {
    expect(styleFromText('sofa', 'chaises taperedness armlessly')).toEqual(defaultStyle('sofa'));
    expect(styleFromText('table', 'roundabout shelfish')).toEqual(plain('table'));
  });

  it('reads a shelf count only from a single digit', () => {
    expect(styleFromText('shelf', '12-shelf unit')).toEqual(defaultStyle('shelf'));
  });

  it.each(ALL_KINDS)('text with __proto__ or constructor has no effect on a %s', (kind) => {
    expect(styleFromText(kind, '__proto__ constructor toString hasOwnProperty')).toEqual(plain(kind));
  });

  it('handles long input', () => {
    const text = `${'9'.repeat(50_000)} ${'a '.repeat(50_000)}drawer`;
    expect(styleFromText('desk', text)).toEqual({ ...plain('desk'), drawers: 'right' });
  });

  it('handles long hostile runs of digits, hyphens and half-words in every function', () => {
    const text = [
      '9'.repeat(20_000), '3-'.repeat(20_000), '3 '.repeat(20_000), 'off-'.repeat(10_000),
      'light-'.repeat(10_000), 'tv-'.repeat(10_000), 'seat'.repeat(10_000), 'no-'.repeat(10_000),
    ].join(' ');
    for (const kind of ALL_KINDS) expect(completeStyle(kind, styleFromText(kind, text))).not.toBeNull();
    expect(kindFromName(text)).toBeNull();
    expect(mainColourFromName(text)).toBeNull();
    expect(accentColourFromText(text, null)).toBeNull();
  });
});

const MAIN_COLOURS: [words: string[], colour: string][] = [
  [['white'], '#f3f1ec'], [['ivory'], '#ece6d8'], [['cream', 'off-white', 'off white'], '#ddd8ce'],
  [['beige'], '#cdbfa8'], [['sand'], '#c9b8a3'], [['tan'], '#b89b78'], [['taupe'], '#9a8b7c'],
  [['camel'], '#b58a5a'], [['brown'], '#6b4a33'], [['chocolate'], '#4a3428'], [['espresso'], '#3b2f27'],
  [['black'], '#232325'], [['charcoal'], '#3a3d42'], [['dark gray', 'dark grey'], '#55595f'],
  [['light gray', 'light grey'], '#b9bcc0'], [['gray', 'grey'], '#8a8d91'], [['slate'], '#6f7f8c'],
  [['silver'], '#b8bcc2'], [['navy'], '#2f4057'], [['dark blue'], '#2b3f63'], [['light blue'], '#a9c1d6'],
  [['blue'], '#4a6fa5'], [['teal'], '#2f7f7b'], [['turquoise'], '#3aa7a3'],
  [['dark green', 'forest green'], '#2f4f3a'], [['emerald'], '#2e7d5b'], [['olive'], '#6f7242'],
  [['sage'], '#8a9a8b'], [['green'], '#5c7a55'], [['mustard'], '#c79a2b'], [['yellow'], '#d9b53f'],
  [['gold'], '#b08d57'], [['orange'], '#cf7a35'], [['rust', 'terracotta'], '#b5673f'],
  [['burgundy', 'wine', 'maroon'], '#6b2331'], [['red'], '#a8322d'], [['blush'], '#e0bdb8'],
  [['pink'], '#d7a1a8'], [['lavender'], '#b3a4cf'], [['purple'], '#6a4c8c'], [['oak'], '#b98d5e'],
  [['walnut'], '#6b4a33'], [['natural', 'birch', 'pine', 'bamboo', 'rattan'], '#caa877'],
  [['mahogany', 'cherry'], '#7a3b2a'],
];

const ACCENT_COLOURS: [words: string[], colour: string][] = [
  [['black metal', 'black steel', 'black legs', 'matte black'], '#2b2b2d'], [['brass', 'gold'], '#b08d57'],
  [['chrome', 'silver', 'stainless', 'nickel'], '#b8bcc2'],
  [['oak', 'natural wood', 'light wood', 'birch', 'beech', 'pine', 'ash'], '#b98d5e'],
  [['walnut', 'dark wood', 'acacia', 'mango wood'], '#6b4a33'], [['espresso', 'wenge'], '#3b2f27'],
];

describe('mainColourFromName', () => {
  const CASES = MAIN_COLOURS.flatMap(([words, colour]) => words.map((w) => [w, colour] as const));

  it.each(CASES)('"%s" → %s', (word, colour) => {
    expect(mainColourFromName(word)).toBe(colour);
    expect(mainColourFromName(`Modern ${word.toUpperCase()} sofa, 3 seats`)).toBe(colour);
  });

  it('takes the word starting earliest in the name', () => {
    expect(mainColourFromName('Navy sofa with oak legs')).toBe('#2f4057');
    expect(mainColourFromName('Oak sofa in navy')).toBe('#b98d5e');
  });

  it('takes the longer word when an earlier-starting phrase contains another', () => {
    expect(mainColourFromName('Light gray sofa')).toBe('#b9bcc0');
    expect(mainColourFromName('Off-white chair')).toBe('#ddd8ce');
    expect(mainColourFromName('Forest green rug')).toBe('#2f4f3a');
  });

  it('no colour word → null', () => {
    expect(mainColourFromName('Jadier 66" Upholstered Loveseat Square Sofa')).toBeNull();
  });

  it.each(['Redwood', 'Tangerine', 'Greyhound'])('not inside another word: "%s" → null', (name) => {
    expect(mainColourFromName(name)).toBeNull();
  });

  it('ignores __proto__ and constructor', () => {
    expect(mainColourFromName('__proto__ constructor')).toBeNull();
  });
});

describe('accentColourFromText', () => {
  const CASES = ACCENT_COLOURS.flatMap(([words, colour]) => words.map((w) => [w, colour] as const));

  it.each(CASES)('"%s" → %s', (word, colour) => {
    expect(accentColourFromText(word, null)).toBe(colour);
    expect(accentColourFromText(`Sofa in navy with ${word.toUpperCase()} details`, '#2f4057')).toBe(colour);
  });

  it('takes the first accent word in the text', () => {
    expect(accentColourFromText('brass and chrome', null)).toBe('#b08d57');
    expect(accentColourFromText('chrome and brass', null)).toBe('#b8bcc2');
  });

  it('skips a word whose colour equals main and takes the next', () => {
    expect(accentColourFromText('oak top with brass feet', '#b98d5e')).toBe('#b08d57');
  });

  it('accent equals main: "Walnut coffee table", main #6b4a33 → null', () => {
    expect(accentColourFromText('Walnut coffee table', '#6b4a33')).toBeNull();
  });

  it('no accent word → null', () => {
    expect(accentColourFromText('Navy sofa', null)).toBeNull();
    expect(accentColourFromText('Ashley sofa, brassy oaken', null)).toBeNull();
  });

  it('ignores __proto__ and constructor', () => {
    expect(accentColourFromText('__proto__ constructor', null)).toBeNull();
  });
});

describe('recipeColours', () => {
  const SAME_DEFAULT: Kind[] = ['table', 'shelf', 'box'];
  const OTHERS = ALL_KINDS.filter((k) => !SAME_DEFAULT.includes(k));

  it.each(ALL_KINDS)('main given → main, main null → default main (%s)', (kind) => {
    expect(recipeColours(kind, '#123456', '#abcdef').main).toBe('#123456');
    expect(recipeColours(kind, null, '#abcdef').main).toBe(defaultColours(kind).main);
  });

  it.each(ALL_KINDS)('accent given → the accent (%s)', (kind) => {
    expect(recipeColours(kind, '#123456', '#abcdef').accent).toBe('#abcdef');
    expect(recipeColours(kind, null, '#abcdef').accent).toBe('#abcdef');
  });

  it.each(SAME_DEFAULT)('accent null, main given, %s (default main equals default accent) → accent = main', (kind) => {
    expect(defaultColours(kind).main).toBe(defaultColours(kind).accent);
    expect(recipeColours(kind, '#123456', null)).toEqual({ main: '#123456', accent: '#123456' });
  });

  it.each(OTHERS)('accent null, %s → default accent', (kind) => {
    expect(recipeColours(kind, '#123456', null)).toEqual({ main: '#123456', accent: defaultColours(kind).accent });
    expect(recipeColours(kind, null, null)).toEqual(defaultColours(kind));
  });
});

describe('Amendment 1: common spellings, plurals and hyphen forms', () => {
  describe('real product names from the review', () => {
    it.each<[string, Kind]>([
      ['3-Seater Sofa', 'sofa'], ['3 Seat Sofa', 'sofa'], ['Three Seater Sofa', 'sofa'],
      ['5 Shelf Bookcase', 'shelf'], ['5 Tier Bookshelf', 'shelf'], ['4 Tier Ladder Shelf', 'shelf'],
      ['2 Tier Coffee Table', 'table'], ['Area Rugs 8x10', 'rug'], ['Set of 2 Bar Stools', 'chair'],
      ['Nightstands Set of 2', 'nightstand'], ['TV Stands for Living Room', 'tvstand'], ['Sofas', 'sofa'],
      ['Couches for Living Room', 'sofa'], ['Recliners', 'chair'], ['Dressers for Bedroom', 'dresser'],
      ['Bookcases', 'shelf'], ['Office Desks', 'desk'], ['Barstool', 'chair'], ['TV-Stand', 'tvstand'],
      ['Night-stand', 'nightstand'], ['Light-Gray Sofa', 'sofa'], ['Desk with no drawer', 'desk'],
    ])('kind: "%s" → %s', (name, kind) => {
      expect(kindFromName(name)).toBe(kind);
    });

    it.each<[string, Kind, Record<string, string>]>([
      ['3-Seater Sofa', 'sofa', { seats: '3' }],
      ['3 Seat Sofa', 'sofa', { seats: '3' }],
      ['Three Seater Sofa', 'sofa', { seats: '3' }],
      ['5 Shelf Bookcase', 'shelf', { shelves: '5' }],
      ['5 Tier Bookshelf', 'shelf', { shelves: '5' }],
      ['4 Tier Ladder Shelf', 'shelf', { shelves: '4', back: 'no' }],
      ['2 Tier Coffee Table', 'table', { shelf: 'yes' }],
      ['Desk with no drawer', 'desk', { drawers: 'none' }],
    ])('style: "%s" (%s)', (name, kind, sets) => {
      expect(styleFromText(kind, name)).toEqual({ ...plain(kind), ...sets });
    });

    it('colour: "Light-Gray Sofa" → light grey', () => {
      expect(mainColourFromName('Light-Gray Sofa')).toBe('#b9bcc0');
    });
  });

  describe('item 1: a phrase joins its words with a space or a hyphen, in every table', () => {
    /** `text` with every space made a hyphen, and every hyphen made a space. */
    const swapJoins = (text: string) => text.replace(/[ -]/g, (c) => (c === ' ' ? '-' : ' '));

    it('hyphen form: "Light-Gray", "Entertainment-Center", "rolled-arm", "black-metal"', () => {
      expect(mainColourFromName('Light-Gray Sofa')).toBe('#b9bcc0');
      expect(kindFromName('Entertainment-Center')).toBe('tvstand');
      expect(styleFromText('sofa', 'Rolled-arm sofa')).toEqual({ ...defaultStyle('sofa'), arms: 'rounded' });
      expect(accentColourFromText('with black-metal legs', null)).toBe('#2b2b2d');
    });

    it('plural form: "Entertainment-Centers" → tvstand', () => {
      expect(kindFromName('Entertainment-Centers')).toBe('tvstand');
    });

    it.each(
      STYLE_ROWS.flatMap(([label, kind, texts, sets, size]) =>
        texts.filter((t) => /[ -]/.test(t)).map((t) => [label, swapJoins(t), kind, sets, size] as const),
      ),
    )('style %s: "%s"', (_label, text, kind, sets, size) => {
      expect(styleFromText(kind, text, size)).toEqual({ ...plain(kind), ...sets });
    });

    it.each(
      [...MAIN_COLOURS.map(([w, c]) => ['main', w, c] as const), ...ACCENT_COLOURS.map(([w, c]) => ['accent', w, c] as const)]
        .flatMap(([table, words, colour]) => words.filter((w) => w.includes(' ')).map((w) => [table, w.replace(/ /g, '-'), colour] as const)),
    )('%s colour "%s" → %s', (table, word, colour) => {
      const found = table === 'main' ? mainColourFromName(word) : accentColourFromText(word, null);
      expect(found).toBe(colour);
    });
  });

  describe('item 2: kind words match their plural', () => {
    const PLURALS: [string, Kind][] = [
      ['desk chairs', 'chair'], ['office chairs', 'chair'], ['task chairs', 'chair'], ['gaming chairs', 'chair'],
      ['nightstands', 'nightstand'], ['night stands', 'nightstand'], ['bedside tables', 'nightstand'],
      ['tv stands', 'tvstand'], ['tv units', 'tvstand'], ['tv consoles', 'tvstand'], ['media consoles', 'tvstand'],
      ['media stands', 'tvstand'], ['entertainment centers', 'tvstand'], ['dressers', 'dresser'], ['drawer chests', 'dresser'],
      ['sofa tables', 'table'], ['console tables', 'table'], ['coffee tables', 'table'], ['side tables', 'table'],
      ['end tables', 'table'], ['dining tables', 'table'], ['accent tables', 'table'], ['kitchen tables', 'table'],
      ['rugs', 'rug'], ['carpets', 'rug'], ['sofas', 'sofa'], ['couches', 'sofa'], ['loveseats', 'sofa'],
      ['sectionals', 'sofa'], ['settees', 'sofa'], ['futons', 'sofa'], ['desks', 'desk'], ['bookcases', 'shelf'],
      ['bookshelves', 'shelf'], ['shelving units', 'shelf'], ['shelf units', 'shelf'], ['bed frames', 'bed'],
      ['daybeds', 'bed'], ['armchairs', 'chair'], ['stools', 'chair'], ['recliners', 'chair'],
      ['barstools', 'chair'], ['bar stools', 'chair'],
    ];

    it.each(PLURALS)('plural form: "%s" → %s', (word, kind) => {
      expect(kindFromName(word)).toBe(kind);
    });

    it.each<[string, Kind]>([['bed-frames', 'bed'], ['bar-stools', 'chair'], ['bar-stool', 'chair'], ['barstool', 'chair'], ['bar stool', 'chair']])(
      'hyphen form and the added row-12 words: "%s" → %s',
      (word, kind) => {
        expect(kindFromName(word)).toBe(kind);
      },
    );

    it('still needs a whole word', () => {
      expect(kindFromName('Bedding set')).toBeNull();
      expect(kindFromName('Tablet stand')).toBeNull();
      expect(kindFromName('Sofa bed')).toBe('sofa');
      expect(kindFromName('Coffee table with shelf')).toBe('table');
    });
  });

  describe('item 3: sofa seats', () => {
    const NUMBERS: [string, string][] = [['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['two', '2'], ['three', '3'], ['four', '4'], ['five', '5']];
    const FORMS = ['N seat', 'N-seat', 'N seater', 'N-seater', 'N seats', 'N-seats', 'N seaters', 'N-seaters'];

    it.each(NUMBERS.flatMap(([n, seats]) => FORMS.map((f) => [f.replace('N', n), seats] as const)))('"%s" → seats %s', (text, seats) => {
      expect(styleFromText('sofa', `Modern ${text.toUpperCase()} sofa`)).toEqual({ ...defaultStyle('sofa'), seats });
    });

    it('hyphen form "4-seaters" and plural form "3 seats"', () => {
      expect(styleFromText('sofa', '4-seaters')).toEqual({ ...defaultStyle('sofa'), seats: '4' });
      expect(styleFromText('sofa', '3 seats')).toEqual({ ...defaultStyle('sofa'), seats: '3' });
    });

    it.each([
      ['Winfree 78" 2-Person Sofa', '2'],
      ['2-Person Sofa', '2'],
      ['3 person sofa', '3'],
      ['Three-Person Couch', '3'],
      ['four person sofa', '4'],
      ['5-Person Sofa', '5'],
    ])('"%s" → seats %s (the N-person form)', (text, seats) => {
      expect(styleFromText('sofa', text)).toEqual({ ...defaultStyle('sofa'), seats });
    });

    it('a person count outside 2–5, or a word that only starts with "person", changes nothing', () => {
      for (const text of ['1 person', '6-person', 'six person', '2 personal']) {
        expect(styleFromText('sofa', text)).toEqual(defaultStyle('sofa'));
      }
    });

    it('"loveseat" still means 2; numbers outside 2–5 change nothing', () => {
      expect(styleFromText('sofa', 'Loveseat')).toEqual({ ...defaultStyle('sofa'), seats: '2' });
      for (const text of ['1 seat', '6-seater', 'six seater', '12 seats', '3 seatbelt']) {
        expect(styleFromText('sofa', text)).toEqual(defaultStyle('sofa'));
      }
    });
  });

  describe('item 4: shelf count', () => {
    const FORMS = ['N shelf', 'N-shelf', 'N shelves', 'N-shelves', 'N tier', 'N-tier', 'N tiers', 'N-tiers'];

    it.each(FORMS.map((f) => f.replace('N', '6')))('"%s" → shelves 6', (text) => {
      expect(styleFromText('shelf', `Tall ${text.toUpperCase()} bookcase`)).toEqual({ ...defaultStyle('shelf'), shelves: '6' });
    });

    it('hyphen form "9-shelves" (clamped to 8) and plural form "1 tiers" (clamped to 2)', () => {
      expect(styleFromText('shelf', '9-shelves')).toEqual({ ...defaultStyle('shelf'), shelves: '8' });
      expect(styleFromText('shelf', '1 tiers')).toEqual({ ...defaultStyle('shelf'), shelves: '2' });
    });

    it('N is one digit', () => {
      expect(styleFromText('shelf', '12 shelves')).toEqual(defaultStyle('shelf'));
    });
  });

  describe('item 5: table lower shelf', () => {
    it.each(['shelves', '3 tier', '3-tier', '3 tiers', '3-tiers', '7 tier'])('"%s" → shelf yes', (text) => {
      expect(styleFromText('table', `Coffee table, ${text.toUpperCase()}`)).toEqual({ ...plain('table'), shelf: 'yes' });
    });

    it('hyphen form "two tier" and plural form "4-tiers"', () => {
      expect(styleFromText('table', 'two tier')).toEqual({ ...plain('table'), shelf: 'yes' });
      expect(styleFromText('table', '4-tiers')).toEqual({ ...plain('table'), shelf: 'yes' });
    });

    it('a tier count needs a whole word', () => {
      expect(styleFromText('table', '3 tierce 12 tier')).toEqual(plain('table'));
    });
  });

  describe('item 6: no drawer', () => {
    it.each(['no drawer', 'without drawer', 'no drawers', 'without drawers'])('desk "%s" → drawers none', (text) => {
      expect(styleFromText('desk', `Desk with ${text.toUpperCase()}`)).toEqual({ ...plain('desk'), drawers: 'none' });
    });

    it.each(['no drawer', 'no drawers', 'without drawer', 'without drawers'])('nightstand "%s" → drawers 0', (text) => {
      expect(styleFromText('nightstand', `Nightstand with ${text.toUpperCase()}`)).toEqual({ ...plain('nightstand'), drawers: '0' });
    });

    it('hyphen form "no-drawer" and plural form "without-drawers"', () => {
      expect(styleFromText('desk', 'no-drawer desk')).toEqual({ ...plain('desk'), drawers: 'none' });
      expect(styleFromText('nightstand', 'nightstand, without-drawers')).toEqual({ ...plain('nightstand'), drawers: '0' });
    });

    it('nightstand "no drawers" overrides the plain drawer row', () => {
      expect(styleFromText('nightstand', 'Drawer-style front, no drawers')).toEqual({ ...plain('nightstand'), drawers: '0' });
    });
  });
});
