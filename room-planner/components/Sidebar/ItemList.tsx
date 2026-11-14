import type { JSX } from 'react';
import { fmtFurnDims, fmtMoney } from '../../domain/units';
import { usePlanStore } from '../../state/planStore';
import { totalPrice, useConflicts } from '../../state/selectors';
import { useUiStore } from '../../state/uiStore';
import './sidebar.css';
import './itemList.css';

/**
 * Sidebar section 03: one selectable row per placed item (name, price, dimensions and any
 * placement conflict), then the total of known prices. Each row is a real button, so it is
 * the keyboard route for selecting an item.
 */
export function ItemList(): JSX.Element {
  const items = usePlanStore((s) => s.items);
  const units = usePlanStore((s) => s.units);
  const selectedId = useUiStore((s) => s.selectedId);
  const select = useUiStore((s) => s.select);
  const conflicts = useConflicts();

  return (
    <section className="sidebar-section item-list-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">03</span>
        <span>In this room</span>
      </h6>
      {items.length === 0 && <div className="text-muted item-list-empty">Nothing placed yet.</div>}
      <div className="item-list">
        {items.map((item) => {
          const selected = item.id === selectedId;
          const conflict = conflicts[item.id];
          return (
            <button
              key={item.id}
              type="button"
              className={selected ? 'item-row item-row-selected' : 'item-row'}
              aria-pressed={selected}
              onClick={() => select(item.id)}
            >
              <span className="item-row-name">{item.name}</span>
              <span className="item-row-price">{fmtMoney(item.price)}</span>
              <span className="text-muted item-row-dims">{fmtFurnDims(item, units)}</span>
              {conflict !== undefined && <span className="tag item-row-conflict">{conflict}</span>}
            </button>
          );
        })}
      </div>
      <div className="item-list-total">
        <span className="text-muted">Total, nothing bought yet</span>
        <span className="item-list-total-value">{fmtMoney(totalPrice(items))}</span>
      </div>
    </section>
  );
}
