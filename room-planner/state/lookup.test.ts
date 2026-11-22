import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../config';
import { defaultStyle } from '../domain/furniture/recipe';
import type { Item, Kind, ProductPreview } from '../domain/types';
import { LookupError, type LookupErrorCode, type ProductLookup } from '../services/productLookup';
import { furnishedDocument } from '../test/fixtures';
import {
  addFurnitureOfKind,
  addPreviewToRoom,
  clearPendingLink,
  dismissLookup,
  lookupProduct,
  updatePreview,
} from './actions';
import { usePlanStore } from './planStore';
import { type LookupState, useUiStore } from './uiStore';

/** The link every lookup here is given, and what parseProductUrl makes of it. */
const LINK = 'https://www.ikea.com/us/en/p/alder-3-seat-sofa-12345/';
const PARSED = { url: LINK, host: 'ikea.com' };

const PLAN_FULL = 'This plan is full. Remove a piece to add another.';

function preview(overrides: Partial<ProductPreview> = {}): ProductPreview {
  return {
    kind: 'sofa',
    name: 'Alder 3-seat sofa',
    host: 'ikea.com',
    sourceUrl: LINK,
    price: 499,
    w: 80,
    d: 35,
    h: 30,
    kindFound: false,
    sizesFound: false,
    sizeNote: null,
    imageUrl: 'https://www.ikea.com/us/en/images/alder.jpg',
    style: { ...defaultStyle('sofa'), arms: 'slim', legs: 'metal' },
    colours: { main: '#112233', accent: '#445566' },
    ...overrides,
  };
}

/** One lookup call the test settles by hand, with the signal it was given. */
interface PendingCall {
  url: string;
  signal: AbortSignal | undefined;
  resolve(p: ProductPreview): void;
  reject(err: unknown): void;
}

/** A fake lookup whose calls stay pending until the test settles them. */
function manualLookup(): { lookup: ProductLookup; calls: PendingCall[] } {
  const calls: PendingCall[] = [];
  const lookup: ProductLookup = {
    lookup: vi.fn(
      (url: string, opts?: { signal?: AbortSignal }) =>
        new Promise<ProductPreview>((resolve, reject) => {
          calls.push({ url, signal: opts?.signal, resolve, reject });
        }),
    ),
  };
  return { lookup, calls };
}

function resolvingLookup(p: ProductPreview): ProductLookup {
  return { lookup: vi.fn(async () => p) };
}

