import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultColours, defaultStyle, KIND_LABELS, KIND_ORDER } from '../../domain/furniture/recipe';
import type { ProductPreview } from '../../domain/types';
import { addPreviewToRoom, dismissLookup, updatePreview } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { disposePreviewRenderer, renderPieceSnapshot } from '../../three/previewSnapshot';
import { ProductPreviewCard } from './ProductPreviewCard';

// jsdom has no WebGL: the snapshot module is replaced so tests are quiet and can count its calls.
vi.mock('../../three/previewSnapshot', () => ({
  renderPieceSnapshot: vi.fn(),
  disposePreviewRenderer: vi.fn(),
}));

// The card's actions are spies over the real ones.
vi.mock('../../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/actions')>();
  return {
    ...actual,
    updatePreview: vi.fn(actual.updatePreview),
    addPreviewToRoom: vi.fn(actual.addPreviewToRoom),
    dismissLookup: vi.fn(actual.dismissLookup),
  };
});

const SNAPSHOT = 'data:image/png;base64,AAAA';
const PHOTO = 'https://www.ikea.com/us/en/images/alder.jpg';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  vi.clearAllMocks();
  vi.mocked(renderPieceSnapshot).mockImplementation(() => SNAPSHOT);
});

function preview(overrides: Partial<ProductPreview> = {}): ProductPreview {
  return {
    kind: 'sofa',
    name: 'Alder 3-seat sofa',
    host: 'ikea.com',
    sourceUrl: 'https://www.ikea.com/us/en/p/alder-sofa-12345678/',
    price: 1299,
    w: 80,
    d: 35,
    h: 30,
    kindFound: true,
    sizesFound: true,
    sizeNote: null,
    imageUrl: PHOTO,
    style: defaultStyle('sofa'),
    colours: defaultColours('sofa'),
    ...overrides,
  };
}

/** Renders the card for `p` and puts the same preview in the store, as the section does. */
function renderCard(p: ProductPreview) {
  useUiStore.getState().setLookup({ status: 'preview', preview: p });
  return render(<ProductPreviewCard preview={p} />);
}

function photo(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector<HTMLImageElement>('img.product-card-photo');
}

/** Simulates the browser reporting `value` for a number input (bypasses jsdom's number sanitising). */
function typeRaw(el: HTMLElement, value: string): void {
  Object.defineProperty(el, 'value', { configurable: true, writable: true, value });
  fireEvent.change(el);
}

