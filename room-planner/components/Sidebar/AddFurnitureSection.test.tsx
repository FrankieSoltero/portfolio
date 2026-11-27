import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultColours, defaultStyle, KIND_LABELS, KIND_ORDER, TYPICAL_SIZE } from '../../domain/furniture/recipe';
import type { ProductPreview } from '../../domain/types';
import { LOOKUP_MESSAGES } from '../../services/productLookup';
import { usePlanStore } from '../../state/planStore';
import { addPreviewToRoom } from '../../state/actions';
import { useUiStore } from '../../state/uiStore';
import { AddFurnitureSection } from './AddFurnitureSection';

// jsdom has no WebGL: the preview card's snapshot module is replaced so the tests stay quiet.
vi.mock('../../three/previewSnapshot', () => ({
  renderPieceSnapshot: vi.fn(() => null),
  disposePreviewRenderer: vi.fn(),
}));

// No test here reaches the network.
vi.mock('../../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/actions')>();
  return { ...actual, lookupProduct: vi.fn(async () => {}) };
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

const PREVIEW: ProductPreview = {
  kind: 'sofa',
  name: 'Alder 3-seat sofa',
  host: 'ikea.com',
  sourceUrl: 'https://www.ikea.com/us/en/p/alder-sofa-12345678/',
  price: 499,
  w: 80,
  d: 35,
  h: 30,
  kindFound: true,
  sizesFound: true,
  sizeNote: null,
  imageUrl: null,
  style: defaultStyle('sofa'),
  colours: defaultColours('sofa'),
};

function typeButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.add-furniture-kinds > button'));
}

