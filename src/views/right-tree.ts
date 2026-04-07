import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT } from "../colors";

function branchSize(b: TreeNode): { w: number; h: number } {
  return { w: 185 + Math.min(b.children.length, 5) * 5, h: 44 + Math.min(b.children.length, 5) * 2 };
}

/** Right Tree: root left, all branches stacked right, leaves further right */
export function layoutRightTree(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const rootW = 200, rootH = 60, rootX = 40, rootRad = 14;
  const brGap = 24, lfGap = 6, lfH = 32, lfW = 155;
  const colGap = 170, lfColGap = 55;
  const br = root.children;

  const totalBrH = br.reduce((s, b) => s + branchSize(b).h, 0) + (br.length - 1) * brGap;
  const startY = 40;
  const rootCy = startY + totalBrH / 2;

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
    const { w: brW, h: brH } = branchSize(b);
    const brCy = curY + brH / 2;

    // Root → branch bezier
    const sx = rootX + rootW, sy = rootCy;
    const cpx = (sx + brX) / 2;
    els.push({
      type: "curve", x1: sx, y1: sy, cx1: cpx, cy1: sy, cx2: cpx, cy2: brCy, x2: brX, y2: brCy,
      color: c.stroke + "80", lw: 2.2,
    });

    // Branch box
    els.push({
      type: "box", x: brX, y: curY, w: brW, h: brH,
      fill: c.fill, stroke: c.stroke, lw: 1.5, rad: 8,
      text: b.name, textColor: c.text, textSize: 12, textWeight: 600,
      uuid: b.uuid,
    });

    // Leaves
    if (b.children.length) {
      const kidsH = b.children.length * lfH + (b.children.length - 1) * lfGap;
      const kidsStartY = brCy - kidsH / 2;
      const lfX = brX + brW + lfColGap;

      b.children.forEach((k, ki) => {
        const ly = kidsStartY + ki * (lfH + lfGap);
        const lcy = ly + lfH / 2;
        const cpx2 = (brX + brW + lfX) / 2;
        els.push({
          type: "curve", x1: brX + brW, y1: brCy, cx1: cpx2, cy1: brCy, cx2: cpx2, cy2: lcy, x2: lfX, y2: lcy,
          color: c.stroke + "40", lw: 1.3,
        });
        els.push({
          type: "box", x: lfX, y: ly, w: lfW, h: lfH,
          fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 6,
          text: k.name, textColor: LEAF_TEXT, textSize: 12, dash: c.dash,
          uuid: k.uuid,
        });
      });
    }
    curY += brH + brGap;
  });

  const maxBrW = Math.max(...br.map((b) => branchSize(b).w));
  return { elements: els, bounds: { x: 0, y: 0, w: brX + maxBrW + lfColGap + lfW + 40, h: totalBrH + 80 } };
}
