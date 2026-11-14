import { type ChangeEvent, type JSX, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import type { ProductPreview } from '../../domain/types';
import { fmtMoney, furnInputStr, furnUnitLabel, parseFurnInput } from '../../domain/units';
import { SAMPLE_LINKS } from '../../services/mockProductLookup';
import {
  LOOKUP_MESSAGES,
  LookupError,
  parseProductUrl,
  type LookupErrorCode,
  type ProductLookup,
} from '../../services/productLookup';
import { placePreview } from '../../state/actions';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { BlueprintCorners } from '../ui/BlueprintCorners';
import './sidebar.css';
import './addFurniture.css';

type DimAxis = 'w' | 'd' | 'h';

/** A draft within this many inches of the stored value still counts as showing it. */
const DRAFT_TOLERANCE_IN = 0.01;

const DIM_FIELDS: readonly { axis: DimAxis; label: string }[] = [
  { axis: 'w', label: 'Width' },
  { axis: 'd', label: 'Depth' },
  { axis: 'h', label: 'Height' },
];

const SAMPLES: readonly { label: string; url: string }[] = [
  { label: 'Sofa', url: SAMPLE_LINKS.sofa },
  { label: 'Bookshelf', url: SAMPLE_LINKS.shelf },
  { label: 'Page without sizes', url: SAMPLE_LINKS.unknown },
];

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError';
}

/**
 * One preview dimension input. The input shows exactly what the user typed; the preview is
 * updated only when the text parses to an in-range length. The draft is re-seeded when units
 * change, or when the stored value changes to something the draft does not show.
 */
function PreviewDimInput({ axis, label, stored }: { axis: DimAxis; label: string; stored: number }) {
  const id = useId();
  const units = usePlanStore((s) => s.units);
  const updatePreviewDim = useUiStore((s) => s.updatePreviewDim);
  const [draft, setDraft] = useState(() => furnInputStr(stored, units));
  const [seen, setSeen] = useState({ units, stored });

  // Adjust state during render (not in an effect) so the input never shows a stale draft.
  if (seen.units !== units || seen.stored !== stored) {
    const parsed = parseFurnInput(draft, units);
    const draftShowsStored = parsed !== null && Math.abs(parsed - stored) <= DRAFT_TOLERANCE_IN;
    if (seen.units !== units || !draftShowsStored) setDraft(furnInputStr(stored, units));
    setSeen({ units, stored });
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDraft(raw);
    const inches = parseFurnInput(raw, units);
    if (inches !== null) updatePreviewDim(axis, inches);
  }

  return (
    <div className="field">
      <label htmlFor={id}>
        {label} ({furnUnitLabel(units)})
      </label>
      <input id={id} className="input" type="number" value={draft} onChange={onChange} />
    </div>
  );
}

/** The looked-up product: photo placeholder, source, name, price, model source and editable size. */
function PreviewCard({
  product,
  onPlace,
  onDiscard,
}: {
  product: ProductPreview;
  onPlace(): void;
  onDiscard(): void;
}) {
  return (
    <div className="card blueprint lookup-preview">
      <BlueprintCorners />
      <div className="lookup-preview-head">
        <div className="lookup-photo" aria-hidden="true">
          photo
        </div>
        <div className="lookup-preview-info">
          <div className="card-kicker lookup-host">{product.host}</div>
          <div className="card-title">{product.name}</div>
          <div className="card-meta">{fmtMoney(product.price)}</div>
          <span className="tag tag-outline lookup-model">{product.model.label}</span>
        </div>
      </div>
      {!product.known && (
        <div className="lookup-warning">
          This page didn&apos;t list dimensions. Enter them from the product description.
        </div>
      )}
      <div className="field-grid-3">
        {DIM_FIELDS.map((f) => (
          <PreviewDimInput key={f.axis} axis={f.axis} label={f.label} stored={product[f.axis]} />
        ))}
      </div>
      <div className="lookup-actions">
        <button type="button" className="btn btn-primary blueprint" onClick={onPlace}>
          <BlueprintCorners />
          Place in room
        </button>
        <button type="button" className="btn btn-ghost" onClick={onDiscard}>
          Discard
        </button>
      </div>
    </div>
  );
}

