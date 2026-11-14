import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductPreview } from '../../domain/types';
import type { ProductLookup } from '../../services/productLookup';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { ItemList } from './ItemList';
import { Sidebar } from './Sidebar';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

const BED = 'Low platform bed, queen';
const DESK = 'Tack writing desk';

/** A ProductLookup that is never expected to be called. */
function fakeLookup(): ProductLookup {
  return { lookup: vi.fn(() => new Promise<ProductPreview>(() => undefined)) };
}

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

/** The item row button whose accessible name starts with `name` (other rows may name it in a conflict tag). */
function row(name: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
}

function rows(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button.item-row'));
}

describe('ItemList', () => {
  it('renders a section headed 03 (in .sidebar-heading-num) then In this room', () => {
    const { container } = render(<ItemList />);
    expect(container.querySelector('section')).toHaveClass('sidebar-section');
    const heading = screen.getByRole('heading', { level: 6 });
    expect(heading).toHaveClass('sidebar-heading');
    expect(heading.querySelector('.sidebar-heading-num')).toHaveTextContent('03');
    expect(heading).toHaveTextContent(/^03In this room$/);
  });

  it('renders one <button> row per seeded item with name, price and dimensions', () => {
    const { container } = render(<ItemList />);
    const list = rows(container);
    expect(list).toHaveLength(2);
    const first = list[0];
    if (first === undefined) throw new Error('missing first row');
    expect(first.tagName).toBe('BUTTON');
    expect(first).toHaveAttribute('type', 'button');
    expect(within(first).getByText(BED)).toBeInTheDocument();
    expect(within(first).getByText('$890')).toBeInTheDocument();
    expect(within(first).getByText('64 × 85 × 38 in')).toBeInTheDocument();
    expect(list[1]).toHaveTextContent(DESK);
  });

  it('selects the desk on clicking its row and marks the row pressed and selected', async () => {
    render(<ItemList />);
    expect(row(DESK)).toHaveAttribute('aria-pressed', 'false');
    await userEvent.setup().click(row(DESK));
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
    expect(row(DESK)).toHaveAttribute('aria-pressed', 'true');
    expect(row(DESK)).toHaveClass('item-row-selected');
    expect(row(BED)).toHaveAttribute('aria-pressed', 'false');
    expect(row(BED)).not.toHaveClass('item-row-selected');
  });

  it('shows a conflict tag under the desk row once the desk is moved onto the bed', () => {
    render(<ItemList />);
    act(() => usePlanStore.getState().moveItemTo('seed-desk', 40, 0));
    const tag = within(row(DESK)).getByText(`Overlaps ${BED}`);
    expect(tag).toHaveClass('tag');
    expect(tag).toHaveClass('item-row-conflict');
  });

  it('shows no tag elements in any row when nothing conflicts', () => {
    const { container } = render(<ItemList />);
    const list = rows(container);
    expect(list).toHaveLength(2);
    for (const r of list) expect(r.querySelector('.tag')).toBeNull();
  });

  it('shows Nothing placed yet. when there are no items', () => {
    act(() => {
      usePlanStore.getState().removeItem('seed-bed');
      usePlanStore.getState().removeItem('seed-desk');
    });
    const { container } = render(<ItemList />);
    expect(screen.getByText('Nothing placed yet.')).toBeInTheDocument();
    expect(rows(container)).toHaveLength(0);
  });

  it('does not show the empty message while items exist', () => {
    render(<ItemList />);
    expect(screen.queryByText('Nothing placed yet.')).toBeNull();
  });

  it('totals $1,310 initially and still $1,310 after adding an item with no price', () => {
    render(<ItemList />);
    expect(screen.getByText('$1,310')).toBeInTheDocument();
    act(() => {
      usePlanStore.getState().addItem(preview({ name: 'Mystery stool', price: null }));
    });
    expect(screen.getByText('$1,310')).toBeInTheDocument();
    expect(within(row('Mystery stool')).getByText('No price')).toBeInTheDocument();
  });

  it('labels the total Total, nothing bought yet', () => {
    render(<ItemList />);
    expect(screen.getByText('Total, nothing bought yet')).toBeInTheDocument();
  });

  it('shows metric dimensions when units are m', () => {
    act(() => usePlanStore.getState().setUnits('m'));
    const { container } = render(<ItemList />);
    expect(rows(container)[0]).toHaveTextContent('163 × 216 × 97 cm');
  });

  it('renders an item name containing markup as literal text', () => {
    act(() => {
      usePlanStore.getState().addItem(preview({ name: '<b>x</b>' }));
    });
    const { container } = render(<ItemList />);
    const last = rows(container).at(-1);
    if (last === undefined) throw new Error('missing row');
    expect(within(last).getByText('<b>x</b>')).toBeInTheDocument();
    expect(last.querySelector('b')).toBeNull();
  });
});

describe('Sidebar', () => {
  it('is an aside.sidebar with sections 01, 02, 03 in DOM order', () => {
    const { container } = render(<Sidebar lookup={fakeLookup()} />);
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside).toHaveClass('sidebar');
    const nums = Array.from(container.querySelectorAll('.sidebar-heading-num')).map((n) => n.textContent);
    expect(nums).toEqual(['01', '02', '03']);
    const headings = screen.getAllByRole('heading', { level: 6 }).map((h) => h.textContent);
    expect(headings).toEqual(['01Room', '02Add furniture from a link', '03In this room']);
  });
});
