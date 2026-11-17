import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { keepSharedPlan, leaveSharedPlan } from '../hooks/usePlanPersistence';
import { useUiStore } from '../state/uiStore';
import { createFakePlanStore } from '../test/fakePlanStore';
import { SharedBanner } from './SharedBanner';

// The banner only calls these; what they do is Task 2's (and its tests').
vi.mock('../hooks/usePlanPersistence', () => ({ keepSharedPlan: vi.fn(), leaveSharedPlan: vi.fn() }));

const KEEP_TEXT = 'Viewing a shared plan. Your own plan is untouched, and changes here are not saved.';
const VIEW_TEXT = 'Viewing a shared plan. Changes here are not saved.';

/** A promise with its resolve function, for holding an action pending. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets pending promise callbacks run. */
async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function preview(canKeep: boolean): void {
  act(() => useUiStore.getState().setSharedPreview({ canKeep }));
}

function confirmKeep(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Keep this plan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Replace my plan' }));
}

const backButton = () => screen.getByRole('button', { name: 'Back to my plan' });

// Vitest globals are off, so Testing Library cannot register its own cleanup.
afterEach(cleanup);

beforeEach(() => {
  useUiStore.getState().reset();
  vi.mocked(keepSharedPlan).mockReset().mockResolvedValue(undefined);
  vi.mocked(leaveSharedPlan).mockReset().mockResolvedValue(undefined);
});

describe('SharedBanner', () => {
  it('renders nothing without a shared preview', () => {
    const { container } = render(<SharedBanner planStore={createFakePlanStore()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('a keepable preview: a status bar with the first text, Keep this plan and Back to my plan', () => {
    preview(true);
    const { container } = render(<SharedBanner planStore={createFakePlanStore()} />);
    const bar = container.firstElementChild;
    expect(bar).toHaveClass('shared-banner');
    expect(bar).toHaveAttribute('role', 'status');
    expect(screen.getByText(KEEP_TEXT)).toHaveClass('shared-banner-text');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Keep this plan', 'Back to my plan']);
  });

  it('Keep this plan asks first, then calls keepSharedPlan with the plan store', () => {
    preview(true);
    const store = createFakePlanStore();
    render(<SharedBanner planStore={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep this plan' }));
    expect(keepSharedPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Replace my plan' }));
    expect(keepSharedPlan).toHaveBeenCalledTimes(1);
    expect(keepSharedPlan).toHaveBeenCalledWith(store);
  });

  it('Back to my plan calls leaveSharedPlan with the plan store', () => {
    preview(true);
    const store = createFakePlanStore();
    render(<SharedBanner planStore={store} />);
    fireEvent.click(backButton());
    expect(leaveSharedPlan).toHaveBeenCalledTimes(1);
    expect(leaveSharedPlan).toHaveBeenCalledWith(store);
  });

  it('a preview that cannot be kept: the second text and only Back to my plan', () => {
    preview(false);
    const store = createFakePlanStore();
    render(<SharedBanner planStore={store} />);
    expect(screen.getByRole('status')).toHaveTextContent(VIEW_TEXT);
    expect(screen.queryByText(KEEP_TEXT)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Back to my plan']);
    fireEvent.click(backButton());
    expect(leaveSharedPlan).toHaveBeenCalledWith(store);
  });

  it('a second Keep while the first is pending does nothing; once settled it works again', async () => {
    preview(true);
    const pending = deferred();
    vi.mocked(keepSharedPlan).mockReturnValue(pending.promise);
    render(<SharedBanner planStore={createFakePlanStore()} />);
    confirmKeep();
    confirmKeep();
    expect(keepSharedPlan).toHaveBeenCalledTimes(1);
    pending.resolve();
    await flush();
    confirmKeep();
    expect(keepSharedPlan).toHaveBeenCalledTimes(2);
  });

  it('a second Back to my plan while the first is pending does nothing; once settled it works again', async () => {
    preview(true);
    const pending = deferred();
    vi.mocked(leaveSharedPlan).mockReturnValue(pending.promise);
    render(<SharedBanner planStore={createFakePlanStore()} />);
    fireEvent.click(backButton());
    fireEvent.click(backButton());
    expect(leaveSharedPlan).toHaveBeenCalledTimes(1);
    pending.resolve();
    await flush();
    fireEvent.click(backButton());
    expect(leaveSharedPlan).toHaveBeenCalledTimes(2);
  });

  it('while Back to my plan is pending, confirming Keep this plan does nothing', async () => {
    preview(true);
    const pending = deferred();
    vi.mocked(leaveSharedPlan).mockReturnValue(pending.promise);
    render(<SharedBanner planStore={createFakePlanStore()} />);
    fireEvent.click(backButton());
    confirmKeep();
    expect(keepSharedPlan).not.toHaveBeenCalled();
    pending.resolve();
    await flush();
    confirmKeep();
    expect(keepSharedPlan).toHaveBeenCalledTimes(1);
  });

  it('while Keep this plan is pending, Back to my plan does nothing', async () => {
    preview(true);
    const pending = deferred();
    vi.mocked(keepSharedPlan).mockReturnValue(pending.promise);
    render(<SharedBanner planStore={createFakePlanStore()} />);
    confirmKeep();
    fireEvent.click(backButton());
    expect(leaveSharedPlan).not.toHaveBeenCalled();
    pending.resolve();
    await flush();
    fireEvent.click(backButton());
    expect(leaveSharedPlan).toHaveBeenCalledTimes(1);
  });
});
