/**
 * The stage: measures itself and positions the 2D plan pane and the 3D pane for the current
 * layout (inset, split or tabs). Owns the inset decoration and swap, the render-style control
 * and the WebGL fallback to the blueprint view. Ported from prototype lines 134–196 and 673–675.
 */
import { Component, Suspense, lazy, type JSX, type ReactNode } from 'react';
import type { RenderStyle } from '../../domain/types';
import { useElementSize } from '../../hooks/useElementSize';
import { useUiStore } from '../../state/uiStore';
import { computePanes, type PaneRect } from '../../view/panes';
import { Segmented, type SegmentedOption } from '../ui/Segmented';
import { BlueprintView } from './BlueprintView';
import { InsetFrame } from './InsetFrame';
import { PlanView } from './PlanView';
import './stageShell.css';

// three.js is only fetched when the realistic view is first shown.
const ThreeView = lazy(() => import('./ThreeView'));

const WEBGL_NOTE = "3D rendering isn't available in this browser. Showing the blueprint view.";

/**
 * Catches a failure of the realistic 3D view (for example a WebGL context that cannot be
 * created), records it in the UI store and renders nothing; the stage then shows the
 * blueprint view because `webglAvailable` is false.
 */
class ThreeErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(): void {
    useUiStore.getState().markWebglUnavailable();
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Absolutely positioned pane container whose box is exactly the `PaneRect`. */
function Pane({ which, pane, children }: { which: 'plan' | 'three'; pane: PaneRect; children: ReactNode }): JSX.Element {
  const className = ['pane', pane.inset && 'pane-inset', pane.divider && 'pane-divider'].filter(Boolean).join(' ');
  return (
    <div
      className={className}
      data-pane={which}
      style={{ left: pane.left, top: pane.top, width: pane.w, height: pane.h, zIndex: pane.z }}
    >
      {children}
    </div>
  );
}

/** Realistic | Blueprint switch for the main 3D pane; `value` is the style actually shown. */
function RenderStyleControl({ value, webglAvailable }: { value: RenderStyle; webglAvailable: boolean }): JSX.Element {
  const setRenderStyle = useUiStore((s) => s.setRenderStyle);
  const options: SegmentedOption<RenderStyle>[] = [
    { value: 'realistic', label: 'Realistic', disabled: !webglAvailable },
    { value: 'blueprint', label: 'Blueprint' },
  ];
  return (
    <div className="render-style">
      <Segmented<RenderStyle>
        name="render"
        aria-label="Render style"
        value={value}
        options={options}
        onChange={setRenderStyle}
      />
      {!webglAvailable && (
        <p className="webgl-note" role="status">
          {WEBGL_NOTE}
        </p>
      )}
    </div>
  );
}

export function Stage(): JSX.Element {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const layout = useUiStore((s) => s.layout);
  const tab = useUiStore((s) => s.tab);
  const insetSwapped = useUiStore((s) => s.insetSwapped);
  const renderStyle = useUiStore((s) => s.renderStyle);
  const webglAvailable = useUiStore((s) => s.webglAvailable);
  const toggleInsetSwap = useUiStore((s) => s.toggleInsetSwap);

  const { plan, three } = computePanes(size.width, size.height, layout, tab, insetSwapped);
  const realistic = renderStyle === 'realistic' && webglAvailable;

  return (
    <div className="stage" ref={ref}>
      {plan && (
        <Pane which="plan" pane={plan}>
          <PlanView pane={plan} />
          {plan.inset && <InsetFrame label="Plan" onSwap={toggleInsetSwap} />}
        </Pane>
      )}
      {three && (
        <Pane which="three" pane={three}>
          {realistic ? (
            <Suspense fallback={null}>
              <ThreeErrorBoundary>
                <ThreeView pane={three} />
              </ThreeErrorBoundary>
            </Suspense>
          ) : (
            <BlueprintView pane={three} />
          )}
          {three.inset ? (
            <InsetFrame label="3D" onSwap={toggleInsetSwap} />
          ) : (
            <RenderStyleControl value={realistic ? 'realistic' : 'blueprint'} webglAvailable={webglAvailable} />
          )}
        </Pane>
      )}
    </div>
  );
}
