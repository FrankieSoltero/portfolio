import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { CONFIG } from '../config';
import type { PlanDocument } from '../domain/types';
import { type PlanState, usePlanStore } from './planStore';
import { useUiStore } from './uiStore';

/**
 * Undo and redo for the plan. The history watches the plan store and keeps two lists of earlier
 * plans: one to undo, one to redo. The plan is always replaced, never changed in place, so a step
 * only holds references to an earlier room, items, openings and obstacles. Units and the schema
 * version are never part of a step. The history lives in memory only; nothing is saved or sent.
 */

/** A group that joins every change made while it is open into one step. */
export type GroupKind = 'drag' | 'field';

/** What the undo and redo controls need to show. */
export interface HistoryState {
  canUndo: boolean;
  canRedo: boolean;
  /** 'Undone' or 'Redone' after the latest undo or redo; null before the first and after clearHistory. */
  lastAnnouncement: 'Undone' | 'Redone' | null;
  /** Goes up by one on every successful undo or redo. */
  announceCount: number;
}

/** The four plan fields a step covers, kept by reference. */
type Snapshot = Pick<PlanDocument, 'room' | 'items' | 'openings' | 'obstacles'>;

/** An open group; each call to openGroup (or renewFieldGroup) makes a new one. */
type Group = { readonly kind: GroupKind };

/** One undo step: the plan before it, and what later changes need to know to join it. */
interface Step {
  plan: Snapshot;
  /** The group the step belongs to, or null. */
  group: Group | null;
  /** The key of a keyed step outside any group, or null. */
  key: string | null;
  /** Date.now() at the step's latest change. */
  time: number;
}

let undoList: Step[] = [];
let redoList: Snapshot[] = [];
const openGroups: Record<GroupKind, Group | null> = { drag: null, field: null };
let currentKey: string | null = null;
/** The step later changes may join; null after an undo, a redo or clearHistory. */
let latestStep: Step | null = null;
/**
 * While undo or redo replaces the plan: the plan state just before the replacement, else null. The
 * replacement's own update is the one whose previous state is this object, and it alone is not
 * recorded; any other update made meanwhile (say by a subscriber reacting to the restored plan) is.
 */
let stateBeforeRestore: PlanState | null = null;

/** The undo and redo state the controls read. Changed only by this module. */
export const useHistoryStore: UseBoundStore<StoreApi<HistoryState>> = create<HistoryState>()(() => ({
  canUndo: false,
  canRedo: false,
  lastAnnouncement: null,
  announceCount: 0,
}));

function snapshotOf(s: Snapshot): Snapshot {
  return { room: s.room, items: s.items, openings: s.openings, obstacles: s.obstacles };
}

function isChange(next: PlanState, prev: PlanState): boolean {
  return (
    next.room !== prev.room ||
    next.items !== prev.items ||
    next.openings !== prev.openings ||
    next.obstacles !== prev.obstacles
  );
}

/** Copies the lengths of both lists into useHistoryStore, writing only when they changed. */
function publish(): void {
  const canUndo = undoList.length > 0;
  const canRedo = redoList.length > 0;
  const h = useHistoryStore.getState();
  if (h.canUndo !== canUndo || h.canRedo !== canRedo) useHistoryStore.setState({ canUndo, canRedo });
}

/** Adds a step to the undo list, dropping the oldest beyond CONFIG.historyLimit. */
function pushUndo(step: Step): void {
  undoList.push(step);
  if (undoList.length > CONFIG.historyLimit) undoList = undoList.slice(undoList.length - CONFIG.historyLimit);
}

/**
 * Records a plan-store change: it joins the latest step when that step belongs to the active
 * group, or, outside any group, has the current key and came within CONFIG.historyMergeMs;
 * otherwise it becomes a new step holding the plan before the change. Either way the redo list
 * is emptied.
 */
function record(next: PlanState, prev: PlanState): void {
  if (prev === stateBeforeRestore || !isChange(next, prev)) return;
  redoList = [];
  const now = Date.now();
  const group = openGroups.drag ?? openGroups.field;
  const joins =
    latestStep !== null &&
    (group !== null
      ? latestStep.group === group
      : currentKey !== null &&
        latestStep.group === null &&
        latestStep.key === currentKey &&
        now - latestStep.time <= CONFIG.historyMergeMs);
  if (joins && latestStep !== null) {
    latestStep.time = now;
  } else {
    latestStep = { plan: snapshotOf(prev), group, key: group === null ? currentKey : null, time: now };
    pushUndo(latestStep);
  }
  publish();
}

