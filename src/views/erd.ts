import type { TreeNode, LayoutResult, RenderElement, Rect } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth, wrapText, LINE_HEIGHT, TEXT_PAD_Y } from "../text";

const NODE_GAP = 16;
const COL_GAP = 60;
const MIN_W = 155;
const PROP_FONT_SIZE = 10;
const PROP_PADDING_Y = 4;
const DIVIDER_MARGIN_Y = 6;

/** Compute box size for any node, accounting for properties */
function nodeSize(n: TreeNode): { w: number; h: number; headerH: number; propRows: { text: string; h: number }[] } {
  const isRoot = n.depth === 0;
  const fontSize = isRoot ? 16 : 12;
  const fontWeight = isRoot ? 700 : 600;
  const baseW = isRoot ? 200 : MIN_W;
  const w = adaptiveWidth(n.name, baseW, fontSize, fontWeight);
  const headerH = measureBoxHeight(n.name, w, fontSize, fontWeight, isRoot ? 60 : 36);

  const propRows: { text: string; h: number }[] = [];
  let totalPropH = 0;

  if (n.properties && n.properties.length > 0) {
    const maxTextWidth = w - 16; // TEXT_PAD_X * 2
    for (const prop of n.properties) {
      const propText = `${prop.name}: ${prop.value}`;
      const lines = wrapText(propText, maxTextWidth, PROP_FONT_SIZE, 400);
      const rowH = lines.length * PROP_FONT_SIZE * LINE_HEIGHT + PROP_PADDING_Y;
      propRows.push({ text: propText, h: rowH });
      totalPropH += rowH;
    }
  }

  const h = headerH + (propRows.length > 0 ? DIVIDER_MARGIN_Y * 2 + totalPropH : 0);

  return { w, h, headerH, propRows };
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
    const { w, h, headerH, propRows } = nodeSize(node);
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

    // Header Text (manually added since we stripped text from box to allow top-align)
    // Box center text is usually centered. Here we want it in the header area.
    // Actually, BoxElement in renderer.ts centers text in the box.
    // Since we want header + properties, we should draw text elements manually.

    // Title
    const titleLines = wrapText(node.name, w - 16, isRoot ? 16 : 12, isRoot ? 700 : 600);
    const titleLineH = (isRoot ? 16 : 12) * LINE_HEIGHT;
    let textY = boxY + TEXT_PAD_Y + titleLineH / 2;
    for (const line of titleLines) {
      els.push({
        type: "text",
        text: line,
        x: x + w / 2,
        y: textY,
        color: isRoot ? ROOT_TEXT() : (isLeaf ? LEAF_TEXT() : c.text),
        size: isRoot ? 16 : 12,
        weight: isRoot ? 700 : 600,
        align: "center",
        baseline: "middle",
      });
      textY += titleLineH;
    }

    // Divider & Properties
    if (propRows.length > 0) {
      const dividerY = boxY + headerH + DIVIDER_MARGIN_Y;
      els.push({
        type: "line",
        x1: x + 4,
        y1: dividerY,
        x2: x + w - 4,
        y2: dividerY,
        color: theme().tableBorder || "#ccc",
        lw: 1,
      });

      let propY = dividerY + DIVIDER_MARGIN_Y;
      propRows.forEach((row, i) => {
        // Alternating background (optional/cosmetic)
        if (i % 2 === 1 && theme().tableStripe) {
           els.push({
             type: "box",
             x: x + 1,
             y: propY,
             w: w - 2,
             h: row.h,
             fill: theme().tableStripe,
             stroke: "transparent",
             lw: 0,
             rad: 0
           });
        }

        const lines = wrapText(row.text, w - 16, PROP_FONT_SIZE, 400);
        const rowLineH = PROP_FONT_SIZE * LINE_HEIGHT;
        let lineY = propY + rowLineH / 2;
        for (const line of lines) {
          els.push({
            type: "text",
            text: line,
            x: x + 8,
            y: lineY,
            color: theme().muted || "#666",
            size: PROP_FONT_SIZE,
            weight: 400,
            align: "left",
            baseline: "middle",
          });
          lineY += rowLineH;
        }
        propY += row.h;
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
    nodeRectsByUuid,
  };
}
