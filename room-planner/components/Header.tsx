import type { Units } from '../domain/types';
import { usePlanStore } from '../state/planStore';
import { Segmented, type SegmentedOption } from './ui/Segmented';
import './Sidebar/sidebar.css';

const UNIT_OPTIONS: readonly SegmentedOption<Units>[] = [
  { value: 'ft', label: 'ft / in' },
  { value: 'm', label: 'm / cm' },
];

/** Top navigation bar: brand and the units toggle. Changing units never changes stored lengths. */
export function Header() {
  const units = usePlanStore((s) => s.units);
  const setUnits = usePlanStore((s) => s.setUnits);
  return (
    <header className="nav app-header">
      <span className="nav-brand">Room planner</span>
      <span className="note">Units</span>
      <Segmented<Units> name="units" aria-label="Units" value={units} options={UNIT_OPTIONS} onChange={setUnits} />
    </header>
  );
}
