import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultColours, defaultStyle } from '../../domain/furniture/recipe';
import type { ProductPreview } from '../../domain/types';
import { isTextField } from '../../hooks/textField';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { LOOKUP_MESSAGES, type LookupErrorCode } from '../../services/productLookup';
import { addPreviewToRoom, clearPendingLink, dismissLookup, lookupProduct } from '../../state/actions';
import { clearHistory } from '../../state/historyStore';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { furnishedDocument } from '../../test/fixtures';
import { ProductLinkBox } from './ProductLinkBox';

// lookupProduct is replaced so no test reaches the network; the other actions are spies over the real ones.
vi.mock('../../state/actions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../state/actions')>();
  return {
    ...actual,
    lookupProduct: vi.fn(async () => {}),
    clearPendingLink: vi.fn(actual.clearPendingLink),
    addPreviewToRoom: vi.fn(actual.addPreviewToRoom),
    dismissLookup: vi.fn(actual.dismissLookup),
  };
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  clearHistory();
  vi.clearAllMocks();
});

const LINK = 'https://www.ikea.com/us/en/p/alder-sofa-12345678/';
const ERROR_CODES: LookupErrorCode[] = ['invalid_url', 'unsupported_shop', 'blocked', 'not_a_product', 'unavailable', 'rate_limited'];

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
    kindFound: true,
    sizesFound: true,
    sizeNote: null,
    imageUrl: null,
    style: defaultStyle('sofa'),
    colours: defaultColours('sofa'),
    ...overrides,
  };
}

function linkInput(): HTMLInputElement {
  return screen.getByLabelText('Paste a product link') as HTMLInputElement;
}

function lookUpButton(): HTMLButtonElement {
  return screen.getByRole('button') as HTMLButtonElement;
}

