import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT } from "../colors";

/** Tree Chart: Root top-left, vertical spine, branches right with bezier S-curves */
export function layoutTreeChart(root: TreeNode, _maxDepth: number): LayoutResult {
  const nW = 185, nH = 40, lW = 175, lH = 34, lGap = 7, bGap = 55;
  const bX = 200, lX = bX + nW + 70;
  const els: RenderElement[] = [];

  // Root box
  els.push({
    type: "box", x: 25, y: 25, w: 150, h: 50,
    fill: "#46a75818", stroke: "#46a758", lw: 2.5, rad: 10,
    text: root.name, textColor: ROOT_TEXT, textSize: 15, textWeight: 700,
    uuid: root.uuid,
  });

  let curY = 115;
  const branchData: Array<{ mid: number; bi: number }> = [];

  root.children.forEach((b, bi) => {
    const c = branchColor(bi);
    const kids = b.children;
    const kH = Math.max(kids.length, 1) * (lH + lGap) - lGap;
    const blockH = Math.max(nH, kH);
    const nY = curY + (blockH - nH) / 2;
    const mid = nY + nH / 2;
    branchData.push({ mid, bi });

    // Background zone
    const zoneTop = curY - 8;
    const zoneH = blockH + 16;
    els.push({
      type: "box", x: bX - 12, y: zoneTop, w: lX + lW - bX + 36, h: zoneH,
      fill: c.zone, stroke: c.stroke + "20", lw: 1, rad: 10, dash: c.dash,
    });

    // Branch box (scaled by child count)
    const scaledH = nH + Math.min(kids.length, 4) * 1.5;
    const adjNY = mid - scaledH / 2;
    els.push({
      type: "box", x: bX, y: adjNY, w: nW, h: scaledH,
      fill: c.fill, stroke: c.stroke, lw: 1.5, rad: 8,
      text: `${bi + 1}. ${b.name}`, textColor: c.text, textSize: 12, textWeight: 600,
      uuid: b.uuid,
    });

    // Branch → leaf bezier curves + leaf boxes
    if (kids.length) {
      const lStartY = curY + (blockH - kH) / 2;
      kids.forEach((k, ki) => {
        const ly = lStartY + ki * (lH + lGap);
        const lcy = ly + lH / 2;
        const sx = bX + nW, sy = mid;
        const ex = lX, ey = lcy;
        const cpx = (sx + ex) / 2;
        els.push({
          type: "curve", x1: sx, y1: sy, cx1: cpx, cy1: sy, cx2: cpx, cy2: ey, x2: ex, y2: ey,
          color: c.stroke + "50", lw: 1.5,
        });
        els.push({
          type: "box", x: lX, y: ly, w: lW, h: lH,
          fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 6,
          text: k.name, textColor: LEAF_TEXT, textSize: 12, dash: c.dash,
          uuid: k.uuid,
        });
      });
    }
    curY += blockH + bGap;
  });

  // Root → branch bezier curves
  const rootRX = 25 + 150, rootCY = 25 + 25;
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
