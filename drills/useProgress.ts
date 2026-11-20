// drills/useProgress.ts
// Client hook over the progress store in progress.ts, persisted in localStorage under
// PROGRESS_KEY. The first render always shows EMPTY_PROGRESS with ready=false so it
// matches the server render; stored progress is read after mount. Storage may be
// blocked or full: every access is wrapped, and on failure the state still updates in
// memory for the rest of the visit.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_PROGRESS,
  localDate,
  markCompleted,
  markRevealed,
  parseProgress,
  PROGRESS_KEY,
  type DrillProgress,
} from "./progress";

function readStored(): DrillProgress {
  try {
    return parseProgress(window.localStorage.getItem(PROGRESS_KEY));
  } catch {
    return EMPTY_PROGRESS;
  }
}

function writeStored(progress: DrillProgress): void {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage is blocked or full: keep the in-memory state only.
  }
}

export function useProgress(): {
  progress: DrillProgress; ready: boolean;
  complete(slug: string): void; reveal(slug: string): void;
} {
  const [state, setState] = useState({ progress: EMPTY_PROGRESS, ready: false });
  // The latest progress, so several updates in one event build on each other and the
  // value written to storage is computed outside a state updater.
  const latest = useRef<DrillProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    const loaded = readStored();
    latest.current = loaded;
    // localStorage only exists in the browser, and the first render must match the
    // server's, so stored progress can only be applied after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount load from an external store
    setState({ progress: loaded, ready: true });
  }, []);

  const update = useCallback((change: (p: DrillProgress) => DrillProgress) => {
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setState((s) => ({ ...s, progress: next }));
    writeStored(next);
  }, []);

  const complete = useCallback(
    (slug: string) => update((p) => markCompleted(p, slug, localDate(new Date()))),
    [update],
  );
  const reveal = useCallback((slug: string) => update((p) => markRevealed(p, slug)), [update]);

  return { progress: state.progress, ready: state.ready, complete, reveal };
}