function rejectingLookup(err: unknown): ProductLookup {
  return { lookup: vi.fn(async () => Promise.reject(err)) };
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function lookupState(): LookupState {
  return useUiStore.getState().lookup;
}

function showPreview(p: ProductPreview = preview()): void {
  useUiStore.getState().setLookup({ status: 'preview', preview: p });
}

function itemById(id: string): Item {
  const item = usePlanStore.getState().items.find((i) => i.id === id);
  if (item === undefined) throw new Error(`no item ${id}`);
  return item;
}

function fillPlan(): void {
  const doc = furnishedDocument();
  const bed = doc.items[0];
  usePlanStore.getState().reset({ ...doc, items: Array.from({ length: CONFIG.maxItems }, (_, i) => ({ ...bed, id: `bed-${i}` })) });
}

beforeEach(() => {
  dismissLookup();
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
});

describe('uiStore lookup state', () => {
  it('starts idle with no pending link', () => {
    expect(lookupState()).toEqual({ status: 'idle' });
    expect(useUiStore.getState().pendingLink).toBeNull();
  });

  it('setLookup and setPendingLink set only their own field, and reset clears both', () => {
    const before = useUiStore.getState();
    useUiStore.getState().setLookup({ status: 'loading' });
    expect(useUiStore.getState()).toEqual({ ...before, lookup: { status: 'loading' } });
    useUiStore.getState().setPendingLink(PARSED);
    expect(useUiStore.getState()).toEqual({ ...before, lookup: { status: 'loading' }, pendingLink: PARSED });
    useUiStore.getState().reset();
    expect(lookupState()).toEqual({ status: 'idle' });
    expect(useUiStore.getState().pendingLink).toBeNull();
  });
});

describe('lookupProduct', () => {
  it('goes loading, then preview with the result, and clears the pending link', async () => {
    useUiStore.getState().setPendingLink({ url: 'https://www.wayfair.com/x', host: 'wayfair.com' });
    const { lookup, calls } = manualLookup();
    const done = lookupProduct(LINK, lookup);
    expect(lookupState()).toEqual({ status: 'loading' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(LINK);
    const p = preview();
    calls[0].resolve(p);
    await done;
    expect(lookupState()).toEqual({ status: 'preview', preview: p });
    expect(useUiStore.getState().pendingLink).toBeNull();
  });

  it.each<LookupErrorCode>(['unsupported_shop', 'blocked', 'not_a_product', 'unavailable', 'rate_limited'])(
    'a %s failure shows that error and keeps the parsed link as pending',
    async (code) => {
      await lookupProduct(`  ${LINK}  `, rejectingLookup(new LookupError(code)));
      expect(lookupState()).toEqual({ status: 'error', code });
      expect(useUiStore.getState().pendingLink).toEqual(PARSED);
    },
  );

  it('an invalid_url failure from the lookup shows that error and keeps no pending link', async () => {
    await lookupProduct(LINK, rejectingLookup(new LookupError('invalid_url')));
    expect(lookupState()).toEqual({ status: 'error', code: 'invalid_url' });
    expect(useUiStore.getState().pendingLink).toBeNull();
  });

  it('an error that is not a LookupError counts as unavailable and keeps the link', async () => {
    await expect(lookupProduct(LINK, rejectingLookup(new TypeError('boom')))).resolves.toBeUndefined();
    expect(lookupState()).toEqual({ status: 'error', code: 'unavailable' });
    expect(useUiStore.getState().pendingLink).toEqual(PARSED);
  });

  it.each(['', '   ', 'javascript:alert(1)'])('input %j is invalid_url and makes no request', async (raw) => {
    const lookup = resolvingLookup(preview());
    await lookupProduct(raw, lookup);
    expect(lookup.lookup).not.toHaveBeenCalled();
    expect(lookupState()).toEqual({ status: 'error', code: 'invalid_url' });
    expect(useUiStore.getState().pendingLink).toBeNull();
  });

  it('a second lookup aborts the first, and the first one’s late result is ignored', async () => {
    const { lookup, calls } = manualLookup();
    const first = lookupProduct(LINK, lookup);
    const second = lookupProduct('https://www.wayfair.com/furniture/pdp/oak-desk.html', lookup);
    expect(calls[0].signal?.aborted).toBe(true);
    expect(calls[1].signal?.aborted).toBe(false);
    const secondPreview = preview({ kind: 'desk', name: 'Oak desk' });
    calls[1].resolve(secondPreview);
    await second;
    calls[0].resolve(preview());
    await first;
    expect(lookupState()).toEqual({ status: 'preview', preview: secondPreview });
  });

  it('a superseded lookup’s late failure changes nothing', async () => {
    const { lookup, calls } = manualLookup();
    const first = lookupProduct(LINK, lookup);
    const second = lookupProduct(LINK, lookup);
    calls[0].reject(new LookupError('blocked'));
    await first;
    expect(lookupState()).toEqual({ status: 'loading' });
    expect(useUiStore.getState().pendingLink).toBeNull();
    const p = preview();
    calls[1].resolve(p);
    await second;
    expect(lookupState()).toEqual({ status: 'preview', preview: p });
  });

  it('an abort error is swallowed: the call resolves and changes nothing', async () => {
    const { lookup, calls } = manualLookup();
    const first = lookupProduct(LINK, lookup);
    lookupProduct(LINK, lookup);
    calls[0].reject(abortError());
    await expect(first).resolves.toBeUndefined();
    expect(lookupState()).toEqual({ status: 'loading' });
    expect(useUiStore.getState().pendingLink).toBeNull();
  });

  it('an abort error from the lookup that is still the current one shows unavailable instead of staying on loading', async () => {
    await expect(lookupProduct(LINK, rejectingLookup(abortError()))).resolves.toBeUndefined();
    expect(lookupState()).toEqual({ status: 'error', code: 'unavailable' });
    expect(useUiStore.getState().pendingLink).toEqual(PARSED);
  });

  it('keeps a pasted http link in its https form after a failure', async () => {
    await lookupProduct('http://www.ikea.com/us/en/p/alder-3-seat-sofa-12345/', rejectingLookup(new LookupError('blocked')));
    expect(useUiStore.getState().pendingLink).toEqual(PARSED);
  });

  it('keeps an http link with an explicit port as it was', async () => {
    await lookupProduct('http://www.ikea.com:8080/us/en/p/x/', rejectingLookup(new LookupError('unavailable')));
    expect(useUiStore.getState().pendingLink).toEqual({ url: 'http://www.ikea.com:8080/us/en/p/x/', host: 'ikea.com' });
  });
});

describe('updatePreview', () => {
  it.each([
    ['below the least size', { w: 0.2 }],
    ['above the largest size', { d: 241 }],
    ['not finite', { h: Number.POSITIVE_INFINITY }],
    ['not a number', { w: Number.NaN }],
  ])('ignores a size %s', (_label, patch) => {
    showPreview();
    updatePreview(patch);
    expect(lookupState()).toEqual({ status: 'preview', preview: preview() });
  });

  it('a valid size replaces the preview’s, invalid ones in the same patch are ignored, sizesFound unchanged', () => {
    showPreview();
    updatePreview({ w: 0.25, d: 500, h: 240 });
    expect(lookupState()).toEqual({ status: 'preview', preview: preview({ w: 0.25, h: 240 }) });
    updatePreview({ d: 40 });
    expect(lookupState()).toEqual({ status: 'preview', preview: preview({ w: 0.25, d: 40, h: 240 }) });
  });

  it('a different kind takes that kind’s default style and keeps colours, name and sizes; kindFound becomes true', () => {
    showPreview();
    updatePreview({ kind: 'bed' });
    expect(lookupState()).toEqual({
      status: 'preview',
      preview: preview({ kind: 'bed', style: defaultStyle('bed'), kindFound: true }),
    });
  });

  it('ignores a kind it does not know, while still applying a valid size', () => {
    showPreview();
    updatePreview({ kind: 'lamp' as unknown as Kind, w: 50 });
    expect(lookupState()).toEqual({ status: 'preview', preview: preview({ w: 50 }) });
  });

  it.each<LookupState>([{ status: 'idle' }, { status: 'loading' }, { status: 'error', code: 'blocked' }])(
    'does nothing while the lookup is $status',
    (state) => {
      useUiStore.getState().setLookup(state);
      const before = useUiStore.getState();
      updatePreview({ kind: 'bed', w: 50 });
      expect(useUiStore.getState()).toBe(before);
    },
  );
});

describe('addPreviewToRoom', () => {
  it('adds the previewed piece, selects it, sets the lookup idle and returns its id', () => {
    const p = preview();
    showPreview(p);
    const id = addPreviewToRoom();
    expect(id).not.toBeNull();
    const item = itemById(id as string);
    expect(item).toMatchObject({
      kind: 'sofa',
      name: p.name,
      host: 'ikea.com',
      sourceUrl: LINK,
      price: 499,
      w: 80,
      d: 35,
      h: 30,
      style: p.style,
      colours: p.colours,
    });
    expect(useUiStore.getState().selectedId).toBe(id);
    expect(lookupState()).toEqual({ status: 'idle' });
  });

  it('when the plan is full shows the notice, keeps the preview and returns null', () => {
    fillPlan();
    showPreview();
    expect(addPreviewToRoom()).toBeNull();
    expect(useUiStore.getState().notice).toBe(PLAN_FULL);
    expect(lookupState()).toEqual({ status: 'preview', preview: preview() });
    expect(usePlanStore.getState().items).toHaveLength(CONFIG.maxItems);
  });

  it('returns null and adds nothing when no preview is shown', () => {
    const count = usePlanStore.getState().items.length;
    expect(addPreviewToRoom()).toBeNull();
    expect(usePlanStore.getState().items).toHaveLength(count);
    expect(lookupState()).toEqual({ status: 'idle' });
  });
});

describe('dismissLookup', () => {
  it('aborts a running lookup, sets it idle and clears the pending link; the late result is ignored', async () => {
    const { lookup, calls } = manualLookup();
    const done = lookupProduct(LINK, lookup);
    useUiStore.getState().setPendingLink(PARSED);
    dismissLookup();
    expect(calls[0].signal?.aborted).toBe(true);
    expect(lookupState()).toEqual({ status: 'idle' });
    expect(useUiStore.getState().pendingLink).toBeNull();
    calls[0].resolve(preview());
    await done;
    expect(lookupState()).toEqual({ status: 'idle' });
  });

  it.each<LookupState>([{ status: 'preview', preview: preview() }, { status: 'error', code: 'blocked' }])(
    'from $status sets the lookup idle and clears the pending link',
    (state) => {
      useUiStore.getState().setLookup(state);
      useUiStore.getState().setPendingLink(PARSED);
      dismissLookup();
      expect(lookupState()).toEqual({ status: 'idle' });
      expect(useUiStore.getState().pendingLink).toBeNull();
    },
  );
});

describe('clearPendingLink', () => {
  it('clears the pending link and leaves the lookup as it was', () => {
    const state: LookupState = { status: 'error', code: 'blocked' };
    useUiStore.getState().setLookup(state);
    useUiStore.getState().setPendingLink(PARSED);
    clearPendingLink();
    expect(useUiStore.getState().pendingLink).toBeNull();
    expect(lookupState()).toEqual(state);
  });
});

describe('addFurnitureOfKind and the pending link', () => {
  it('gives the new piece the pending link and host, clears the link and sets the lookup idle', () => {
    useUiStore.getState().setLookup({ status: 'error', code: 'blocked' });
    useUiStore.getState().setPendingLink(PARSED);
    const id = addFurnitureOfKind('chair');
    expect(id).not.toBeNull();
    expect(itemById(id as string)).toMatchObject({ kind: 'chair', name: 'Chair', sourceUrl: LINK, host: 'ikea.com' });
    expect(useUiStore.getState().selectedId).toBe(id);
    expect(useUiStore.getState().pendingLink).toBeNull();
    expect(lookupState()).toEqual({ status: 'idle' });
  });

  it('when the plan is full shows the notice, keeps the pending link and returns null', () => {
    fillPlan();
    const state: LookupState = { status: 'error', code: 'blocked' };
    useUiStore.getState().setLookup(state);
    useUiStore.getState().setPendingLink(PARSED);
    expect(addFurnitureOfKind('chair')).toBeNull();
    expect(useUiStore.getState().notice).toBe(PLAN_FULL);
    expect(useUiStore.getState().pendingLink).toEqual(PARSED);
    expect(lookupState()).toEqual(state);
  });

  it('without a pending link adds a plain piece and leaves the lookup alone', () => {
    const state: LookupState = { status: 'error', code: 'invalid_url' };
    useUiStore.getState().setLookup(state);
    const id = addFurnitureOfKind('chair');
    expect(itemById(id as string)).toMatchObject({ kind: 'chair', name: 'Chair', sourceUrl: null, host: '' });
    expect(useUiStore.getState().selectedId).toBe(id);
    expect(lookupState()).toEqual(state);
  });
});
