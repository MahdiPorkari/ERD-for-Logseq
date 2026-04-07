import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT } from "../colors";
import { measureBoxHeight } from "../text";

function branchBoxSize(b: TreeNode): { w: number; h: number } {
  const w = 185 + Math.min(b.children.length, 5) * 5;
  const h = measureBoxHeight(b.name, w, 12, 600, 44);
  return { w, h };
}

/** Compute the total row height for a branch: max of branch box and its leaves */
function rowHeight(b: TreeNode, lfW: number, lfGap: number): number {
  const { h: brH } = branchBoxSize(b);
  if (!b.children.length) return brH;
  const leafHeights = b.children.map((k) => measureBoxHeight(k.name, lfW, 12, 400, 32));
  const kidsH = leafHeights.reduce((s, h) => s + h, 0) + (leafHeights.length - 1) * lfGap;
  return Math.max(brH, kidsH);
}

/** Right Tree: root left, all branches stacked right, leaves further right */
export function layoutRightTree(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const rootW = 200, rootX = 40, rootRad = 14;
  const brGap = 24, lfGap = 6, lfW = 155;
  const colGap = 170, lfColGap = 55;
  const br = root.children;

  const rootH = measureBoxHeight(root.name, rootW, 16, 700, 60);

  // Total height uses row height (max of branch box and leaf stack)
  const totalH = br.reduce((s, b) => s + rowHeight(b, lfW, lfGap), 0) + (br.length - 1) * brGap;
  const startY = 40;
  const rootCy = startY + totalH / 2;

  // Root glow
  els.push({ type: "dot", x: rootX + rootW / 2, y: rootCy, r: 60, color: "#46a75808" });
  els.push({ type: "dot", x: rootX + rootW / 2, y: rootCy, r: 45, color: "#46a75810" });

  // Root box
  els.push({
    type: "box", x: rootX, y: rootCy - rootH / 2, w: rootW, h: rootH,
    fill: "#1a1d2480", stroke: "#46a758", lw: 2.5, rad: rootRad,
    text: root.name, textColor: ROOT_TEXT, textSize: 16, textWeight: 700,
    uuid: root.uuid,
  });

  const brX = rootX + rootW + colGap;
  let curY = startY;

  br.forEach((b, bi) => {
    const c = branchColor(bi);
    const { w: brW, h: brH } = branchBoxSize(b);
    const rH = rowHeight(b, lfW, lfGap);
    const brCy = curY + rH / 2; // center within row, not just branch box

    // Root → branch bezier
    const sx = rootX + rootW, sy = rootCy;
    const cpx = (sx + brX) / 2;
    els.push({
      type: "curve", x1: sx, y1: sy, cx1: cpx, cy1: sy, cx2: cpx, cy2: brCy, x2: brX, y2: brCy,
      color: c.stroke + "80", lw: 2.2,
    });

    // Branch box — vertically centered within the row
    const brBoxY = curY + (rH - brH) / 2;
    els.push({
      type: "box", x: brX, y: brBoxY, w: brW, h: brH,
      fill: c.fill, stroke: c.stroke, lw: 1.5, rad: 8,
      text: b.name, textColor: c.text, textSize: 12, textWeight: 600,
      uuid: b.uuid,
    });

    // Leaves
    if (b.children.length) {
      const leafHeights = b.children.map((k) => measureBoxHeight(k.name, lfW, 12, 400, 32));
      const kidsH = leafHeights.reduce((s, h) => s + h, 0) + (leafHeights.length - 1) * lfGap;
      const kidsStartY = curY + (rH - kidsH) / 2; // center leaves within the row
      const lfX = brX + brW + lfColGap;

      let leafY = kidsStartY;
      b.children.forEach((k, ki) => {
        const lfH = leafHeights[ki];
        const lcy = leafY + lfH / 2;
        const cpx2 = (brX + brW + lfX) / 2;
        els.push({
          type: "curve", x1: brX + brW, y1: brCy, cx1: cpx2, cy1: brCy, cx2: cpx2, cy2: lcy, x2: lfX, y2: lcy,
          color: c.stroke + "40", lw: 1.3,
        });
        els.push({
          type: "box", x: lfX, y: leafY, w: lfW, h: lfH,
          fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 6,
          text: k.name, textColor: LEAF_TEXT, textSize: 12, dash: c.dash,
          uuid: k.uuid,
        });
        leafY += lfH + lfGap;
      });
    }
    curY += rH + brGap;
  });

  const maxBrW = Math.max(...br.map((b) => branchBoxSize(b).w));
  return { elements: els, bounds: { x: 0, y: 0, w: brX + maxBrW + lfColGap + lfW + 40, h: totalH + 80 } };
}
