import { create } from 'zustand';
import { CONFIG } from '../config';
import type { CameraState, LayoutMode, ProductPreview, RenderStyle, StageTab } from '../domain/types';
import type { LookupErrorCode } from '../services/productLookup';

/** Workspace view state: selection, layout, 3D view and the product-lookup flow. Not saved. */
export interface UiState {
  selectedId: string | null;
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
  reset(): void;
}

type UiData = Pick<
  UiState,
  'selectedId' | 'layout' | 'insetSwapped' | 'tab' | 'renderStyle' | 'camera' | 'webglAvailable' | 'lookup'
>;

function initialUi(): UiData {
  return {
    selectedId: null,
    layout: 'inset',
    insetSwapped: false,
    tab: '2d',
    renderStyle: 'realistic',
    camera: { ...CONFIG.camera },
    webglAvailable: true,
    lookup: { status: 'idle' },
  };
}

export const useUiStore = create<UiState>()((set) => ({
  ...initialUi(),

  select: (selectedId) => set({ selectedId }),
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
  reset: () => set(initialUi()),
}));
