import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

/** Roadmap layout — shared by both alternating and linear modes */
export function layoutRoadmap(root: TreeNode, _maxDepth: number, alternating: boolean): LayoutResult {
  const els: RenderElement[] = [];
  const br = root.children;
  const rW = 150;
  const basePhaseW = 180, itemGap = 4;
  const itemPadTop = 38, itemPadBot = 10, phaseGap = 40;

  // Compute per-phase adaptive widths
  const phaseWidths = br.map((b) => {
    const headerW = adaptiveWidth(b.name, basePhaseW, 12, 600, 320);
    const childW = b.children.length > 0
      ? Math.max(...b.children.map((k) => adaptiveWidth(k.name, basePhaseW - 16, 12, 400, 304))) + 16
      : 0;
    return Math.max(basePhaseW, headerW, childW);
  });

  // Root box
  const rootH = measureBoxHeight(root.name, rW, 14, 700, 52);
  const spY = alternating ? 280 : 100;

  // Phase card heights — compute item heights dynamically
  const phaseData = br.map((b, bi) => {
    const phaseW = phaseWidths[bi];
    const kidHeights = b.children.map((k) => measureBoxHeight(k.name, phaseW - 16, 12, 400, 28));
    const kidsH = kidHeights.length > 0
      ? kidHeights.reduce((s, h) => s + h, 0) + (kidHeights.length - 1) * itemGap
      : 0;
    const cardH = Math.max(itemPadTop + kidsH + itemPadBot, 60);
    return { b, bi, kids: b.children, kidHeights, cardH, phaseW };
  });

  const totalPhasesW = phaseData.reduce((s, d) => s + d.phaseW, 0) + (phaseData.length - 1) * phaseGap;
  const startX = rW + 80;

  // Root box
  els.push({
    type: "box", x: 20, y: spY - rootH / 2, w: rW, h: rootH,
    fill: theme().rootFill, stroke: theme().rootStroke, lw: 2.5, rad: 10,
    text: root.name, textColor: ROOT_TEXT(), textSize: 14, textWeight: 700,
    uuid: root.uuid,
  });

  // Spine
  const spineEndX = startX + totalPhasesW + 50;
  els.push({ type: "line", x1: 20 + rW, y1: spY, x2: spineEndX, y2: spY, color: theme().accent + "25", lw: 3 });

  // Arrow
  els.push({ type: "line", x1: spineEndX - 10, y1: spY - 6, x2: spineEndX, y2: spY, color: theme().accent + "50", lw: 2.5 });
  els.push({ type: "line", x1: spineEndX - 10, y1: spY + 6, x2: spineEndX, y2: spY, color: theme().accent + "50", lw: 2.5 });

  let px = startX;
  phaseData.forEach(({ b, bi, kids, kidHeights, cardH, phaseW }, pi) => {
    const c = branchColor(bi);
    const isAbove = alternating ? pi % 2 === 0 : false;
    const gapFromSpine = 12;
    const cardY = isAbove ? spY - gapFromSpine - cardH : spY + gapFromSpine;

    // Phase dot on spine
    els.push({ type: "dot", x: px + phaseW / 2, y: spY, r: 14, color: c.fill });
    els.push({ type: "dot", x: px + phaseW / 2, y: spY, r: 12, color: theme().spineDotInner });
    els.push({ type: "text", text: `${bi + 1}`, x: px + phaseW / 2, y: spY, color: c.stroke, size: 12, weight: 700, align: "center" });

    // Vertical connector
    const connStartY = isAbove ? spY - 14 : spY + 14;
    const connEndY = isAbove ? cardY + cardH : cardY;
    els.push({ type: "line", x1: px + phaseW / 2, y1: connStartY, x2: px + phaseW / 2, y2: connEndY, color: c.stroke + "50", lw: 1.5 });

    // Phase card
    els.push({ type: "box", x: px, y: cardY, w: phaseW, h: cardH, fill: c.zone, stroke: c.stroke + "40", lw: 1, rad: 10 });

    // Header inside card
    const headerH = measureBoxHeight(b.name, phaseW - 12, 12, 600, 26);
    const headerY = cardY + 8;
    els.push({
      type: "box", x: px + 6, y: headerY, w: phaseW - 12, h: headerH,
      fill: c.fill, stroke: c.stroke, lw: 1, rad: 6,
      text: b.name, textColor: c.text, textSize: 12, textWeight: 600,
      uuid: b.uuid,
    });

    // Chevron between phases
    if (pi < phaseData.length - 1) {
      const nextPx = px + phaseW + phaseGap;
      const mx = (px + phaseW + nextPx) / 2;
      els.push({ type: "line", x1: mx - 4, y1: spY - 4, x2: mx + 3, y2: spY, color: theme().accent + "45", lw: 1.5 });
      els.push({ type: "line", x1: mx - 4, y1: spY + 4, x2: mx + 3, y2: spY, color: theme().accent + "45", lw: 1.5 });
    }

    // Children inside card
    let itemY = headerY + headerH + 4;
    kids.forEach((k, ki) => {
      const itemH = kidHeights[ki];
      els.push({
        type: "box", x: px + 8, y: itemY, w: phaseW - 16, h: itemH,
        fill: c.leafFill, stroke: c.leafStroke, lw: 0.7, rad: 5,
        text: k.name, textColor: LEAF_TEXT(), textSize: 12, dash: c.dash,
        uuid: k.uuid,
      });
      itemY += itemH + itemGap;
    });

    px += phaseW + phaseGap;
  });

  const maxCardH = Math.max(...phaseData.map((d) => d.cardH));
  const boundsTop = alternating ? spY - 12 - maxCardH - 30 : spY - rootH / 2 - 20;
  const boundsBot = alternating ? spY + 12 + maxCardH + 30 : spY + 12 + maxCardH + 30;
  return { elements: els, bounds: { x: 0, y: boundsTop, w: spineEndX + 40, h: boundsBot - boundsTop } };
}

/** Roadmap ↕ — alternating above/below */
export function layoutRoadmapAlt(root: TreeNode, maxDepth: number): LayoutResult {
  return layoutRoadmap(root, maxDepth, true);
}

/** Roadmap → — all cards below */
export function layoutRoadmapLinear(root: TreeNode, maxDepth: number): LayoutResult {
  return layoutRoadmap(root, maxDepth, false);
}
