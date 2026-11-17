import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { CONFIG } from './config';
import { createInitialDocument } from './domain/catalog';
import type { ProductLookup } from './services/productLookup';
import { clearHistory, undo } from './state/historyStore';
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
    Sidebar: (props: Parameters<typeof actual.Sidebar>[0]): JSX.Element => {
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

describe('App: undo history', () => {
  beforeEach(() => {
    clearHistory();
  });

  it('wires the text-field groups: three changes while the product link field is focused make one step', async () => {
    // Wait for the load (which clears the history) before the changes.
    await renderApp();
    screen.getByRole('textbox', { name: 'Product link' }).focus();
    act(() => {
      for (let i = 0; i < 3; i++) usePlanStore.getState().moveItemBy('seed-bed', 1, 0);
    });
    let steps = 0;
    act(() => {
      while (undo()) steps += 1;
    });
    expect(steps).toBe(1);
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

describe('App: shared-plan banner', () => {
  /** The class each child of the `.app` root starts with, in order. */
  function shellChildren(container: HTMLElement): string[] {
    const root = container.querySelector('.app');
    return Array.from(root?.children ?? []).map((el) => el.className.split(' ')[0]);
  }

  it('renders the banner right after the notice, above the body; without either the shell is unchanged', async () => {
    const { container } = await renderApp(
      createFakePlanStore({ load: { type: 'resolve', value: { status: 'unavailable' } } }),
    );
    act(() => useUiStore.getState().setSharedPreview({ canKeep: true }));
    expect(shellChildren(container)).toEqual(['nav', 'notice', 'shared-banner', 'app-body']);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(shellChildren(container)).toEqual(['nav', 'shared-banner', 'app-body']);

    act(() => useUiStore.getState().setSharedPreview(null));
    expect(shellChildren(container)).toEqual(['nav', 'app-body']);
  });
});

describe('App: reset plan', () => {
  const STORAGE_NOTICE = 'This browser is blocking storage, so changes will not be saved.';

  /** Lets pending promise callbacks (the reset's awaited clear, the save's result) run. */
  async function flushPromises(): Promise<void> {
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
  }

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      vi.advanceTimersByTime(ms);
    });
    await flushPromises();
  }

  function bedX(): number {
    const bed = usePlanStore.getState().items.find((i) => i.id === 'seed-bed');
    if (!bed) throw new Error('bed not in the plan');
    return bed.x;
  }

  async function confirmReset(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'Reset plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Erase everything and start over' }));
    await flushPromises();
  }

  it('passes its planStore to the sidebar: a confirmed reset clears it, then the autosave saves the seeded document', async () => {
    const { store } = await renderApp();
    vi.useFakeTimers();
    act(() => usePlanStore.getState().moveItemTo('seed-bed', 100, 100));
    await advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(1);
    expect(store.saveCalls[0]?.items.find((i) => i.id === 'seed-bed')?.x).toBe(100);

    await confirmReset();
    expect(store.clearCalls).toBe(1);
    expect(bedX()).not.toBe(100);
    expect(useUiStore.getState().notice).toBeNull();

    await advance(CONFIG.saveDebounceMs - 1);
    expect(store.saveCalls).toHaveLength(1);
    await advance(1);
    expect(store.saveCalls).toHaveLength(2);
    expect(store.saveCalls[1]).toEqual(createInitialDocument());
  });

  it('when clear rejects: resets, shows the storage notice, and still saves the seeded document', async () => {
    const { store, container } = await renderApp();
    store.clear = vi.fn(() => Promise.reject(new Error('storage blocked')));
    vi.useFakeTimers();
    act(() => usePlanStore.getState().moveItemTo('seed-bed', 100, 100));

    await confirmReset();
    expect(store.clear).toHaveBeenCalledTimes(1);
    expect(bedX()).not.toBe(100);
    expect(container.querySelector('.notice')).toHaveTextContent(STORAGE_NOTICE);
    await advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls.at(-1)).toEqual(createInitialDocument());
  });

  it('in a newer-version session: a confirmed reset clears the key, removes the notice and resumes saving', async () => {
    const { store, container } = await renderApp(
      createFakePlanStore({ load: { type: 'resolve', value: { status: 'newer' } } }),
    );
    expect(useUiStore.getState().saveBlocked).toBe(true);
    expect(container.querySelector('.notice')).toBeInTheDocument();
    vi.useFakeTimers();
    act(() => usePlanStore.getState().moveItemTo('seed-bed', 100, 100));
    await advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toHaveLength(0);

    await confirmReset();
    expect(store.clearCalls).toBe(1);
    expect(useUiStore.getState().saveBlocked).toBe(false);
    expect(container.querySelector('.notice')).not.toBeInTheDocument();
    await advance(CONFIG.saveDebounceMs);
    expect(store.saveCalls).toEqual([createInitialDocument()]);
  });

  it('Escape while the reset is armed cancels it without clearing the selection; once idle, Escape deselects', async () => {
    const { store } = await renderApp();
    act(() => useUiStore.getState().select('seed-desk'));
    fireEvent.click(screen.getByRole('button', { name: 'Reset plan' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(cancel).toHaveFocus();

    fireEvent.keyDown(cancel, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    const reset = screen.getByRole('button', { name: 'Reset plan' });
    expect(reset).toHaveFocus();
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
    expect(store.clearCalls).toBe(0);

    fireEvent.keyDown(reset, { key: 'Escape' });
    expect(useUiStore.getState().selectedId).toBeNull();
  });
});
