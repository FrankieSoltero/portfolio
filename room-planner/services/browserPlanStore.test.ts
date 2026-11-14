import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { createInitialDocument } from '../domain/catalog';
import { parsePlan } from '../domain/planSchema';
import type { PlanDocument } from '../domain/types';
import { createBrowserPlanStore } from './browserPlanStore';

const KEY = 'room-planner:plan:v1';
const OTHER_KEY = 'some-other-app:settings';
const OTHER_VALUE = '{"theme":"dark"}';

/** An in-memory `Storage`, so no test depends on jsdom's real localStorage. */
class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }

  /** Every key and value, for exact assertions about what is stored. */
  entries(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}

function quotaError(): DOMException {
  return new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

function blockedError(): DOMException {
  return new DOMException('Access is denied for this document.', 'SecurityError');
}

/** The four document fields, serialised in the order the store writes them. */
function serialised(doc: PlanDocument): string {
  return JSON.stringify({ schemaVersion: doc.schemaVersion, units: doc.units, room: doc.room, items: doc.items });
}

/** The version 1 seeded document exactly as slice A wrote it (commit 6ed5e96). */
function v1Seed(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    units: 'ft',
    room: { w: 144, l: 168, h: 96 },
    items: [
      {
        id: 'seed-bed', kind: 'bed', name: 'Low platform bed, queen', host: 'shop.example',
        sourceUrl: null, price: 890, w: 64, d: 85, h: 38, x: 40, y: 0, rot: 0,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
      {
        id: 'seed-desk', kind: 'desk', name: 'Tack writing desk', host: 'shop.example',
        sourceUrl: null, price: 420, w: 55, d: 26, h: 30, x: 118, y: 104, rot: 1,
        model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
      },
    ],
  };
}

/**
 * A document that serialises to exactly `chars` characters and that parsePlan accepts, so only the
 * size limit can refuse it: 200 copies of the seeded bed whose link, name and host are padded, one
 * field at a time, up to their saved-plan limits.
 */
function docSerialisingTo(chars: number): PlanDocument {
  const doc = createInitialDocument();
  const link = 'https://shop.example/';
  doc.items = Array.from({ length: CONFIG.maxItems }, (_, i) => ({ ...doc.items[0], id: `pad-${i}`, sourceUrl: link }));
  let pad = chars - serialised(doc).length;
  const take = (room: number): string => {
    const n = Math.max(0, Math.min(pad, room));
    pad -= n;
    return 'a'.repeat(n);
  };
  doc.items = doc.items.map((item) => ({
    ...item,
    sourceUrl: link + take(2048 - link.length),
    name: item.name + take(200 - item.name.length),
    host: item.host + take(255 - item.host.length),
  }));
  expect(serialised(doc)).toHaveLength(chars);
  expect(parsePlan(JSON.parse(serialised(doc))).ok).toBe(true);
  return doc;
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  storage.setItem(OTHER_KEY, OTHER_VALUE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CONFIG for saving', () => {
  it('uses the one storage key and the size limit the store relies on', () => {
    expect(CONFIG.planStorageKey).toBe(KEY);
    expect(CONFIG.maxStoredChars).toBe(524288);
  });
});

describe('createBrowserPlanStore load', () => {
  it('reports empty when nothing is saved', async () => {
    const store = createBrowserPlanStore(() => storage);
    await expect(store.load()).resolves.toEqual({ status: 'empty' });
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE });
  });

  it('loads a saved version 2 document and leaves it stored', async () => {
    const doc = createInitialDocument();
    storage.setItem(KEY, serialised(doc));
    const store = createBrowserPlanStore(() => storage);
    await expect(store.load()).resolves.toEqual({ status: 'loaded', doc });
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE, [KEY]: serialised(doc) });
  });

  it('loads a version 1 document converted by parsePlan', async () => {
    const stored = JSON.stringify(v1Seed());
    storage.setItem(KEY, stored);
    const expected = parsePlan(v1Seed());
    if (!expected.ok) throw new Error('the version 1 fixture must be accepted');
    const result = await createBrowserPlanStore(() => storage).load();
    expect(result).toEqual({ status: 'loaded', doc: expected.doc });
    if (result.status !== 'loaded') throw new Error('unreachable');
    expect(result.doc.schemaVersion).toBe(2);
    expect(result.doc.room.outline).toEqual([
      { id: 'c1', x: 0, y: 0 }, { id: 'c2', x: 144, y: 0 }, { id: 'c3', x: 144, y: 168 }, { id: 'c4', x: 0, y: 168 },
    ]);
    expect(storage.getItem(KEY)).toBe(stored);
  });

  it('discards a value that is not JSON', async () => {
    storage.setItem(KEY, '{oops');
    await expect(createBrowserPlanStore(() => storage).load()).resolves.toEqual({ status: 'invalid' });
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE });
  });

  it.each([
    ['JSON null', 'null'],
    ['a JSON string', '"plan"'],
    ['a document with unknown units', JSON.stringify({ ...createInitialDocument(), units: 'cubits' })],
    ['a document with no schemaVersion', JSON.stringify({ units: 'ft', room: createInitialDocument().room, items: [] })],
    ['a document with schemaVersion 0', JSON.stringify({ ...createInitialDocument(), schemaVersion: 0 })],
  ])('discards %s, which parsePlan refuses as not newer', async (_name, stored) => {
    const refusal = parsePlan(JSON.parse(stored));
    expect(refusal).toMatchObject({ ok: false, newer: false });
    storage.setItem(KEY, stored);
    await expect(createBrowserPlanStore(() => storage).load()).resolves.toEqual({ status: 'invalid' });
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE });
  });

  it.each([3, 40])('leaves a plan saved by a newer planner (schemaVersion %s) untouched', async (version) => {
    const stored = JSON.stringify({ ...createInitialDocument(), schemaVersion: version });
    storage.setItem(KEY, stored);
    const setItem = vi.spyOn(storage, 'setItem');
    const removeItem = vi.spyOn(storage, 'removeItem');
    await expect(createBrowserPlanStore(() => storage).load()).resolves.toEqual({ status: 'newer' });
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE, [KEY]: stored });
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('discards an oversized value without parsing it, even when it is a valid document', async () => {
    const doc = serialised(createInitialDocument());
    const stored = doc + ' '.repeat(CONFIG.maxStoredChars + 1 - doc.length);
    expect(stored).toHaveLength(CONFIG.maxStoredChars + 1);
    storage.setItem(KEY, stored);
    const parse = vi.spyOn(JSON, 'parse');
    await expect(createBrowserPlanStore(() => storage).load()).resolves.toEqual({ status: 'invalid' });
    expect(parse).not.toHaveBeenCalled();
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE });
  });

  it('loads a value of exactly the size limit', async () => {
    const doc = createInitialDocument();
    const stored = serialised(doc) + ' '.repeat(CONFIG.maxStoredChars - serialised(doc).length);
    expect(stored).toHaveLength(CONFIG.maxStoredChars);
    storage.setItem(KEY, stored);
    await expect(createBrowserPlanStore(() => storage).load()).resolves.toEqual({ status: 'loaded', doc });
  });

  it('reads the key afresh on every call', async () => {
    const store = createBrowserPlanStore(() => storage);
    await expect(store.load()).resolves.toEqual({ status: 'empty' });
    const doc = createInitialDocument();
    storage.setItem(KEY, serialised(doc));
    await expect(store.load()).resolves.toEqual({ status: 'loaded', doc });
  });
});

