import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, MUTED } from "../colors";

/** Count leaf nodes for spanning */
function countLeaves(n: TreeNode): number {
  return n.children.length ? n.children.reduce((s, c) => s + countLeaves(c), 0) : 1;
}

/** Find max depth */
function maxDepth(n: TreeNode, d = 0): number {
  return n.children.length ? Math.max(...n.children.map((c) => maxDepth(c, d + 1))) : d;
}

interface Cell {
  text: string;
  span: number;
  depth: number;
  isLeaf: boolean;
  empty?: boolean;
}

/** Tree Table: spanning-cell matrix with alternating stripes */
export function layoutTreeTable(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const md = maxDepth(root);
  const cW = 185, rH = 36, hH = 40, p = 12;
  const tW = cW * md + p * 2;
  const rows: Cell[][] = [];

  function walk(n: TreeNode, d: number): void {
    const sp = countLeaves(n);
    if (!n.children.length) {
      const r: Cell[] = [{ text: n.name, span: 1, depth: d, isLeaf: true }];
      for (let i = d + 1; i < md; i++) r.push({ text: "", span: 1, depth: i, isLeaf: true, empty: true });
      rows.push(r);
    } else {
      n.children.forEach((c, ci) => {
        const b = rows.length;
        walk(c, d + 1);
        if (ci === 0) rows[b].unshift({ text: n.name, span: sp, depth: d, isLeaf: false });
      });
    }
  }
  root.children.forEach((c) => walk(c, 0));

  const tH = hH + rows.length * rH + p;

  // Background
  els.push({ type: "box", x: 0, y: 0, w: tW, h: tH, fill: "#111318", stroke: "#2b2d35", lw: 1, rad: 0 });

  // Column headers
  const headerLabels = ["Group", "Category", "Sub-category", "Item", "Detail", "Attribute"];
  for (let d = 0; d < md; d++) {
    els.push({ type: "box", x: p + d * cW, y: 0, w: cW, h: hH, fill: "#1a1d24", stroke: "#2b2d35", lw: 0.5, rad: 0 });
    const label = d < headerLabels.length ? headerLabels[d] : `Level ${d + 1}`;
    els.push({ type: "text", text: label, x: p + d * cW + cW / 2, y: hH / 2, color: MUTED, size: 10, weight: 600, align: "center" });
  }
  els.push({ type: "line", x1: 0, y1: hH, x2: tW, y2: hH, color: "#46a758", lw: 2 });

  // Cells
  const placed: boolean[][] = Array.from({ length: rows.length }, () => Array(md).fill(false));
  rows.forEach((row, ri) => {
    // Alternating stripe
    if (ri % 2 === 1) {
      els.push({ type: "box", x: p, y: hH + ri * rH, w: tW - p * 2, h: rH, fill: "#ffffff04", stroke: "transparent", lw: 0, rad: 0 });
    }
    let ci = 0;
    for (const cell of row) {
      while (ci < md && placed[ri][ci]) ci++;
      if (ci >= md) break;
      for (let s = 0; s < cell.span; s++) if (ri + s < rows.length) placed[ri + s][ci] = true;
      if (!cell.empty) {
        const c = branchColor(cell.depth);
        const cx = p + ci * cW, cy = hH + ri * rH, ch = cell.span * rH;
        els.push({
          type: "box", x: cx + 1, y: cy + 1, w: cW - 2, h: ch - 2,
          fill: cell.isLeaf ? "transparent" : c.fill, stroke: "#2b2d35", lw: 0.5, rad: 0,
        });
        if (!cell.isLeaf) {
          els.push({ type: "line", x1: cx + 1, y1: cy + 1, x2: cx + 1, y2: cy + ch - 2, color: c.stroke, lw: 3 });
        }
        els.push({
          type: "text", text: cell.text, x: cx + 16, y: cy + ch / 2,
          color: cell.isLeaf ? MUTED : ROOT_TEXT,
          size: cell.isLeaf ? 11 : 12, weight: cell.isLeaf ? 400 : 600, align: "left",
        });
      }
      ci++;
    }
  });

  return { elements: els, bounds: { x: 0, y: 0, w: tW, h: tH } };
}
