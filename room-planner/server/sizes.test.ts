// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { parseDimensionLine, parseLength } from './sizes';

describe('parseLength', () => {
  it.each([
    ['fraction', '31 1/2 "', 31.5],
    ['fraction, no space', '41 3/4"', 41.75],
    ['whole', '11 "', 11],
    ['double apostrophe', "32.3''", 32.3],
    ['in', '66 in', 66],
    ['inches', '66 inches', 66],
    ['inch', '66 inch', 66],
    ['bare number', '59', 59],
    ['centimetres', '80 cm', 31.5],
    ['millimetres', '800 mm', 31.5],
    ['ft', '6 ft', 72],
    ['feet', '6 feet', 72],
    ['left-to-right mark', '\u200E14.01 inches', 14.01],
  ])('reads %s: %j', (_case, text, expected) => {
    expect(parseLength(text)).toBe(expected);
  });

  it.each(['', 'abc', '0', '-3', '1/0', '20000'])('refuses %j', (text) => {
    expect(parseLength(text)).toBeNull();
  });

  it('stays fast and never throws on long hostile text', () => {
    const hostile = ['1'.repeat(50_000) + ' 1/', ' '.repeat(50_000) + 'x', '1.1.1.1'.repeat(10_000)];
    const started = Date.now();
    for (const text of hostile) expect(parseLength(text)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('parseDimensionLine', () => {
  it('reads a Wayfair line by its labels', () => {
    expect(parseDimensionLine("32.3'' H X 65.8'' W X 32.3'' D")).toEqual({ h: 32.3, w: 65.8, d: 32.3, labelled: true });
  });

  it('reads an Amazon labelled line', () => {
    expect(parseDimensionLine('35"D x 80"W x 30"H')).toEqual({ d: 35, w: 80, h: 30, labelled: true });
  });

  it('reads L as width and then W as depth', () => {
    expect(parseDimensionLine('80"L x 35"W x 30"H')).toEqual({ w: 80, d: 35, h: 30, labelled: true });
  });

  it('reads labels in any case', () => {
    expect(parseDimensionLine('80"l x 35"w x 30"h')).toEqual({ w: 80, d: 35, h: 30, labelled: true });
  });

  it('reads an unlabelled line as depth, width, height', () => {
    expect(parseDimensionLine('14.01 x 9.77 x 0.66 inches')).toEqual({ d: 14.01, w: 9.77, h: 0.66, labelled: false });
  });

  it('reads an unlabelled line in the order a hint gives', () => {
    expect(parseDimensionLine('80 x 35 x 30 inches', 'LxWxH')).toEqual({ w: 80, d: 35, h: 30, labelled: true });
  });

  it('reads a spaced D x W x H hint', () => {
    expect(parseDimensionLine('35 x 80 x 30 inches', 'D x W x H')).toEqual({ d: 35, w: 80, h: 30, labelled: true });
  });

  it('applies the unit at the end of the line to every number', () => {
    expect(parseDimensionLine('80 x 35 x 30 cm')).toEqual({ d: 31.5, w: 13.78, h: 11.81, labelled: false });
  });

  it('reads two numbers as depth and width', () => {
    expect(parseDimensionLine('60 x 96 inches')).toEqual({ d: 60, w: 96, h: null, labelled: false });
  });

  it.each(['48 inches', 'n/a', '', '1 x 2 x 3 x 4 inches'])('refuses %j', (text) => {
    expect(parseDimensionLine(text)).toBeNull();
  });

  it('keeps the other parts when one part is refused', () => {
    expect(parseDimensionLine('0 x 9 x 3 inches')).toEqual({ d: null, w: 9, h: 3, labelled: false });
  });

  it('stays fast and never throws on long hostile text', () => {
    const hostile = ['1 x '.repeat(20_000), 'x'.repeat(100_000), '1"' + ' '.repeat(50_000) + 'H x 2'];
    const started = Date.now();
    for (const text of hostile) expect(() => parseDimensionLine(text, 'L x '.repeat(10_000))).not.toThrow();
    expect(Date.now() - started).toBeLessThan(500);
  });
});
