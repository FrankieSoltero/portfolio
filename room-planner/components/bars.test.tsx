import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProductPreview } from '../domain/types';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { SelectionBar } from './SelectionBar';
import { TopBar } from './TopBar';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

const DESK_ID = 'seed-desk';
const BED_ID = 'seed-bed';

const HINT_2D =
  'Drag a piece on the plan to move it, or nudge it with the arrow keys. Select one to see its clearance to each wall. R turns it 90°, Shift+R turns it 15°, Delete removes. Drag the 3D view to orbit.';
const HINT_3D = 'Drag to orbit, scroll to zoom. Pick a piece from the list to highlight it.';
const HINT_ROOM =
  'Drag a corner to reshape the room. Click a wall to add a corner. Select a corner and press Delete to remove it.';

function preview(overrides: Partial<ProductPreview>): ProductPreview {
  return {
    kind: 'box',
    name: 'Plain box',
    host: 'shop.example',
    sourceUrl: 'https://shop.example/p/box',
    price: null,
    w: 20,
    d: 20,
    h: 20,
    known: true,
    model: { tier: 'box', label: 'Box', assetUrl: null },
    ...overrides,
  };
}

/** A 36 in ceiling makes the 38 in bed the only conflict (the 30 in desk still fits). */
function oneConflict(): void {
  act(() => usePlanStore.getState().setRoomHeight(36));
}

/** One conflict, plus a too-tall shelf and a centred sofa that overlaps the bed. */
function threeConflicts(): void {
  act(() => {
    usePlanStore.getState().setRoomHeight(36);
    usePlanStore.getState().addItem(preview({ kind: 'shelf', name: 'Tall shelf', w: 36, d: 13, h: 78 }));
    usePlanStore.getState().addItem(preview({ kind: 'sofa', name: 'Sofa', w: 84, d: 36, h: 33 }));
  });
}

function desk() {
  const item = usePlanStore.getState().items.find((i) => i.id === DESK_ID);
  if (!item) throw new Error('desk not in the plan');
  return item;
}

describe('TopBar', () => {
  it('renders the layout control with inset checked and sets the layout on choice', async () => {
    render(<TopBar />);
    const group = screen.getByRole('radiogroup', { name: 'Layout' });
    expect(group).toHaveClass('seg');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual(['3D + plan inset', 'Side by side', 'Tabs']);
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([true, false, false]);

    await userEvent.setup().click(screen.getByRole('radio', { name: 'Side by side' }));
    expect(useUiStore.getState().layout).toBe('split');
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Tabs' }));
    expect(useUiStore.getState().layout).toBe('tabs');
  });

  it('shows the 2D plan | 3D check control only in tabs layout and sets the tab on choice', async () => {
    render(<TopBar />);
    expect(screen.queryByRole('radio', { name: '2D plan' })).toBeNull();
    expect(screen.queryByRole('radio', { name: '3D check' })).toBeNull();

    act(() => useUiStore.getState().setLayout('tabs'));
    expect(screen.getByRole('radio', { name: '2D plan' })).toBeChecked();
    await userEvent.setup().click(screen.getByRole('radio', { name: '3D check' }));
    expect(useUiStore.getState().tab).toBe('3d');

    act(() => useUiStore.getState().setLayout('split'));
    expect(screen.queryByRole('radio', { name: '3D check' })).toBeNull();
  });

  it('shows the accent "Everything fits" tag when nothing conflicts', () => {
    render(<TopBar />);
    const tag = screen.getByText('Everything fits');
    expect(tag).toHaveClass('tag', 'tag-accent');
    expect(screen.queryByText(/conflict/)).toBeNull();
  });

  it('shows "1 conflict" in a tag-conflict tag', () => {
    oneConflict();
    render(<TopBar />);
    const tag = screen.getByText('1 conflict');
    expect(tag).toHaveClass('tag', 'tag-conflict');
    expect(tag).not.toHaveClass('tag-accent');
    expect(screen.queryByText('Everything fits')).toBeNull();
  });

  it('shows "3 conflicts" in a tag-conflict tag', () => {
    threeConflicts();
    render(<TopBar />);
    expect(screen.getByText('3 conflicts')).toHaveClass('tag', 'tag-conflict');
  });
});

