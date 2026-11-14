import { describe, expect, it } from 'vitest';
import {
  fmtArea,
  fmtFurnDims,
  fmtLen,
  fmtMoney,
  furnInputStr,
  furnUnitLabel,
  gridStepInches,
  parseFurnInput,
  parseRoomInput,
  roomInputStep,
  roomInputStr,
  roomUnitLabel,
} from './units';

describe('fmtLen', () => {
  it('formats whole feet with a zero inch part', () => {
    expect(fmtLen(144, 'ft')).toBe('12′ 0″');
  });

  it('formats feet with inches', () => {
    expect(fmtLen(150, 'ft')).toBe('12′ 6″');
  });

  it('formats lengths under a foot as inches only', () => {
    expect(fmtLen(8, 'ft')).toBe('8″');
  });

  it('rounds up to the next foot when inches round to 12', () => {
    expect(fmtLen(11.6, 'ft')).toBe('1′ 0″');
  });

  it('formats metric lengths of a metre or more in metres', () => {
    expect(fmtLen(144, 'm')).toBe('3.66 m');
  });

  it('formats metric lengths under a metre in whole centimetres', () => {
    expect(fmtLen(30, 'm')).toBe('76 cm');
  });
});

describe('roomInputStr', () => {
  it('converts inches to feet with up to two decimals', () => {
    expect(roomInputStr(144, 'ft')).toBe('12');
    expect(roomInputStr(150, 'ft')).toBe('12.5');
  });

  it('converts inches to metres with up to two decimals', () => {
    expect(roomInputStr(144, 'm')).toBe('3.66');
  });
});

describe('furnInputStr', () => {
  it('keeps inches with one decimal in ft mode and whole centimetres in m mode', () => {
    expect(furnInputStr(0.5, 'ft')).toBe('0.5');
    expect(furnInputStr(64, 'm')).toBe('163');
  });
});

describe('fmtFurnDims', () => {
  const dims = { w: 64, d: 85, h: 38 };

  it('formats dimensions in inches', () => {
    expect(fmtFurnDims(dims, 'ft')).toBe('64 × 85 × 38 in');
  });

  it('formats dimensions in centimetres', () => {
    expect(fmtFurnDims(dims, 'm')).toBe('163 × 216 × 97 cm');
  });
});

describe('parseRoomInput', () => {
  it('parses feet and metres to inches', () => {
    expect(parseRoomInput('12', 'ft')).toBe(144);
    const metric = parseRoomInput('3.66', 'm');
    expect(metric).not.toBeNull();
    expect(metric).toBeCloseTo(144.094, 2);
  });

  it('rejects values outside the room limits and non-numeric input', () => {
    expect(parseRoomInput('2.9', 'ft')).toBeNull();
    expect(parseRoomInput('61', 'ft')).toBeNull();
    expect(parseRoomInput('', 'ft')).toBeNull();
    expect(parseRoomInput('abc', 'ft')).toBeNull();
  });

  it('accepts values exactly at the room limits', () => {
    expect(parseRoomInput('3', 'ft')).toBe(36);
    expect(parseRoomInput('60', 'ft')).toBe(720);
  });
});

describe('parseFurnInput', () => {
  it('parses inches in ft mode and centimetres in m mode', () => {
    expect(parseFurnInput('84', 'ft')).toBe(84);
    const metric = parseFurnInput('100', 'm');
    expect(metric).not.toBeNull();
    expect(metric).toBeCloseTo(39.37, 2);
  });

  it('rejects zero and values above the preview maximum', () => {
    expect(parseFurnInput('0', 'ft')).toBeNull();
    expect(parseFurnInput('241', 'ft')).toBeNull();
  });
});

describe('fmtArea', () => {
  const room = { w: 144, l: 168, h: 96 };

  it('formats floor area in square feet', () => {
    expect(fmtArea(room, 'ft')).toBe('168 sq ft');
  });

  it('formats floor area in square metres', () => {
    expect(fmtArea(room, 'm')).toBe('15.6 m²');
  });
});

describe('fmtMoney', () => {
  it('formats prices in US dollars with grouping', () => {
    expect(fmtMoney(1290)).toBe('$1,290');
    expect(fmtMoney(0)).toBe('$0');
  });

  it('shows No price for a missing price', () => {
    expect(fmtMoney(null)).toBe('No price');
  });
});

describe('gridStepInches', () => {
  it('is one foot in ft mode and 50 cm in m mode', () => {
    expect(gridStepInches('ft')).toBe(12);
    expect(gridStepInches('m')).toBe(50 / 2.54);
  });
});

describe('unit labels and steps', () => {
  it('labels room and furniture units', () => {
    expect(roomUnitLabel('ft')).toBe('ft');
    expect(roomUnitLabel('m')).toBe('m');
    expect(furnUnitLabel('ft')).toBe('in');
    expect(furnUnitLabel('m')).toBe('cm');
  });

  it('uses a quarter-foot or 5 cm input step', () => {
    expect(roomInputStep('ft')).toBe(0.25);
    expect(roomInputStep('m')).toBe(0.05);
  });
});