describe('AddFurnitureSection', () => {
  it('renders a section headed 02 then Add furniture, with the line about changing a piece after it is placed', () => {
    const { container } = render(<AddFurnitureSection />);
    expect(container.querySelector('section')).toHaveClass('sidebar-section');
    const heading = screen.getByRole('heading', { level: 6 });
    expect(heading.querySelector('.sidebar-heading-num')).toHaveTextContent('02');
    expect(heading).toHaveTextContent(/^02Add furniture$/);
    expect(screen.getByText('Pick a type. You can change its size, style and colours after it is placed.')).toBeInTheDocument();
  });

  it('shows 11 secondary buttons, one per kind in KIND_ORDER, named by KIND_LABELS', () => {
    const { container } = render(<AddFurnitureSection />);
    const buttons = typeButtons(container);
    expect(buttons).toHaveLength(11);
    expect(buttons.map((b) => b.textContent)).toEqual(KIND_ORDER.map((k) => KIND_LABELS[k]));
    for (const b of buttons) {
      expect(b).toHaveAttribute('type', 'button');
      expect(b).toHaveClass('btn', 'btn-secondary');
      expect(b).toBeEnabled();
    }
    // The only text field is the product link input.
    expect(screen.getAllByRole('textbox')).toEqual([screen.getByLabelText('Paste a product link')]);
  });

  it('clicking Dresser adds a dresser at its typical size and selects it', async () => {
    render(<AddFurnitureSection />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dresser' }));
    const { items } = usePlanStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'dresser', name: 'Dresser', ...TYPICAL_SIZE.dresser });
    expect(useUiStore.getState().selectedId).toBe(items[0]?.id);
  });

  it('disables the 11 type buttons in room-edit mode', async () => {
    useUiStore.getState().setMode('room');
    const { container } = render(<AddFurnitureSection />);
    const buttons = typeButtons(container);
    expect(buttons).toHaveLength(11);
    for (const b of buttons) expect(b).toBeDisabled();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sofa' }));
    expect(usePlanStore.getState().items).toEqual([]);
  });

  it('lays out the heading, the link box, the preview card, then the note and the type grid', () => {
    useUiStore.getState().setLookup({ status: 'preview', preview: PREVIEW });
    const { container } = render(<AddFurnitureSection />);
    const order = [
      screen.getByRole('heading', { level: 6 }),
      container.querySelector('.product-link'),
      container.querySelector('.product-card'),
      screen.getByText('Pick a type. You can change its size, style and colours after it is placed.'),
      container.querySelector('.add-furniture-kinds'),
    ];
    for (const el of order) expect(el).not.toBeNull();
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]?.compareDocumentPosition(order[i] as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });

  it('shows the preview card only while a preview is shown, and closes it after Add to room', async () => {
    const { container } = render(<AddFurnitureSection />);
    expect(container.querySelector('.product-card')).toBeNull();
    act(() => useUiStore.getState().setLookup({ status: 'loading' }));
    expect(container.querySelector('.product-card')).toBeNull();
    act(() => useUiStore.getState().setLookup({ status: 'preview', preview: PREVIEW }));
    expect(screen.getByText('Alder 3-seat sofa')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Add to room' }));
    expect(container.querySelector('.product-card')).toBeNull();
    expect(usePlanStore.getState().items).toHaveLength(1);
  });

  it('puts the error line between the link box input and the note, and keeps the type grid enabled', () => {
    useUiStore.getState().setLookup({ status: 'error', code: 'blocked' });
    const { container } = render(<AddFurnitureSection />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(LOOKUP_MESSAGES.blocked);
    expect(container.querySelector('.product-link')).toContainElement(alert);
    const note = screen.getByText('Pick a type. You can change its size, style and colours after it is placed.');
    expect(alert.compareDocumentPosition(note)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    for (const b of typeButtons(container)) expect(b).toBeEnabled();
  });

  it('in room-edit mode disables the link input, Look up and Add to room like the type grid', () => {
    useUiStore.getState().setMode('room');
    useUiStore.getState().setLookup({ status: 'preview', preview: PREVIEW });
    render(<AddFurnitureSection />);
    expect(screen.getByLabelText('Paste a product link')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add to room' })).toBeDisabled();
  });

  describe('focus', () => {
    function linkInput(): HTMLElement {
      return screen.getByLabelText('Paste a product link');
    }

    it('moves focus to the link input after Add to room closes the card', async () => {
      useUiStore.getState().setLookup({ status: 'preview', preview: PREVIEW });
      render(<AddFurnitureSection />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Add to room' }));
      expect(document.querySelector('.product-card')).toBeNull();
      expect(document.activeElement).toBe(linkInput());
    });

    it('moves focus to the link input after Cancel closes the card', async () => {
      useUiStore.getState().setLookup({ status: 'preview', preview: PREVIEW });
      render(<AddFurnitureSection />);
      await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }));
      expect(document.querySelector('.product-card')).toBeNull();
      expect(document.activeElement).toBe(linkInput());
    });

    it('moves focus to the link input when clicking Look up puts the box into loading', async () => {
      const user = userEvent.setup();
      render(<AddFurnitureSection />);
      await user.type(linkInput(), 'https://www.ikea.com/us/en/p/alder-sofa-12345678/');
      await user.click(screen.getByRole('button', { name: 'Look up' }));
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Look up' }));
      act(() => useUiStore.getState().setLookup({ status: 'loading' }));
      expect(screen.getByRole('button', { name: 'Reading the page…' })).toBeDisabled();
      expect(document.activeElement).toBe(linkInput());
    });

    it('leaves focus alone when it is on an unrelated element', () => {
      useUiStore.getState().setLookup({ status: 'preview', preview: PREVIEW });
      render(
        <>
          <input aria-label="Elsewhere" />
          <AddFurnitureSection />
        </>,
      );
      const elsewhere = screen.getByLabelText('Elsewhere');
      elsewhere.focus();
      act(() => {
        addPreviewToRoom();
      });
      expect(document.querySelector('.product-card')).toBeNull();
      expect(document.activeElement).toBe(elsewhere);
      act(() => useUiStore.getState().setLookup({ status: 'loading' }));
      expect(document.activeElement).toBe(elsewhere);
    });
  });
});
