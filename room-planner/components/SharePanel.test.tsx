import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findPlanIssues } from '../domain/conflicts';
import { currentDocument } from '../hooks/usePlanPersistence';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { canvasToPng, downloadBlob } from '../services/download';
import { encodePlan } from '../services/shareLink';
import { shareUrl } from '../services/shareLocation';
import { clearHistory, useHistoryStore } from '../state/historyStore';
import { usePlanStore } from '../state/planStore';
import { useUiStore } from '../state/uiStore';
import { furnishedDocument } from '../test/fixtures';
import { captureView } from '../view/captureRegistry';
import { drawPlanPicture, planPictureSize } from '../view/planPicture';
import { SharePanel } from './SharePanel';

// Encoding is Task 1's job; here it only has to resolve when the test says so.
vi.mock('../services/shareLink', () => ({ encodePlan: vi.fn() }));
// jsdom cannot make PNGs, and downloadBlob leaves a 40 s timer behind.
vi.mock('../services/download', () => ({ canvasToPng: vi.fn(), downloadBlob: vi.fn() }));
vi.mock('../view/captureRegistry', () => ({ captureView: vi.fn() }));
// The real size; the drawing itself is checked by Task 3's tests.
vi.mock('../view/planPicture', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../view/planPicture')>()),
  drawPlanPicture: vi.fn(),
}));

const TOO_LARGE = 'This plan is too large to share as a link.';
const NO_PICTURE = 'The picture could not be made.';
const NO_3D_REASON = 'Show the 3D view to save a picture of it.';
const DATA = '1.abc';

/** A promise with its resolve function, for holding an action pending. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
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

function setClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  });
}

/** The panel plus the global shortcuts, as in the app. */
function Harness(): JSX.Element {
  useKeyboardShortcuts();
  return <SharePanel />;
}

const shareButton = () => screen.getByRole('button', { name: 'Share' });
const panel = () => screen.queryByRole('dialog', { name: 'Share this plan' });

function openPanel(): void {
  fireEvent.click(shareButton());
}

let context2d: CanvasRenderingContext2D | null;

afterEach(() => {
  // Vitest globals are off, so Testing Library cannot register its own cleanup.
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'fonts');
});

beforeEach(() => {
  // Furnished, so the plan shared and drawn has the bed and desk in it.
  usePlanStore.getState().reset(furnishedDocument());
  useUiStore.getState().reset();
  vi.mocked(encodePlan).mockReset().mockResolvedValue(DATA);
  vi.mocked(canvasToPng).mockReset().mockResolvedValue(new Blob(['png']));
  vi.mocked(downloadBlob).mockReset();
  vi.mocked(captureView).mockReset().mockReturnValue(null);
  vi.mocked(drawPlanPicture).mockReset();
  context2d = {} as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context2d as unknown as ReturnType<HTMLCanvasElement['getContext']>,
  );
});

describe('SharePanel: opening and closing', () => {
  it('closed: only the Share button, collapsed, announcing a dialog', () => {
    const { container } = render(<SharePanel />);
    expect(container.children).toHaveLength(1);
    const share = shareButton();
    expect(share).toHaveAttribute('type', 'button');
    expect(share).toHaveAttribute('aria-expanded', 'false');
    expect(share).toHaveAttribute('aria-haspopup', 'dialog');
    expect(panel()).not.toBeInTheDocument();
  });

  it('a click opens the panel, expands the button and focuses Copy link', () => {
    render(<SharePanel />);
    openPanel();
    expect(panel()).toBeInTheDocument();
    expect(shareButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Download floor plan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download 3D view' })).toBeInTheDocument();
  });

  it('has an empty status area from the moment it opens', () => {
    render(<SharePanel />);
    openPanel();
    const status = screen.getByRole('status');
    expect(panel()).toContainElement(status);
    expect(status).toHaveTextContent('');
  });

  it('a second click on Share closes it', () => {
    render(<SharePanel />);
    openPanel();
    fireEvent.click(shareButton());
    expect(panel()).not.toBeInTheDocument();
    expect(shareButton()).toHaveAttribute('aria-expanded', 'false');
  });

  it('Escape closes it and returns focus to Share without reaching the global shortcuts', () => {
    render(<Harness />);
    act(() => useUiStore.getState().select('seed-desk'));
    openPanel();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Copy link' }), { key: 'Escape' });
    expect(panel()).not.toBeInTheDocument();
    expect(shareButton()).toHaveFocus();
    expect(useUiStore.getState().selectedId).toBe('seed-desk');

    // Closed, Escape passes through: the shortcuts are live in this harness.
    fireEvent.keyDown(shareButton(), { key: 'Escape' });
    expect(useUiStore.getState().selectedId).toBeNull();
  });

  it('Escape on the Share button while open also closes it without clearing the selection', () => {
    render(<Harness />);
    act(() => useUiStore.getState().select('seed-desk'));
    openPanel();
    fireEvent.keyDown(shareButton(), { key: 'Escape' });
    expect(panel()).not.toBeInTheDocument();
    expect(shareButton()).toHaveFocus();
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
  });

  it('a pointer down outside the panel and the button closes it; one inside does not', () => {
    render(
      <>
        <SharePanel />
        <p>elsewhere</p>
      </>,
    );
    openPanel();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Copy link' }));
    expect(panel()).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByText('elsewhere'));
    expect(panel()).not.toBeInTheDocument();
  });

  it('a pointer down on the Share button does not close it before the click does', () => {
    render(<SharePanel />);
    openPanel();
    fireEvent.pointerDown(shareButton());
    expect(panel()).toBeInTheDocument();
    fireEvent.click(shareButton());
    expect(panel()).not.toBeInTheDocument();
  });
});

