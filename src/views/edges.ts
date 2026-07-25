import type { TreeNode, RenderElement, Rect, RelKind, CurveElement } from "../types";
import { theme, branchColor } from "../colors";
import { nodeSize, PROP_FONT_SIZE, PROP_PADDING_Y, DIVIDER_MARGIN_Y } from "./erd";

interface Edge {
  x1: number; y1: number;
  cx1: number; cy1: number;
  cx2: number; cy2: number;
  x2: number; y2: number;
}

function getSourceAnchorOffset(node: TreeNode, refKind: string, rectH: number): number {
  const { headerH, tagAreaH, h } = nodeSize(node);
  const rowH = PROP_FONT_SIZE * 1.2 + PROP_PADDING_Y * 2;

  let computedY = h / 2;

  if (node.properties && node.properties.length > 0) {
    const normalizedKind = refKind.toLowerCase().replace(/[_-]/g, " ").trim();
    const idx = node.properties.findIndex(p => {
      const normalizedPropName = p.name.toLowerCase().replace(/[_-]/g, " ").trim();
      return normalizedPropName === normalizedKind;
    });

    if (idx !== -1) {
      computedY = tagAreaH + headerH + DIVIDER_MARGIN_Y * 2 + idx * rowH + rowH / 2;
    }
  }

  // Scale offset to fit the actual rect height (handles mock/test rects seamlessly)
  return rectH * (computedY / h);
}

function getTargetAnchorOffset(node: TreeNode, rectH: number): number {
  const { headerH, tagAreaH, h } = nodeSize(node);
  const computedY = tagAreaH + headerH / 2;

  // Scale offset to fit the actual rect height
  return rectH * (computedY / h);
}

function pickERDEdgeGeometry(
  source: Rect,
  target: Rect,
  sourceOffsetY: number,
  targetOffsetY: number
): Edge {
  const isSelf = source.x === target.x && source.y === target.y;

  // Check horizontal overlap
  const overlap = !(source.x + source.w < target.x || target.x + target.w < source.x);
  const dy = (target.y + targetOffsetY) - (source.y + sourceOffsetY);

  let x1 = source.x + source.w;
  let y1 = source.y + sourceOffsetY;
  let x2 = target.x;
  let y2 = target.y + targetOffsetY;

  if (isSelf) {
    // Self-reference / loop edge: bulge out to the right and loop back to the left
    const bulge = 60;
    return {
      x1, y1,
      cx1: x1 + bulge, cy1: y1,
      cx2: x2 - bulge, cy2: y2,
      x2, y2,
    };
  }

  if (overlap && Math.abs(dy) > 8) {
    // Stacked: same-side anchors (both right), bulge outward to the right.
    x1 = source.x + source.w;
    x2 = target.x + target.w;
    const bulge = Math.max(50, Math.abs(dy) * 0.45);
    return {
      x1, y1,
      cx1: x1 + bulge, cy1: y1,
      cx2: x2 + bulge, cy2: y2,
      x2, y2,
    };
  }

  // Horizontal/Vertical dominant curves
  const sourceCx = source.x + source.w / 2;
  const targetCx = target.x + target.w / 2;
  const dxCenter = targetCx - sourceCx;
  const dyCenter = (target.y + target.h / 2) - (source.y + source.h / 2);

  if (!overlap && Math.abs(dxCenter) < Math.abs(dyCenter)) {
    // Vertical-dominant (no x-overlap): anchor on top/bottom faces, mid-y controls.
    const fromX = sourceCx;
    const fromY = dyCenter >= 0 ? source.y + source.h : source.y;
    const toX = targetCx;
    const toY = dyCenter >= 0 ? target.y : target.y + target.h;
    const midY = (fromY + toY) / 2;
    return {
      x1: fromX, y1: fromY,
      cx1: fromX, cy1: midY,
      cx2: toX, cy2: midY,
      x2: toX, y2: toY,
    };
  }

  // Horizontal-dominant: anchor on facing left/right faces, mid-x control points.
  const isTargetToRight = target.x + target.w / 2 >= source.x + source.w / 2;
  x1 = isTargetToRight ? source.x + source.w : source.x;
  x2 = isTargetToRight ? target.x : target.x + target.w;

  const controlOffset = Math.max(40, Math.abs(x2 - x1) * 0.5);

  return {
    x1, y1,
    cx1: isTargetToRight ? x1 + controlOffset : x1 - controlOffset, cy1: y1,
    cx2: isTargetToRight ? x2 - controlOffset : x2 + controlOffset, cy2: y2,
    x2, y2,
  };
}

