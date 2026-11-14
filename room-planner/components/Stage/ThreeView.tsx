/**
 * Realistic 3D pane: a WebGL canvas driven by `SceneRenderer` through the shared orbit camera.
 * Owns renderer creation (once the colour tokens are readable), WebGL failure reporting,
 * redraw scheduling and orbit/zoom input. Ported from prototype lines 181 and 547–577.
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { CONFIG } from '../../config';
import { startDrag } from '../../hooks/startDrag';
import { useConflicts } from '../../state/selectors';
import { usePlanStore } from '../../state/planStore';
import { useUiStore } from '../../state/uiStore';
import { readTokens } from '../../styles/tokens';
import { SceneRenderer } from '../../three/SceneRenderer';
import { computeCameraPose, orbitCamera, zoomCamera } from '../../view/camera';
import type { PaneRect } from '../../view/panes';

const CANVAS_STYLE = {
  position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'grab', touchAction: 'none',
} as const;

export default function ThreeView({ pane }: { pane: PaneRect }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [renderer, setRenderer] = useState<SceneRenderer | null>(null);
  const room = usePlanStore((s) => s.room);
  const items = usePlanStore((s) => s.items);
  const selectedId = useUiStore((s) => s.selectedId);
  const camera = useUiStore((s) => s.camera);
  const setCamera = useUiStore((s) => s.setCamera);
  const conflicts = useConflicts();

  // Create the renderer once the stylesheet's colour tokens are readable, retrying each frame.
  // A lost context (GPU reset, too many contexts) means the realistic view cannot continue.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onLost = () => useUiStore.getState().markWebglUnavailable();
    canvas.addEventListener('webglcontextlost', onLost);
    let created: SceneRenderer | null = null;
    let frame = 0;
    const tryCreate = () => {
      const tokens = readTokens();
      if (!tokens) {
        frame = requestAnimationFrame(tryCreate);
        return;
      }
      try {
        created = new SceneRenderer(canvas, tokens);
      } catch {
        // No WebGL: the canvas stays inert and the store falls back to the blueprint style.
        useUiStore.getState().markWebglUnavailable();
        return;
      }
      setRenderer(created);
    };
    frame = requestAnimationFrame(tryCreate);
    return () => {
      cancelAnimationFrame(frame);
      // Disposing forces a context loss; the listener goes first so that loss is not reported.
      canvas.removeEventListener('webglcontextlost', onLost);
      created?.dispose();
    };
  }, []);

  // One update per animation frame: each change replaces the pending frame with a fresh one.
  useEffect(() => {
    if (!renderer) return;
    const frame = requestAnimationFrame(() => {
      renderer.update({
        room, items, selectedId, conflicts,
        pose: computeCameraPose(room, camera, pane),
        width: pane.w,
        height: pane.h,
        pixelRatio: Math.min(CONFIG.maxPixelRatio, window.devicePixelRatio || 1),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [renderer, room, items, selectedId, conflicts, camera, pane]);

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
    <canvas ref={canvasRef} role="img" aria-label="3D view of the room"
      onPointerDown={onPointerDown} style={CANVAS_STYLE} />
  );
}
