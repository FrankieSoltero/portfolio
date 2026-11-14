import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductPreview } from '../../domain/types';
import { SAMPLE_LINKS } from '../../services/mockProductLookup';
import { LOOKUP_MESSAGES, LookupError, type ProductLookup } from '../../services/productLookup';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { AddFurnitureSection } from './AddFurnitureSection';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

interface PendingCall {
  url: string;
  signal: AbortSignal | undefined;
  resolve(p: ProductPreview): void;
  reject(err: unknown): void;
}

/** A ProductLookup whose promises the test settles by hand. */
function fakeLookup(): { lookup: ProductLookup; spy: ReturnType<typeof vi.fn>; calls: PendingCall[] } {
  const calls: PendingCall[] = [];
  const spy = vi.fn(
    (url: string, opts?: { signal?: AbortSignal }) =>
      new Promise<ProductPreview>((resolve, reject) => {
        calls.push({ url, signal: opts?.signal, resolve, reject });
      }),
  );
  return { lookup: { lookup: spy }, spy, calls };
}

/** Array element at `i`, failing the test if it does not exist. */
function at<T>(list: readonly T[], i: number): T {
  const v = list[i];
  if (v === undefined) throw new Error(`expected an element at index ${i}`);
  return v;
}

const SOFA: ProductPreview = {
  kind: 'sofa',
  name: 'Alder 3-seat sofa',
  host: 'shop.example',
  sourceUrl: SAMPLE_LINKS.sofa,
  price: 1290,
  w: 84,
  d: 36,
  h: 33,
  known: true,
  model: { tier: 'retailer', label: '3D model from retailer', assetUrl: null },
};

const UNKNOWN: ProductPreview = {
  kind: 'box',
  name: 'Untitled product',
  host: 'market.example',
  sourceUrl: SAMPLE_LINKS.unknown,
  price: null,
  w: 36,
  d: 24,
  h: 30,
  known: false,
  model: { tier: 'box', label: 'No model, shown as a sized box', assetUrl: null },
};

function linkInput(): HTMLInputElement {
  return screen.getByRole('textbox', { name: 'Product link' }) as HTMLInputElement;
}

function dimInput(label: string): HTMLInputElement {
  return screen.getByLabelText(label) as HTMLInputElement;
}

/** Simulates the browser reporting `value` for a number input (bypasses jsdom's number sanitising). */
function typeRaw(el: HTMLInputElement, value: string): void {
  fireEvent.change(el, { target: { value } });
}

