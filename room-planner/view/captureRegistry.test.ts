import { afterEach, describe, expect, it } from 'vitest';
import { captureView, registerViewCapture, type ViewCapture } from './captureRegistry';

/** Unregister functions from each test, run afterwards so no registration leaks between tests. */
let cleanups: (() => void)[] = [];

function register(fn: ViewCapture): () => void {
  const unregister = registerViewCapture(fn);
  cleanups.push(unregister);
  return unregister;
}

afterEach(() => {
  cleanups.forEach((unregister) => unregister());
  cleanups = [];
});

describe('captureRegistry', () => {
  it('captures null when nothing is registered', () => {
    expect(captureView()).toBeNull();
  });

  it("returns the registered capture's canvas", () => {
    const canvas = document.createElement('canvas');
    register(() => canvas);
    expect(captureView()).toBe(canvas);
  });

  it("returns null when the registered capture returns null", () => {
    register(() => null);
    expect(captureView()).toBeNull();
  });

  it('returns null when the registered capture throws', () => {
    register(() => {
      throw new Error('capture failed');
    });
    expect(() => captureView()).not.toThrow();
    expect(captureView()).toBeNull();
  });

  it('captures null again once the capture is unregistered', () => {
    const unregister = register(() => document.createElement('canvas'));
    unregister();
    expect(captureView()).toBeNull();
  });

  it('makes a later registration the current one', () => {
    const first = document.createElement('canvas');
    const second = document.createElement('canvas');
    register(() => first);
    register(() => second);
    expect(captureView()).toBe(second);
  });

  it("keeps the newer registration when the older one's unregister runs afterwards (style switch)", () => {
    const older = document.createElement('canvas');
    const newer = document.createElement('canvas');
    const unregisterOlder = register(() => older);
    register(() => newer);
    unregisterOlder();
    expect(captureView()).toBe(newer);
  });

  it('removes a capture registered twice only when its own latest registration is unregistered', () => {
    const canvas = document.createElement('canvas');
    const fn: ViewCapture = () => canvas;
    const first = register(fn);
    const second = register(fn);
    first();
    expect(captureView()).toBe(canvas);
    second();
    expect(captureView()).toBeNull();
  });
});