describe('SharePanel: keys inside the panel', () => {
  /** Moves and selects the desk (so there is a step to undo), then opens the panel in the Harness. */
  function openWithDeskSelected(): void {
    clearHistory();
    render(<Harness />);
    act(() => {
      usePlanStore.getState().moveItemTo('seed-desk', 100, 100);
      useUiStore.getState().select('seed-desk');
    });
    expect(useHistoryStore.getState().canUndo).toBe(true);
    openPanel();
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
  }

  it.each([
    ['ArrowRight', { key: 'ArrowRight' }],
    ['Delete', { key: 'Delete' }],
    ['Backspace', { key: 'Backspace' }],
    ['r', { key: 'r' }],
    ['Cmd+Z', { key: 'z', metaKey: true }],
    ['Ctrl+Z', { key: 'z', ctrlKey: true }],
  ])('%s on Copy link does not reach the planner shortcuts', (_, init) => {
    openWithDeskSelected();
    const before = currentDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Copy link' }), init);
    expect(currentDocument()).toEqual(before);
    expect(useUiStore.getState().selectedId).toBe('seed-desk');
    expect(useHistoryStore.getState().canUndo).toBe(true);
    expect(panel()).toBeInTheDocument();
  });

  it('Tab still moves focus through the panel and reaches the page', async () => {
    openWithDeskSelected();
    const seen: string[] = [];
    const listen = (e: KeyboardEvent) => seen.push(e.key);
    window.addEventListener('keydown', listen);
    try {
      const user = userEvent.setup();
      await user.tab();
      expect(screen.getByRole('button', { name: 'Download floor plan' })).toHaveFocus();
      await user.tab({ shift: true });
      expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Copy link' }), { key: 'ArrowRight' });
    } finally {
      window.removeEventListener('keydown', listen);
    }
    expect(seen).toEqual(['Tab', 'Tab']);
  });

  it('the fallback link field still takes keys: arrows move the cursor, Ctrl+A selects all', async () => {
    setClipboard(undefined);
    openWithDeskSelected();
    const before = currentDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    const field = screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement;
    expect(field).toHaveFocus();
    const user = userEvent.setup();
    await user.keyboard('{ArrowLeft}{ArrowRight}{ArrowRight}');
    expect([field.selectionStart, field.selectionEnd]).toEqual([2, 2]);
    await user.keyboard('{Control>}a{/Control}');
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length]);
    expect(fireEvent.keyDown(field, { key: 'ArrowRight' })).toBe(true);
    expect(currentDocument()).toEqual(before);
    expect(panel()).toBeInTheDocument();
  });
});

