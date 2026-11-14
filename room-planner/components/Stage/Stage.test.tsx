import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import type { PaneRect } from '../../view/panes';
import { Stage } from './Stage';

// The 3D views draw on canvases jsdom cannot provide; stand-ins render a marker that echoes
// the pane they were given. `throwOnRender` makes the realistic stand-in fail like a WebGL error.
const stubControl = vi.hoisted(() => ({ throwOnRender: false }));

vi.mock('./ThreeView', () => ({
  default: ({ pane }: { pane: PaneRect }): JSX.Element => {
    if (stubControl.throwOnRender) throw new Error('WebGL context lost');
    return <div data-testid="realistic-marker" data-w={pane.w} data-h={pane.h} />;
  },
}));

vi.mock('./BlueprintView', () => ({
  BlueprintView: ({ pane }: { pane: PaneRect }): JSX.Element => (
    <div data-testid="blueprint-marker" data-w={pane.w} data-h={pane.h} />
  ),
}));

/** ResizeObserver stand-in that remembers each observed element and its callback. */
const observers: { el: Element; cb: ResizeObserverCallback; self: ResizeObserver }[] = [];
class RecordingResizeObserver implements ResizeObserver {
  private readonly cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(el: Element): void {
    observers.push({ el, cb: this.cb, self: this });
  }
  unobserve(): void {}
  disconnect(): void {}
}

