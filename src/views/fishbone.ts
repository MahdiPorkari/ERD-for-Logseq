import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT, theme } from "../colors";
import { measureBoxHeight, adaptiveWidth } from "../text";

const SUB_GAP = 8;       // vertical gap between sub-bone boxes
const BONE_PAD = 20;     // gap between spine and first sub-bone
const BRANCH_GAP = 40;   // minimum horizontal gap between branches

interface SubBone {
  w: number;
  h: number;
  name: string;
  uuid: string;
}

/** Fishbone (Ishikawa): horizontal spine with angled bones, dynamic sizing */
export function layoutFishbone(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const br = root.children;
  const spY = 400; // spine Y — enough room for tall top bones
  const headW = adaptiveWidth(root.name, 180, 14, 700);
  const headH = measureBoxHeight(root.name, headW, 14, 700, 50);

  // Pre-compute all sub-bone sizes per branch
  const branchData = br.map((b, bi) => {
    const labelW = adaptiveWidth(b.name, 140, 11, 600);
    const labelH = measureBoxHeight(b.name, labelW, 11, 600, 36);

    const subs: SubBone[] = b.children.map((k) => {
      const w = adaptiveWidth(k.name, 120, 12, 400);
      const h = measureBoxHeight(k.name, w, 12, 400, 28);
      return { w, h, name: k.name, uuid: k.uuid };
    });

    // Total vertical extent of sub-bones
    const subsH = subs.reduce((s, sub) => s + sub.h, 0) + Math.max(0, subs.length - 1) * SUB_GAP;
    // Max sub-bone width (for horizontal extent)
    const maxSubW = subs.length > 0 ? Math.max(...subs.map((s) => s.w)) : 0;
    // The branch needs enough horizontal space for its label and sub-bones
    const branchExtent = Math.max(labelW, maxSubW + 40);

    return { b, bi, labelW, labelH, subs, subsH, maxSubW, branchExtent };
  });

  // Compute spacing between branches based on their extents
  const branchPositions: number[] = [];
  let curX = 100;
  branchData.forEach((bd, i) => {
    if (i > 0) {
      const prevExtent = branchData[i - 1].branchExtent;
      curX += Math.max(prevExtent / 2 + bd.branchExtent / 2 + BRANCH_GAP, 200);
    }
    branchPositions.push(curX);
  });

  const hX = (branchPositions.length > 0 ? branchPositions[branchPositions.length - 1] : 100) + 100;

  // Spine
  els.push({ type: "line", x1: 40, y1: spY, x2: hX, y2: spY, color: theme().accent, lw: 2.5 });

  // Head box
  els.push({
    type: "box", x: hX, y: spY - headH / 2, w: headW, h: headH,
    fill: theme().rootFill, stroke: theme().rootStroke, lw: 2, rad: 8,
    text: root.name, textColor: ROOT_TEXT(), textSize: 14, textWeight: 700,
    uuid: root.uuid,
  });

  let maxTop = spY;
  let maxBot = spY;

  branchData.forEach((bd, pi) => {
    const { b, bi, labelW, labelH, subs, subsH, maxSubW } = bd;
    const c = branchColor(bi);
    const boneX = branchPositions[pi];
    const isTop = pi % 2 === 0;
    const dir = isTop ? -1 : 1;

    // Main bone line — length based on sub-bones extent + label
    const boneLen = BONE_PAD + subsH + 20 + labelH + 10;
    const endY = spY + dir * boneLen;

    // Bone line (slightly angled)
    const angleOffset = boneLen * 0.12;
    els.push({ type: "line", x1: boneX, y1: spY, x2: boneX + angleOffset, y2: endY, color: c.stroke, lw: 2 });

    // Branch label box at the end of the bone
    const labelX = boneX + angleOffset - labelW / 2;
    const labelY = endY + dir * 8 + (isTop ? -labelH : 0);
    els.push({
      type: "box", x: labelX, y: labelY, w: labelW, h: labelH,
      fill: c.fill, stroke: c.stroke, lw: 1.5, rad: 6,
      text: b.name, textColor: c.text, textSize: 11, textWeight: 600,
      uuid: b.uuid,
    });

    // Track extent for bounds
    const labelEnd = isTop ? labelY : labelY + labelH;
    if (isTop) maxTop = Math.min(maxTop, labelEnd - 10);
    else maxBot = Math.max(maxBot, labelEnd + 10);

    // Sub-bones — stacked vertically along the main bone
    let subY = spY + dir * BONE_PAD;
    subs.forEach((sub, ki) => {
      // Position sub-bone box to the right of the main bone
      const subBoxX = boneX + angleOffset + 20;
      const subBoxY = isTop ? subY - sub.h : subY;

      // Connector line from bone to sub-bone box
      const boneProgress = (BONE_PAD + (isTop ? -subY + spY - sub.h / 2 : subY - spY + sub.h / 2)) / boneLen;
      const connX = boneX + angleOffset * Math.min(boneProgress, 0.9);
      const connY = isTop ? subY - sub.h / 2 : subY + sub.h / 2;
      els.push({
        type: "line", x1: connX, y1: connY, x2: subBoxX, y2: connY,
        color: c.stroke + "45", lw: 1,
      });

      els.push({
        type: "box", x: subBoxX, y: subBoxY, w: sub.w, h: sub.h,
        fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 4,
        text: sub.name, textColor: LEAF_TEXT(), textSize: 12, dash: c.dash,
        uuid: sub.uuid,
      });

      // Track extent for bounds
      if (isTop) maxTop = Math.min(maxTop, subBoxY - 5);
      else maxBot = Math.max(maxBot, subBoxY + sub.h + 5);

      subY += dir * (sub.h + SUB_GAP);
    });
  });

  return {
    elements: els,
    bounds: {
      x: 0,
      y: maxTop - 30,
      w: hX + headW + 40,
      h: maxBot - maxTop + 60,
    },
  };
}
