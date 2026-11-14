import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { createInitialDocument } from './domain/catalog';
import type { ProductLookup } from './services/productLookup';
import { usePlanStore } from './state/planStore';
import { useUiStore } from './state/uiStore';
import { createFakePlanStore, type FakePlanStore } from './test/fakePlanStore';

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

/** Renders the app against `store` and waits until its plan has loaded and the workspace shows. */
async function renderApp(store: FakePlanStore = createFakePlanStore()) {
  const view = render(<App planStore={store} />);
  await screen.findByRole('main');
  return { ...view, store };
}

function desk() {
  const item = usePlanStore.getState().items.find((i) => i.id === 'seed-desk');
  if (!item) throw new Error('desk not in the plan');
  return item;
}

describe('App', () => {
  it('renders the header, the sidebar and a main column inside a root with class app', async () => {
    const { container } = await renderApp();
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

  it('wires the keyboard shortcuts: R rotates the selected desk', async () => {
    const { container } = await renderApp();
    // The plan also renders the desk as a button; click its row in the item list.
    const row = Array.from(container.querySelectorAll('button.item-row')).find((b) =>
      b.textContent?.startsWith('Tack writing desk'),
    );
    if (!row) throw new Error('no desk row in the item list');
    fireEvent.click(row);
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
    expect(desk().angle).toBe(90);
    fireEvent.keyDown(window, { key: 'r' });
    expect(desk().angle).toBe(180);
  });

  it('creates the lookup provider once and passes the same instance to Sidebar on re-render', async () => {
    const { rerender, store } = await renderApp();
    act(() => useUiStore.getState().select('seed-bed'));
    rerender(<App planStore={store} />);
    expect(seenLookups.length).toBeGreaterThanOrEqual(2);
    const [first] = seenLookups;
    expect(typeof first?.lookup).toBe('function');
    for (const lookup of seenLookups) expect(lookup).toBe(first);
  });

  it('places the Sofa sample: three rows, $2,600 total, 2 conflicts', async () => {
    const { container } = await renderApp();
    vi.useFakeTimers();
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

describe('App: saved plan', () => {
  it('shows only "Loading your plan…" in a status element, and saves nothing, until the plan has loaded', async () => {
    const store = createFakePlanStore({ load: { type: 'pending' } });
    const { container } = render(<App planStore={store} />);
    await act(async () => {
      await Promise.resolve();
    });
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading your plan…');
    expect(status).toHaveClass('plan-loading');
    expect(container.querySelector('main')).not.toBeInTheDocument();
    expect(container.querySelector('aside.sidebar')).not.toBeInTheDocument();
    expect(container.querySelector('header.nav')).not.toBeInTheDocument();
    expect(store.saveCalls).toHaveLength(0);

    await act(async () => {
      store.pendingLoads[0].resolve({ status: 'empty' });
    });
    expect(await screen.findByRole('main')).toBeInTheDocument();
    expect(screen.queryByText('Loading your plan…')).not.toBeInTheDocument();
  });

  it('renders the workspace from the loaded plan', async () => {
    const seed = createInitialDocument();
    const saved = { ...seed, items: seed.items.filter((i) => i.id !== 'seed-desk') };
    const { container } = await renderApp(
      createFakePlanStore({ load: { type: 'resolve', value: { status: 'loaded', doc: saved } } }),
    );
    expect(container.querySelectorAll('button.item-row')).toHaveLength(1);
  });

  it('renders the workspace and the storage notice above the workspace body when storage is unavailable', async () => {
    const { container } = await renderApp(
      createFakePlanStore({ load: { type: 'resolve', value: { status: 'unavailable' } } }),
    );
    // The room section keeps its own (empty) status element mounted, so find the notice by class.
    const notice = container.querySelector('.notice');
    expect(notice).toHaveAttribute('role', 'status');
    expect(notice).toHaveTextContent('This browser is blocking storage, so changes will not be saved.');
    const root = container.querySelector('.app');
    const children = Array.from(root?.children ?? []);
    expect(children.map((el) => el.className.split(' ')[0])).toEqual(['nav', 'notice', 'app-body']);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(container.querySelector('.notice')).not.toBeInTheDocument();
  });
});
