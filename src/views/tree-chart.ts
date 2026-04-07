import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight } from "../text";

/** Tree Chart: Root top-left, vertical spine, branches right with bezier S-curves */
export function layoutTreeChart(root: TreeNode, _maxDepth: number): LayoutResult {
  const nW = 185, lW = 175, lGap = 7, bGap = 55;
  const bX = 200, lX = bX + nW + 70;
  const els: RenderElement[] = [];

  // Root box
  const rootH = measureBoxHeight(root.name, 150, 15, 700, 50);
  els.push({
    type: "box", x: 25, y: 25, w: 150, h: rootH,
    fill: theme().rootFill, stroke: theme().rootStroke, lw: 2.5, rad: 10,
    text: root.name, textColor: ROOT_TEXT(), textSize: 15, textWeight: 700,
    uuid: root.uuid,
  });

  let curY = 25 + rootH + 40;
  const branchData: Array<{ mid: number; bi: number }> = [];

  root.children.forEach((b, bi) => {
    const c = branchColor(bi);
    const kids = b.children;

    // Compute branch box height from text
    const branchText = `${bi + 1}. ${b.name}`;
    const branchH = measureBoxHeight(branchText, nW, 12, 600, 40);

    // Compute each leaf height
    const leafHeights = kids.map((k) => measureBoxHeight(k.name, lW, 12, 400, 34));
    const kH = leafHeights.length > 0
      ? leafHeights.reduce((s, h) => s + h, 0) + (leafHeights.length - 1) * lGap
      : 0;
    const blockH = Math.max(branchH, kH);
    const nY = curY + (blockH - branchH) / 2;
    const mid = nY + branchH / 2;
    branchData.push({ mid, bi });

    // Background zone
    const zoneTop = curY - 8;
    const zoneH = blockH + 16;
    els.push({
      type: "box", x: bX - 12, y: zoneTop, w: lX + lW - bX + 36, h: zoneH,
      fill: c.zone, stroke: c.stroke + "20", lw: 1, rad: 10, dash: c.dash,
    });

    // Branch box
    els.push({
      type: "box", x: bX, y: nY, w: nW, h: branchH,
      fill: c.fill, stroke: c.stroke, lw: 1.5, rad: 8,
      text: branchText, textColor: c.text, textSize: 12, textWeight: 600,
      uuid: b.uuid,
    });

    // Branch → leaf bezier curves + leaf boxes
    if (kids.length) {
      const lStartY = curY + (blockH - kH) / 2;
      let leafY = lStartY;
      kids.forEach((k, ki) => {
        const lH = leafHeights[ki];
        const lcy = leafY + lH / 2;
        const sx = bX + nW, sy = mid;
        const ex = lX, ey = lcy;
        const cpx = (sx + ex) / 2;
        els.push({
          type: "curve", x1: sx, y1: sy, cx1: cpx, cy1: sy, cx2: cpx, cy2: ey, x2: ex, y2: ey,
          color: c.stroke + "50", lw: 1.5,
        });
        els.push({
          type: "box", x: lX, y: leafY, w: lW, h: lH,
          fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 6,
          text: k.name, textColor: LEAF_TEXT(), textSize: 12, dash: c.dash,
          uuid: k.uuid,
        });
        leafY += lH + lGap;
      });
    }
    curY += blockH + bGap;
  });

  // Root → branch bezier curves
  const rootRX = 25 + 150, rootCY = 25 + rootH / 2;
  branchData.forEach(({ mid, bi }) => {
    const c = branchColor(bi);
    const cpx = (rootRX + bX) / 2;
    els.push({
      type: "curve", x1: rootRX, y1: rootCY, cx1: cpx, cy1: rootCY, cx2: cpx, cy2: mid, x2: bX, y2: mid,
      color: c.stroke + "60", lw: 2,
    });
  });

  return { elements: els, bounds: { x: 0, y: 0, w: lX + lW + 40, h: curY + 20 } };
}
