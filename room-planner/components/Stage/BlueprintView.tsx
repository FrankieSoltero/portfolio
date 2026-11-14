/**
 * Blueprint 3D pane: a 2D canvas line drawing of the room through the shared orbit camera.
 * Owns canvas sizing, device-pixel-ratio scaling, token reading and redraw scheduling;
 * the drawing itself is the pure `drawBlueprint`. Ported from prototype lines 178 and 578–583.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { CONFIG } from '../../config';
import { startDrag } from '../../hooks/startDrag';
import { useConflicts } from '../../state/selectors';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { readTokens } from '../../styles/tokens';
import { drawBlueprint } from '../../view/blueprintDraw';
import { computeCameraPose, orbitCamera, zoomCamera } from '../../view/camera';
import type { PaneRect } from '../../view/panes';

/** How long to wait before retrying when the stylesheet's colour tokens are not readable yet. */
const TOKEN_RETRY_MS = 200;

const CANVAS_STYLE = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'grab', touchAction: 'none',
} as const;

export function BlueprintView({ pane }: { pane: PaneRect }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const room = usePlanStore((s) => s.room);
  const items = usePlanStore((s) => s.items);
  const units = usePlanStore((s) => s.units);
  const selectedId = useUiStore((s) => s.selectedId);
  const camera = useUiStore((s) => s.camera);
  const setCamera = useUiStore((s) => s.setCamera);
  const conflicts = useConflicts();
  // Bumped to force a redraw when nothing in the plan changed (fonts loaded, tokens retry).
  const [redraw, setRedraw] = useState(0);

  // One draw per animation frame: each change replaces the pending frame with a fresh one.
  useEffect(() => {
    let retry: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
      const pw = Math.round(pane.w * dpr);
      const ph = Math.round(pane.h * dpr);
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
      const tokens = readTokens();
      if (!tokens) {
        retry = setTimeout(() => setRedraw((n) => n + 1), TOKEN_RETRY_MS);
        return;
      }
      const g = canvas.getContext('2d');
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawBlueprint(g, {
        room, items, selectedId, conflicts, units,
        pose: computeCameraPose(room, camera, pane),
        width: pane.w, safeW: pane.safeW, height: pane.h, tokens,
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(retry);
    };
  }, [room, items, units, selectedId, camera, conflicts, pane, redraw]);

  // Label widths are measured with the web font, so redraw once it has loaded.
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setRedraw((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);

  // React's onWheel listener is passive and cannot stop the page scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const ui = useUiStore.getState();
      ui.setCamera(zoomCamera(ui.camera, e.deltaY));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = useUiStore.getState().camera;
    startDrag(e, (dx, dy) => setCamera(orbitCamera(start, dx, dy)));
  };

  return (
    <canvas ref={canvasRef} role="img" aria-label="Blueprint view of the room"
      onPointerDown={onPointerDown} style={CANVAS_STYLE} />
  );
}
