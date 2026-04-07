import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, LEAF_TEXT } from "../colors";

export interface TreemapHitBox {
  x: number;
  y: number;
  w: number;
  h: number;
  path: string[];
}

/** Shared hit boxes for breadcrumb hover — updated on each layout */
export let treemapHitBoxes: TreemapHitBox[] = [];

function countArea(n: TreeNode): number {
  return 1 + n.children.reduce((s, c) => s + countArea(c), 0);
}

/** Treemap: nested rectangles with squarified layout */
export function layoutTreemap(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const W = 900, H = 580;
  treemapHitBoxes = [];

  function sq(n: TreeNode, x: number, y: number, w: number, h: number, d: number, path: string[]): void {
    const fullPath = [...path, n.name];

    if (!n.children.length) {
      const c = branchColor(d);
      els.push({
        type: "box", x: x + 1, y: y + 1, w: w - 3, h: h - 3,
        fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 4, dash: c.dash,
      });
      if (w > 32 && h > 14) {
        els.push({
          type: "text", text: n.name, x: x + 8, y: y + (h - 2) / 2,
          color: LEAF_TEXT, size: Math.max(12, Math.min(13, h / 2.2)), weight: 400, align: "left",
        });
      }
      treemapHitBoxes.push({ x: x + 1, y: y + 1, w: w - 3, h: h - 3, path: fullPath });
      return;
    }

    const c = branchColor(d);
    els.push({
      type: "box", x, y, w: w - 1, h: h - 1,
      fill: c.fill, stroke: c.stroke, lw: d < 2 ? 1.5 : 1, rad: 4,
    });
    const minLabelW = d < 2 ? 30 : 55;
    if (w > minLabelW) {
      const labelSize = d < 2 ? Math.min(13, w / 10) : 12;
      els.push({
        type: "text", text: n.name, x: x + 8, y: y + 13,
        color: c.text, size: labelSize, weight: 700, align: "left",
      });
    }
    treemapHitBoxes.push({ x, y, w: w - 1, h: h - 1, path: fullPath });

    // Inner padding
    const padTop = 24, padSide = 4, padBot = 4;
    const tot = n.children.reduce((s, c2) => s + countArea(c2), 0);
    let off = 0;
    const iX = x + padSide, iY = y + padTop;
    const iW = w - padSide * 2 - 1, iH = h - padTop - padBot - 1;
    const hz = iW >= iH;

    n.children.forEach((ch) => {
      const r = countArea(ch) / tot;
      sq(ch, hz ? iX + off : iX, hz ? iY : iY + off, hz ? iW * r : iW, hz ? iH : iH * r, d + 1, fullPath);
      off += hz ? iW * r : iH * r;
    });
  }

  sq(root, 0, 0, W, H, 0, []);
  return { elements: els, bounds: { x: -10, y: -10, w: W + 20, h: H + 20 } };
}
