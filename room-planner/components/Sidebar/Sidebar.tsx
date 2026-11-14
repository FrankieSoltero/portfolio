import type { JSX } from 'react';
import type { ProductLookup } from '../../services/productLookup';
import { AddFurnitureSection } from './AddFurnitureSection';
import { ItemList } from './ItemList';
import { RoomSection } from './RoomSection';
import './sidebar.css';

/** The workspace sidebar: room size, add-from-link, then the items in the room. */
export function Sidebar({ lookup }: { lookup: ProductLookup }): JSX.Element {
  return (
    <aside className="sidebar">
      <RoomSection />
      <AddFurnitureSection lookup={lookup} />
      <ItemList />
    </aside>
  );
}
