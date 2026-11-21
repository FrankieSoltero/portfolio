import { type JSX, useEffect, useId, useState } from 'react';
import { CONFIG } from '../../config';
import { KIND_LABELS, KIND_ORDER } from '../../domain/furniture/recipe';
import type { Kind, ProductPreview } from '../../domain/types';
import { addPreviewToRoom, dismissLookup, updatePreview } from '../../state/actions';
import { useUiStore } from '../../state/uiStore';
import { disposePreviewRenderer, renderPieceSnapshot } from '../../three/previewSnapshot';
import { DimInput } from './DimInput';
import './sidebar.css';
import './addFurniture.css';

/** How long the piece must stay unchanged before its snapshot is drawn again, in milliseconds. */
const SNAPSHOT_DEBOUNCE_MS = 150;

/** The stored kind whose value is `value`, or null for any other text. */
function kindOf(value: string): Kind | null {
  return KIND_ORDER.find((k) => k === value) ?? null;
}

/** A US-dollar price: whole dollars as `$1,299`, otherwise with cents as `$319.99`. */
function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
  }).format(price);
}

/**
 * A still picture of the piece as the planner draws it, as a data URL, or null until one is drawn
 * or when none can be. It is drawn 150 ms after the kind, sizes, style or colours last changed, and
 * the shared preview renderer is released when the card goes away.
 */
function usePieceSnapshot({ kind, w, d, h, style, colours }: ProductPreview): string | null {
  const [snapshot, setSnapshot] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSnapshot(renderPieceSnapshot({ id: 'preview', kind, w, d, h, style, colours }));
    }, SNAPSHOT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [kind, w, d, h, style, colours]);

  useEffect(() => () => disposePreviewRenderer(), []);

  return snapshot;
}

/**
 * The looked-up product before it is placed, under the link box in sidebar section 02: the shop's
 * photo, the name, shop host and price, a picture of the piece as the planner will draw it, and its
 * type and sizes, which can be corrected first. All product text is shown as plain text; the only
 * address used is the photo's, which the lookup has limited to the shops' photo hosts. A photo that
 * fails to load is left out. In room-edit mode Add to room is disabled, like the type buttons.
 */
export function ProductPreviewCard({ preview }: { preview: ProductPreview }): JSX.Element {
  const typeId = useId();
  const typeNoteId = useId();
  const roomMode = useUiStore((s) => s.mode === 'room');
  const snapshot = usePieceSnapshot(preview);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [seenImageUrl, setSeenImageUrl] = useState(preview.imageUrl);
  const range = { min: CONFIG.itemDimMin, max: CONFIG.itemDimMax };

  // Adjust state during render (not in an effect): a new photo address gets a fresh try.
  if (seenImageUrl !== preview.imageUrl) {
    setSeenImageUrl(preview.imageUrl);
    setPhotoFailed(false);
  }

  return (
    <div className="product-card">
      {preview.imageUrl !== null && !photoFailed && (
        <img
          className="product-card-photo"
          src={preview.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
        />
      )}
      <p>
        <strong>{preview.name}</strong>
      </p>
      <p className="note">{preview.host}</p>
      {preview.price !== null && <p>{formatPrice(preview.price)}</p>}
      {snapshot !== null && <img className="product-card-snapshot" src={snapshot} alt="Preview of the piece" />}
      <div className="field">
        <label htmlFor={typeId}>Type</label>
        <select
          id={typeId}
          className={preview.kindFound ? 'input' : 'input is-attention'}
          aria-describedby={preview.kindFound ? undefined : typeNoteId}
          value={preview.kind}
          onChange={(e) => {
            const kind = kindOf(e.target.value);
            if (kind !== null) updatePreview({ kind });
          }}
        >
          {KIND_ORDER.map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        {!preview.kindFound && (
          <p id={typeNoteId} className="note">
            Type not recognised: pick one.
          </p>
        )}
      </div>
      <div className="field-grid-3 product-card-dims">
        <DimInput label="Width" stored={preview.w} {...range} onValue={(w) => updatePreview({ w })} />
        <DimInput label="Depth" stored={preview.d} {...range} onValue={(d) => updatePreview({ d })} />
        <DimInput label="Height" stored={preview.h} {...range} onValue={(h) => updatePreview({ h })} />
      </div>
      {!preview.sizesFound && <p className="note">Sizes not found: check these.</p>}
      {preview.sizeNote !== null && <p className="note">{preview.sizeNote}</p>}
      <div className="product-card-actions">
        <button type="button" className="btn" disabled={roomMode} onClick={() => addPreviewToRoom()}>
          Add to room
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => dismissLookup()}>
          Cancel
        </button>
      </div>
    </div>
  );
}
