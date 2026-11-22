// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { growth, GROWTH_MAX, growthMessage, HANG_GUARD_MS } from '../test/cpuTiming';
import { parseDimensionLine, parseLength } from './sizes';

/**
 * How much more CPU time `parse` takes on its hostile input built at 8 times the size than at the
 * base size (see `growth` in `test/cpuTiming.ts`). Both inputs are built before either is timed.
 */
function growthOf<T>(build: (factor: number) => T, parse: (input: T) => void): { ratio: number; smallMs: number; largeMs: number } {
  return growth(parse, build(1), build(8));
}

describe('parseLength', { retry: 2 }, () => {
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

  it.each<[string, (factor: number) => string]>([
    ['digits then a bare slash', (f) => '1'.repeat(50_000 * f) + ' 1/'],
    ['spaces then a letter', (f) => ' '.repeat(50_000 * f) + 'x'],
    ['repeated dots', (f) => '1.1.1.1'.repeat(10_000 * f)],
  ])('refuses long hostile text (%s) in time growing in step with its length', (_case, build) => {
    const result = growthOf(build, (text) => expect(parseLength(text)).toBeNull());
    expect(result.ratio, growthMessage(result)).toBeLessThan(GROWTH_MAX);
    // A hang guard only: it fails if the parse stops ending, not on a slow core.
    expect(result.largeMs).toBeLessThan(HANG_GUARD_MS);
  });
});

describe('parseDimensionLine', { retry: 2 }, () => {
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

  it.each<[string, (factor: number) => string]>([
    ['repeated "1 x "', (f) => '1 x '.repeat(20_000 * f)],
    ['one long word', (f) => 'x'.repeat(100_000 * f)],
    ['a label far after its number', (f) => '1"' + ' '.repeat(50_000 * f) + 'H x 2'],
  ])('never throws on long hostile text (%s) with a long hint, in time growing in step with its length', (_case, build) => {
    // The order hint grows with the text, so work that multiplied the two would show as about 64.
    const result = growthOf(
      (f) => ({ text: build(f), hint: 'L x '.repeat(10_000 * f) }),
      ({ text, hint }) => expect(() => parseDimensionLine(text, hint)).not.toThrow(),
    );
    expect(result.ratio, growthMessage(result)).toBeLessThan(GROWTH_MAX);
    // A hang guard only: it fails if the parse stops ending, not on a slow core.
    expect(result.largeMs).toBeLessThan(HANG_GUARD_MS);
  });
});
