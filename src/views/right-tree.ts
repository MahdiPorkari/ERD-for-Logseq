import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

const NODE_GAP = 16;
const COL_GAP = 60;
const MIN_W = 155;

/** Compute box size for any node */
function nodeSize(n: TreeNode): { w: number; h: number } {
  const isRoot = n.depth === 0;
  const fontSize = isRoot ? 16 : 12;
  const fontWeight = isRoot ? 700 : 600;
  const baseW = isRoot ? 200 : MIN_W;
  const w = adaptiveWidth(n.name, baseW, fontSize, fontWeight);
  const h = measureBoxHeight(n.name, w, fontSize, fontWeight, isRoot ? 60 : 36);
  return { w, h };
}

/** Recursively compute the total height a subtree needs */
function subtreeHeight(node: TreeNode): number {
  if (!node.children.length) {
    return nodeSize(node).h;
  }
  const childrenH = node.children.reduce((s, c) => s + subtreeHeight(c), 0)
    + (node.children.length - 1) * NODE_GAP;
  return Math.max(nodeSize(node).h, childrenH);
}

/** Right Tree: recursive left-to-right layout for arbitrary depth */
export function layoutRightTree(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  let maxX = 0;

  function layoutNode(
    node: TreeNode,
    x: number,
    yStart: number,
    parentColorIndex: number
  ): { cy: number; height: number } {
    const { w, h } = nodeSize(node);
    const totalH = subtreeHeight(node);
    const cy = yStart + totalH / 2;
    const boxY = cy - h / 2;
    const isRoot = node.depth === 0;
    const colorIdx = node.depth === 0 ? 0 : (node.depth === 1 ? parentColorIndex : parentColorIndex);
    const c = branchColor(colorIdx);
    const isLeaf = node.children.length === 0;

    // Root glow
    if (isRoot) {
      els.push({ type: "dot", x: x + w / 2, y: cy, r: 60, color: theme().rootGlow1 });
      els.push({ type: "dot", x: x + w / 2, y: cy, r: 45, color: theme().rootGlow2 });
    }

    // Node box
    els.push({
      type: "box", x, y: boxY, w, h,
      fill: isRoot ? theme().rootBoxFill : (isLeaf ? c.leafFill : c.fill),
      stroke: isRoot ? theme().rootStroke : (isLeaf ? c.leafStroke : c.stroke),
      lw: isRoot ? 2.5 : (isLeaf ? 0.8 : 1.5),
      rad: isRoot ? 14 : (isLeaf ? 6 : 8),
      text: node.name,
      textColor: isRoot ? ROOT_TEXT() : (isLeaf ? LEAF_TEXT() : c.text),
      textSize: isRoot ? 16 : 12,
      textWeight: isRoot ? 700 : (isLeaf ? 400 : 600),
      dash: isLeaf ? c.dash : undefined,
      uuid: node.uuid,
    });

    maxX = Math.max(maxX, x + w);

    // Recurse into children
    if (node.children.length) {
      const childX = x + w + COL_GAP;
      let childY = yStart;
      const childrenTotalH = node.children.reduce((s, c2) => s + subtreeHeight(c2), 0)
        + (node.children.length - 1) * NODE_GAP;
      // Center children block within this node's total height
      childY = yStart + (totalH - childrenTotalH) / 2;

      node.children.forEach((child, ci) => {
        const childColorIdx = node.depth === 0 ? ci : parentColorIndex;
        const childResult = layoutNode(child, childX, childY, childColorIdx);

        // Bezier from parent right edge to child left edge
        const sx = x + w, sy = cy;
        const ex = childX, ey = childResult.cy;
        const cpx = (sx + ex) / 2;
        const curveColor = isRoot
          ? branchColor(ci).stroke + "80"
          : c.stroke + "40";
        els.push({
          type: "curve", x1: sx, y1: sy, cx1: cpx, cy1: sy, cx2: cpx, cy2: ey, x2: ex, y2: ey,
          color: curveColor, lw: isRoot ? 2.2 : 1.3,
        });

        childY += childResult.height + NODE_GAP;
      });
    }

    return { cy, height: totalH };
  }

  const result = layoutNode(root, 40, 40, 0);
  const totalH = result.height;

  return {
    elements: els,
    bounds: { x: 0, y: 0, w: maxX + 40, h: totalH + 80 },
  };
}
