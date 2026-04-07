import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT } from "../colors";

function branchSize(b: TreeNode): { w: number; h: number } {
  return { w: 180 + Math.min(b.children.length, 5) * 5, h: 44 + Math.min(b.children.length, 5) * 2 };
}

function sideHeight(list: TreeNode[], gap: number): number {
  return list.reduce((s, b) => s + branchSize(b).h, 0) + (list.length - 1) * gap;
}

/** Mind Map: bilateral layout — branches split left/right from central root */
export function layoutMindMap(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const rootW = 200, rootH = 60, rootRad = 14;
  const brGap = 24, lfGap = 6, lfH = 32, lfW = 155;
  const colGap = 180, lfColGap = 55;
  const br = root.children;

  const rightBr = br.slice(0, Math.ceil(br.length / 2));
  const leftBr = br.slice(Math.ceil(br.length / 2));

  const rightH = sideHeight(rightBr, brGap);
  const leftH = sideHeight(leftBr, brGap);
  const maxH = Math.max(rightH, leftH, rootH);

  const centerY = 50 + maxH / 2;
  const rootCx = 500, rootCy = centerY;

  // Root glow
  els.push({ type: "dot", x: rootCx, y: rootCy, r: 60, color: "#46a75808" });
  els.push({ type: "dot", x: rootCx, y: rootCy, r: 45, color: "#46a75810" });

  // Root box
  els.push({
    type: "box", x: rootCx - rootW / 2, y: rootCy - rootH / 2, w: rootW, h: rootH,
    fill: "#1a1d2480", stroke: "#46a758", lw: 2.5, rad: rootRad,
    text: root.name, textColor: ROOT_TEXT, textSize: 16, textWeight: 700,
    uuid: root.uuid,
  });

  function renderSide(list: TreeNode[], isRight: boolean, startIndex: number): void {
    const totalH = sideHeight(list, brGap);
    let curY = centerY - totalH / 2;

    list.forEach((b, i) => {
      const bi = startIndex + i;
      const c = branchColor(bi);
      const { w: brW, h: brH } = branchSize(b);
      const brCy = curY + brH / 2;

      const brX = isRight ? rootCx + rootW / 2 + colGap : rootCx - rootW / 2 - colGap - brW;
      const lfX = isRight ? brX + brW + lfColGap : brX - lfColGap - lfW;

      // Root → branch bezier
      const sx = isRight ? rootCx + rootW / 2 : rootCx - rootW / 2;
      const ex = isRight ? brX : brX + brW;
      const cpx = (sx + ex) / 2;
      els.push({
        type: "curve", x1: sx, y1: rootCy, cx1: cpx, cy1: rootCy, cx2: cpx, cy2: brCy, x2: ex, y2: brCy,
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

        b.children.forEach((k, ki) => {
          const ly = kidsStartY + ki * (lfH + lfGap);
          const lcy = ly + lfH / 2;
          const sx2 = isRight ? brX + brW : brX;
          const ex2 = isRight ? lfX : lfX + lfW;
          const cpx2 = (sx2 + ex2) / 2;
          els.push({
            type: "curve", x1: sx2, y1: brCy, cx1: cpx2, cy1: brCy, cx2: cpx2, cy2: lcy, x2: ex2, y2: lcy,
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
  }

  renderSide(rightBr, true, 0);
  renderSide(leftBr, false, rightBr.length);

  const leftEdge = rootCx - rootW / 2 - colGap - 200 - lfColGap - lfW;
  const rightEdge = rootCx + rootW / 2 + colGap + 200 + lfColGap + lfW;
  return {
    elements: els,
    bounds: { x: Math.min(leftEdge - 30, 0), y: 0, w: rightEdge - Math.min(leftEdge - 30, 0) + 40, h: maxH + 100 },
  };
}
