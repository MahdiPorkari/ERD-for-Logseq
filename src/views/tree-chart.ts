import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

const NODE_GAP = 12;
const COL_GAP = 70;
const ZONE_PAD = 8;
const MIN_W = 175;

function nodeSize(n: TreeNode): { w: number; h: number } {
  const isRoot = n.depth === 0;
  const fontSize = isRoot ? 15 : 12;
  const fontWeight = isRoot ? 700 : 600;
  const baseW = isRoot ? 150 : MIN_W;
  const w = adaptiveWidth(n.name, baseW, fontSize, fontWeight);
  const h = measureBoxHeight(n.name, w, fontSize, fontWeight, isRoot ? 50 : 34);
  return { w, h };
}

function subtreeHeight(node: TreeNode): number {
  if (!node.children.length) return nodeSize(node).h;
  const childrenH = node.children.reduce((s, c) => s + subtreeHeight(c), 0)
    + (node.children.length - 1) * NODE_GAP;
  return Math.max(nodeSize(node).h, childrenH);
}

/** Tree Chart: recursive layout with root top-left, branches flowing right */
export function layoutTreeChart(root: TreeNode, _maxDepth: number): LayoutResult {
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
    const isLeaf = node.children.length === 0;
    const c = branchColor(parentColorIndex);

    // Background zone for depth-1 branches
    if (node.depth === 1) {
      els.push({
        type: "box", x: x - ZONE_PAD, y: yStart - ZONE_PAD,
        w: 0, h: totalH + ZONE_PAD * 2,
        fill: c.zone, stroke: c.stroke + "20", lw: 1, rad: 10, dash: c.dash,
      });
    }

    // Node box
    els.push({
      type: "box", x, y: boxY, w, h,
      fill: isRoot ? theme().rootFill : (isLeaf ? c.leafFill : c.fill),
      stroke: isRoot ? theme().rootStroke : (isLeaf ? c.leafStroke : c.stroke),
      lw: isRoot ? 2.5 : (isLeaf ? 0.8 : 1.5),
      rad: isRoot ? 10 : (isLeaf ? 6 : 8),
      text: isRoot ? node.name : (node.depth === 1 ? `${parentColorIndex + 1}. ${node.name}` : node.name),
      textColor: isRoot ? ROOT_TEXT() : (isLeaf ? LEAF_TEXT() : c.text),
      textSize: isRoot ? 15 : 12,
      textWeight: isRoot ? 700 : (isLeaf ? 400 : 600),
      dash: isLeaf ? c.dash : undefined,
      uuid: node.uuid,
    });

    maxX = Math.max(maxX, x + w);

    if (node.children.length) {
      const childX = x + w + COL_GAP;
      const childrenTotalH = node.children.reduce((s, c2) => s + subtreeHeight(c2), 0)
        + (node.children.length - 1) * NODE_GAP;
      let childY = yStart + (totalH - childrenTotalH) / 2;

      node.children.forEach((child, ci) => {
        const childColorIdx = isRoot ? ci : parentColorIndex;
        const childResult = layoutNode(child, childX, childY, childColorIdx);

        // Bezier curve
        const sx = x + w, sy = cy;
        const ex = childX, ey = childResult.cy;
        const cpx = (sx + ex) / 2;
        els.push({
          type: "curve", x1: sx, y1: sy, cx1: cpx, cy1: sy, cx2: cpx, cy2: ey, x2: ex, y2: ey,
          color: (isRoot ? branchColor(ci) : c).stroke + (isRoot ? "60" : "50"), lw: isRoot ? 2 : 1.5,
        });

        childY += childResult.height + NODE_GAP;
      });

      // Update zone width for depth-1 branches
      if (node.depth === 1) {
        const zoneEl = els.find(
          (e) => e.type === "box" && "fill" in e && e.fill === c.zone && e.y === yStart - ZONE_PAD
        );
        if (zoneEl && zoneEl.type === "box") {
          zoneEl.w = maxX - x + ZONE_PAD * 2;
        }
      }
    }

    return { cy, height: totalH };
  }

  const result = layoutNode(root, 25, 25, 0);
  return { elements: els, bounds: { x: 0, y: 0, w: maxX + 40, h: result.height + 50 } };
}