describe('ProductLinkBox', () => {
  it('shows the label, a url input limited to 2048 characters with no autocomplete, the Look up button and the shops note', () => {
    render(<ProductLinkBox />);
    const input = linkInput();
    expect(input).toHaveAttribute('type', 'url');
    expect(input).toHaveAttribute('maxLength', '2048');
    expect(input).toHaveAttribute('autoComplete', 'off');
    expect(input).toBeEnabled();
    expect(input.value).toBe('');
    expect(screen.getByRole('button', { name: 'Look up' })).toHaveAttribute('type', 'submit');
    expect(screen.getByText('Works with IKEA, Amazon and Wayfair.')).toBeInTheDocument();
  });

  it('looks the link up once when Enter is pressed in the input', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK + '{Enter}');
    expect(lookupProduct).toHaveBeenCalledTimes(1);
    expect(lookupProduct).toHaveBeenCalledWith(LINK);
  });

  it('looks the link up once when Look up is clicked', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    expect(lookupProduct).toHaveBeenCalledTimes(1);
    expect(lookupProduct).toHaveBeenCalledWith(LINK);
  });

  it('does nothing for an empty or blank link', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.click(screen.getByRole('button', { name: 'Look up' }));
    await user.type(linkInput(), '   {Enter}');
    expect(lookupProduct).not.toHaveBeenCalled();
  });

  it('while loading, disables the button reading Reading the page…, keeps the input editable and announces it politely', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK);
    act(() => useUiStore.getState().setLookup({ status: 'loading' }));
    expect(lookUpButton()).toBeDisabled();
    expect(lookUpButton()).toHaveTextContent(/^Reading the page…$/);
    expect(linkInput()).toBeEnabled();
    await user.type(linkInput(), 'x');
    expect(linkInput().value).toBe(LINK + 'x');
    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live).toHaveTextContent('Reading the page…');
  });

  it.each(ERROR_CODES)('shows the %s message in an alert and keeps the typed link', async (code) => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK + '{Enter}');
    act(() => useUiStore.getState().setLookup({ status: 'error', code }));
    expect(screen.getByRole('alert')).toHaveTextContent(LOOKUP_MESSAGES[code]);
    expect(linkInput().value).toBe(LINK);
  });

  it('shows no alert while idle, loading or previewing', () => {
    render(<ProductLinkBox />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => useUiStore.getState().setLookup({ status: 'loading' }));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => useUiStore.getState().setLookup({ status: 'preview', preview: preview() }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the next piece keeps the link while a pending link is set, with no extra button', () => {
    render(<ProductLinkBox />);
    expect(screen.queryByText('The next piece you add will keep this link.')).toBeNull();
    act(() => useUiStore.getState().setPendingLink({ url: LINK, host: 'ikea.com' }));
    expect(screen.getByText('The next piece you add will keep this link.')).toHaveClass('product-link-kept');
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('emptying the input clears the pending link', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK);
    act(() => useUiStore.getState().setPendingLink({ url: LINK, host: 'ikea.com' }));
    await user.type(linkInput(), '{Backspace}');
    expect(clearPendingLink).not.toHaveBeenCalled();
    await user.clear(linkInput());
    expect(clearPendingLink).toHaveBeenCalledTimes(1);
    expect(useUiStore.getState().pendingLink).toBeNull();
    expect(screen.queryByText('The next piece you add will keep this link.')).toBeNull();
  });

  it('emptying the input with no pending link does not call clearPendingLink', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK);
    await user.clear(linkInput());
    expect(clearPendingLink).not.toHaveBeenCalled();
  });

  it('clears the input when the preview is added to the room', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK);
    act(() => useUiStore.getState().setLookup({ status: 'preview', preview: preview() }));
    act(() => {
      addPreviewToRoom();
    });
    expect(usePlanStore.getState().items).toHaveLength(1);
    expect(linkInput().value).toBe('');
  });

  it('keeps the input when the preview is cancelled, or when a piece is added by type meanwhile', async () => {
    const user = userEvent.setup();
    render(<ProductLinkBox />);
    await user.type(linkInput(), LINK);
    act(() => useUiStore.getState().setLookup({ status: 'preview', preview: preview() }));
    act(() => {
      usePlanStore.getState().addFurniture('desk');
    });
    expect(linkInput().value).toBe(LINK);
    act(() => dismissLookup());
    expect(linkInput().value).toBe(LINK);
  });

  it('in room-edit mode disables the input and Look up', () => {
    useUiStore.getState().setMode('room');
    render(<ProductLinkBox />);
    expect(linkInput()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled();
  });

  describe('keyboard shortcuts', () => {
    const BED = 'seed-bed';
    const bed = () => usePlanStore.getState().items.find((i) => i.id === BED);

    /** Dispatches a cancelable keydown on `target` (bubbling to window). */
    function press(target: EventTarget, key: string, init: KeyboardEventInit = {}): void {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
    }

    beforeEach(() => {
      usePlanStore.getState().reset(furnishedDocument());
      clearHistory();
      renderHook(() => useKeyboardShortcuts());
    });

    it('the link input is a text field to the shortcut guard', () => {
      render(<ProductLinkBox />);
      expect(isTextField(linkInput())).toBe(true);
    });

    it('Delete, R and Ctrl/Cmd+Z typed in the link input do not change the plan', () => {
      render(<ProductLinkBox />);
      act(() => useUiStore.getState().select(BED));
      act(() => usePlanStore.getState().updateItem(BED, { name: 'Renamed bed' }));
      const before = usePlanStore.getState().items;
      const input = linkInput();
      input.focus();
      act(() => {
        press(input, 'Delete');
        press(input, 'Backspace');
        press(input, 'r');
        press(input, 'R', { shiftKey: true });
        press(input, 'z', { ctrlKey: true });
        press(input, 'z', { metaKey: true });
      });
      expect(usePlanStore.getState().items).toBe(before);
      expect(bed()?.name).toBe('Renamed bed');
      // The same Ctrl+Z outside a text field does undo, so the presses above reached the shortcuts.
      act(() => press(document.body, 'z', { ctrlKey: true }));
      expect(bed()?.name).not.toBe('Renamed bed');
    });
  });
});