usePlanStore.subscribe(record);

/** Clears each ui selection whose target is no longer in the plan. Never touches roomProblem. */
function clearStaleSelections(): void {
  const { room, items, openings, obstacles } = usePlanStore.getState();
  const ui = useUiStore.getState();
  const hasCorner = (id: string) => room.outline.some((c) => c.id === id);
  if (ui.selectedId !== null && !items.some((i) => i.id === ui.selectedId)) ui.select(null);
  if (ui.selectedCornerId !== null && !hasCorner(ui.selectedCornerId)) ui.selectCorner(null);
  // A wall is named by its starting corner, so it exists while that corner does.
  if (ui.selectedWallId !== null && !hasCorner(ui.selectedWallId)) ui.selectWall(null);
  if (ui.selectedOpeningId !== null && !openings.some((o) => o.id === ui.selectedOpeningId)) ui.selectOpening(null);
  if (ui.selectedObstacleId !== null && !obstacles.some((o) => o.id === ui.selectedObstacleId)) {
    ui.selectObstacle(null);
  }
}

/**
 * Puts `plan` back into the plan store, keeping the current units and schema version, without
 * recording that update (a change another subscriber makes in reaction is recorded as usual); then
 * clears stale selections and announces `text`.
 */
function restore(plan: Snapshot, text: 'Undone' | 'Redone'): void {
  const current = usePlanStore.getState();
  const { schemaVersion, units, reset } = current;
  stateBeforeRestore = current;
  try {
    reset({ schemaVersion, units, ...plan });
  } finally {
    stateBeforeRestore = null;
  }
  // A change after an undo or redo always starts a new step.
  latestStep = null;
  clearStaleSelections();
  useHistoryStore.setState((h) => ({
    canUndo: undoList.length > 0,
    canRedo: redoList.length > 0,
    lastAnnouncement: text,
    announceCount: h.announceCount + 1,
  }));
}

/**
 * Takes back the latest step. Returns true when a step was taken back; false (changing nothing)
 * when there is none or a drag is in progress.
 */
export function undo(): boolean {
  if (openGroups.drag !== null) return false;
  const step = undoList.pop();
  if (step === undefined) return false;
  redoList.push(snapshotOf(usePlanStore.getState()));
  restore(step.plan, 'Undone');
  return true;
}

/**
 * Puts back the step most recently taken back. Returns true when a step was put back; false
 * (changing nothing) when there is none or a drag is in progress.
 */
export function redo(): boolean {
  if (openGroups.drag !== null) return false;
  const plan = redoList.pop();
  if (plan === undefined) return false;
  pushUndo({ plan: snapshotOf(usePlanStore.getState()), group: null, key: null, time: Date.now() });
  restore(plan, 'Redone');
  return true;
}

/** Empties both lists and forgets open groups, the current key and the latest step. */
export function clearHistory(): void {
  undoList = [];
  redoList = [];
  openGroups.drag = null;
  openGroups.field = null;
  currentKey = null;
  latestStep = null;
  useHistoryStore.setState({ canUndo: false, canRedo: false, lastAnnouncement: null });
}

/**
 * Opens a group of `kind`: until closeGroup, every change joins one step. An open drag group wins
 * over an open field group, and blocks undo and redo.
 */
export function openGroup(kind: GroupKind): void {
  openGroups[kind] = { kind };
}

/** Closes the group of `kind`; the next change outside a group starts a new step. */
export function closeGroup(kind: GroupKind): void {
  openGroups[kind] = null;
}

/** An open field group becomes a new group, so the next change starts a new step; no effect when none is open. */
export function renewFieldGroup(): void {
  if (openGroups.field !== null) openGroups.field = { kind: 'field' };
}

/**
 * Runs `fn` with `key` as the current key and returns its result, putting the previous key back
 * afterwards (also when `fn` throws). Outside any group, a keyed change joins the latest step when
 * that step has the same key and its latest change was at most CONFIG.historyMergeMs ago.
 */
export function runKeyed<T>(key: string, fn: () => T): T {
  const previous = currentKey;
  currentKey = key;
  try {
    return fn();
  } finally {
    currentKey = previous;
  }
}