async function settle(fn: () => void): Promise<void> {
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

/** Renders the section, clicks the Sofa sample and resolves it with `product`. */
async function renderPreview(product: ProductPreview = SOFA) {
  const fake = fakeLookup();
  const view = render(<AddFurnitureSection lookup={fake.lookup} />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
  await settle(() => at(fake.calls, 0).resolve(product));
  return { ...fake, ...view };
}

describe('AddFurnitureSection', () => {
  it('renders a section headed 02 then Add furniture from a link', () => {
    const { container } = render(<AddFurnitureSection lookup={fakeLookup().lookup} />);
    expect(container.querySelector('section')).toHaveClass('sidebar-section');
    const heading = screen.getByRole('heading', { level: 6 });
    expect(heading).toHaveClass('sidebar-heading');
    expect(heading.querySelector('.sidebar-heading-num')).toHaveTextContent('02');
    expect(heading).toHaveTextContent(/^02Add furniture from a link$/);
  });

  it('renders the link input and a blueprint Fetch button', () => {
    render(<AddFurnitureSection lookup={fakeLookup().lookup} />);
    const input = linkInput();
    expect(input).toHaveClass('input');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('placeholder', 'Paste a product link');
    const fetchBtn = screen.getByRole('button', { name: 'Fetch' });
    expect(fetchBtn).toHaveClass('btn', 'btn-primary', 'blueprint');
    expect(fetchBtn.querySelectorAll('.corner')).toHaveLength(4);
    expect(fetchBtn).toBeEnabled();
  });

  it('shows the sample prompt and three secondary sample buttons when idle', () => {
    render(<AddFurnitureSection lookup={fakeLookup().lookup} />);
    expect(screen.getByText('No link handy? Try a sample:')).toBeInTheDocument();
    for (const name of ['Sofa', 'Bookshelf', 'Page without sizes']) {
      expect(screen.getByRole('button', { name })).toHaveClass('btn', 'btn-secondary');
    }
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the invalid-link error and does not call the provider for "nope"', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    const user = userEvent.setup();
    await user.type(linkInput(), 'nope');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(screen.getByRole('alert')).toHaveTextContent(LOOKUP_MESSAGES.invalid_url);
    expect(fake.spy).not.toHaveBeenCalled();
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
  });

  it('removes the error line when the user types again', async () => {
    render(<AddFurnitureSection lookup={fakeLookup().lookup} />);
    const user = userEvent.setup();
    await user.type(linkInput(), 'nope');
    await user.click(screen.getByRole('button', { name: 'Fetch' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.type(linkInput(), 'x');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('starts a lookup from the Sofa sample and shows the loading card', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
    expect(fake.spy).toHaveBeenCalledTimes(1);
    expect(at(fake.calls, 0).url).toBe(SAMPLE_LINKS.sofa);
    expect(at(fake.calls, 0).signal).toBeInstanceOf(AbortSignal);
    expect(useUiStore.getState().lookup).toEqual({ status: 'loading', host: 'shop.example' });
    const kicker = screen.getByText('shop.example');
    expect(kicker).toHaveClass('card-kicker');
    expect(kicker.closest('.card')).toHaveClass('blueprint');
    expect(screen.getByText('Reading the product page for name, size and price…')).toHaveClass('card-body');
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Sofa' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bookshelf' })).toBeNull();
    expect(screen.queryByText('No link handy? Try a sample:')).toBeNull();
  });

  it('runs Fetch when Enter is pressed in the link input', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    await userEvent.setup().type(linkInput(), `${SAMPLE_LINKS.sofa}{Enter}`);
    expect(fake.spy).toHaveBeenCalledTimes(1);
    expect(at(fake.calls, 0).url).toBe(SAMPLE_LINKS.sofa);
    expect(screen.getByText('Reading the product page for name, size and price…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeDisabled();
  });

  it('shows the preview card with host, name, price, model tag, inputs and actions', async () => {
    const { container } = await renderPreview();
    expect(useUiStore.getState().lookup).toEqual({ status: 'preview', product: SOFA });
    expect(screen.getByText('shop.example')).toHaveClass('card-kicker');
    expect(screen.getByText('Alder 3-seat sofa')).toHaveClass('card-title');
    expect(screen.getByText('$1,290')).toHaveClass('card-meta');
    expect(screen.getByText('3D model from retailer')).toHaveClass('tag', 'tag-outline');
    expect(dimInput('Width (in)').value).toBe('84');
    expect(dimInput('Depth (in)').value).toBe('36');
    expect(dimInput('Height (in)').value).toBe('33');
    expect(dimInput('Width (in)')).toHaveAttribute('type', 'number');
    const place = screen.getByRole('button', { name: 'Place in room' });
    expect(place).toHaveClass('btn', 'btn-primary', 'blueprint');
    expect(place.querySelectorAll('.corner')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveClass('btn', 'btn-ghost');
    const photo = screen.getByText('photo');
    expect(photo).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.card.blueprint')).not.toBeNull();
    expect(screen.queryByText(/didn't list dimensions/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled();
  });

  it('shows the missing-dimensions note and No price for an unknown product', async () => {
    await renderPreview(UNKNOWN);
    expect(
      screen.getByText("This page didn't list dimensions. Enter them from the product description."),
    ).toBeInTheDocument();
    expect(screen.getByText('No price')).toHaveClass('card-meta');
  });

  it('writes a valid width edit to the preview product', async () => {
    await renderPreview();
    typeRaw(dimInput('Width (in)'), '90');
    const lookup = useUiStore.getState().lookup;
    expect(lookup.status === 'preview' && lookup.product.w).toBe(90);
    expect(dimInput('Width (in)').value).toBe('90');
  });

  it('keeps an invalid width in the input without changing the product', async () => {
    await renderPreview();
    typeRaw(dimInput('Width (in)'), '0');
    const lookup = useUiStore.getState().lookup;
    expect(lookup.status === 'preview' && lookup.product.w).toBe(84);
    expect(dimInput('Width (in)').value).toBe('0');
  });

  it('keeps a partial entry in the input while storing its parsed value', async () => {
    await renderPreview();
    const el = dimInput('Width (in)');
    // jsdom sanitises "90." on a number input to ""; Chrome reports the typed text.
    Object.defineProperty(el, 'value', { configurable: true, writable: true, value: '90.' });
    fireEvent.change(el);
    const lookup = useUiStore.getState().lookup;
    expect(lookup.status === 'preview' && lookup.product.w).toBe(90);
    expect(el.value).toBe('90.');
  });

  it('relabels and re-seeds the inputs in centimetres when units change during preview', async () => {
    await renderPreview();
    typeRaw(dimInput('Width (in)'), '0');
    act(() => usePlanStore.getState().setUnits('m'));
    expect(dimInput('Width (cm)').value).toBe('213');
    expect(dimInput('Depth (cm)').value).toBe('91');
    expect(dimInput('Height (cm)').value).toBe('84');
  });

  it('re-seeds on a units change even when the draft happens to parse to the stored length', async () => {
    await renderPreview({ ...SOFA, w: 100 });
    // 254.0 in is out of range, so the preview keeps 100 in, which is exactly 254 cm.
    typeRaw(dimInput('Width (in)'), '254.0');
    const lookup = useUiStore.getState().lookup;
    expect(lookup.status === 'preview' && lookup.product.w).toBe(100);
    act(() => usePlanStore.getState().setUnits('m'));
    expect(dimInput('Width (cm)').value).toBe('254');
  });

  it('places the previewed product, selects it and returns to idle with an empty link', async () => {
    const before = usePlanStore.getState().items.length;
    await renderPreview();
    expect(linkInput().value).toBe(SAMPLE_LINKS.sofa);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Place in room' }));
    const items = usePlanStore.getState().items;
    expect(items).toHaveLength(before + 1);
    const added = at(items, items.length - 1);
    expect(added.name).toBe('Alder 3-seat sofa');
    expect(useUiStore.getState().selectedId).toBe(added.id);
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
    expect(linkInput().value).toBe('');
    expect(screen.getByRole('button', { name: 'Sofa' })).toBeInTheDocument();
  });

  it('discards the preview without adding an item and empties the link', async () => {
    const before = usePlanStore.getState().items;
    await renderPreview();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Discard' }));
    expect(usePlanStore.getState().items).toBe(before);
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
    expect(linkInput().value).toBe('');
    expect(screen.queryByText('Alder 3-seat sofa')).toBeNull();
  });

  it('shows the unavailable message (never the raw error) when the provider fails', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
    await settle(() => at(fake.calls, 0).reject(new Error('x')));
    expect(screen.getByRole('alert')).toHaveTextContent(LOOKUP_MESSAGES.unavailable);
    expect(screen.getByRole('alert').textContent).toBe(LOOKUP_MESSAGES.unavailable);
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
    expect(screen.getByRole('button', { name: 'Sofa' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch' })).toBeEnabled();
  });

  it('shows a LookupError from the provider by its code message', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
    await settle(() => at(fake.calls, 0).reject(new LookupError('invalid_url')));
    expect(screen.getByRole('alert')).toHaveTextContent(LOOKUP_MESSAGES.invalid_url);
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
  });

  it('aborts a superseded lookup and ignores its late response', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    const user = userEvent.setup();
    await user.type(linkInput(), 'https://a.example/sofa{Enter}');
    await user.clear(linkInput());
    await user.type(linkInput(), 'https://b.example/shelf{Enter}');
    expect(fake.calls).toHaveLength(2);
    const a = at(fake.calls, 0);
    const b = at(fake.calls, 1);
    expect(a.signal?.aborted).toBe(true);
    expect(b.signal?.aborted).toBe(false);
    expect(useUiStore.getState().lookup).toEqual({ status: 'loading', host: 'b.example' });

    await settle(() => a.resolve({ ...SOFA, host: 'a.example', name: 'Stale sofa' }));
    expect(useUiStore.getState().lookup).toEqual({ status: 'loading', host: 'b.example' });
    expect(screen.queryByText('Stale sofa')).toBeNull();

    const shelf: ProductPreview = { ...SOFA, host: 'b.example', name: 'Fresh shelf' };
    await settle(() => b.resolve(shelf));
    expect(useUiStore.getState().lookup).toEqual({ status: 'preview', product: shelf });
    expect(screen.getByText('Fresh shelf')).toBeInTheDocument();
  });

  it('ignores a late rejection from a superseded lookup', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    const user = userEvent.setup();
    await user.type(linkInput(), 'https://a.example/sofa{Enter}');
    await user.clear(linkInput());
    await user.type(linkInput(), 'https://b.example/shelf{Enter}');
    await settle(() => at(fake.calls, 0).reject(new Error('late')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useUiStore.getState().lookup).toEqual({ status: 'loading', host: 'b.example' });
  });

  it('shows no error line when the provider rejects with an AbortError', async () => {
    const fake = fakeLookup();
    render(<AddFurnitureSection lookup={fake.lookup} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
    await settle(() => at(fake.calls, 0).reject(new DOMException('aborted', 'AbortError')));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('aborts the lookup on unmount and makes no store update afterwards', async () => {
    const fake = fakeLookup();
    const { unmount } = render(<AddFurnitureSection lookup={fake.lookup} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
    const setLookup = vi.spyOn(useUiStore.getState(), 'setLookup');
    unmount();
    expect(at(fake.calls, 0).signal?.aborted).toBe(true);
    const before = useUiStore.getState().lookup;
    await settle(() => at(fake.calls, 0).resolve(SOFA));
    expect(useUiStore.getState().lookup).toBe(before);
    expect(setLookup).not.toHaveBeenCalled();
    setLookup.mockRestore();
  });

  it('renders a hostile product name as literal text', async () => {
    const name = '<img src=x onerror=alert(1)>';
    const { container } = await renderPreview({ ...SOFA, name });
    expect(screen.getByText(name)).toHaveClass('card-title');
    expect(container.querySelector('img')).toBeNull();
  });
});