/** Gives the observed stage root a client size and fires its ResizeObserver. */
function resizeStage(width: number, height: number): void {
  const entry = observers.find((o) => o.el.classList.contains('stage'));
  if (!entry) throw new Error('the stage root is not observed');
  Object.defineProperty(entry.el, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(entry.el, 'clientHeight', { configurable: true, value: height });
  act(() => entry.cb([], entry.self));
}

function paneEl(container: HTMLElement, which: 'plan' | 'three'): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-pane="${which}"]`);
}

function mustPane(container: HTMLElement, which: 'plan' | 'three'): HTMLElement {
  const el = paneEl(container, which);
  if (!el) throw new Error(`no ${which} pane rendered`);
  return el;
}

function box(el: HTMLElement): Record<string, string> {
  const s = el.style;
  return { left: s.left, top: s.top, width: s.width, height: s.height, zIndex: s.zIndex };
}

/** Renders the stage at the given size and waits for the lazy 3D chunk when it is shown. */
async function renderStage(width = 1000, height = 600) {
  const utils = render(<Stage />);
  resizeStage(width, height);
  const ui = useUiStore.getState();
  const threeShown = ui.layout !== 'tabs' || ui.tab === '3d';
  if (threeShown && ui.renderStyle === 'realistic' && ui.webglAvailable) {
    await screen.findByTestId('realistic-marker');
  }
  return utils;
}

beforeEach(() => {
  usePlanStore.getState().reset();
  useUiStore.getState().reset();
  stubControl.throwOnRender = false;
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', RecordingResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Stage', () => {
  it('Lazy 3D: the Suspense fallback is empty and the plan pane is present before the chunk resolves', async () => {
    vi.resetModules();
    const fresh = await import('./Stage');
    const { container } = render(<fresh.Stage />);
    expect(mustPane(container, 'plan').querySelector('.plan-view')).not.toBeNull();
    const three = mustPane(container, 'three');
    expect(within(three).queryByTestId('realistic-marker')).toBeNull();
    // Only the render-style control: the fallback itself renders nothing.
    expect([...three.children].filter((c) => !c.classList.contains('render-style'))).toHaveLength(0);
    expect(await within(three).findByTestId('realistic-marker')).toBeInTheDocument();
  });

  it('Inset placement: the plan is a 360×264 inset at 624,320 and the 3D pane fills the stage', async () => {
    const { container } = await renderStage(1000, 600);
    expect(box(mustPane(container, 'plan'))).toEqual({
      left: '624px', top: '320px', width: '360px', height: '264px', zIndex: '8',
    });
    expect(box(mustPane(container, 'three'))).toEqual({
      left: '0px', top: '0px', width: '1000px', height: '600px', zIndex: '1',
    });
    const marker = screen.getByTestId('realistic-marker');
    expect(marker).toHaveAttribute('data-w', '1000');
    expect(marker).toHaveAttribute('data-h', '600');
  });

  it('Inset pane style: the inset has class pane-inset and an InsetFrame labelled Plan', async () => {
    const { container } = await renderStage();
    const plan = mustPane(container, 'plan');
    const three = mustPane(container, 'three');
    expect(plan).toHaveClass('pane', 'pane-inset');
    expect(three).not.toHaveClass('pane-inset');
    const frame = plan.querySelector('.inset-frame');
    expect(frame).not.toBeNull();
    expect(frame).toHaveTextContent('Plan');
    expect(within(plan).getByRole('button', { name: 'Swap' })).toBeInTheDocument();
    expect(three.querySelector('.inset-frame')).toBeNull();
  });

  it('Swap: clicking Swap makes the 3D pane the inset labelled 3D and keeps the selection', async () => {
    useUiStore.getState().select('seed-bed');
    const { container } = await renderStage();
    await userEvent.setup().click(within(mustPane(container, 'plan')).getByRole('button', { name: 'Swap' }));
    expect(useUiStore.getState().insetSwapped).toBe(true);
    expect(useUiStore.getState().selectedId).toBe('seed-bed');
    const three = mustPane(container, 'three');
    const plan = mustPane(container, 'plan');
    expect(three).toHaveClass('pane-inset');
    expect(three.querySelector('.inset-frame')).toHaveTextContent('3D');
    expect(plan).not.toHaveClass('pane-inset');
    expect(plan.querySelector('.inset-frame')).toBeNull();
    expect(box(three)).toEqual({ left: '624px', top: '320px', width: '360px', height: '264px', zIndex: '8' });
    expect(box(plan)).toEqual({ left: '0px', top: '0px', width: '1000px', height: '600px', zIndex: '1' });
  });

  it('Split: at width 1001 the plan is 0..500 and the 3D pane 500..1001 with a divider', async () => {
    useUiStore.getState().setLayout('split');
    const { container } = await renderStage(1001, 600);
    const plan = mustPane(container, 'plan');
    const three = mustPane(container, 'three');
    expect(plan.style.left).toBe('0px');
    expect(plan.style.width).toBe('500px');
    expect(three.style.left).toBe('500px');
    expect(three.style.width).toBe('501px');
    expect(three).toHaveClass('pane-divider');
    expect(plan).not.toHaveClass('pane-divider');
    expect(container.querySelector('.inset-frame')).toBeNull();
  });

  it('Tabs: tab 2d shows only the plan pane and tab 3d only the 3D pane', async () => {
    useUiStore.getState().setLayout('tabs');
    const { container } = await renderStage();
    expect(paneEl(container, 'plan')).not.toBeNull();
    expect(paneEl(container, 'three')).toBeNull();
    expect(screen.queryByTestId('realistic-marker')).toBeNull();

    act(() => useUiStore.getState().setTab('3d'));
    expect(paneEl(container, 'plan')).toBeNull();
    const three = mustPane(container, 'three');
    expect(box(three)).toEqual({ left: '0px', top: '0px', width: '1000px', height: '600px', zIndex: '1' });
    expect(await within(three).findByTestId('realistic-marker')).toBeInTheDocument();
  });

  it('Render control shown: the main 3D pane has Realistic | Blueprint with Realistic checked', async () => {
    const { container } = await renderStage();
    const group = within(mustPane(container, 'three')).getByRole('radiogroup', { name: 'Render style' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')?.textContent)).toEqual(['Realistic', 'Blueprint']);
    expect(within(group).getByRole('radio', { name: 'Realistic' })).toBeChecked();
    expect(within(group).getByRole('radio', { name: 'Blueprint' })).not.toBeChecked();
  });

  it('Render control hidden: no control when the 3D pane is the inset', async () => {
    useUiStore.getState().toggleInsetSwap();
    await renderStage();
    expect(screen.queryByRole('radiogroup', { name: 'Render style' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Realistic' })).toBeNull();
  });

  it('Style switch: choosing Blueprint shows the blueprint view instead of the realistic one', async () => {
    await renderStage();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Blueprint' }));
    expect(useUiStore.getState().renderStyle).toBe('blueprint');
    const marker = screen.getByTestId('blueprint-marker');
    expect(marker).toHaveAttribute('data-w', '1000');
    expect(screen.queryByTestId('realistic-marker')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Blueprint' })).toBeChecked();
  });

  it('WebGL unavailable: blueprint shown, Realistic disabled and the fallback note announced', async () => {
    useUiStore.getState().markWebglUnavailable();
    await renderStage();
    expect(screen.getByTestId('blueprint-marker')).toBeInTheDocument();
    expect(screen.queryByTestId('realistic-marker')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Realistic' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      "3D rendering isn't available in this browser. Showing the blueprint view.",
    );
  });

  it('WebGL unavailable: the blueprint is shown and checked even if renderStyle is still realistic', async () => {
    useUiStore.setState({ webglAvailable: false });
    expect(useUiStore.getState().renderStyle).toBe('realistic');
    await renderStage();
    expect(screen.getByTestId('blueprint-marker')).toBeInTheDocument();
    expect(screen.queryByTestId('realistic-marker')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Blueprint' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Realistic' })).not.toBeChecked();
  });

  it('WebGL available: no fallback note', async () => {
    await renderStage();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Realistic' })).toBeEnabled();
  });

  it('Error boundary: a throwing ThreeView marks WebGL unavailable and falls back to the blueprint', async () => {
    // React reports the caught error through console.error; expected here, so silenced.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = useUiStore.getState().markWebglUnavailable;
    const markSpy = vi.fn(original);
    useUiStore.setState({ markWebglUnavailable: markSpy });
    try {
      stubControl.throwOnRender = true;
      render(<Stage />);
      resizeStage(1000, 600);
      expect(await screen.findByTestId('blueprint-marker')).toBeInTheDocument();
      expect(markSpy).toHaveBeenCalledTimes(1);
      expect(useUiStore.getState().webglAvailable).toBe(false);
      expect(screen.queryByTestId('realistic-marker')).toBeNull();
      expect(screen.getByRole('status')).toBeInTheDocument();
    } finally {
      useUiStore.setState({ markWebglUnavailable: original });
      errorSpy.mockRestore();
    }
  });

  it('Resize: pane styles are recomputed from the new stage size', async () => {
    const { container } = await renderStage(1000, 600);
    resizeStage(500, 400);
    // iw = clamp(180, 220, 380) = 220; ih = clamp(176, 200, 320) = 200.
    expect(box(mustPane(container, 'plan'))).toEqual({
      left: '264px', top: '184px', width: '220px', height: '200px', zIndex: '8',
    });
    expect(box(mustPane(container, 'three'))).toEqual({
      left: '0px', top: '0px', width: '500px', height: '400px', zIndex: '1',
    });
    expect(screen.getByTestId('realistic-marker')).toHaveAttribute('data-w', '500');
  });
});