/**
 * Sidebar section 02: paste a product link (or pick a sample), look it up, review and
 * adjust the preview, then place it in the room. Only the latest lookup may update the
 * store; earlier ones are aborted and their results ignored.
 */
export function AddFurnitureSection({ lookup }: { lookup: ProductLookup }): JSX.Element {
  const state = useUiStore((s) => s.lookup);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<LookupErrorCode | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  function cancelPending() {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }

  function runFetch(raw: string) {
    let parsed: ReturnType<typeof parseProductUrl>;
    try {
      parsed = parseProductUrl(raw);
    } catch (err) {
      if (err instanceof LookupError) {
        setError(err.code);
        return;
      }
      throw err;
    }

    cancelPending();
    const controller = new AbortController();
    controllerRef.current = controller;
    setUrl(raw.trim());
    setError(null);
    const { setLookup } = useUiStore.getState();
    setLookup({ status: 'loading', host: parsed.host });

    lookup.lookup(parsed.url, { signal: controller.signal }).then(
      (product) => {
        if (controllerRef.current !== controller) return;
        controllerRef.current = null;
        useUiStore.getState().setLookup({ status: 'preview', product });
      },
      (err: unknown) => {
        if (controllerRef.current !== controller) return;
        controllerRef.current = null;
        useUiStore.getState().setLookup({ status: 'idle' });
        if (isAbortError(err)) return;
        // Never surface a provider's own message: only our fixed copy is rendered.
        setError(err instanceof LookupError ? err.code : 'unavailable');
      },
    );
  }

  function onUrlChange(e: ChangeEvent<HTMLInputElement>) {
    setUrl(e.target.value);
    setError(null);
  }

  function onUrlKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') runFetch(url);
  }

  function onPlace() {
    placePreview();
    setUrl('');
  }

  function onDiscard() {
    cancelPending();
    useUiStore.getState().setLookup({ status: 'idle' });
    setUrl('');
  }

  const isLoading = state.status === 'loading';
  const isIdle = state.status === 'idle' || state.status === 'error';

  return (
    <section className="sidebar-section">
      <h6 className="sidebar-heading">
        <span className="sidebar-heading-num">02</span>
        <span>Add furniture from a link</span>
      </h6>
      <div className="lookup-row">
        <input
          className="input"
          type="text"
          aria-label="Product link"
          placeholder="Paste a product link"
          value={url}
          onChange={onUrlChange}
          onKeyDown={onUrlKeyDown}
        />
        <button
          type="button"
          className="btn btn-primary blueprint"
          disabled={isLoading}
          onClick={() => runFetch(url)}
        >
          <BlueprintCorners />
          Fetch
        </button>
      </div>
      {error !== null && (
        <div className="lookup-warning" role="alert">
          {LOOKUP_MESSAGES[error]}
        </div>
      )}
      {isIdle && (
        <div className="lookup-samples">
          <span className="text-muted lookup-samples-prompt">No link handy? Try a sample:</span>
          {SAMPLES.map((s) => (
            <button key={s.label} type="button" className="btn btn-secondary" onClick={() => runFetch(s.url)}>
              {s.label}
            </button>
          ))}
        </div>
      )}
      {state.status === 'loading' && (
        <div className="card blueprint">
          <BlueprintCorners />
          <div className="card-kicker">{state.host}</div>
          <div className="card-body">Reading the product page for name, size and price…</div>
        </div>
      )}
      {state.status === 'preview' && (
        <PreviewCard product={state.product} onPlace={onPlace} onDiscard={onDiscard} />
      )}
    </section>
  );
}
