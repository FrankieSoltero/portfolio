import type { JSX } from 'react';
import type { PlanStore } from '../../services/planStorage';
import { AddFurnitureSection } from './AddFurnitureSection';
import { ItemList } from './ItemList';
import { PlanSection } from './PlanSection';
import { RoomSection } from './RoomSection';
import './sidebar.css';

/** The workspace sidebar: room size, add furniture by type, the items in the room, then the saved plan. */
export function Sidebar({ planStore }: { planStore: PlanStore }): JSX.Element {
  return (
    <aside className="sidebar">
      <RoomSection />
      <AddFurnitureSection />
      <ItemList />
      <PlanSection planStore={planStore} />
    </aside>
  );
}