describe('SelectionBar', () => {
  it('shows the selected desk name, dimensions and the Rotate and Remove buttons', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    const { container } = render(<SelectionBar />);
    expect(screen.getByText('Tack writing desk')).toBeInTheDocument();
    expect(screen.getByText('55 × 26 × 30 in')).toBeInTheDocument();
    const rotate = screen.getByRole('button', { name: 'Rotate 90°' });
    const remove = screen.getByRole('button', { name: 'Remove' });
    expect(rotate).toHaveClass('btn', 'btn-secondary');
    expect(remove).toHaveClass('btn', 'btn-ghost');
    for (const b of [rotate, remove]) {
      const svg = b.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('width', '16');
      expect(svg).toHaveAttribute('stroke-width', '1.5');
    }
    expect(container.querySelector('.selection-note')).toBeNull();
    expect(screen.queryByText(HINT_2D)).toBeNull();
  });

  it('shows the selected item conflict reason in .selection-note', () => {
    oneConflict();
    act(() => useUiStore.getState().select(BED_ID));
    render(<SelectionBar />);
    expect(screen.getByText('Taller than the ceiling')).toHaveClass('selection-note');
  });

  it('shows the 2D hint when nothing is selected and the plan is visible', () => {
    const { rerender } = render(<SelectionBar />);
    expect(screen.getByText(HINT_2D)).toBeInTheDocument();
    act(() => useUiStore.getState().setLayout('split'));
    rerender(<SelectionBar />);
    expect(screen.getByText(HINT_2D)).toBeInTheDocument();
    act(() => useUiStore.getState().setLayout('tabs'));
    expect(screen.getByText(HINT_2D)).toBeInTheDocument();
    expect(screen.queryByText(HINT_3D)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the 3D hint when nothing is selected in tabs layout on the 3d tab', () => {
    act(() => {
      useUiStore.getState().setLayout('tabs');
      useUiStore.getState().setTab('3d');
    });
    render(<SelectionBar />);
    expect(screen.getByText(HINT_3D)).toBeInTheDocument();
    expect(screen.queryByText(HINT_2D)).toBeNull();
  });

  it('rotates the selected desk a quarter turn on Rotate 90°', async () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    expect(desk().angle).toBe(90);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rotate 90°' }));
    expect(desk().angle).toBe(180);
  });

  it('removes the selected desk and clears the selection on Remove', async () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Remove' }));
    expect(usePlanStore.getState().items.some((i) => i.id === DESK_ID)).toBe(false);
    expect(useUiStore.getState().selectedId).toBeNull();
    expect(screen.getByText(HINT_2D)).toBeInTheDocument();
  });
});

