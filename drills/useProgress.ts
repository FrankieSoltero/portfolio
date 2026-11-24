// drills/useProgress.ts
// Client hook over the progress store in progress.ts, persisted in localStorage under
// PROGRESS_KEY. The first render always shows EMPTY_PROGRESS with ready=false so it
// matches the server render; stored progress is read after mount. Storage may be
// blocked or full: every access is wrapped, and on failure the state still updates in
// memory for the rest of the visit.
//
// Every component on the page shares one store, so a change made through one hook (for
// example "solution revealed") shows in every other hook at once and is never overwritten
// from a stale copy. Other tabs are followed through the `storage` event while at least
// one hook is mounted, and every change is applied to what storage holds at that moment.

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  EMPTY_PROGRESS,
  localDate,
  markCompleted,
  markRevealed,
  parseProgress,
  PROGRESS_KEY,
  type DrillProgress,
} from "./progress";

/** Stored progress, or null when storage cannot be read. */
function readStored(): DrillProgress | null {
  try {
    return parseProgress(window.localStorage.getItem(PROGRESS_KEY));
  } catch {
    return null;
  }
}

/** Writes progress; false when storage is blocked or full. */
function writeStored(progress: DrillProgress): boolean {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

// The shared store. `current` only changes through setCurrent, so the snapshot handed to
// React stays the same object between changes.
let current: DrillProgress = EMPTY_PROGRESS;
// Set once storage could not be read or written: storage then no longer reflects this
// tab's progress, so changes build on the in-memory value instead.
let memoryOnly = false;
const listeners = new Set<() => void>();

function setCurrent(next: DrillProgress): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

/** Another tab wrote progress. Untrusted like any stored value, so it is parsed. */
function onStorage(event: StorageEvent): void {
  if (event.key !== PROGRESS_KEY) return;
  setCurrent(parseProgress(event.newValue));
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    // Nothing listened while no hook was mounted, so load what is stored now.
    const loaded = readStored();
    memoryOnly = loaded === null;
    current = loaded ?? EMPTY_PROGRESS;
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): DrillProgress {
  return current;
}

function getServerSnapshot(): DrillProgress {
  return EMPTY_PROGRESS;
}

/**
 * Applies a change to what storage holds now (another tab may have written without this
 * tab seeing the event yet), saves it and tells every mounted hook.
 */
function update(change: (p: DrillProgress) => DrillProgress): void {
  const stored = memoryOnly ? null : readStored();
  if (stored === null) memoryOnly = true;
  const base = stored ?? current;
  const next = change(base);
  if (next !== base && !writeStored(next)) memoryOnly = true;
  setCurrent(next);
}

function complete(slug: string): void {
  update((p) => markCompleted(p, slug, localDate(new Date())));
}

function reveal(slug: string): void {
  update((p) => markRevealed(p, slug));
}

export function useProgress(): {
  progress: DrillProgress; ready: boolean;
  complete(slug: string): void; reveal(slug: string): void;
} {
  const progress = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // localStorage only exists in the browser, and the first render must match the
    // server's, so stored progress can only be shown after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-mount switch to the external store
    setReady(true);
  }, []);

  return { progress: ready ? progress : EMPTY_PROGRESS, ready, complete, reveal };
}