describe('SharePanel: Copy link', () => {
  it('encodes the current document and copies its share address; reads Copied for 2000 ms', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard(writeText);
    render(<SharePanel />);
    openPanel();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(encodePlan).toHaveBeenCalledTimes(1);
    expect(vi.mocked(encodePlan).mock.calls[0]?.[0]).toEqual(currentDocument());
    expect(writeText).toHaveBeenCalledWith(shareUrl(DATA));
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('without navigator.clipboard: shows the link in a read-only field, focused and selected', async () => {
    setClipboard(undefined);
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    const field = screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement;
    expect(field.value).toBe(shareUrl(DATA));
    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });

  it('when writeText rejects: shows the fallback field holding the link', async () => {
    setClipboard(vi.fn(() => Promise.reject(new Error('denied'))));
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    const field = screen.getByRole('textbox', { name: 'Share link' }) as HTMLInputElement;
    expect(field.value).toBe(shareUrl(DATA));
    expect(field).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
  });

  it('when encodePlan gives null: the too-large message, nothing copied', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard(writeText);
    vi.mocked(encodePlan).mockResolvedValue(null);
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(TOO_LARGE);
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Share link' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
  });

  it('a second click while the copy is pending is ignored', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard(writeText);
    const pending = deferred<string | null>();
    vi.mocked(encodePlan).mockReturnValue(pending.promise);
    render(<SharePanel />);
    openPanel();
    const copy = screen.getByRole('button', { name: 'Copy link' });
    fireEvent.click(copy);
    fireEvent.click(copy);
    await flush();
    expect(encodePlan).toHaveBeenCalledTimes(1);
    pending.resolve(DATA);
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    // Settled: a new click copies again.
    fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
    await flush();
    expect(encodePlan).toHaveBeenCalledTimes(2);
  });

  it('unmounting with the Copied timer running clears it', async () => {
    setClipboard(vi.fn(() => Promise.resolve()));
    const { unmount } = render(<SharePanel />);
    openPanel();
    // Only setTimeout is faked, so the count is the component's own timers: jsdom starts a
    // setInterval of its own (focus fixup) when the focused button is removed on unmount.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('SharePanel: Download floor plan', () => {
  /** One conflict (the 38 in bed under a 36 in ceiling), in metric units. */
  function planWithConflict(): void {
    act(() => {
      usePlanStore.getState().setRoomHeight(36);
      usePlanStore.getState().setUnits('m');
    });
  }

  it('draws the current plan, units and conflicts on a canvas of the picture size and downloads room-plan.png', async () => {
    planWithConflict();
    const blob = new Blob(['plan']);
    vi.mocked(canvasToPng).mockResolvedValue(blob);
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Download floor plan' }));
    await flush();

    const s = usePlanStore.getState();
    const conflicts = findPlanIssues(s.items, s.room, s.openings, s.obstacles).conflicts;
    expect(Object.keys(conflicts)).not.toHaveLength(0);
    expect(drawPlanPicture).toHaveBeenCalledTimes(1);
    expect(drawPlanPicture).toHaveBeenCalledWith(context2d, {
      outline: s.room.outline,
      items: s.items,
      openings: s.openings,
      obstacles: s.obstacles,
      conflicts,
      units: 'm',
    });
    const canvas = vi.mocked(canvasToPng).mock.calls[0]?.[0];
    const size = planPictureSize(s.room.outline);
    expect(canvas?.width).toBe(size.width);
    expect(canvas?.height).toBe(size.height);
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'room-plan.png');
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('waits for document.fonts.ready before drawing when it exists', async () => {
    const ready = deferred<void>();
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: ready.promise } });
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Download floor plan' }));
    await flush();
    expect(drawPlanPicture).not.toHaveBeenCalled();
    ready.resolve();
    await flush();
    expect(drawPlanPicture).toHaveBeenCalledTimes(1);
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });

  it('with no 2D context: the could-not-be-made message, nothing drawn or downloaded', async () => {
    context2d = null;
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Download floor plan' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(NO_PICTURE);
    expect(drawPlanPicture).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('with a null blob: the could-not-be-made message, nothing downloaded', async () => {
    vi.mocked(canvasToPng).mockResolvedValue(null);
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Download floor plan' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(NO_PICTURE);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('a second click while the download is pending is ignored', async () => {
    const pending = deferred<Blob | null>();
    vi.mocked(canvasToPng).mockReturnValue(pending.promise);
    render(<SharePanel />);
    openPanel();
    const button = screen.getByRole('button', { name: 'Download floor plan' });
    fireEvent.click(button);
    await flush();
    fireEvent.click(button);
    await flush();
    expect(drawPlanPicture).toHaveBeenCalledTimes(1);
    pending.resolve(new Blob(['x']));
    await flush();
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });
});

describe('SharePanel: Download 3D view', () => {
  it('in the tabs layout on the 2D tab: greyed out with the reason shown, and a click does nothing', async () => {
    act(() => {
      useUiStore.getState().setLayout('tabs');
      useUiStore.getState().setTab('2d');
    });
    render(<SharePanel />);
    openPanel();
    const button = screen.getByRole('button', { name: 'Download 3D view' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(NO_3D_REASON)).toBeInTheDocument();
    fireEvent.click(button);
    await flush();
    expect(captureView).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it.each([
    ['inset', '2d'],
    ['split', '2d'],
    ['tabs', '3d'],
  ] as const)('in layout %s on tab %s it is active, with no reason shown', (layout, tab) => {
    act(() => {
      useUiStore.getState().setLayout(layout);
      useUiStore.getState().setTab(tab);
    });
    render(<SharePanel />);
    openPanel();
    expect(screen.getByRole('button', { name: 'Download 3D view' })).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText(NO_3D_REASON)).not.toBeInTheDocument();
  });

  it('captures the 3D view and downloads room-3d.png', async () => {
    const view = document.createElement('canvas');
    vi.mocked(captureView).mockReturnValue(view);
    const blob = new Blob(['3d']);
    vi.mocked(canvasToPng).mockResolvedValue(blob);
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Download 3D view' }));
    await flush();
    expect(captureView).toHaveBeenCalledTimes(1);
    expect(canvasToPng).toHaveBeenCalledWith(view);
    expect(downloadBlob).toHaveBeenCalledWith(blob, 'room-3d.png');
  });

  it('when captureView gives null: the could-not-be-made message', async () => {
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Download 3D view' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(NO_PICTURE);
    expect(canvasToPng).not.toHaveBeenCalled();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('with a null blob: the could-not-be-made message', async () => {
    vi.mocked(captureView).mockReturnValue(document.createElement('canvas'));
    vi.mocked(canvasToPng).mockResolvedValue(null);
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Download 3D view' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(NO_PICTURE);
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('a second click while the download is pending is ignored', async () => {
    vi.mocked(captureView).mockReturnValue(document.createElement('canvas'));
    const pending = deferred<Blob | null>();
    vi.mocked(canvasToPng).mockReturnValue(pending.promise);
    render(<SharePanel />);
    openPanel();
    const button = screen.getByRole('button', { name: 'Download 3D view' });
    fireEvent.click(button);
    fireEvent.click(button);
    await flush();
    expect(captureView).toHaveBeenCalledTimes(1);
    pending.resolve(new Blob(['x']));
    await flush();
    expect(downloadBlob).toHaveBeenCalledTimes(1);
  });
});

describe('SharePanel: an action that throws or rejects', () => {
  /** Spies on every console method, so a test can tell nothing was logged. */
  function watchConsole() {
    return (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m));
  }

  it('Copy link when encodePlan rejects: the too-large message, nothing logged, and a new click tries again', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard(writeText);
    vi.mocked(encodePlan).mockRejectedValue(new Error('encoder failed'));
    const logged = watchConsole();
    render(<SharePanel />);
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(TOO_LARGE);
    expect(writeText).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await flush();
    expect(encodePlan).toHaveBeenCalledTimes(2);
    logged.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it.each([
    ['drawPlanPicture throws', () => vi.mocked(drawPlanPicture).mockImplementation(() => { throw new Error('draw'); })],
    ['canvasToPng rejects', () => vi.mocked(canvasToPng).mockRejectedValue(new Error('png'))],
    ['downloadBlob throws', () => vi.mocked(downloadBlob).mockImplementation(() => { throw new Error('save'); })],
  ])('Download floor plan when %s: the could-not-be-made message, nothing logged, and a new click tries again',
    async (_, fail) => {
      fail();
      const logged = watchConsole();
      render(<SharePanel />);
      openPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Download floor plan' }));
      await flush();
      expect(screen.getByRole('status')).toHaveTextContent(NO_PICTURE);
      fireEvent.click(screen.getByRole('button', { name: 'Download floor plan' }));
      await flush();
      expect(drawPlanPicture).toHaveBeenCalledTimes(2);
      logged.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    });

  it.each([
    ['captureView throws', () => vi.mocked(captureView).mockImplementation(() => { throw new Error('capture'); })],
    ['canvasToPng rejects', () => {
      vi.mocked(captureView).mockReturnValue(document.createElement('canvas'));
      vi.mocked(canvasToPng).mockRejectedValue(new Error('png'));
    }],
  ])('Download 3D view when %s: the could-not-be-made message, nothing logged, and a new click tries again',
    async (_, fail) => {
      fail();
      const logged = watchConsole();
      render(<SharePanel />);
      openPanel();
      fireEvent.click(screen.getByRole('button', { name: 'Download 3D view' }));
      await flush();
      expect(screen.getByRole('status')).toHaveTextContent(NO_PICTURE);
      expect(downloadBlob).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Download 3D view' }));
      await flush();
      expect(captureView).toHaveBeenCalledTimes(2);
      logged.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    });
});