describe('createBrowserPlanStore save', () => {
  it('round-trips a document through save and load', async () => {
    const doc = createInitialDocument();
    const store = createBrowserPlanStore(() => storage);
    await expect(store.save(doc)).resolves.toBe(true);
    await expect(store.load()).resolves.toEqual({ status: 'loaded', doc });
  });

  it('writes exactly the one key holding only the four document fields', async () => {
    const empty = new MemoryStorage();
    const doc = createInitialDocument();
    // A store state object: the document's fields plus actions and UI state.
    const state = {
      ...doc,
      selectedId: 'seed-bed',
      editMode: 'room',
      setUnits: () => {},
      moveItem: (id: string) => id,
    };
    await expect(createBrowserPlanStore(() => empty).save(state)).resolves.toBe(true);
    expect(empty.entries()).toEqual({ [KEY]: serialised(doc) });
    expect(Object.keys(JSON.parse(empty.getItem(KEY) as string) as object)).toEqual(['schemaVersion', 'units', 'room', 'items']);
  });

  it('leaves other keys untouched and overwrites an earlier save', async () => {
    const store = createBrowserPlanStore(() => storage);
    const first = createInitialDocument();
    const second = { ...createInitialDocument(), units: 'm' as const };
    await expect(store.save(first)).resolves.toBe(true);
    await expect(store.save(second)).resolves.toBe(true);
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE, [KEY]: serialised(second) });
  });

  it('saves a document that serialises to exactly the size limit', async () => {
    const doc = docSerialisingTo(CONFIG.maxStoredChars);
    await expect(createBrowserPlanStore(() => storage).save(doc)).resolves.toBe(true);
    expect(storage.getItem(KEY)).toBe(serialised(doc));
  });

  it('writes nothing when the document serialises to more than the size limit', async () => {
    const earlier = serialised(createInitialDocument());
    storage.setItem(KEY, earlier);
    const setItem = vi.spyOn(storage, 'setItem');
    const removeItem = vi.spyOn(storage, 'removeItem');
    const doc = docSerialisingTo(CONFIG.maxStoredChars + 1);
    await expect(createBrowserPlanStore(() => storage).save(doc)).resolves.toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE, [KEY]: earlier });
  });

  it('writes nothing and resolves false when parsePlan would refuse the document (a 3000-character link)', async () => {
    const earlier = serialised(createInitialDocument());
    storage.setItem(KEY, earlier);
    const setItem = vi.spyOn(storage, 'setItem');
    const removeItem = vi.spyOn(storage, 'removeItem');
    const doc = createInitialDocument();
    doc.items[0] = { ...doc.items[0], sourceUrl: `https://shop.example/${'a'.repeat(3000 - 21)}` };
    expect(doc.items[0].sourceUrl).toHaveLength(3000);
    expect(parsePlan(JSON.parse(serialised(doc))).ok).toBe(false);
    await expect(createBrowserPlanStore(() => storage).save(doc)).resolves.toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE, [KEY]: earlier });
  });

  it('resolves false when the quota is exceeded', async () => {
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    await expect(createBrowserPlanStore(() => storage).save(createInitialDocument())).resolves.toBe(false);
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE });
  });
});

