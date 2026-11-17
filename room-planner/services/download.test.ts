import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { canvasToPng, downloadBlob } from './download';

type ToBlob = HTMLCanvasElement['toBlob'];

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('canvasToPng', () => {
  it("resolves the blob toBlob gives for 'image/png'", async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    const canvas = document.createElement('canvas');
    const toBlob = vi.spyOn(canvas, 'toBlob').mockImplementation(
      ((callback: BlobCallback) => callback(blob)) as ToBlob,
    );
    await expect(canvasToPng(canvas)).resolves.toBe(blob);
    expect(toBlob).toHaveBeenCalledTimes(1);
    expect(toBlob.mock.calls[0]?.[1]).toBe('image/png');
  });

  it('resolves null when toBlob gives null', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation(((callback: BlobCallback) => callback(null)) as ToBlob);
    await expect(canvasToPng(canvas)).resolves.toBeNull();
  });

  it('resolves null, without throwing, when toBlob throws', async () => {
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation(() => {
      throw new DOMException('tainted', 'SecurityError');
    });
    let result: Promise<Blob | null> | undefined;
    expect(() => {
      result = canvasToPng(canvas);
    }).not.toThrow();
    await expect(result).resolves.toBeNull();
  });
});

describe('downloadBlob', () => {
  const URL_STR = 'blob:test/1';
  let createObjectURL: ReturnType<typeof vi.fn<(obj: Blob | MediaSource) => string>>;
  let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;
  /** Each clicked anchor, with its state at the moment of the click. */
  let clicks: { href: string; download: string; inDocument: boolean }[];

  let originals: Record<'createObjectURL' | 'revokeObjectURL', PropertyDescriptor | undefined>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Object URLs need a real browser; these stand-ins record their use.
    originals = {
      createObjectURL: Object.getOwnPropertyDescriptor(URL, 'createObjectURL'),
      revokeObjectURL: Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL'),
    };
    createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => URL_STR);
    revokeObjectURL = vi.fn<(url: string) => void>();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
    clicks = [];
    // jsdom would try to navigate on an anchor click; record it instead.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push({ href: this.href, download: this.download, inDocument: document.contains(this) });
    });
  });

  afterEach(() => {
    for (const [name, descriptor] of Object.entries(originals)) {
      if (descriptor) Object.defineProperty(URL, name, descriptor);
      else Reflect.deleteProperty(URL, name);
    }
  });

  it('clicks a download link to an object URL of the blob, named by the filename', () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    downloadBlob(blob, 'room-3d.png');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]?.href).toBe(URL_STR);
    expect(clicks[0]?.download).toBe('room-3d.png');
  });

  it('does not leave the link in the document', () => {
    downloadBlob(new Blob(['png']), 'room-plan.png');
    expect(clicks).toHaveLength(1);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('revokes the object URL once the download has been handed off', () => {
    downloadBlob(new Blob(['png']), 'room-plan.png');
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith(URL_STR);
  });

  it('swallows a throw from creating the object URL, and clicks nothing', () => {
    createObjectURL.mockImplementation(() => {
      throw new Error('no object URLs');
    });
    expect(() => downloadBlob(new Blob(['png']), 'room-plan.png')).not.toThrow();
    expect(clicks).toHaveLength(0);
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('swallows a throw from the click, still revokes and leaves no link behind', () => {
    vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => {
      throw new Error('click blocked');
    });
    expect(() => downloadBlob(new Blob(['png']), 'room-plan.png')).not.toThrow();
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(revokeObjectURL).toHaveBeenCalledWith(URL_STR);
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('swallows a throw from revoking the object URL', () => {
    revokeObjectURL.mockImplementation(() => {
      throw new Error('revoke failed');
    });
    expect(() => downloadBlob(new Blob(['png']), 'room-plan.png')).not.toThrow();
    expect(() => vi.runAllTimers()).not.toThrow();
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});
