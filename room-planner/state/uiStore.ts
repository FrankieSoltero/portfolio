import { create } from 'zustand';
import { CONFIG } from '../config';
import type { LengthAnchor } from '../domain/outline';
import type { CameraState, EditMode, LayoutMode, ProductPreview, RenderStyle, RoomTool, StageTab } from '../domain/types';
import type { LookupErrorCode } from '../services/productLookup';

/**
 * Workspace view state: selection, layout, 3D view, the product-lookup flow, room editing
 * and notices. Not saved.
 */
export interface UiState {
  selectedId: string | null;
  mode: EditMode;
  /** At most one of the selected corner, wall, door or window, and obstacle is set at a time. */
  selectedCornerId: string | null;
  /** The selected wall, named by its starting corner's id. */
  selectedWallId: string | null;
  selectedOpeningId: string | null;
  selectedObstacleId: string | null;
  /** Which end of a wall a typed length moves: its start, both ends, or its end. */
  lengthAnchor: LengthAnchor;
  /** The room editor's tool: 'corner', or a door or window tool armed to place one on a wall. */
  roomTool: RoomTool;
  /** Why the last room edit was refused, shown while editing the room. */
  roomProblem: string | null;
  /** A general message for the visitor, such as a storage problem. */
  notice: string | null;
  /** True when this session must not save the plan. */
  saveBlocked: boolean;
  layout: LayoutMode;
  insetSwapped: boolean;
  tab: StageTab;
  renderStyle: RenderStyle;
  camera: CameraState;
  webglAvailable: boolean;
  lookup:
    | { status: 'idle' }
    | { status: 'loading'; host: string }
    | { status: 'preview'; product: ProductPreview }
    | { status: 'error'; code: LookupErrorCode };
  /** Selects an item, or clears the selection with null. In room mode an item id is ignored. */
  select(id: string | null): void;
  setLayout(l: LayoutMode): void;
  toggleInsetSwap(): void;
  setTab(t: StageTab): void;
  /** Ignores 'realistic' once WebGL is known to be unavailable. */
  setRenderStyle(r: RenderStyle): void;
  setCamera(c: CameraState): void;
  setLookup(l: UiState['lookup']): void;
  /** Edits a dimension of the previewed product; no-op unless the lookup is in preview. */
  updatePreviewDim(axis: 'w' | 'd' | 'h', inches: number): void;
  /** Records that WebGL failed and falls back to the blueprint render style. */
  markWebglUnavailable(): void;
  /**
   * Switches edit mode. Entering 'room' clears the item selection; entering 'furnish' clears
   * the selected corner, wall, opening and obstacle and the room problem, and sets the tool back
   * to 'corner'. Applies the clears even if the mode is unchanged.
   */
  setMode(m: EditMode): void;
  /** Selects a corner, clearing the selected wall, opening and obstacle; null clears only the corner. */
  selectCorner(id: string | null): void;
  /** Selects a wall, clearing the selected corner, opening and obstacle; null clears only the wall. */
  selectWall(id: string | null): void;
  /** Selects a door or window, clearing the selected corner, wall and obstacle; null clears only the opening. */
  selectOpening(id: string | null): void;
  /** Selects an obstacle, clearing the selected corner, wall and opening; null clears only the obstacle. */
  selectObstacle(id: string | null): void;
  setLengthAnchor(a: LengthAnchor): void;
  /** Sets the room tool; arming a door or window tool also clears every room selection. */
  setRoomTool(t: RoomTool): void;
  setRoomProblem(text: string | null): void;
  setNotice(text: string | null): void;
  setSaveBlocked(b: boolean): void;
  reset(): void;
}

type UiData = Pick<
  UiState,
  | 'selectedId'
  | 'mode'
  | 'selectedCornerId'
  | 'selectedWallId'
  | 'selectedOpeningId'
  | 'selectedObstacleId'
  | 'lengthAnchor'
  | 'roomTool'
  | 'roomProblem'
  | 'notice'
  | 'saveBlocked'
  | 'layout'
  | 'insetSwapped'
  | 'tab'
  | 'renderStyle'
  | 'camera'
  | 'webglAvailable'
  | 'lookup'
>;

function initialUi(): UiData {
  return {
    selectedId: null,
    mode: 'furnish',
    selectedCornerId: null,
    selectedWallId: null,
    selectedOpeningId: null,
    selectedObstacleId: null,
    lengthAnchor: 'end',
    roomTool: 'corner',
    roomProblem: null,
    notice: null,
    saveBlocked: false,
    layout: 'inset',
    insetSwapped: false,
    tab: '2d',
    renderStyle: 'realistic',
    camera: { ...CONFIG.camera },
    webglAvailable: true,
    lookup: { status: 'idle' },
  };
}

/** Clears the selected corner, wall, opening and obstacle; a non-null selection overrides its own field. */
const NO_ROOM_SELECTION = {
  selectedCornerId: null,
  selectedWallId: null,
  selectedOpeningId: null,
  selectedObstacleId: null,
} as const;

export const useUiStore = create<UiState>()((set) => ({
  ...initialUi(),

  select: (selectedId) => set((s) => (s.mode === 'room' && selectedId !== null ? s : { selectedId })),
  setLayout: (layout) => set({ layout }),
  toggleInsetSwap: () => set((s) => ({ insetSwapped: !s.insetSwapped })),
  setTab: (tab) => set({ tab }),
  setRenderStyle: (renderStyle) =>
    set((s) => (renderStyle === 'realistic' && !s.webglAvailable ? s : { renderStyle })),
  setCamera: (camera) => set({ camera }),
  setLookup: (lookup) => set({ lookup }),
  updatePreviewDim: (axis, inches) =>
    set((s) =>
      s.lookup.status === 'preview'
        ? { lookup: { status: 'preview', product: { ...s.lookup.product, [axis]: inches } } }
        : s,
    ),
  markWebglUnavailable: () => set({ webglAvailable: false, renderStyle: 'blueprint' }),
  setMode: (mode) =>
    set(
      mode === 'room'
        ? { mode, selectedId: null }
        : { mode, ...NO_ROOM_SELECTION, roomTool: 'corner', roomProblem: null },
    ),
  selectCorner: (selectedCornerId) =>
    set(selectedCornerId === null ? { selectedCornerId } : { ...NO_ROOM_SELECTION, selectedCornerId }),
  selectWall: (selectedWallId) =>
    set(selectedWallId === null ? { selectedWallId } : { ...NO_ROOM_SELECTION, selectedWallId }),
  selectOpening: (selectedOpeningId) =>
    set(selectedOpeningId === null ? { selectedOpeningId } : { ...NO_ROOM_SELECTION, selectedOpeningId }),
  selectObstacle: (selectedObstacleId) =>
    set(selectedObstacleId === null ? { selectedObstacleId } : { ...NO_ROOM_SELECTION, selectedObstacleId }),
  setLengthAnchor: (lengthAnchor) => set({ lengthAnchor }),
  setRoomTool: (roomTool) => set(roomTool === 'corner' ? { roomTool } : { roomTool, ...NO_ROOM_SELECTION }),
  setRoomProblem: (roomProblem) => set({ roomProblem }),
  setNotice: (notice) => set({ notice }),
  setSaveBlocked: (saveBlocked) => set({ saveBlocked }),
  reset: () => set(initialUi()),
}));
