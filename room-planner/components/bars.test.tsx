import { act, cleanup, render, screen } from '@testing-library/react';
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
  'Drag a piece on the plan to move it, or nudge it with the arrow keys. Select one to see its clearance to each wall. R rotates, Delete removes. Drag the 3D view to orbit.';
const HINT_3D = 'Drag to orbit, scroll to zoom. Pick a piece from the list to highlight it.';

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
  act(() => usePlanStore.getState().setRoomDim('h', 36));
}

/** One conflict, plus a too-tall shelf and a centred sofa that overlaps the bed. */
function threeConflicts(): void {
  act(() => {
    usePlanStore.getState().setRoomDim('h', 36);
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
    expect(desk().rot).toBe(1);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Rotate 90°' }));
    expect(desk().rot).toBe(2);
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