/** Point at t=0.5 on a cubic bezier — the perceptual midpoint of the curve. */
function bezierMidpoint(g: Edge): { x: number; y: number } {
  return {
    x: 0.125 * g.x1 + 0.375 * g.cx1 + 0.375 * g.cx2 + 0.125 * g.x2,
    y: 0.125 * g.y1 + 0.375 * g.cy1 + 0.375 * g.cy2 + 0.125 * g.y2,
  };
}

const LABEL_FONT_SIZE = 10;
const LABEL_H = 16;
const LABEL_PAD_X = 7;
const LABEL_CHAR_W = LABEL_FONT_SIZE * 0.62; // IBM Plex Mono approx

function makeEdge(
  source: Rect,
  target: Rect,
  kind: RelKind,
  sourceOffsetY: number,
  targetOffsetY: number
): CurveElement {
  const g = pickERDEdgeGeometry(source, target, sourceOffsetY, targetOffsetY);
  const t_ = theme();

  if (kind === "parent-child") {
    return {
      type: "curve", ...g,
      color: t_.connectorDepends,
      lw: 1.6,
      arrowEnd: true,
    };
  }
  if (kind === "reference") {
    return {
      type: "curve", ...g,
      color: t_.connectorRelates,
      lw: 1.4,
      dash: [6, 4],
      arrowEnd: true,
    };
  }
  if (kind === "tag") {
    const tagColor = branchColor(2).stroke; // purple from available theme colors
    return {
      type: "curve", ...g,
      color: tagColor,
      lw: 1.4,
      dash: [2, 4],
      arrowEnd: false,
    };
  }
  if (kind === "property") {
    const propColor = branchColor(0).stroke; // blue from available theme colors
    return {
      type: "curve", ...g,
      color: propColor,
      lw: 1.4,
      dash: [8, 4, 2, 4],
      arrowEnd: true,
    };
  }

  // Fallback to legacy modes
  if (kind === "depends_on") {
    return {
      type: "curve", ...g,
      color: t_.connectorDepends,
      lw: 1.6,
      arrowEnd: true,
    };
  }
  // relates_to: dashed, no arrowhead
  return {
    type: "curve", ...g,
    color: t_.connectorRelates,
    lw: 1.3,
    dash: [6, 4],
  };
}

/**
 * Build connector overlay elements for every NodeRef whose source and target
 * are both present in `rectsByUuid`. Caller is expected to have already
 * filtered refs via `filterIntraTreeRefs` so a missing target rect is a
 * defensive skip, not the normal path.
 *
 * When `focusedUuid` is provided, only edges involving that node (as source
 * OR target) are emitted — this is the "lazy edges" UX where the diagram
 * stays clean at rest and edges fade in only for the selected node. Pass
 * `null` to suppress all edges (used by the static PNG macro renderer).
 * Pass `undefined` to emit every edge (the eager / preview behavior).
 */
