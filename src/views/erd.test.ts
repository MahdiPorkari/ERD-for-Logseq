/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { layoutERD } from "./erd";
import type { TreeNode } from "../types";

describe("layoutERD updated layout", () => {
  const node = (name: string, properties: { name: string; value: string }[] = []): TreeNode => ({
    name,
    uuid: "u",
    depth: 0,
    id: 1,
    children: [],
    properties,
  });

  it("uses fixed-height rows for properties", () => {
    const root0 = node("Header");
    const result0 = layoutERD(root0, 5);
    const box0 = result0.elements.find(e => e.type === "box") as any;
    const h0 = box0.h;

    const root1 = node("Header", [{ name: "Prop", value: "Value" }]);
    const result1 = layoutERD(root1, 5);
    const box1 = result1.elements.find(e => e.type === "box") as any;
    const h1 = box1.h;

    // In new layout, property row height is fixed.
    // Header divider (6*2) + Row (10*1.4 + 4*2 = 22) = 34 approx.
    expect(h1).toBeGreaterThan(h0);
  });

  it("truncates long values with ellipsis and keeps box width stable", () => {
    const rootShort = node("Header", [{ name: "P", value: "Short" }]);
    const wShort = (layoutERD(rootShort, 5).elements.find(e => e.type === "box") as any).w;

    const longValue = "A very long value that should definitely be truncated with an ellipsis rather than causing the box to grow unbounded horizontally";
    const rootLong = node("Header", [{ name: "P", value: longValue }]);
    const resultLong = layoutERD(rootLong, 5);
    const boxLong = resultLong.elements.find(e => e.type === "box") as any;

    expect(boxLong.w).toBe(wShort); // Width should be stable (based on header or min_w)

    const textEls = resultLong.elements.filter(e => e.type === "text") as any[];
    const valueEl = textEls.find(e => e.text.includes("…"));
    expect(valueEl).toBeDefined();
    expect(valueEl.text).toMatch(/…$/);
  });

  it("adds divider line between every individual property row", () => {
    // 2 props -> 1 header divider + 2 prop row bottom dividers = 3 lines total
    const root = node("Header", [
      { name: "P1", value: "V1" },
      { name: "P2", value: "V2" }
    ]);
    const result = layoutERD(root, 5);
    const lines = result.elements.filter(e => e.type === "line");
    expect(lines.length).toBe(3);
  });
});
