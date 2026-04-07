import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, LEAF_TEXT } from "../colors";
import { measureBoxHeight } from "../text";

export interface TreemapHitBox {
  x: number;
  y: number;
  w: number;
  h: number;
  path: string[];
}

/** Shared hit boxes for breadcrumb hover — updated on each layout */
export let treemapHitBoxes: TreemapHitBox[] = [];

/** Minimum leaf cell width for readable text */
const MIN_CELL_W = 160;
/** Minimum leaf cell height */
const MIN_CELL_H = 60;
/** Area weight per character of text (longer text gets more space) */
const CHAR_WEIGHT = 3;
/** Base area for any node regardless of text length */
const BASE_WEIGHT = 40;

/** Compute area weight based on text content — longer text gets proportionally more space */
function contentArea(n: TreeNode): number {
  if (!n.children.length) {
    return BASE_WEIGHT + n.name.length * CHAR_WEIGHT;
  }
  return n.children.reduce((s, c) => s + contentArea(c), 0);
}

/** Count total leaf nodes */
function countLeaves(n: TreeNode): number {
  if (!n.children.length) return 1;
  return n.children.reduce((s, c) => s + countLeaves(c), 0);
}

/** Treemap: nested rectangles with content-aware sizing */
export function layoutTreemap(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  treemapHitBoxes = [];

  // Scale viewport based on content volume
  const leaves = countLeaves(root);
  const totalContent = contentArea(root);
  // Ensure enough area: each leaf needs at least MIN_CELL_W * MIN_CELL_H pixels
  const minArea = leaves * MIN_CELL_W * MIN_CELL_H;
  const contentArea_ = Math.max(minArea, totalContent * 12);
  // Compute viewport with ~16:10 aspect ratio
  const aspect = 1.6;
  const W = Math.max(900, Math.round(Math.sqrt(contentArea_ * aspect)));
  const H = Math.max(580, Math.round(W / aspect));

  function sq(n: TreeNode, x: number, y: number, w: number, h: number, d: number, path: string[]): void {
    const fullPath = [...path, n.name];

    if (!n.children.length) {
      const c = branchColor(d);
      const fontSize = 12;
      const cellW = w - 3;
      const cellH = h - 3;
      // Compute needed height for wrapped text to decide if we can show it
      const neededH = cellW > 20 ? measureBoxHeight(n.name, cellW, fontSize, 400, 14) : 999;
      const showText = cellW > 30 && cellH >= Math.min(neededH, 28);

      els.push({
        type: "box", x: x + 1, y: y + 1, w: cellW, h: cellH,
        fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 4, dash: c.dash,
        text: showText ? n.name : undefined,
        textColor: LEAF_TEXT,
        textSize: fontSize,
        textWeight: 400,
      });
      treemapHitBoxes.push({ x: x + 1, y: y + 1, w: cellW, h: cellH, path: fullPath });
      return;
    }

    const c = branchColor(d);
    const labelSize = d < 2 ? Math.min(13, w / 10) : 12;
    els.push({
      type: "box", x, y, w: w - 1, h: h - 1,
      fill: c.fill, stroke: c.stroke, lw: d < 2 ? 1.5 : 1, rad: 4,
    });
    // Container label in header area
    if (w > 30) {
      const labelH = measureBoxHeight(n.name, w - 5, labelSize, 700, 18);
      els.push({
        type: "box", x: x + 2, y: y + 2, w: w - 5, h: Math.min(labelH, 20),
        fill: "transparent", stroke: "transparent", lw: 0, rad: 0,
        text: n.name, textColor: c.text, textSize: labelSize, textWeight: 700,
      });
    }
    treemapHitBoxes.push({ x, y, w: w - 1, h: h - 1, path: fullPath });

    // Inner padding
    const padTop = 24, padSide = 4, padBot = 4;
    const tot = n.children.reduce((s, c2) => s + contentArea(c2), 0);
    let off = 0;
    const iX = x + padSide, iY = y + padTop;
    const iW = w - padSide * 2 - 1, iH = h - padTop - padBot - 1;
    const hz = iW >= iH;

    n.children.forEach((ch) => {
      const r = contentArea(ch) / tot;
      sq(ch, hz ? iX + off : iX, hz ? iY : iY + off, hz ? iW * r : iW, hz ? iH : iH * r, d + 1, fullPath);
      off += hz ? iW * r : iH * r;
    });
  }

  sq(root, 0, 0, W, H, 0, []);
  return { elements: els, bounds: { x: -10, y: -10, w: W + 20, h: H + 20 } };
}
