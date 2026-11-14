export type Units = 'ft' | 'm';
export type Kind = 'sofa' | 'chair' | 'bed' | 'desk' | 'table' | 'shelf' | 'rug' | 'box';
export type Rot = 0 | 1 | 2 | 3;
export type ModelTier = 'retailer' | 'generated' | 'parametric' | 'box';
export type RoomAxis = 'w' | 'l' | 'h';
export interface Room { w: number; l: number; h: number }
export interface ItemModel { tier: ModelTier; label: string; assetUrl: string | null }
export interface Item {
  id: string; kind: Kind; name: string; host: string; sourceUrl: string | null;
  price: number | null; w: number; d: number; h: number;
  x: number; y: number; rot: Rot; model: ItemModel;
}
export interface PlanDocument { schemaVersion: 1; units: Units; room: Room; items: Item[] }
export interface ProductPreview {
  kind: Kind; name: string; host: string; sourceUrl: string; price: number | null;
  w: number; d: number; h: number; known: boolean; model: ItemModel;
}
export type LayoutMode = 'inset' | 'split' | 'tabs';
export type StageTab = '2d' | '3d';
export type RenderStyle = 'realistic' | 'blueprint';
export interface CameraState { yaw: number; pitch: number; zoom: number }
/** [u0,u1,v0,v1,z0,z1] fractions of width, depth, height; v=0 is the back edge */
export type PartRect = readonly [number, number, number, number, number, number];
export type Conflicts = Readonly<Record<string, string>>;
