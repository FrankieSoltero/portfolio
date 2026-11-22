import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialDocument } from '../../domain/catalog';
import { defaultColours, defaultStyle } from '../../domain/furniture/recipe';
import type { ProductPreview } from '../../domain/types';
import type { ProductLookup } from '../../services/productLookup';
import { clearShareFragment } from '../../services/shareLocation';
import { lookupProduct } from '../../state/actions';
import { clearHistory, undo, useHistoryStore } from '../../state/historyStore';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { createFakePlanStore, type FakePlanStore, type Pending } from '../../test/fakePlanStore';
import { furnishedDocument } from '../../test/fixtures';
import { PlanSection } from './PlanSection';

vi.mock('../../services/shareLocation', () => ({
  readShareData: vi.fn(),
  clearShareFragment: vi.fn(),
  shareUrl: vi.fn(),
  reloadPage: vi.fn(),
}));

const clearFragment = vi.mocked(clearShareFragment);

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  // Start furnished, so a reset has a bed to take away.
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
  clearFragment.mockReset();
});

const STORAGE_NOTICE = 'This browser is blocking storage, so changes will not be saved.';

function bed() {
  const item = usePlanStore.getState().items.find((i) => i.id === 'seed-bed');
  if (!item) throw new Error('bed not in the plan');
  return item;
}

/**
 * Loads the furnished plan, moves the bed, selects it and shows a notice, so a reset has something to
 * undo. It sets the plan directly rather than through `reset`, which some tests count.
 */
function dirtyTheStores(): void {
  act(() => {
    usePlanStore.setState(furnishedDocument());
    usePlanStore.getState().moveItemTo('seed-bed', 100, 100);
    useUiStore.getState().select('seed-bed');
    useUiStore.getState().setNotice('Something earlier');
  });
  expect(bed().x).toBe(100);
}

/** Makes `store.clear` return a promise the test settles, still counting the calls. */
function holdClear(store: FakePlanStore): Pending<void> {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  store.clear = () => {
    store.clearCalls++;
    return promise;
  };
  return { promise, resolve, reject };
}

async function confirmReset(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Reset plan' }));
  await user.click(screen.getByRole('button', { name: 'Erase everything and start over' }));
}

/** The plan is the starting plan, the room with no furniture, and the UI store is fresh. */
function expectStartingPlanAndFreshUi(): void {
  const seed = createInitialDocument();
  const plan = usePlanStore.getState();
  expect({
    schemaVersion: plan.schemaVersion,
    units: plan.units,
    room: plan.room,
    items: plan.items,
    openings: plan.openings,
    obstacles: plan.obstacles,
  }).toEqual(seed);
  expect(plan.items).toEqual([]);
  const ui = useUiStore.getState();
  expect(ui.selectedId).toBeNull();
  expect(ui.mode).toBe('furnish');
  expect(ui.saveBlocked).toBe(false);
}

