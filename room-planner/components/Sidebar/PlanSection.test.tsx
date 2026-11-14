import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialDocument } from '../../domain/catalog';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { createFakePlanStore, type FakePlanStore, type Pending } from '../../test/fakePlanStore';
import { PlanSection } from './PlanSection';

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
});

const STORAGE_NOTICE = 'This browser is blocking storage, so changes will not be saved.';

function bed() {
  const item = usePlanStore.getState().items.find((i) => i.id === 'seed-bed');
  if (!item) throw new Error('bed not in the plan');
  return item;
}

/** Moves the bed, selects it and shows a notice, so a reset has something to undo. */
function dirtyTheStores(): void {
  act(() => {
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

function expectSeededPlanAndFreshUi(): void {
  const seed = createInitialDocument();
  const plan = usePlanStore.getState();
  expect({ schemaVersion: plan.schemaVersion, units: plan.units, room: plan.room, items: plan.items }).toEqual(seed);
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
    expect(screen.getByText('Saved in this browser only. Nothing is sent anywhere.')).toBeInTheDocument();
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

  it('reset: awaits planStore.clear(), then resets the plan to the seeded document and the UI store', async () => {
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
    expectSeededPlanAndFreshUi();
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
    expectSeededPlanAndFreshUi();
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
      expectSeededPlanAndFreshUi();

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
      expectSeededPlanAndFreshUi();
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
    expectSeededPlanAndFreshUi();
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
    expectSeededPlanAndFreshUi();
    expect(useUiStore.getState().saveBlocked).toBe(false);
    expect(useUiStore.getState().notice).toBeNull();
  });
});
