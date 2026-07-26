import type { TreeNode, LayoutResult, RenderElement, Rect } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth, wrapText, LINE_HEIGHT, TEXT_PAD_Y, TEXT_PAD_X, truncateWithEllipsis } from "../text";

const NODE_GAP = 16;
const COL_GAP = 60;
const MIN_W = 155;

export const PROP_FONT_SIZE = 10;
export const PROP_PADDING_Y = 4;
export const DIVIDER_MARGIN_Y = 6;
export const NAME_GAP = 8;

/** Compute box size for any node, accounting for properties and tags */
export function nodeSize(n: TreeNode): {
  w: number;
  h: number;
  headerH: number;
  tagsValue: string;
  tagAreaH: number;
  tagLines: string[];
  propRows: { name: string; value: string; h: number; lines: string[] }[]
} {
  const isRoot = n.depth === 0;
  const fontSize = isRoot ? 16 : 12;
  const fontWeight = isRoot ? 700 : 600;
  const baseW = isRoot ? 200 : MIN_W;
  const w = adaptiveWidth(n.name, baseW, fontSize, fontWeight);

  const tagsValue = (n.tags && n.tags.length > 0)
    ? n.tags.map(t => t.title).join(", ")
    : "N/A";

  const nameWidthLimit = (w - TEXT_PAD_X * 2) * 0.4;
  const valueSpace = w - TEXT_PAD_X * 2 - nameWidthLimit - NAME_GAP;

  const tagLines = wrapText(tagsValue, valueSpace, PROP_FONT_SIZE, 400);
  const tagRowH = tagLines.length * PROP_FONT_SIZE * LINE_HEIGHT + PROP_PADDING_Y * 2;
  const tagAreaH = tagRowH + DIVIDER_MARGIN_Y * 2;

  const headerH = measureBoxHeight(n.name, w, fontSize, fontWeight, isRoot ? 60 : 36);

  const propRows: { name: string; value: string; h: number; lines: string[] }[] = [];
  let totalPropH = 0;

  if (n.properties && n.properties.length > 0) {
    for (const prop of n.properties) {
      const propLines = wrapText(prop.value, valueSpace, PROP_FONT_SIZE, 400);
      const rowH = propLines.length * PROP_FONT_SIZE * LINE_HEIGHT + PROP_PADDING_Y * 2;
      propRows.push({ name: prop.name, value: prop.value, h: rowH, lines: propLines });
      totalPropH += rowH;
    }
  }

  const h = tagAreaH + headerH + (propRows.length > 0 ? (DIVIDER_MARGIN_Y * 2 + totalPropH) : 0);

  return { w, h, headerH, tagsValue, tagAreaH, tagLines, propRows };
}