describe('createBrowserPlanStore clear', () => {
  it('removes the key and leaves other keys untouched', async () => {
    storage.setItem(KEY, serialised(createInitialDocument()));
    await expect(createBrowserPlanStore(() => storage).clear()).resolves.toBeUndefined();
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE });
  });

  it('resolves when nothing is saved', async () => {
    await expect(createBrowserPlanStore(() => storage).clear()).resolves.toBeUndefined();
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE });
  });
});

describe('createBrowserPlanStore when storage fails', () => {
  it('calls the getter inside every method, so a blocked storage never throws or rejects', async () => {
    const getter = vi.fn((): Storage => {
      throw blockedError();
    });
    const store = createBrowserPlanStore(getter);
    let load: Promise<unknown> | undefined;
    let save: Promise<unknown> | undefined;
    let clear: Promise<unknown> | undefined;
    expect(() => {
      load = store.load();
      save = store.save(createInitialDocument());
      clear = store.clear();
    }).not.toThrow();
    await expect(load).resolves.toEqual({ status: 'unavailable' });
    await expect(save).resolves.toBe(false);
    await expect(clear).resolves.toBeUndefined();
    expect(getter).toHaveBeenCalledTimes(3);
  });

  it('does not call the getter until a method is called', () => {
    const getter = vi.fn(() => storage);
    createBrowserPlanStore(getter);
    expect(getter).not.toHaveBeenCalled();
  });

  it('reports unavailable when reading the key throws', async () => {
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw blockedError();
    });
    await expect(createBrowserPlanStore(() => storage).load()).resolves.toEqual({ status: 'unavailable' });
  });

  it('reports unavailable when discarding an invalid value throws, and keeps the value', async () => {
    storage.setItem(KEY, '{oops');
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw blockedError();
    });
    await expect(createBrowserPlanStore(() => storage).load()).resolves.toEqual({ status: 'unavailable' });
    expect(storage.entries()).toEqual({ [OTHER_KEY]: OTHER_VALUE, [KEY]: '{oops' });
  });

  it('resolves clear when removing the key throws', async () => {
    storage.setItem(KEY, serialised(createInitialDocument()));
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw blockedError();
    });
    await expect(createBrowserPlanStore(() => storage).clear()).resolves.toBeUndefined();
  });

  it('logs nothing on any failure', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug', 'trace'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const store = createBrowserPlanStore(() => storage);

    storage.setItem(KEY, '{oops');
    await store.load();
    storage.setItem(KEY, JSON.stringify({ ...createInitialDocument(), units: 'cubits' }));
    await store.load();
    storage.setItem(KEY, JSON.stringify({ ...createInitialDocument(), schemaVersion: 3 }));
    await store.load();
    storage.setItem(KEY, 'x'.repeat(CONFIG.maxStoredChars + 1));
    await store.load();
    await store.save(docSerialisingTo(CONFIG.maxStoredChars + 1));

    const blocked = createBrowserPlanStore(() => {
      throw blockedError();
    });
    await blocked.load();
    await blocked.save(createInitialDocument());
    await blocked.clear();

    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw quotaError();
    });
    vi.spyOn(storage, 'removeItem').mockImplementation(() => {
      throw blockedError();
    });
    vi.spyOn(storage, 'getItem').mockImplementation(() => {
      throw blockedError();
    });
    await store.save(createInitialDocument());
    await store.clear();
    await store.load();

    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
  });
});

describe('createBrowserPlanStore default storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('uses window.localStorage when no getter is given', async () => {
    const doc = createInitialDocument();
    const store = createBrowserPlanStore();
    await expect(store.save(doc)).resolves.toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe(serialised(doc));
    await expect(store.load()).resolves.toEqual({ status: 'loaded', doc });
    await store.clear();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });
});