describe('ProductPreviewCard', () => {
  it('shows the name, the shop host and a whole-dollar price as $1,299', () => {
    const { container } = renderCard(preview());
    expect(container.querySelector('.product-card')).not.toBeNull();
    expect(screen.getByText('Alder 3-seat sofa')).toBeInTheDocument();
    expect(screen.getByText('ikea.com')).toBeInTheDocument();
    expect(screen.getByText('$1,299')).toBeInTheDocument();
  });

  it('shows cents when the price has them, as $319.99', () => {
    renderCard(preview({ price: 319.99 }));
    expect(screen.getByText('$319.99')).toBeInTheDocument();
  });

  it('omits the price when it is null', () => {
    const { container } = renderCard(preview({ price: null }));
    expect(container).not.toHaveTextContent('$');
  });

  it('shows the product photo with an empty alt, no referrer, lazy loading and async decoding', () => {
    const { container } = renderCard(preview());
    const img = photo(container);
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', PHOTO);
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('referrerPolicy', 'no-referrer');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img).toHaveAttribute('decoding', 'async');
  });

  it('loads the product photo as a plain image, with no CORS mode that a cached copy could fail', () => {
    // A CORS request answered from a copy the browser cached without CORS is blocked, and the
    // photo would not show; the colour sampler fetches its own uncached copy instead.
    const img = photo(renderCard(preview()).container);
    expect(img).not.toHaveAttribute('crossorigin');
    expect(img).toHaveAttribute('referrerPolicy', 'no-referrer');
  });

  it('shows no photo when there is no image address', () => {
    const { container } = renderCard(preview({ imageUrl: null }));
    expect(photo(container)).toBeNull();
  });

  it('removes the photo when it fails to load and keeps the rest; a new image address shows again', () => {
    vi.useFakeTimers();
    const p = preview();
    const view = renderCard(p);
    act(() => vi.advanceTimersByTime(150));
    const img = photo(view.container);
    if (img === null) throw new Error('no photo');
    fireEvent.error(img);
    expect(photo(view.container)).toBeNull();
    expect(screen.getByText('Alder 3-seat sofa')).toBeInTheDocument();
    expect(screen.getByAltText('Preview of the piece')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add to room' })).toBeInTheDocument();
    const next = 'https://www.ikea.com/us/en/images/alder-2.jpg';
    view.rerender(<ProductPreviewCard preview={{ ...p, imageUrl: next }} />);
    expect(photo(view.container)).toHaveAttribute('src', next);
  });

  it('shows the snapshot as an image named Preview of the piece once it is drawn', () => {
    vi.useFakeTimers();
    renderCard(preview());
    expect(screen.queryByAltText('Preview of the piece')).toBeNull();
    act(() => vi.advanceTimersByTime(150));
    const img = screen.getByAltText('Preview of the piece');
    expect(img).toHaveAttribute('src', SNAPSHOT);
    expect(img).toHaveClass('product-card-snapshot');
  });

  it('shows no snapshot image when none can be drawn', () => {
    vi.useFakeTimers();
    vi.mocked(renderPieceSnapshot).mockImplementation(() => null);
    renderCard(preview());
    act(() => vi.advanceTimersByTime(150));
    expect(screen.queryByAltText('Preview of the piece')).toBeNull();
  });

  it('has a Type picker with the 11 kinds; a change calls updatePreview with the kind', async () => {
    renderCard(preview());
    const select = screen.getByRole('combobox', { name: 'Type' }) as HTMLSelectElement;
    expect(select.value).toBe('sofa');
    const options = within(select).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual([...KIND_ORDER]);
    expect(options.map((o) => o.textContent)).toEqual(KIND_ORDER.map((k) => KIND_LABELS[k]));
    await userEvent.setup().selectOptions(select, 'desk');
    expect(updatePreview).toHaveBeenCalledTimes(1);
    expect(updatePreview).toHaveBeenCalledWith({ kind: 'desk' });
  });

  it('highlights the Type picker and describes it with the not-recognised line when the kind was not found', () => {
    renderCard(preview({ kindFound: false }));
    const select = screen.getByRole('combobox', { name: 'Type' });
    expect(select).toHaveClass('is-attention');
    const line = screen.getByText('Type not recognised: pick one.');
    expect(line.id).not.toBe('');
    expect(select).toHaveAttribute('aria-describedby', line.id);
    expect(select).toHaveAccessibleDescription('Type not recognised: pick one.');
  });

  it('neither highlights nor describes the Type picker when the kind was found', () => {
    renderCard(preview({ kindFound: true }));
    const select = screen.getByRole('combobox', { name: 'Type' });
    expect(select).not.toHaveClass('is-attention');
    expect(select).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Type not recognised: pick one.')).toBeNull();
  });

  it('has Width, Depth and Height inputs showing the sizes; a valid edit calls updatePreview with that size', () => {
    const { container } = renderCard(preview());
    const width = screen.getByRole('spinbutton', { name: 'Width (in)' });
    const depth = screen.getByRole('spinbutton', { name: 'Depth (in)' });
    const height = screen.getByRole('spinbutton', { name: 'Height (in)' });
    expect(container.querySelector('.product-card-dims')).toContainElement(width);
    expect([width, depth, height].map((el) => (el as HTMLInputElement).value)).toEqual(['80', '35', '30']);
    typeRaw(width, '90');
    expect(updatePreview).toHaveBeenLastCalledWith({ w: 90 });
    typeRaw(depth, '40');
    expect(updatePreview).toHaveBeenLastCalledWith({ d: 40 });
    typeRaw(height, '32');
    expect(updatePreview).toHaveBeenLastCalledWith({ h: 32 });
    typeRaw(width, '0');
    typeRaw(width, '241');
    expect(updatePreview).toHaveBeenCalledTimes(3);
  });

  it('says the sizes were not found only when they were not', () => {
    const view = renderCard(preview({ sizesFound: false }));
    expect(screen.getByText('Sizes not found: check these.')).toBeInTheDocument();
    view.rerender(<ProductPreviewCard preview={preview({ sizesFound: true })} />);
    expect(screen.queryByText('Sizes not found: check these.')).toBeNull();
  });

  it('describes the Size group of the three inputs with the not-found line only when the sizes were not found', () => {
    const view = renderCard(preview({ sizesFound: false }));
    const group = screen.getByRole('group', { name: 'Size' });
    expect(within(group).getAllByRole('spinbutton')).toHaveLength(3);
    const line = screen.getByText('Sizes not found: check these.');
    expect(line.id).not.toBe('');
    expect(group).toHaveAttribute('aria-describedby', line.id);
    expect(group).toHaveAccessibleDescription('Sizes not found: check these.');
    view.rerender(<ProductPreviewCard preview={preview({ sizesFound: true })} />);
    expect(screen.getByRole('group', { name: 'Size' })).not.toHaveAttribute('aria-describedby');
  });

  it('marks Add to room as the main action with the primary button style', () => {
    renderCard(preview());
    expect(screen.getByRole('button', { name: 'Add to room' })).toHaveClass('btn', 'btn-primary');
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveClass('btn', 'btn-secondary');
  });

  it('shows the size note as text when there is one', () => {
    renderCard(preview({ sizeNote: 'Sizes are for the 3-seat model.' }));
    expect(screen.getByText('Sizes are for the 3-seat model.')).toBeInTheDocument();
  });

  it('Add to room adds the preview to the room', async () => {
    renderCard(preview());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add to room' }));
    expect(addPreviewToRoom).toHaveBeenCalledTimes(1);
    expect(usePlanStore.getState().items).toHaveLength(1);
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
  });

  it('Cancel dismisses the lookup', async () => {
    renderCard(preview());
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
    expect(dismissLookup).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
  });

  it('in room-edit mode disables Add to room, leaving Cancel enabled', () => {
    useUiStore.getState().setMode('room');
    renderCard(preview());
    expect(screen.getByRole('button', { name: 'Add to room' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });

  it('shows a hostile name as literal text and makes no image from it', () => {
    vi.mocked(renderPieceSnapshot).mockImplementation(() => null);
    vi.useFakeTimers();
    const name = '<img src=x onerror=alert(1)>';
    const { container } = renderCard(preview({ name, imageUrl: null }));
    act(() => vi.advanceTimersByTime(150));
    expect(screen.getByText(name)).toBeInTheDocument();
    expect(container.querySelectorAll('img')).toHaveLength(0);
  });

  describe('snapshot refresh', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('draws the snapshot 150 ms after mounting, from the preview’s kind, sizes, style and colours', () => {
      const p = preview();
      renderCard(p);
      act(() => vi.advanceTimersByTime(149));
      expect(renderPieceSnapshot).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(renderPieceSnapshot).toHaveBeenCalledTimes(1);
      expect(renderPieceSnapshot).toHaveBeenCalledWith({
        id: 'preview',
        kind: p.kind,
        w: p.w,
        d: p.d,
        h: p.h,
        style: p.style,
        colours: p.colours,
      });
    });

    it('redraws at most once per 150 ms while kind, sizes, style or colours keep changing, with the latest values', () => {
      const p = preview();
      const view = renderCard(p);
      act(() => vi.advanceTimersByTime(150));
      vi.mocked(renderPieceSnapshot).mockClear();
      const steps: ProductPreview[] = [
        { ...p, w: 81 },
        { ...p, w: 81, d: 36 },
        { ...p, w: 81, d: 36, h: 31 },
        { ...p, w: 81, d: 36, h: 31, kind: 'desk', style: defaultStyle('desk') },
        { ...p, w: 81, d: 36, h: 31, kind: 'desk', style: defaultStyle('desk'), colours: { main: '#112233', accent: '#445566' } },
      ];
      for (const step of steps) {
        view.rerender(<ProductPreviewCard preview={step} />);
        act(() => vi.advanceTimersByTime(100));
      }
      expect(renderPieceSnapshot).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(50));
      expect(renderPieceSnapshot).toHaveBeenCalledTimes(1);
      expect(renderPieceSnapshot).toHaveBeenCalledWith({
        id: 'preview',
        kind: 'desk',
        w: 81,
        d: 36,
        h: 31,
        style: defaultStyle('desk'),
        colours: { main: '#112233', accent: '#445566' },
      });
    });

    it('does not redraw for a change that does not touch the piece, such as the name', () => {
      const p = preview();
      const view = renderCard(p);
      act(() => vi.advanceTimersByTime(150));
      view.rerender(<ProductPreviewCard preview={{ ...p, name: 'Another name', price: 10 }} />);
      act(() => vi.advanceTimersByTime(500));
      expect(renderPieceSnapshot).toHaveBeenCalledTimes(1);
    });

    it('on unmount drops a pending redraw and releases the preview renderer', () => {
      const view = renderCard(preview());
      act(() => vi.advanceTimersByTime(100));
      view.unmount();
      expect(disposePreviewRenderer).toHaveBeenCalledTimes(1);
      act(() => vi.advanceTimersByTime(500));
      expect(renderPieceSnapshot).not.toHaveBeenCalled();
    });
  });
});
