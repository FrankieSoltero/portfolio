import { describe, expect, it } from 'vitest';
import { dominantColours } from './photoColours';

/** An RGBA colour as four bytes. */
type Rgba = readonly [number, number, number, number];

const WHITE: Rgba = [255, 255, 255, 255];
const CLEAR: Rgba = [0, 0, 0, 0];

/** `#rrggbb` as an opaque RGBA colour. */
function hex(colour: string): Rgba {
  const n = Number.parseInt(colour.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** A test image: a size, a backdrop colour and rectangles painted over it in order. */
class Picture {
  readonly pixels: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    backdrop: Rgba,
  ) {
    this.pixels = new Uint8ClampedArray(width * height * 4);
    this.fill(0, 0, width, height, backdrop);
  }

  /** Paints a `w` × `h` rectangle whose top-left pixel is (`x`, `y`). */
  fill(x: number, y: number, w: number, h: number, colour: Rgba): this {
    for (let row = y; row < y + h; row += 1) {
      for (let col = x; col < x + w; col += 1) {
        this.pixels.set(colour, (row * this.width + col) * 4);
      }
    }
    return this;
  }

  colours() {
    return dominantColours(this.pixels, this.width, this.height);
  }
}

describe('dominantColours', () => {
  it('finds the colour of an object on a white backdrop, with no accent', () => {
    const picture = new Picture(64, 64, WHITE).fill(16, 16, 32, 32, hex('#2f4057'));
    expect(picture.colours()).toEqual({ main: '#2f4057', accent: null });
  });

  it('gives the larger colour as main and the smaller, different one as accent', () => {
    const picture = new Picture(64, 64, WHITE)
      .fill(16, 16, 32, 24, hex('#2f4057'))
      .fill(16, 40, 32, 8, hex('#b98d5e'));
    expect(picture.colours()).toEqual({ main: '#2f4057', accent: '#b98d5e' });
  });

  it('removes a coloured backdrop by the corner colour', () => {
    const picture = new Picture(64, 64, hex('#e8e0d0')).fill(16, 16, 32, 32, hex('#6b2331'));
    expect(picture.colours()).toEqual({ main: '#6b2331', accent: null });
  });

  it('counts white enclosed by the object, since it is not connected to the border', () => {
    // A 40 × 40 square with a 20 × 20 white hole: the ring (1200 pixels) outnumbers the hole (400).
    const picture = new Picture(64, 64, WHITE)
      .fill(12, 12, 40, 40, hex('#3a3d42'))
      .fill(22, 22, 20, 20, WHITE);
    expect(picture.colours()).toEqual({ main: '#3a3d42', accent: '#ffffff' });
  });

  it('gives the enclosed white as main when it outnumbers the object', () => {
    // A 40 × 40 square with a 36 × 36 white hole: the hole (1296) outnumbers the ring (304).
    const picture = new Picture(64, 64, WHITE)
      .fill(12, 12, 40, 40, hex('#3a3d42'))
      .fill(14, 14, 36, 36, WHITE);
    expect(picture.colours()).toEqual({ main: '#ffffff', accent: '#3a3d42' });
  });

  it('gives nulls when everything is white', () => {
    expect(new Picture(64, 64, WHITE).colours()).toEqual({ main: null, accent: null });
  });

  it('gives nulls when everything is transparent, whatever its colour channels hold', () => {
    const picture = new Picture(64, 64, CLEAR).fill(16, 16, 32, 32, [47, 64, 87, 0]);
    expect(picture.colours()).toEqual({ main: null, accent: null });
  });

  it('gives nulls when fewer than 2% of the pixels remain, but not at 2% or more', () => {
    // 8 × 8 = 64 of 4096 pixels (1.6%) against 10 × 10 = 100 (2.4%).
    const tiny = new Picture(64, 64, WHITE).fill(28, 28, 8, 8, hex('#2f4057'));
    expect(tiny.colours()).toEqual({ main: null, accent: null });
    const small = new Picture(64, 64, WHITE).fill(27, 27, 10, 10, hex('#2f4057'));
    expect(small.colours()).toEqual({ main: '#2f4057', accent: null });
  });

  it('gives no accent when the second colour is too close to main', () => {
    const picture = new Picture(64, 64, WHITE)
      .fill(16, 16, 32, 20, hex('#2f4057'))
      .fill(16, 36, 32, 12, hex('#31425a'));
    expect(picture.colours()).toEqual({ main: '#2f4057', accent: null });
  });

  it('gives no accent when the second colour holds under 5% of the remaining pixels', () => {
    // 32 of 1024 remaining pixels (3.1%) are the second colour.
    const picture = new Picture(64, 64, WHITE)
      .fill(16, 16, 32, 32, hex('#2f4057'))
      .fill(20, 20, 4, 8, hex('#b98d5e'));
    expect(picture.colours()).toEqual({ main: '#2f4057', accent: null });
  });

  it('gives an accent at 5% of the remaining pixels or more', () => {
    // 64 of 1024 remaining pixels (6.25%) are the second colour.
    const picture = new Picture(64, 64, WHITE)
      .fill(16, 16, 32, 32, hex('#2f4057'))
      .fill(20, 20, 8, 8, hex('#b98d5e'));
    expect(picture.colours()).toEqual({ main: '#2f4057', accent: '#b98d5e' });
  });

  it('gives nulls when the length is not width × height × 4', () => {
    const picture = new Picture(64, 64, WHITE).fill(16, 16, 32, 32, hex('#2f4057'));
    expect(dominantColours(picture.pixels, 64, 63)).toEqual({ main: null, accent: null });
    expect(dominantColours(picture.pixels.subarray(4), 64, 64)).toEqual({ main: null, accent: null });
  });

  it('gives nulls when the width or height is 0', () => {
    const empty = new Uint8ClampedArray(0);
    expect(dominantColours(empty, 0, 64)).toEqual({ main: null, accent: null });
    expect(dominantColours(empty, 64, 0)).toEqual({ main: null, accent: null });
  });

  it('gives a colour as the rounded mean of its bucket, as #rrggbb in lower case', () => {
    // Two colours in one bucket, each in half the square: the mean (1.5, 2.5, 171.5) rounds up.
    const picture = new Picture(64, 64, WHITE)
      .fill(16, 16, 32, 16, [1, 2, 171, 255])
      .fill(16, 32, 32, 16, [2, 3, 172, 255]);
    const { main } = picture.colours();
    expect(main).toBe('#0203ac');
    expect(main).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('handles a large image without overflowing the stack', () => {
    const picture = new Picture(1000, 1000, WHITE).fill(250, 250, 500, 500, hex('#2f4057'));
    expect(picture.colours()).toEqual({ main: '#2f4057', accent: null });
  });
});
