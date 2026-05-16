import type { TreeNode, LayoutResult, RenderElement, Rect } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

const NODE_GAP = 12;
const COL_GAP = 60;
const MIN_W = 155;

function nodeSize(n: TreeNode): { w: number; h: number } {
  const isRoot = n.depth === 0;
  const fontSize = isRoot ? 16 : 12;
  const fontWeight = isRoot ? 700 : (n.children.length ? 600 : 400);
  const baseW = isRoot ? 200 : MIN_W;
  const w = adaptiveWidth(n.name, baseW, fontSize, fontWeight);
  const h = measureBoxHeight(n.name, w, fontSize, fontWeight, isRoot ? 60 : 32);
  return { w, h };
}

function subtreeHeight(node: TreeNode): number {
  if (!node.children.length) return nodeSize(node).h;
  const childrenH = node.children.reduce((s, c) => s + subtreeHeight(c), 0)
    + (node.children.length - 1) * NODE_GAP;
  return Math.max(nodeSize(node).h, childrenH);
}

/** Recursively compute max X extent of a subtree */
function subtreeWidth(node: TreeNode): number {
  const { w } = nodeSize(node);
  if (!node.children.length) return w;
  const maxChildW = Math.max(...node.children.map((c) => subtreeWidth(c)));
  return w + COL_GAP + maxChildW;
}

/** Mind Map: bilateral layout — branches split left/right, recursive depth */
export function layoutMindMap(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const nodeRectsByUuid = new Map<string, Rect>();
  const br = root.children;

  const rightBr = br.slice(0, Math.ceil(br.length / 2));
  const leftBr = br.slice(Math.ceil(br.length / 2));

  function sideHeight(list: TreeNode[]): number {
    return list.reduce((s, b) => s + subtreeHeight(b), 0) + (list.length - 1) * NODE_GAP;
  }

  const rootSize = nodeSize(root);
  const rightH = sideHeight(rightBr);
  const leftH = sideHeight(leftBr);
  const maxH = Math.max(rightH, leftH, rootSize.h);
  const centerY = 50 + maxH / 2;

  // Compute horizontal extent for positioning root
  const rightExtent = rightBr.length ? Math.max(...rightBr.map((b) => subtreeWidth(b))) : 0;
  const leftExtent = leftBr.length ? Math.max(...leftBr.map((b) => subtreeWidth(b))) : 0;
  const rootCx = 50 + leftExtent + COL_GAP + rootSize.w / 2;

  // Root glow
  els.push({ type: "dot", x: rootCx, y: centerY, r: 60, color: theme().rootGlow1 });
  els.push({ type: "dot", x: rootCx, y: centerY, r: 45, color: theme().rootGlow2 });

  // Root box
  els.push({
    type: "box", x: rootCx - rootSize.w / 2, y: centerY - rootSize.h / 2,
    w: rootSize.w, h: rootSize.h,
    fill: theme().rootBoxFill, stroke: theme().rootStroke, lw: 2.5, rad: 14,
    text: root.name, textColor: ROOT_TEXT(), textSize: 16, textWeight: 700,
    uuid: root.uuid,
  });
  if (root.uuid) {
    nodeRectsByUuid.set(root.uuid, {
      x: rootCx - rootSize.w / 2,
      y: centerY - rootSize.h / 2,
      w: rootSize.w,
      h: rootSize.h,
    });
  }

  function layoutSubtree(
    node: TreeNode,
    x: number,
    yStart: number,
    isRight: boolean,
    colorIdx: number
  ): { cy: number; height: number } {
    const { w, h } = nodeSize(node);
    const totalH = subtreeHeight(node);
    const cy = yStart + totalH / 2;
    const boxY = cy - h / 2;
    const c = branchColor(colorIdx);
    const isLeaf = node.children.length === 0;

    els.push({
      type: "box", x, y: boxY, w, h,
      fill: isLeaf ? c.leafFill : c.fill,
      stroke: isLeaf ? c.leafStroke : c.stroke,
      lw: isLeaf ? 0.8 : 1.5, rad: isLeaf ? 6 : 8,
      text: node.name,
      textColor: isLeaf ? LEAF_TEXT() : c.text,
      textSize: 12, textWeight: isLeaf ? 400 : 600,
      dash: isLeaf ? c.dash : undefined,
      uuid: node.uuid,
    });
    if (node.uuid) nodeRectsByUuid.set(node.uuid, { x, y: boxY, w, h });

    if (node.children.length) {
      const childrenTotalH = node.children.reduce((s, c2) => s + subtreeHeight(c2), 0)
        + (node.children.length - 1) * NODE_GAP;
      let childY = yStart + (totalH - childrenTotalH) / 2;

      node.children.forEach((child) => {
        const childSize = nodeSize(child);
        const childX = isRight ? x + w + COL_GAP : x - COL_GAP - childSize.w;
        const childResult = layoutSubtree(child, childX, childY, isRight, colorIdx);

        const sx = isRight ? x + w : x;
        const ex = isRight ? childX : childX + childSize.w;
        const cpx = (sx + ex) / 2;
        els.push({
          type: "curve", x1: sx, y1: cy, cx1: cpx, cy1: cy, cx2: cpx, cy2: childResult.cy, x2: ex, y2: childResult.cy,
          color: c.stroke + "40", lw: 1.3,
        });

        childY += childResult.height + NODE_GAP;
      });
    }

    return { cy, height: totalH };
  }

  // Render right side
  let rightY = centerY - rightH / 2;
  rightBr.forEach((b, i) => {
    const bSize = nodeSize(b);
    const bx = rootCx + rootSize.w / 2 + COL_GAP;
    const result = layoutSubtree(b, bx, rightY, true, i);

    // Root → branch curve
    const cpx = (rootCx + rootSize.w / 2 + bx) / 2;
    els.push({
      type: "curve", x1: rootCx + rootSize.w / 2, y1: centerY,
      cx1: cpx, cy1: centerY, cx2: cpx, cy2: result.cy,
      x2: bx, y2: result.cy,
      color: branchColor(i).stroke + "80", lw: 2.2,
    });

    rightY += result.height + NODE_GAP;
  });

  // Render left side
  let leftY = centerY - leftH / 2;
  leftBr.forEach((b, i) => {
    const bi = rightBr.length + i;
    const bSize = nodeSize(b);
    const bx = rootCx - rootSize.w / 2 - COL_GAP - bSize.w;
    const result = layoutSubtree(b, bx, leftY, false, bi);

    const cpx = (rootCx - rootSize.w / 2 + bx + bSize.w) / 2;
    els.push({
      type: "curve", x1: rootCx - rootSize.w / 2, y1: centerY,
      cx1: cpx, cy1: centerY, cx2: cpx, cy2: result.cy,
      x2: bx + bSize.w, y2: result.cy,
      color: branchColor(bi).stroke + "80", lw: 2.2,
    });

    leftY += result.height + NODE_GAP;
  });

  const totalW = 50 + leftExtent + COL_GAP + rootSize.w + COL_GAP + rightExtent + 50;
  return {
    elements: els,
    bounds: { x: 0, y: 0, w: totalW, h: maxH + 100 },
    nodeRectsByUuid,
  };
}
