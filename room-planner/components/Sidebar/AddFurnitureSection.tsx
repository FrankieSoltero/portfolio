import type { JSX } from 'react';
import { KIND_LABELS, KIND_ORDER } from '../../domain/furniture/recipe';
import { addFurnitureOfKind } from '../../state/actions';
import { useUiStore } from '../../state/uiStore';
import { ProductLinkBox } from './ProductLinkBox';
import { ProductPreviewCard } from './ProductPreviewCard';
import './sidebar.css';
import './addFurniture.css';

/**
 * Sidebar section 02: the product link box, the looked-up product's preview card while one is
 * shown, then one button per kind of furniture, in KIND_ORDER. A click adds a piece of that kind at
 * its typical size and selects it. In room-edit mode the buttons are disabled, since furniture
 * cannot be selected there.
 */
export function AddFurnitureSection(): JSX.Element {
  const roomMode = useUiStore((s) => s.mode === 'room');
  const lookup = useUiStore((s) => s.lookup);

  return (
    <section className="sidebar-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">02</span>
        <span>Add furniture</span>
      </h6>
      <ProductLinkBox />
      {lookup.status === 'preview' && <ProductPreviewCard preview={lookup.preview} />}
      <p className="note add-furniture-note">Pick a type. You can change its size, style and colours after it is placed.</p>
      <div className="add-furniture-kinds">
        {KIND_ORDER.map((kind) => (
          <button
            key={kind}
            type="button"
            className="btn btn-secondary"
            disabled={roomMode}
            onClick={() => addFurnitureOfKind(kind)}
          >
            {KIND_LABELS[kind]}
          </button>
        ))}
      </div>
    </section>
  );
}
