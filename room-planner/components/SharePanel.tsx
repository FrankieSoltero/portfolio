import { type JSX, type KeyboardEvent, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { currentDocument } from '../hooks/usePlanPersistence';
import { canvasToPng, downloadBlob } from '../services/download';
import { encodePlan } from '../services/shareLink';
import { shareUrl } from '../services/shareLocation';
import { usePlanStore } from '../state/planStore';
import { useConflicts } from '../state/selectors';
import { useUiStore } from '../state/uiStore';
import { captureView } from '../view/captureRegistry';
import { drawPlanPicture, planPictureSize } from '../view/planPicture';

const TOO_LARGE_TEXT = 'This plan is too large to share as a link.';
const NO_PICTURE_TEXT = 'The picture could not be made.';
const NO_3D_REASON = 'Show the 3D view to save a picture of it.';
/** How long `Copy link` reads `Copied` after a successful copy. */
const COPIED_MS = 2000;

/** The panel's three actions; each ignores a click while its own promise is pending. */
type ShareAction = 'copy' | 'plan' | 'view';

/**
 * The header's Share button and its panel. The button toggles the panel (`aria-expanded`); opening
 * it moves focus to `Copy link`. Escape anywhere in the panel or on the button closes it and returns
 * focus to the button; that Escape is stopped here, so it does not also reach the planner's global
 * shortcuts (which would clear the selection). A pointer down outside the panel and the button
 * closes it too. The panel is rendered only while open.
 *
 * Which actions are pending is kept here, outside the panel, so closing and reopening the panel
 * while a copy or download is still running does not let it start a second time.
 */
export function SharePanel(): JSX.Element {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Set<ShareAction>>(new Set());

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Capture phase: the stage handles its own pointer downs and may stop them.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  function onKeyDown(e: KeyboardEvent<HTMLElement>): void {
    if (!open || e.key !== 'Escape') return;
    e.stopPropagation();
    setOpen(false);
    buttonRef.current?.focus();
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="btn"
        aria-expanded={open ? 'true' : 'false'}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        Share
      </button>
      {open && <SharePanelDialog panelRef={panelRef} pending={pending} onKeyDown={onKeyDown} />}
    </>
  );
}

/**
 * The open panel: `Copy link`, `Download floor plan` and `Download 3D view`, a status line for
 * failures, and the read-only link field shown when the clipboard cannot be written. Mounted on
 * each open, so a previous message or link is not shown again.
 */
function SharePanelDialog({
  panelRef,
  pending,
  onKeyDown,
}: {
  panelRef: RefObject<HTMLDivElement | null>;
  pending: RefObject<Set<ShareAction>>;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
}): JSX.Element {
  const outline = usePlanStore((s) => s.room.outline);
  const items = usePlanStore((s) => s.items);
  const openings = usePlanStore((s) => s.openings);
  const obstacles = usePlanStore((s) => s.obstacles);
  const units = usePlanStore((s) => s.units);
  const conflicts = useConflicts();
  // Only the tabs layout on its 2D tab has no 3D pane to capture.
  const no3dPane = useUiStore((s) => s.layout === 'tabs' && s.tab === '2d');
  const [status, setStatus] = useState('');
  const [copied, setCopied] = useState(false);
  const [fallbackLink, setFallbackLink] = useState<string | null>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const reasonId = useId();

  useEffect(() => {
    mounted.current = true;
    copyRef.current?.focus();
    return () => {
      mounted.current = false;
      if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
      copiedTimer.current = null;
    };
  }, []);

  useEffect(() => {
    if (fallbackLink === null) return;
    linkRef.current?.focus();
    linkRef.current?.select();
  }, [fallbackLink]);

  /** Runs `action` unless the same action is still pending; clears the previous message first. */
  async function run(name: ShareAction, action: () => Promise<void>): Promise<void> {
    if (pending.current.has(name)) return;
    pending.current.add(name);
    setStatus('');
    try {
      await action();
    } finally {
      pending.current.delete(name);
    }
  }

  async function copyLink(): Promise<void> {
    const data = await encodePlan(currentDocument());
    if (data === null) {
      setStatus(TOO_LARGE_TEXT);
      return;
    }
    const link = shareUrl(data);
    let written = false;
    try {
      if (typeof navigator.clipboard?.writeText === 'function') {
        await navigator.clipboard.writeText(link);
        written = true;
      }
    } catch {
      written = false;
    }
    if (!written) {
      setFallbackLink(link);
      return;
    }
    if (!mounted.current) return;
    if (copiedTimer.current !== null) clearTimeout(copiedTimer.current);
    setCopied(true);
    copiedTimer.current = setTimeout(() => {
      copiedTimer.current = null;
      setCopied(false);
    }, COPIED_MS);
  }

  async function downloadPlan(): Promise<void> {
    // The plan as it is at the click; it is drawn after the fonts have loaded.
    const input = { outline, items, openings, obstacles, conflicts, units };
    const { width, height } = planPictureSize(outline);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext('2d');
    if (g === null) {
      setStatus(NO_PICTURE_TEXT);
      return;
    }
    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch {
        // Drawn with the fallback fonts.
      }
    }
    drawPlanPicture(g, input);
    await save(canvas, 'room-plan.png');
  }

  async function downloadView(): Promise<void> {
    const canvas = captureView();
    if (canvas === null) {
      setStatus(NO_PICTURE_TEXT);
      return;
    }
    await save(canvas, 'room-3d.png');
  }

  /** Saves `canvas` as a PNG named `filename`, or shows the could-not-be-made message. */
  async function save(canvas: HTMLCanvasElement, filename: string): Promise<void> {
    const blob = await canvasToPng(canvas);
    if (blob === null) {
      setStatus(NO_PICTURE_TEXT);
      return;
    }
    downloadBlob(blob, filename);
  }

  return (
    <div ref={panelRef} className="share-panel" role="dialog" aria-label="Share this plan" onKeyDown={onKeyDown}>
      <button ref={copyRef} type="button" className="btn btn-secondary" onClick={() => void run('copy', copyLink)}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {fallbackLink !== null && (
        <input
          ref={linkRef}
          type="text"
          className="input share-panel-link"
          aria-label="Share link"
          readOnly
          value={fallbackLink}
        />
      )}
      <button type="button" className="btn btn-secondary" onClick={() => void run('plan', downloadPlan)}>
        Download floor plan
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        aria-disabled={no3dPane ? 'true' : undefined}
        aria-describedby={no3dPane ? reasonId : undefined}
        onClick={() => {
          if (!no3dPane) void run('view', downloadView);
        }}
      >
        Download 3D view
      </button>
      {no3dPane && (
        <p id={reasonId} className="note share-panel-note">
          {NO_3D_REASON}
        </p>
      )}
      <p role="status" className="note share-panel-status">
        {status}
      </p>
    </div>
  );
}
