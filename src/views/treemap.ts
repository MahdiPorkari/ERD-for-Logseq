import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, LEAF_TEXT } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

export interface TreemapHitBox {
  x: number;
  y: number;
  w: number;
  h: number;
  path: string[];
}

/** Shared hit boxes for breadcrumb hover — updated on each layout */
export let treemapHitBoxes: TreemapHitBox[] = [];

/** Minimum leaf cell dimensions */
const MIN_CELL_W = 140;
const MIN_CELL_H = 50;
const CONTAINER_PAD_TOP = 28;
const CONTAINER_PAD_SIDE = 6;
const CONTAINER_PAD_BOT = 6;
const CELL_GAP = 4;

interface CellSize {
  w: number;
  h: number;
}

/** Compute the ideal size for a leaf cell based on its text */
function leafSize(name: string): CellSize {
  const w = Math.max(MIN_CELL_W, adaptiveWidth(name, MIN_CELL_W, 12, 400, 400));
  const h = Math.max(MIN_CELL_H, measureBoxHeight(name, w, 12, 400, MIN_CELL_H));
  return { w, h };
}

/**
 * Compute the minimum size a subtree needs.
 * Leaves: their text-based size.
 * Containers: lay out children in rows that fit a reasonable aspect ratio.
 */
function computeSize(node: TreeNode): CellSize {
  if (!node.children.length) {
    return leafSize(node.name);
  }

  const childSizes = node.children.map((c) => computeSize(c));

  // Lay out children in rows, targeting roughly square overall shape
  const totalChildArea = childSizes.reduce((s, cs) => s + cs.w * cs.h, 0);
  const targetW = Math.sqrt(totalChildArea * 1.6); // ~16:10 aspect

  // Pack children into rows
  let rowW = 0;
  let rowH = 0;
  let totalH = 0;
  let maxW = 0;

  for (const cs of childSizes) {
    if (rowW > 0 && rowW + cs.w + CELL_GAP > targetW) {
      // Start new row
      totalH += rowH + CELL_GAP;
      maxW = Math.max(maxW, rowW);
      rowW = 0;
      rowH = 0;
    }
    rowW += (rowW > 0 ? CELL_GAP : 0) + cs.w;
    rowH = Math.max(rowH, cs.h);
  }
  // Last row
  totalH += rowH;
  maxW = Math.max(maxW, rowW);

  return {
    w: maxW + CONTAINER_PAD_SIDE * 2,
    h: totalH + CONTAINER_PAD_TOP + CONTAINER_PAD_BOT,
  };
}

/** Treemap: nested rectangles with content-aware sizing */
export function layoutTreemap(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  treemapHitBoxes = [];

  // Pre-compute sizes for the whole tree
  const sizes = new Map<TreeNode, CellSize>();
  function cacheSizes(node: TreeNode): CellSize {
    const size = computeSize(node);
    sizes.set(node, size);
    node.children.forEach((c) => cacheSizes(c));
    return size;
  }
  const rootSize = cacheSizes(root);

  function layoutCell(
    n: TreeNode,
    x: number,
    y: number,
    availW: number,
    availH: number,
    d: number,
    path: string[]
  ): void {
    const fullPath = [...path, n.name];

    if (!n.children.length) {
      // Leaf cell
      const c = branchColor(d);
      els.push({
        type: "box",
        x: x + 1,
        y: y + 1,
        w: availW - 2,
        h: availH - 2,
        fill: c.leafFill,
        stroke: c.leafStroke,
        lw: 0.8,
        rad: 4,
        dash: c.dash,
        text: availW > 30 && availH > 20 ? n.name : undefined,
        textColor: LEAF_TEXT(),
        textSize: 12,
        textWeight: 400,
      });
      treemapHitBoxes.push({ x: x + 1, y: y + 1, w: availW - 2, h: availH - 2, path: fullPath });
      return;
    }

    // Container cell
    const c = branchColor(d);
    els.push({
      type: "box",
      x,
      y,
      w: availW,
      h: availH,
      fill: c.fill,
      stroke: c.stroke,
      lw: d < 2 ? 1.5 : 1,
      rad: 4,
    });

    // Container label
    if (availW > 30) {
      const labelSize = d < 2 ? Math.min(13, availW / 10) : 12;
      const labelH = Math.min(22, CONTAINER_PAD_TOP - 4);
      els.push({
        type: "box",
        x: x + 2,
        y: y + 2,
        w: availW - 4,
        h: labelH,
        fill: "transparent",
        stroke: "transparent",
        lw: 0,
        rad: 0,
        text: n.name,
        textColor: c.text,
        textSize: labelSize,
        textWeight: 700,
      });
    }
    treemapHitBoxes.push({ x, y, w: availW, h: availH, path: fullPath });

    // Layout children in rows within the container's inner area
    const innerX = x + CONTAINER_PAD_SIDE;
    const innerY = y + CONTAINER_PAD_TOP;
    const innerW = availW - CONTAINER_PAD_SIDE * 2;
    const innerH = availH - CONTAINER_PAD_TOP - CONTAINER_PAD_BOT;

    const childSizes = n.children.map((ch) => sizes.get(ch) ?? { w: MIN_CELL_W, h: MIN_CELL_H });

    // Pack children into rows fitting innerW
    const rows: Array<{ children: TreeNode[]; sizes: CellSize[]; rowH: number }> = [];
    let curRow: TreeNode[] = [];
    let curSizes: CellSize[] = [];
    let curRowW = 0;
    let curRowH = 0;

    n.children.forEach((ch, ci) => {
      const cs = childSizes[ci];
      if (curRow.length > 0 && curRowW + cs.w + CELL_GAP > innerW) {
        rows.push({ children: curRow, sizes: curSizes, rowH: curRowH });
        curRow = [];
        curSizes = [];
        curRowW = 0;
        curRowH = 0;
      }
      curRow.push(ch);
      curSizes.push(cs);
      curRowW += (curRow.length > 1 ? CELL_GAP : 0) + cs.w;
      curRowH = Math.max(curRowH, cs.h);
    });
    if (curRow.length > 0) {
      rows.push({ children: curRow, sizes: curSizes, rowH: curRowH });
    }

    // Compute total rows height for vertical scaling
    const totalRowsH = rows.reduce((s, r) => s + r.rowH, 0) + Math.max(0, rows.length - 1) * CELL_GAP;
    const vScale = totalRowsH > 0 ? Math.min(1, innerH / totalRowsH) : 1;

    let rowY = innerY;
    for (const row of rows) {
      const scaledRowH = row.rowH * vScale;

      // Compute total row width for horizontal scaling
      const totalRowW = row.sizes.reduce((s, cs) => s + cs.w, 0) + Math.max(0, row.sizes.length - 1) * CELL_GAP;
      const hScale = totalRowW > 0 ? Math.min(1, innerW / totalRowW) : 1;

      let cellX = innerX;
      row.children.forEach((ch, ci) => {
        const cs = row.sizes[ci];
        const cellW = cs.w * hScale;
        const cellH = scaledRowH;

        layoutCell(ch, cellX, rowY, cellW, cellH, d + 1, fullPath);
        cellX += cellW + CELL_GAP * hScale;
      });

      rowY += scaledRowH + CELL_GAP * vScale;
    }
  }

  layoutCell(root, 0, 0, rootSize.w, rootSize.h, 0, []);

  return {
    elements: els,
    bounds: { x: -10, y: -10, w: rootSize.w + 20, h: rootSize.h + 20 },
  };
}
