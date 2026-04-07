import type { TreeNode, LayoutResult, RenderElement } from "../types";
import { branchColor, ROOT_TEXT, LEAF_TEXT } from "../colors";

/** Fishbone (Ishikawa): horizontal spine with angled bones */
export function layoutFishbone(root: TreeNode, _maxDepth: number): LayoutResult {
  const els: RenderElement[] = [];
  const br = root.children;
  const spacing = 220, boneLen = 130, spY = 300;
  const hX = 100 + br.length * spacing + 60;
  const headW = 180, headH = 50;

  // Spine
  els.push({ type: "line", x1: 40, y1: spY, x2: hX, y2: spY, color: "#46a758", lw: 2.5 });

  // Head box
  els.push({
    type: "box", x: hX, y: spY - headH / 2, w: headW, h: headH,
    fill: "#46a75818", stroke: "#46a758", lw: 2, rad: 8,
    text: root.name, textColor: ROOT_TEXT, textSize: 14, textWeight: 700,
    uuid: root.uuid,
  });

  br.forEach((b, bi) => {
    const c = branchColor(bi);
    const boneX = 120 + bi * spacing;
    const isTop = bi % 2 === 0;
    const dir = isTop ? -1 : 1;
    const angleX = boneLen * 0.5;
    const endY = spY + dir * boneLen;

    // Bone line (angled slightly)
    els.push({ type: "line", x1: boneX, y1: spY, x2: boneX + angleX * 0.3, y2: endY, color: c.stroke, lw: 2 });

    // Branch label box
    const labelW = 140, labelH = 36;
    const labelX = boneX + angleX * 0.3 - labelW / 2;
    const labelY = endY + dir * 8 + (isTop ? -labelH : 0);
    els.push({
      type: "box", x: labelX, y: labelY, w: labelW, h: labelH,
      fill: c.fill, stroke: c.stroke, lw: 1.5, rad: 6,
      text: b.name, textColor: c.text, textSize: 11, textWeight: 600,
      uuid: b.uuid,
    });

    // Sub-bones in boxes
    b.children.forEach((k, ki) => {
      const subY = spY + dir * (22 + ki * 36);
      const subX = boneX + (ki % 2 === 0 ? -1 : 1) * 90;
      els.push({
        type: "line",
        x1: boneX + angleX * 0.15 * (ki + 1) / (b.children.length + 1), y1: subY,
        x2: subX, y2: subY + dir * 14,
        color: c.stroke + "45", lw: 1,
      });
      const subW = 120, subH = 28;
      els.push({
        type: "box", x: subX - subW / 2, y: subY + dir * 14 + (isTop ? -subH - 2 : 2), w: subW, h: subH,
        fill: c.leafFill, stroke: c.leafStroke, lw: 0.8, rad: 4,
        text: k.name, textColor: LEAF_TEXT, textSize: 12, dash: c.dash,
        uuid: k.uuid,
      });
    });
  });

  const mL = Math.max(...br.map((b) => b.children.length), 0);
  return {
    elements: els,
    bounds: {
      x: 0,
      y: spY - boneLen - 40 - mL * 36 - 50,
      w: hX + headW + 40,
      h: (boneLen + 40 + mL * 36 + 50) * 2 + headH,
    },
  };
}
