/** Internal tree node converted from Logseq BlockEntity */
export interface TreeNode {
  name: string;
  children: TreeNode[];
  depth: number;
  id: number;
  uuid: string;
}

/** Positioned box element */
export interface BoxElement {
  type: "box";
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  stroke: string;
  lw: number;
  rad: number;
  text?: string;
  textColor?: string;
  textSize?: number;
  textWeight?: number;
  dash?: number[];
  uuid?: string;
}

/** Straight line element */
export interface LineElement {
  type: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lw: number;
}

/** Cubic bezier curve element */
export interface CurveElement {
  type: "curve";
  x1: number;
  y1: number;
  cx1: number;
  cy1: number;
  cx2: number;
  cy2: number;
  x2: number;
  y2: number;
  color: string;
  lw: number;
}

/** Standalone text element */
export interface TextElement {
  type: "text";
  text: string;
  x: number;
  y: number;
  color: string;
  size: number;
  weight: number;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
}

/** Filled circle element */
export interface DotElement {
  type: "dot";
  x: number;
  y: number;
  r: number;
  color: string;
}

export type RenderElement =
  | BoxElement
  | LineElement
  | CurveElement
  | TextElement
  | DotElement;

/** Output of a layout engine */
export interface LayoutResult {
  elements: RenderElement[];
  bounds: { x: number; y: number; w: number; h: number };
}

/** View identifiers */
export type ViewId =
  | "tree"
  | "table"
  | "roadmap_alt"
  | "roadmap"
  | "mind"
  | "rtree"
  | "fish"
  | "tmap";

/** View registry entry */
export interface ViewDef {
  id: ViewId;
  label: string;
  icon: string;
  layout: (root: TreeNode, maxDepth: number) => LayoutResult;
}

/** Pan/zoom transform state */
export interface Transform {
  ox: number;
  oy: number;
  scale: number;
}
