import type { JSX } from 'react';
import type { LayoutMode, StageTab } from '../domain/types';
import { useConflicts } from '../state/selectors';
import { useUiStore } from '../state/uiStore';
import { Segmented, type SegmentedOption } from './ui/Segmented';
import '../styles/app.css';

const LAYOUT_OPTIONS: readonly SegmentedOption<LayoutMode>[] = [
  { value: 'inset', label: '3D + plan inset' },
  { value: 'split', label: 'Side by side' },
  { value: 'tabs', label: 'Tabs' },
];

const TAB_OPTIONS: readonly SegmentedOption<StageTab>[] = [
  { value: '2d', label: '2D plan' },
  { value: '3d', label: '3D check' },
];

/** "1 conflict" / "N conflicts". */
function conflictText(count: number): string {
  return count === 1 ? '1 conflict' : `${count} conflicts`;
}

/**
 * The bar above the stage: layout control, the 2D/3D tab control (tabs layout only) and the
 * placement status tag. Prototype lines 117–132.
 */
export function TopBar(): JSX.Element {
  const layout = useUiStore((s) => s.layout);
  const setLayout = useUiStore((s) => s.setLayout);
  const tab = useUiStore((s) => s.tab);
  const setTab = useUiStore((s) => s.setTab);
  const conflictCount = Object.keys(useConflicts()).length;

  return (
    <div className="top-bar">
      <Segmented<LayoutMode> name="layout" aria-label="Layout" value={layout} options={LAYOUT_OPTIONS} onChange={setLayout} />
      {layout === 'tabs' && (
        <Segmented<StageTab>
          name="view"
          aria-label="View"
          className="top-bar-tabs"
          value={tab}
          options={TAB_OPTIONS}
          onChange={setTab}
        />
      )}
      {conflictCount === 0 ? (
        <span className="tag tag-accent">Everything fits</span>
      ) : (
        <span className="tag tag-conflict">{conflictText(conflictCount)}</span>
      )}
    </div>
  );
}
