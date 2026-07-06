import type { TreeNode, LayoutResult, RenderElement, Rect } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth, wrapText, LINE_HEIGHT, TEXT_PAD_Y, TEXT_PAD_X, truncateWithEllipsis } from "../text";

const NODE_GAP = 16;
const COL_GAP = 60;
const MIN_W = 155;
const TAG_FONT_SIZE = 9;
const PROP_FONT_SIZE = 10;
const PROP_PADDING_Y = 4;
const DIVIDER_MARGIN_Y = 6;
const NAME_GAP = 8;
const TAG_ROW_HEIGHT = 16;

/** Compute box size for any node, accounting for properties and tags */
function nodeSize(n: TreeNode): {
  w: number;
  h: number;
  headerH: number;
  tagH: number;
  propRows: { name: string; value: string; h: number }[]
} {
  const isRoot = n.depth === 0;
  const fontSize = isRoot ? 16 : 12;
  const fontWeight = isRoot ? 700 : 600;
  const baseW = isRoot ? 200 : MIN_W;
  const w = adaptiveWidth(n.name, baseW, fontSize, fontWeight);
  const headerH = measureBoxHeight(n.name, w, fontSize, fontWeight, isRoot ? 60 : 36);

  const tagH = (n.tags && n.tags.length > 0) ? TAG_ROW_HEIGHT : 0;

  const propRows: { name: string; value: string; h: number }[] = [];
  let totalPropH = 0;

  if (n.properties && n.properties.length > 0) {
    const rowH = PROP_FONT_SIZE * LINE_HEIGHT + PROP_PADDING_Y * 2;
    for (const prop of n.properties) {
      propRows.push({ name: prop.name, value: prop.value, h: rowH });
      totalPropH += rowH;
    }
  }

  const h = tagH + headerH + (propRows.length > 0 ? (DIVIDER_MARGIN_Y * 2 + totalPropH) : 0);

  return { w, h, headerH, tagH, propRows };
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

/** ERD View: recursive left-to-right layout with property rows and tags */
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
    const { w, h, headerH, tagH, propRows } = nodeSize(node);
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
      uuid: node.uuid,
    });

    let currentY = boxY;

    // Tags (centered all-caps at the very top)
    if (node.tags && node.tags.length > 0) {
      const tagText = node.tags.map(t => t.toUpperCase()).join(" · ");
      const truncatedTags = truncateWithEllipsis(tagText, w - TEXT_PAD_X * 2, TAG_FONT_SIZE, 400);
      els.push({
        type: "text",
        text: truncatedTags,
        x: x + w / 2,
        y: currentY + tagH / 2 + 2,
        color: theme().muted || "#666",
        size: TAG_FONT_SIZE,
        weight: 400,
        align: "center",
        baseline: "middle",
      });
      currentY += tagH;
    }

    // Header Title
    const titleLines = wrapText(node.name, w - TEXT_PAD_X * 2, isRoot ? 16 : 12, isRoot ? 700 : 600);
    const titleLineH = (isRoot ? 16 : 12) * LINE_HEIGHT;
    let textY = currentY + TEXT_PAD_Y + titleLineH / 2;
    const headerTextColor = isRoot ? ROOT_TEXT() : (isLeaf ? LEAF_TEXT() : c.text);

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
    currentY += headerH;

    // Properties
    if (propRows.length > 0) {
      // Header divider
      const headerDividerY = currentY + DIVIDER_MARGIN_Y;
      els.push({
        type: "line",
        x1: x + 4,
        y1: headerDividerY,
        x2: x + w - 4,
        y2: headerDividerY,
        color: theme().tableBorder || "#ccc",
        lw: 1,
      });

      let propY = headerDividerY + DIVIDER_MARGIN_Y;

      propRows.forEach((row, i) => {
        const rowTop = propY;
        const rowBottom = propY + row.h;
        const centerY = rowTop + row.h / 2;

        // Alternating background
        if (i % 2 === 1 && theme().tableStripe) {
           els.push({
             type: "box",
             x: x + 1,
             y: rowTop,
             w: w - 2,
             h: row.h,
             fill: theme().tableStripe,
             stroke: "transparent",
             lw: 0,
             rad: 0
           });
        }

        // Name (left-aligned, bold)
        const nameText = `${row.name}:`;
        els.push({
          type: "text",
          text: nameText,
          x: x + TEXT_PAD_X,
          y: centerY,
          color: headerTextColor,
          size: PROP_FONT_SIZE,
          weight: 700,
          align: "left",
          baseline: "middle",
        });

        // Value (right-aligned, muted, truncated)
        const nameWidthLimit = (w - TEXT_PAD_X * 2) * 0.4;
        const valueSpace = w - TEXT_PAD_X * 2 - nameWidthLimit - NAME_GAP;
        const truncatedValue = truncateWithEllipsis(row.value, valueSpace, PROP_FONT_SIZE, 400);

        els.push({
          type: "text",
          text: truncatedValue,
          x: x + w - TEXT_PAD_X,
          y: centerY,
          color: theme().muted || "#666",
          size: PROP_FONT_SIZE,
          weight: 400,
          align: "right",
          baseline: "middle",
        });

        // Divider after every property row
        els.push({
          type: "line",
          x1: x + 4,
          y1: rowBottom,
          x2: x + w - 4,
          y2: rowBottom,
          color: theme().tableBorder || "#ccc",
          lw: 1,
        });

        propY = rowBottom;
      });
    }

    if (node.uuid) nodeRectsByUuid.set(node.uuid, { x, y: boxY, w, h });

    maxX = Math.max(maxX, x + w);

    // Recurse into children
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
    nodeRectsByUuid,
  };
}