describe('PlanSection', () => {
  it('renders section 04 Plan with the storage text and a Reset plan button', () => {
    const { container } = render(<PlanSection planStore={createFakePlanStore()} />);
    const section = container.querySelector('section');
    expect(section).toHaveClass('sidebar-section');
    expect(section).toHaveClass('plan-section');
    const heading = screen.getByRole('heading', { level: 6 });
    expect(heading).toHaveClass('sidebar-heading');
    expect(heading.querySelector('.sidebar-heading-num')).toHaveTextContent('04');
    expect(heading).toHaveTextContent(/^04Plan$/);
    expect(
      screen.getByText('Saved in this browser only. A share link contains the whole plan. A pasted product link is sent to this site to read the page, and the product photo loads from the shop.'),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Reset plan']);
  });

  it('does nothing until the reset is confirmed', async () => {
    const store = createFakePlanStore();
    render(<PlanSection planStore={store} />);
    dirtyTheStores();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reset plan' }));
    expect(store.clearCalls).toBe(0);
    expect(bed().x).toBe(100);
  });

  it('reset: awaits planStore.clear(), then resets the plan to the empty starting document and the UI store', async () => {
    const store = createFakePlanStore();
    const clear = holdClear(store);
    render(<PlanSection planStore={store} />);
    dirtyTheStores();

    await confirmReset();
    expect(store.clearCalls).toBe(1);
    // Nothing is reset until clear() settles.
    expect(bed().x).toBe(100);
    expect(useUiStore.getState().notice).toBe('Something earlier');

    await act(async () => {
      clear.resolve();
    });
    expectStartingPlanAndFreshUi();
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('reset when clear rejects: still resets both stores, then shows the storage notice; no unhandled rejection', async () => {
    const store = createFakePlanStore();
    const clear = vi.fn(() => Promise.reject(new Error('storage blocked')));
    store.clear = clear;
    render(<PlanSection planStore={store} />);
    dirtyTheStores();

    await act(async () => {
      await confirmReset();
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expectStartingPlanAndFreshUi();
    expect(useUiStore.getState().notice).toBe(STORAGE_NOTICE);
  });

  it('confirming again while a reset is in flight does nothing; once it settles a new reset works', async () => {
    const store = createFakePlanStore();
    const clear = holdClear(store);
    render(<PlanSection planStore={store} />);
    dirtyTheStores();
    let planResets = 0;
    let uiResets = 0;
    const planReset = usePlanStore.getState().reset;
    const uiReset = useUiStore.getState().reset;
    usePlanStore.setState({ reset: (doc) => (planResets++, planReset(doc)) });
    useUiStore.setState({ reset: () => (uiResets++, uiReset()) });
    try {
      await confirmReset();
      await confirmReset();
      expect(store.clearCalls).toBe(1);
      await act(async () => {
        clear.resolve();
      });
      expect(planResets).toBe(1);
      expect(uiResets).toBe(1);
      expectStartingPlanAndFreshUi();

      // A new reset after the first has settled runs normally.
      store.clear = () => {
        store.clearCalls++;
        return Promise.resolve();
      };
      dirtyTheStores();
      await act(async () => {
        await confirmReset();
      });
      expect(store.clearCalls).toBe(2);
      expect(planResets).toBe(2);
      expect(uiResets).toBe(2);
      expectStartingPlanAndFreshUi();
    } finally {
      usePlanStore.setState({ reset: planReset });
      useUiStore.setState({ reset: uiReset });
    }
  });

  it('reset in a browser without WebGL keeps WebGL marked unavailable and the blueprint style', async () => {
    const store = createFakePlanStore();
    render(<PlanSection planStore={store} />);
    dirtyTheStores();
    act(() => useUiStore.getState().markWebglUnavailable());

    await act(async () => {
      await confirmReset();
    });
    expect(store.clearCalls).toBe(1);
    expectStartingPlanAndFreshUi();
    expect(useUiStore.getState().webglAvailable).toBe(false);
    expect(useUiStore.getState().renderStyle).toBe('blueprint');
    expect(useUiStore.getState().notice).toBeNull();
  });

  it('reset where WebGL works leaves it available and the realistic style', async () => {
    const store = createFakePlanStore();
    render(<PlanSection planStore={store} />);
    dirtyTheStores();
    act(() => useUiStore.getState().setRenderStyle('blueprint'));

    await act(async () => {
      await confirmReset();
    });
    expect(useUiStore.getState().webglAvailable).toBe(true);
    expect(useUiStore.getState().renderStyle).toBe('realistic');
  });

  it('reset in a newer-version session: clears the key and lifts saveBlocked', async () => {
    const store = createFakePlanStore();
    render(<PlanSection planStore={store} />);
    dirtyTheStores();
    act(() => useUiStore.getState().setSaveBlocked(true));

    await act(async () => {
      await confirmReset();
    });
    expect(store.clearCalls).toBe(1);
    expectStartingPlanAndFreshUi();
    expect(useUiStore.getState().saveBlocked).toBe(false);
    expect(useUiStore.getState().notice).toBeNull();
  });
});

describe('PlanSection: reset during a shared-plan preview', () => {
  it.each([{ canKeep: true }, { canKeep: false }])(
    'with a preview (%o): ends the preview and clears the share fragment before the plan store is reset',
    async (preview) => {
      const store = createFakePlanStore();
      render(<PlanSection planStore={store} />);
      dirtyTheStores();
      act(() => useUiStore.getState().setSharedPreview(preview));
      const order: string[] = [];
      clearFragment.mockImplementation(() => {
        order.push('clearShareFragment');
      });
      const planReset = usePlanStore.getState().reset;
      usePlanStore.setState({
        reset: (doc) => {
          order.push(`plan reset, preview ${JSON.stringify(useUiStore.getState().sharedPreview)}`);
          planReset(doc);
        },
      });
      try {
        await act(async () => {
          await confirmReset();
        });
      } finally {
        usePlanStore.setState({ reset: planReset });
      }
      expect(store.clearCalls).toBe(1);
      expect(clearFragment).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['clearShareFragment', 'plan reset, preview null']);
      expect(useUiStore.getState().sharedPreview).toBeNull();
      expectStartingPlanAndFreshUi();
      expect(useUiStore.getState().notice).toBeNull();
    },
  );
});

describe('PlanSection: undo history', () => {
  beforeEach(() => {
    clearHistory();
  });

  it('reset leaves nothing to undo or redo', async () => {
    const store = createFakePlanStore();
    render(<PlanSection planStore={store} />);
    act(() => {
      usePlanStore.getState().moveItemTo('seed-bed', 100, 100);
      usePlanStore.getState().moveItemTo('seed-bed', 110, 110);
      undo();
    });
    expect(useHistoryStore.getState().canUndo).toBe(true);
    expect(useHistoryStore.getState().canRedo).toBe(true);

    await act(async () => {
      await confirmReset();
    });
    expect(store.clearCalls).toBe(1);
    expectStartingPlanAndFreshUi();
    expect(useHistoryStore.getState().canUndo).toBe(false);
    expect(useHistoryStore.getState().canRedo).toBe(false);
  });
});

describe('PlanSection: reset during a lookup', () => {
  const LINK = 'https://www.ikea.com/us/en/p/alder-sofa-12345678/';

  /** A product the fake lookup answers with, once the test lets it. */
  const PRODUCT: ProductPreview = {
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
  };

  it('a lookup still running when the plan is reset posts no preview when it answers later', async () => {
    let answer!: (preview: ProductPreview) => void;
    const lookup: ProductLookup = {
      lookup: () =>
        new Promise<ProductPreview>((resolve) => {
          answer = resolve;
        }),
    };
    render(<PlanSection planStore={createFakePlanStore()} />);
    let running!: Promise<void>;
    act(() => {
      running = lookupProduct(LINK, lookup);
    });
    expect(useUiStore.getState().lookup).toEqual({ status: 'loading' });

    await act(async () => {
      await confirmReset();
    });
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });

    await act(async () => {
      answer(PRODUCT);
      await running;
    });
    expect(useUiStore.getState().lookup).toEqual({ status: 'idle' });
    expect(useUiStore.getState().pendingLink).toBeNull();
  });
});