/** Draws the ERD node structure (box, tag row, divider, title, properties, dividers) */
export function drawERDNode(
  node: TreeNode,
  x: number,
  y: number,
  w: number,
  h: number,
  headerH: number,
  tagsValue: string,
  propRows: { name: string; value: string; h: number; lines?: string[] }[],
  isRoot: boolean,
  isLeaf: boolean,
  parentColorIndex: number,
  tagLines?: string[]
): RenderElement[] {
  const els: RenderElement[] = [];
  const cy = y + h / 2;
  const colorIdx = isRoot ? 0 : parentColorIndex;
  const c = branchColor(colorIdx);

  // Root glow
  if (isRoot) {
    els.push({ type: "dot", x: x + w / 2, y: cy, r: 60, color: theme().rootGlow1 });
    els.push({ type: "dot", x: x + w / 2, y: cy, r: 45, color: theme().rootGlow2 });
  }

  // Node box
  els.push({
    type: "box", x, y, w, h,
    fill: isRoot ? theme().rootBoxFill : (isLeaf ? c.leafFill : c.fill),
    stroke: isRoot ? theme().rootStroke : (isLeaf ? c.leafStroke : c.stroke),
    lw: isRoot ? 2.5 : (isLeaf ? 0.8 : 1.5),
    rad: isRoot ? 14 : (isLeaf ? 6 : 8),
    uuid: node.uuid,
  });

  const headerTextColor = isRoot ? ROOT_TEXT() : (isLeaf ? LEAF_TEXT() : c.text);

  // Tags row at the top
  const lineH = PROP_FONT_SIZE * LINE_HEIGHT;
  let actualTagLines = tagLines;
  if (!actualTagLines) {
    const nameWidthLimit = (w - TEXT_PAD_X * 2) * 0.4;
    const valueSpace = w - TEXT_PAD_X * 2 - nameWidthLimit - NAME_GAP;
    actualTagLines = wrapText(tagsValue, valueSpace, PROP_FONT_SIZE, 400);
  }
  const tagRowH = actualTagLines.length * lineH + PROP_PADDING_Y * 2;
  const firstLineCenterY = y + PROP_PADDING_Y + lineH / 2;

  els.push({
    type: "text", text: "Tags:", x: x + TEXT_PAD_X, y: firstLineCenterY,
    color: headerTextColor, size: PROP_FONT_SIZE, weight: 700,
    align: "left", baseline: "middle",
  });

  actualTagLines.forEach((line, i) => {
    const centerY = y + PROP_PADDING_Y + i * lineH + lineH / 2;
    els.push({
      type: "text", text: line, x: x + w - TEXT_PAD_X, y: centerY,
      color: theme().muted || "#666", size: PROP_FONT_SIZE, weight: 400,
      align: "right", baseline: "middle",
    });
  });

  const tagDividerY = y + tagRowH + DIVIDER_MARGIN_Y;
  els.push({
    type: "line",
    x1: x + 4, y1: tagDividerY, x2: x + w - 4, y2: tagDividerY,
    color: theme().tableBorder || "#ccc", lw: 1,
  });

  const currentY = tagDividerY + DIVIDER_MARGIN_Y;

  // Header Title
  const titleLines = wrapText(node.name, w - TEXT_PAD_X * 2, isRoot ? 16 : 12, isRoot ? 700 : 600);
  const titleLineH = (isRoot ? 16 : 12) * LINE_HEIGHT;
  let textY = currentY + TEXT_PAD_Y + titleLineH / 2;

  for (const line of titleLines) {
    els.push({
      type: "text",
      text: line,
      x: x + w / 2,
      y: textY,
      color: headerTextColor,
      size: isRoot ? 16 : 12,
      weight: isRoot ? 700 : 600,
      align: "center",
      baseline: "middle",
    });
    textY += titleLineH;
  }

  // Properties
  if (propRows.length > 0) {
    const headerDividerY = currentY + headerH + DIVIDER_MARGIN_Y;
    els.push({
      type: "line",
      x1: x + 4, y1: headerDividerY, x2: x + w - 4, y2: headerDividerY,
      color: theme().tableBorder || "#ccc", lw: 1,
    });

    let propY = headerDividerY + DIVIDER_MARGIN_Y;
    propRows.forEach((row, i) => {
      const rowTop = propY;
      const rowBottom = propY + row.h;
      const labelY = rowTop + PROP_PADDING_Y + lineH / 2;

      if (i % 2 === 1 && theme().tableStripe) {
         els.push({
           type: "box", x: x + 1, y: rowTop, w: w - 2, h: row.h,
           fill: theme().tableStripe, stroke: "transparent", lw: 0, rad: 0
         });
      }

      els.push({
        type: "text", text: `${row.name}:`, x: x + TEXT_PAD_X, y: labelY,
        color: headerTextColor, size: PROP_FONT_SIZE, weight: 700,
        align: "left", baseline: "middle",
      });

      let actualLines = row.lines;
      if (!actualLines) {
        const nameWidthLimit = (w - TEXT_PAD_X * 2) * 0.4;
        const valueSpace = w - TEXT_PAD_X * 2 - nameWidthLimit - NAME_GAP;
        actualLines = wrapText(row.value, valueSpace, PROP_FONT_SIZE, 400);
      }

      actualLines.forEach((line, j) => {
        const centerY = rowTop + PROP_PADDING_Y + j * lineH + lineH / 2;
        els.push({
          type: "text", text: line, x: x + w - TEXT_PAD_X, y: centerY,
          color: theme().muted || "#666", size: PROP_FONT_SIZE, weight: 400,
          align: "right", baseline: "middle",
        });
      });

      els.push({
        type: "line", x1: x + 4, y1: rowBottom, x2: x + w - 4, y2: rowBottom,
        color: theme().tableBorder || "#ccc", lw: 1,
      });
      propY = rowBottom;
    });
  }

  return els;
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

/** ERD View: recursive left-to-right layout with property rows and tag badges */
export function layoutERD(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const nodeRectsByUuid = new Map<string, Rect>();
  let maxX = 0;

  function layoutNode(
    node: TreeNode,
    x: number,
    yStart: number,
    parentColorIndex: number
  ): { cy: number; height: number } {
    const { w, h, headerH, tagsValue, tagAreaH, tagLines, propRows } = nodeSize(node);
    const totalH = subtreeHeight(node);
    const cy = yStart + totalH / 2;
    const boxY = cy - h / 2;
    const isRoot = node.depth === 0;
    const colorIdx = isRoot ? 0 : parentColorIndex;
    const c = branchColor(colorIdx);
    const isLeaf = node.children.length === 0;

    // Draw using our extracted helper
    const nodeEls = drawERDNode(
      node,
      x,
      boxY,
      w,
      h,
      headerH,
      tagsValue,
      propRows,
      isRoot,
      isLeaf,
      colorIdx,
      tagLines
    );
    els.push(...nodeEls);

    if (node.uuid) nodeRectsByUuid.set(node.uuid, { x, y: boxY, w, h });
    maxX = Math.max(maxX, x + w);

    if (node.children.length) {
      const childX = x + w + COL_GAP;
      let childY = yStart;
      const childrenTotalH = node.children.reduce((s, c2) => s + subtreeHeight(c2), 0)
        + (node.children.length - 1) * NODE_GAP;
      childY = yStart + (totalH - childrenTotalH) / 2;

      node.children.forEach((child, ci) => {
        const childColorIdx = node.depth === 0 ? ci : parentColorIndex;
        const childResult = layoutNode(child, childX, childY, childColorIdx);
        const sx = x + w, sy = cy;
        const ex = childX, ey = childResult.cy;
        const cpx = (sx + ex) / 2;
        const curveColor = isRoot ? branchColor(ci).stroke + "80" : c.stroke + "40";
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
    nodeRectsByUuid,
  };
}