export function buildEdgeElements(
  root: TreeNode,
  rectsByUuid: Map<string, Rect>,
  focusedUuid?: string | null
): RenderElement[] {
  if (focusedUuid === null) return [];
  const els: RenderElement[] = [];

  const nodesByUuid = new Map<string, TreeNode>();
  (function index(n: TreeNode) {
    if (n.uuid) nodesByUuid.set(n.uuid, n);
    for (const c of n.children) index(c);
  })(root);

  (function walk(node: TreeNode): void {
    if (node.uuid && node.refs && node.refs.length) {
      const source = rectsByUuid.get(node.uuid);
      if (source) {
        for (const ref of node.refs) {
          if (focusedUuid !== undefined && node.uuid !== focusedUuid && ref.targetUuid !== focusedUuid) {
            continue;
          }
          const target = rectsByUuid.get(ref.targetUuid);
          if (!target) continue;

          const targetNode = nodesByUuid.get(ref.targetUuid);
          const targetOffsetY = targetNode ? getTargetAnchorOffset(targetNode, target.h) : (target.h / 2);
          const sourceOffsetY = getSourceAnchorOffset(node, ref.kind, source.h);

          els.push(makeEdge(source, target, ref.kind, sourceOffsetY, targetOffsetY));
        }
      }
    }
    for (const child of node.children) walk(child);
  })(root);

  return els;
}

/**
 * Render property-name labels at the midpoint of every visible relationship
 * edge. Each label is a pill (solid bg-colored background so it occludes
 * crossing connectors) with the property name in muted text. Follows the
 * same focus regime as buildEdgeElements.
 */
export function buildEdgeLabels(
  root: TreeNode,
  rectsByUuid: Map<string, Rect>,
  focusedUuid?: string | null
): RenderElement[] {
  if (focusedUuid === null) return [];
  const els: RenderElement[] = [];
  const t_ = theme();

  const nodesByUuid = new Map<string, TreeNode>();
  (function index(n: TreeNode) {
    if (n.uuid) nodesByUuid.set(n.uuid, n);
    for (const c of n.children) index(c);
  })(root);

  (function walk(node: TreeNode): void {
    if (node.uuid && node.refs && node.refs.length) {
      const source = rectsByUuid.get(node.uuid);
      if (source) {
        for (const ref of node.refs) {
          if (focusedUuid !== undefined && node.uuid !== focusedUuid && ref.targetUuid !== focusedUuid) {
            continue;
          }
          const target = rectsByUuid.get(ref.targetUuid);
          if (!target) continue;

          if (
            ref.kind !== "relates_to" &&
            ref.kind !== "depends_on" &&
            ref.kind !== "parent-child" &&
            ref.kind !== "reference" &&
            ref.kind !== "tag" &&
            ref.kind !== "property"
          ) {
            continue;
          }

          const targetNode = nodesByUuid.get(ref.targetUuid);
          const targetOffsetY = targetNode ? getTargetAnchorOffset(targetNode, target.h) : (target.h / 2);
          const sourceOffsetY = getSourceAnchorOffset(node, ref.kind, source.h);

          const g = pickERDEdgeGeometry(source, target, sourceOffsetY, targetOffsetY);
          const mid = bezierMidpoint(g);
          const label = ref.kind;
          const w = label.length * LABEL_CHAR_W + LABEL_PAD_X * 2;

          let edgeColor = t_.connectorRelates;
          if (ref.kind === "parent-child" || ref.kind === "depends_on") {
            edgeColor = t_.connectorDepends;
          } else if (ref.kind === "tag") {
            edgeColor = branchColor(2).stroke;
          } else if (ref.kind === "property") {
            edgeColor = branchColor(0).stroke;
          }

          // Solid bg-colored pill to occlude crossing curves for readability.
          els.push({
            type: "box",
            x: mid.x - w / 2,
            y: mid.y - LABEL_H / 2,
            w, h: LABEL_H,
            fill: t_.bg,
            stroke: edgeColor,
            lw: 1,
            rad: LABEL_H / 2,
          });
          els.push({
            type: "text",
            text: label,
            x: mid.x,
            y: mid.y,
            color: t_.muted,
            size: LABEL_FONT_SIZE,
            weight: 500,
            align: "center",
            baseline: "middle",
          });
        }
      }
    }
    for (const child of node.children) walk(child);
  })(root);

  return els;
}
