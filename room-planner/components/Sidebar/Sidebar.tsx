import type { JSX } from 'react';
import type { PlanStore } from '../../services/planStorage';
import type { ProductLookup } from '../../services/productLookup';
import { AddFurnitureSection } from './AddFurnitureSection';
import { ItemList } from './ItemList';
import { PlanSection } from './PlanSection';
import { RoomSection } from './RoomSection';
import './sidebar.css';

/** The workspace sidebar: room size, add-from-link, the items in the room, then the saved plan. */
export function Sidebar({ lookup, planStore }: { lookup: ProductLookup; planStore: PlanStore }): JSX.Element {
  return (
    <aside className="sidebar">
      <RoomSection />
      <AddFurnitureSection lookup={lookup} />
      <ItemList />
      <PlanSection planStore={planStore} />
    </aside>
  );
}
