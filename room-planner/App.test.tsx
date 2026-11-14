import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { ProductLookup } from './services/productLookup';
import { usePlanStore } from './state/planStore';
import { useUiStore } from './state/uiStore';

// The 3D views draw on canvases jsdom cannot provide; inert stand-ins keep the lazy chunk resolvable.
vi.mock('./components/Stage/ThreeView', () => ({
  default: (): JSX.Element => <div data-testid="realistic-marker" />,
}));

vi.mock('./components/Stage/BlueprintView', () => ({
  BlueprintView: (): JSX.Element => <div data-testid="blueprint-marker" />,
}));

// The real Sidebar, wrapped to record every lookup provider it is rendered with.
const seenLookups = vi.hoisted((): ProductLookup[] => []);
vi.mock('./components/Sidebar/Sidebar', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/Sidebar/Sidebar')>();
  return {
    Sidebar: (props: { lookup: ProductLookup }): JSX.Element => {
      seenLookups.push(props.lookup);
      return <actual.Sidebar {...props} />;
    },
  };
});

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  seenLookups.length = 0;
});

function desk() {
  const item = usePlanStore.getState().items.find((i) => i.id === 'seed-desk');
  if (!item) throw new Error('desk not in the plan');
  return item;
}

describe('App', () => {
  it('renders the header, the sidebar and a main column inside a root with class app', () => {
    const { container } = render(<App />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('app');
    const header = container.querySelector('header.nav');
    const aside = container.querySelector('aside.sidebar');
    const main = container.querySelector('main');
    expect(header).toBeInTheDocument();
    expect(aside).toBeInTheDocument();
    expect(main).toBeInTheDocument();
    expect(main?.querySelector('.top-bar')).toBeInTheDocument();
    expect(main?.querySelector('.stage')).toBeInTheDocument();
    expect(main?.querySelector('.selection-bar')).toBeInTheDocument();
  });

  it('wires the keyboard shortcuts: R rotates the selected desk', () => {
    const { container } = render(<App />);
    // The plan also renders the desk as a button; click its row in the item list.
    const row = Array.from(container.querySelectorAll('button.item-row')).find((b) =>
      b.textContent?.startsWith('Tack writing desk'),
    );
    if (!row) throw new Error('no desk row in the item list');
    fireEvent.click(row);
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
    expect(desk().rot).toBe(1);
    fireEvent.keyDown(window, { key: 'r' });
    expect(desk().rot).toBe(2);
  });

  it('creates the lookup provider once and passes the same instance to Sidebar on re-render', () => {
    const { rerender } = render(<App />);
    act(() => useUiStore.getState().select('seed-bed'));
    rerender(<App />);
    expect(seenLookups.length).toBeGreaterThanOrEqual(2);
    const [first] = seenLookups;
    expect(typeof first?.lookup).toBe('function');
    for (const lookup of seenLookups) expect(lookup).toBe(first);
  });

  it('places the Sofa sample: three rows, $2,600 total, 2 conflicts', async () => {
    vi.useFakeTimers();
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Sofa' }));
    await act(async () => {
      vi.advanceTimersByTime(900);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place in room' }));

    expect(container.querySelectorAll('button.item-row')).toHaveLength(3);
    expect(screen.getByText('$2,600')).toBeInTheDocument();
    expect(screen.getByText('2 conflicts')).toHaveClass('tag-conflict');
  });
});
