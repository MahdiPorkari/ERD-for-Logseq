import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

const BASE_LF_W = 155;
const LF_GAP = 6;

function branchBoxSize(b: TreeNode): { w: number; h: number } {
  const w = adaptiveWidth(b.name, 180, 12, 600, 350);
  const h = measureBoxHeight(b.name, w, 12, 600, 44);
  return { w, h };
}

/** Compute the max leaf width for a branch */
function branchLeafWidth(b: TreeNode): number {
  if (!b.children.length) return BASE_LF_W;
  const leafWidths = b.children.map((k) => adaptiveWidth(k.name, BASE_LF_W, 12, 400, 400));
  return Math.max(BASE_LF_W, ...leafWidths);
}

/** Row height = max of branch box and total leaf stack */
function rowHeight(b: TreeNode, lfW: number): number {
  const { h: brH } = branchBoxSize(b);
  if (!b.children.length) return brH;
  const leafHeights = b.children.map((k) => measureBoxHeight(k.name, lfW, 12, 400, 32));
  const kidsH = leafHeights.reduce((s, h) => s + h, 0) + (leafHeights.length - 1) * LF_GAP;
  return Math.max(brH, kidsH);
}

function sideHeight(list: TreeNode[], gap: number): number {
  return list.reduce((s, b) => s + rowHeight(b, branchLeafWidth(b)), 0) + (list.length - 1) * gap;
}

/** Mind Map: bilateral layout — branches split left/right from central root */
export function layoutMindMap(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const rootW = 200, rootRad = 14;
  const brGap = 24, lfColGap = 55, colGap = 180;
  const br = root.children;

  const rootH = measureBoxHeight(root.name, rootW, 16, 700, 60);

  const rightBr = br.slice(0, Math.ceil(br.length / 2));
  const leftBr = br.slice(Math.ceil(br.length / 2));

  const rightH = sideHeight(rightBr, brGap);
  const leftH = sideHeight(leftBr, brGap);
  const maxH = Math.max(rightH, leftH, rootH);

  const centerY = 50 + maxH / 2;
  const rootCx = 500, rootCy = centerY;

  // Root glow
  els.push({ type: "dot", x: rootCx, y: rootCy, r: 60, color: theme().rootGlow1 });
  els.push({ type: "dot", x: rootCx, y: rootCy, r: 45, color: theme().rootGlow2 });

  // Root box
  els.push({
    type: "box", x: rootCx - rootW / 2, y: rootCy - rootH / 2, w: rootW, h: rootH,
    fill: theme().rootBoxFill, stroke: theme().rootStroke, lw: 2.5, rad: rootRad,
    text: root.name, textColor: ROOT_TEXT(), textSize: 16, textWeight: 700,
    uuid: root.uuid,
  });

  function renderSide(list: TreeNode[], isRight: boolean, startIndex: number): void {
    const totalH = sideHeight(list, brGap);
    let curY = centerY - totalH / 2;

    list.forEach((b, i) => {
      const bi = startIndex + i;
      const c = branchColor(bi);
      const { w: brW, h: brH } = branchBoxSize(b);
      const lfW = branchLeafWidth(b);
      const rH = rowHeight(b, lfW);
      const brCy = curY + rH / 2; // center within row

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
        const kidsH = leafHeights.reduce((s, h) => s + h, 0) + (leafHeights.length - 1) * LF_GAP;
        const kidsStartY = curY + (rH - kidsH) / 2; // center leaves within the row

        let leafY = kidsStartY;
        b.children.forEach((k, ki) => {
          const lfH = leafHeights[ki];
          const lcy = leafY + lfH / 2;
          const sx2 = isRight ? brX + brW : brX;
          const ex2 = isRight ? lfX : lfX + lfW;
          const cpx2 = (sx2 + ex2) / 2;
          els.push({
            type: "curve", x1: sx2, y1: brCy, cx1: cpx2, cy1: brCy, cx2: cpx2, cy2: lcy, x2: ex2, y2: lcy,
            color: c.stroke + "40", lw: 1.3,
          });
          els.push({
            type: "box", x: lfX, y: leafY, w: lfW, h: lfH,
            fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 6,
            text: k.name, textColor: LEAF_TEXT(), textSize: 12, dash: c.dash,
            uuid: k.uuid,
          });
          leafY += lfH + LF_GAP;
        });
      }
      curY += rH + brGap;
    });
  }

  renderSide(rightBr, true, 0);
  renderSide(leftBr, false, rightBr.length);

  const maxLfWAll = Math.max(BASE_LF_W, ...br.map((b) => branchLeafWidth(b)));
  const maxBrW = Math.max(...br.map((b) => branchBoxSize(b).w));
  const leftEdge = rootCx - rootW / 2 - colGap - maxBrW - lfColGap - maxLfWAll;
  const rightEdge = rootCx + rootW / 2 + colGap + maxBrW + lfColGap + maxLfWAll;
  return {
    elements: els,
    bounds: { x: Math.min(leftEdge - 30, 0), y: 0, w: rightEdge - Math.min(leftEdge - 30, 0) + 40, h: maxH + 100 },
  };
}
