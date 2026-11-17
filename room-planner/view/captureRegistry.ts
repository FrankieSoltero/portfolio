/**
 * One-slot registry for the mounted 3D pane's picture. Whichever 3D view is on screen (the WebGL
 * `ThreeView` or the 2D `BlueprintView`) registers how to capture itself; the Share panel calls
 * `captureView()` without knowing which one it is.
 */

/** Returns a new canvas holding the view's picture, or null when it cannot be made. */
export type ViewCapture = () => HTMLCanvasElement | null;

/** The current registration; an object, so registering the same function twice stays two entries. */
let current: { fn: ViewCapture } | null = null;

/** Makes `fn` the current capture and returns a function that removes it only if it is still current. */
export function registerViewCapture(fn: ViewCapture): () => void {
  const entry = { fn };
  current = entry;
  return () => {
    // On a style switch the new view may register before the old one unmounts.
    if (current === entry) current = null;
  };
}

/** The current capture's result; null when none is registered or it throws. */
export function captureView(): HTMLCanvasElement | null {
  if (!current) return null;
  try {
    return current.fn();
  } catch {
    return null;
  }
}
