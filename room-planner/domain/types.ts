export type Units = 'ft' | 'm';
export type Kind = 'sofa' | 'chair' | 'bed' | 'desk' | 'table' | 'shelf' | 'rug' | 'box';
export type ModelTier = 'retailer' | 'generated' | 'parametric' | 'box';
/** A room: its outline (corners in order, positive signed area) and its ceiling height, in inches. */
export interface Room { outline: Corner[]; height: number }
export interface ItemModel { tier: ModelTier; label: string; assetUrl: string | null }
/**
 * A placed item. `x`, `y` are the centre of its footprint on the plan; `w` × `d` is its unturned
 * footprint, turned by `angle` degrees clockwise on the plan, in [0, 360).
 */
export interface Item {
  id: string; kind: Kind; name: string; host: string; sourceUrl: string | null;
  price: number | null; w: number; d: number; h: number;
  x: number; y: number; angle: number; model: ItemModel;
}
export interface PlanDocument { schemaVersion: 2; units: Units; room: Room; items: Item[] }
export interface ProductPreview {
  kind: Kind; name: string; host: string; sourceUrl: string; price: number | null;
  w: number; d: number; h: number; known: boolean; model: ItemModel;
}
export type LayoutMode = 'inset' | 'split' | 'tabs';
export type StageTab = '2d' | '3d';
export type RenderStyle = 'realistic' | 'blueprint';
/** Whether the plan edits furniture or the room outline. */
export type EditMode = 'furnish' | 'room';
export interface CameraState { yaw: number; pitch: number; zoom: number }
/** [u0,u1,v0,v1,z0,z1] fractions of width, depth, height; v=0 is the back edge */
export type PartRect = readonly [number, number, number, number, number, number];
export type Conflicts = Readonly<Record<string, string>>;
/** A plan-space position in inches; x to the right, y down the screen. */
export interface Point { x: number; y: number }
/** A room outline corner; the wall starting at this corner shares its id. */
export interface Corner extends Point { id: string }
/** Axis-aligned bounding box of a set of points; w = maxX − minX, l = maxY − minY. */
export interface Bounds { minX: number; minY: number; maxX: number; maxY: number; w: number; l: number }
/** A door in a wall: offset and width run along the wall from its start corner; hinge and swing set how it opens. */
export interface Door { id: string; kind: 'door'; wallId: string; offset: number; width: number; height: number; hinge: 'start' | 'end'; swing: 'in' | 'out' }
/** A window in a wall: sill is the height of its bottom edge above the floor. */
export interface WindowOpening { id: string; kind: 'window'; wallId: string; offset: number; width: number; sill: number; height: number }
/** Any opening in a wall. */
export type Opening = Door | WindowOpening;
/** A fixed obstacle on the floor; x, y are its centre, and a cylinder's diameter is width (its depth equals its width). */
export interface Obstacle { id: string; shape: 'box' | 'cylinder'; label: string; x: number; y: number; rotation: number; width: number; depth: number; height: number; elevation: number }
/** Which tool the room editor is using: drawing corners, or placing a door or window. */
export type RoomTool = 'corner' | 'door' | 'window';
/** The conflicts and warnings found in a plan, each keyed by item id. */
export interface PlanIssues { conflicts: Conflicts; warnings: Conflicts }
