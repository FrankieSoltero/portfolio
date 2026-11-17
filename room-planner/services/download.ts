/**
 * Saving pictures in the browser: a canvas to PNG, and a blob to a file through a temporary
 * download link. Neither function throws nor rejects; a failure is a null blob or no download.
 */

/**
 * How long the object URL outlives the click. Revoking it in the same task can cancel the
 * download in some browsers (Safari), so it is released later, as FileSaver.js does.
 */
const REVOKE_DELAY_MS = 40_000;

/** The canvas as a PNG blob; null when the browser gives none or refuses (for example a tainted canvas). */
export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/** Saves `blob` as `filename` by clicking a temporary download link; any failure is swallowed. */
export function downloadBlob(blob: Blob, filename: string): void {
  let url: string | null = null;
  let link: HTMLAnchorElement | null = null;
  try {
    url = URL.createObjectURL(blob);
    link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.append(link);
    link.click();
  } catch {
    // Nothing to report: the download simply does not start.
  } finally {
    link?.remove();
    const made = url;
    if (made !== null) {
      setTimeout(() => {
        try {
          URL.revokeObjectURL(made);
        } catch {
          // The URL is released with the page anyway.
        }
      }, REVOKE_DELAY_MS);
    }
  }
}