describe('SelectionBar Angle field', () => {
  function angleField(): HTMLInputElement {
    return screen.getByLabelText('Angle') as HTMLInputElement;
  }

  /**
   * Simulates the browser reporting `value` as the typed text of a number input. jsdom sanitises
   * text such as "abc" to "", so the value is forced, as the room input tests do.
   */
  function typeRaw(el: HTMLInputElement, value: string): void {
    Object.defineProperty(el, 'value', { configurable: true, writable: true, value });
    fireEvent.change(el);
  }

  it('is a labelled number input from 0 to 359 in steps of 1 with an aria-hidden ° suffix', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    const { container } = render(<SelectionBar />);
    const el = angleField();
    expect(el).toHaveAttribute('type', 'number');
    expect(el).toHaveAttribute('min', '0');
    expect(el).toHaveAttribute('max', '359');
    expect(el).toHaveAttribute('step', '1');
    expect(el).toHaveClass('input');
    expect(container.querySelector(`label[for="${el.id}"]`)).toHaveTextContent(/^Angle$/);
    const field = el.closest('.angle-field');
    expect(field).not.toBeNull();
    const suffix = field?.querySelector('.angle-field-suffix');
    expect(suffix).toHaveTextContent(/^°$/);
    expect(suffix).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows the selected item angle: 45 for an item at 45°', () => {
    act(() => {
      usePlanStore.getState().setItemAngle(DESK_ID, 45);
      useUiStore.getState().select(DESK_ID);
    });
    render(<SelectionBar />);
    expect(angleField().value).toBe('45');
  });

  it('shows a stored 22.5° as 22.5 and 90° as 90', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    expect(angleField().value).toBe('90');
    act(() => usePlanStore.getState().setItemAngle(DESK_ID, 22.5));
    expect(angleField().value).toBe('22.5');
  });

  it('writes a typed 30 to the store with setItemAngle', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    typeRaw(angleField(), '30');
    expect(desk().angle).toBe(30);
    expect(angleField().value).toBe('30');
  });

  it('writes a typed 30 when the user types it key by key', async () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    const user = userEvent.setup();
    await user.clear(angleField());
    await user.type(angleField(), '30');
    expect(desk().angle).toBe(30);
    expect(angleField().value).toBe('30');
  });

  it.each([
    ['0', 0],
    ['359', 359],
    ['359.5', 359.5],
  ])('accepts %s as typed', (text, angle) => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    typeRaw(angleField(), text);
    expect(desk().angle).toBe(angle);
    expect(angleField().value).toBe(text);
  });

  it.each(['360', '400', '-10', '-0.5', '', 'abc'])('does not write %j and keeps the typed text', (text) => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    const before = usePlanStore.getState().items;
    typeRaw(angleField(), text);
    expect(usePlanStore.getState().items).toBe(before);
    expect(desk().angle).toBe(90);
    expect(angleField().value).toBe(text);
  });

  it('re-seeds a rejected draft when the selection changes', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    typeRaw(angleField(), '400');
    act(() => useUiStore.getState().select(BED_ID));
    expect(angleField().value).toBe('0');
    act(() => useUiStore.getState().select(DESK_ID));
    expect(angleField().value).toBe('90');
  });

  it('re-seeds the draft when the selection changes to an item at the same angle', () => {
    act(() => {
      usePlanStore.getState().setItemAngle(BED_ID, 30);
      useUiStore.getState().select(DESK_ID);
    });
    render(<SelectionBar />);
    typeRaw(angleField(), '30.001');
    expect(desk().angle).toBe(30);
    act(() => useUiStore.getState().select(BED_ID));
    expect(angleField().value).toBe('30');
  });

  it('re-seeds a rejected draft when the stored angle changes', async () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    typeRaw(angleField(), '400');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rotate 90°' }));
    expect(desk().angle).toBe(180);
    expect(angleField().value).toBe('180');
  });

  it('keeps a draft that still shows the stored angle after rounding', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    typeRaw(angleField(), '30.001');
    expect(desk().angle).toBe(30);
    expect(angleField().value).toBe('30.001');
  });

  it('re-seeds a draft that the stored angle no longer matches after it normalises', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    // 359.999 is in [0, 360) and is accepted, but it is stored rounded to 0.01: 360, which is 0°.
    typeRaw(angleField(), '359.999');
    expect(desk().angle).toBe(0);
    expect(angleField().value).toBe('0');
  });
});

describe('SelectionBar in room mode', () => {
  it('shows only the room-mode hint, with no item controls, even if an item is still selected', () => {
    act(() => {
      useUiStore.getState().setMode('room');
      useUiStore.getState().select(DESK_ID);
    });
    render(<SelectionBar />);
    expect(screen.getByText(HINT_ROOM)).toHaveClass('selection-hint');
    expect(screen.queryByText('Tack writing desk')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByLabelText('Angle')).toBeNull();
    expect(screen.queryByText(HINT_2D)).toBeNull();
  });

  it('switches between the room-mode hint and the furnish controls as the mode changes', () => {
    act(() => useUiStore.getState().select(DESK_ID));
    render(<SelectionBar />);
    act(() => useUiStore.getState().setMode('room'));
    expect(screen.getByText(HINT_ROOM)).toBeInTheDocument();
    act(() => useUiStore.getState().setMode('furnish'));
    expect(screen.queryByText(HINT_ROOM)).toBeNull();
    expect(screen.getByText(HINT_2D)).toBeInTheDocument();
  });

  it('shows the 3D hint, not the room-mode hint, when the plan is not visible', () => {
    act(() => {
      useUiStore.getState().setLayout('tabs');
      useUiStore.getState().setTab('3d');
      useUiStore.getState().setMode('room');
      useUiStore.getState().select(DESK_ID);
    });
    render(<SelectionBar />);
    expect(screen.getByText(HINT_3D)).toBeInTheDocument();
    expect(screen.queryByText(HINT_ROOM)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
