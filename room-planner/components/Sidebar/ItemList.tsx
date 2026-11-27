import { Fragment, useEffect, useRef, type JSX } from 'react';
import { fmtFurnDims, fmtMoney } from '../../domain/units';
import { usePlanStore } from '../../state/planStore';
import { totalPrice, useConflicts, useWarnings } from '../../state/selectors';
import { useUiStore } from '../../state/uiStore';
import { ItemEditor } from './ItemEditor';
import './sidebar.css';
import './itemList.css';

/**
 * Sidebar section 03: one selectable row per placed item (name, price, dimensions and any
 * placement conflict, or else any warning such as covering a window), then the total of known prices. Each row is a real button, so it is
 * the keyboard route for selecting an item. In furnish mode the selected row is followed by the
 * piece's editor (ItemEditor), and the row is marked expanded. When the selection changes, as when
 * a piece is added, the selected row is scrolled into view without taking focus.
 */
export function ItemList(): JSX.Element {
  const items = usePlanStore((s) => s.items);
  const units = usePlanStore((s) => s.units);
  const selectedId = useUiStore((s) => s.selectedId);
  const select = useUiStore((s) => s.select);
  const roomMode = useUiStore((s) => s.mode === 'room');
  const conflicts = useConflicts();
  const warnings = useWarnings();
  const listRef = useRef<HTMLDivElement>(null);

  // Only on a change of selection, not on every render. jsdom and some old browsers lack scrollIntoView.
  useEffect(() => {
    if (selectedId === null) return;
    const row = listRef.current?.querySelector<HTMLElement>('.item-row-selected');
    if (row && typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  return (
    <section className="sidebar-section item-list-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">03</span>
        <span>In this room</span>
      </h6>
      {items.length === 0 && <div className="text-muted item-list-empty">Nothing placed yet.</div>}
      <div className="item-list" ref={listRef}>
        {items.map((item) => {
          const selected = item.id === selectedId;
          const editing = selected && !roomMode;
          const conflict = conflicts[item.id];
          // A conflict is the row's only tag; a warning shows only when there is none.
          const warning = conflict === undefined ? warnings[item.id] : undefined;
          return (
            <Fragment key={item.id}>
              <button
                type="button"
                className={selected ? 'item-row item-row-selected' : 'item-row'}
                aria-pressed={selected}
                aria-expanded={editing ? 'true' : undefined}
                onClick={() => select(item.id)}
              >
                <span className="item-row-name">{item.name}</span>
                <span className="item-row-price">{fmtMoney(item.price)}</span>
                <span className="text-muted item-row-dims">{fmtFurnDims(item, units)}</span>
                {conflict !== undefined && <span className="tag item-row-conflict">{conflict}</span>}
                {warning !== undefined && <span className="tag item-row-warning">{warning}</span>}
              </button>
              {/* Keyed by the piece, so its drafts start afresh when another is selected. */}
              {editing && <ItemEditor key={item.id} item={item} />}
            </Fragment>
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
