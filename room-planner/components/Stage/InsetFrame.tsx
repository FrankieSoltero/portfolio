import type { JSX } from 'react';
import { BlueprintCorners } from '../ui/BlueprintCorners';
import './stage.css';

/**
 * Decoration for whichever stage pane is the small inset: corner marks, the pane label
 * top-left and a Swap button top-right. The button stops pointerdown so pressing it does
 * not reach the pane underneath (deselect, orbit). Ported from prototype lines 137–141.
 */
export function InsetFrame({ label, onSwap }: { label: 'Plan' | '3D'; onSwap: () => void }): JSX.Element {
  return (
    <div className="blueprint inset-frame">
      <BlueprintCorners />
      <span className="inset-label">{label}</span>
      <button
        type="button"
        className="btn btn-secondary inset-swap"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onSwap}
      >
        Swap
      </button>
    </div>
  );
}
