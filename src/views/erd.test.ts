/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { layoutERD } from "./erd";
import type { TreeNode, TagInfo } from "../types";

describe("layoutERD updated layout with badge chips", () => {
  const node = (name: string, tags: TagInfo[] = [], properties: { name: string; value: string }[] = []): TreeNode => ({
    name,
    uuid: "u",
    depth: 0,
    id: 1,
    children: [],
    tags,
    properties
  });

  it("grows height when tags are present", () => {
    const root0 = node("Header");
    const result0 = layoutERD(root0, 5);
    const box0 = result0.elements.find(e => e.type === "box") as any;
    const h0 = box0.h;

    const root1 = node("Header", [{ uuid: "t1", title: "Tag1" }]);
    const result1 = layoutERD(root1, 5);
    const box1 = result1.elements.find(e => e.type === "box") as any;
    const h1 = box1.h;

    expect(h1).toBeGreaterThan(h0);
  });

  it("wraps tags onto multiple lines if they exceed width", () => {
    // Many tags should force wrapping
    const tags = Array.from({ length: 20 }, (_, i) => ({ uuid: `t${i}`, title: `TagLongName${i}` }));
    const root = node("Header", tags);
    const result = layoutERD(root, 5);

    // Check if multiple tag boxes (badges) are rendered
    const badgeBoxes = result.elements.filter(e => e.type === "box" && (e as any).h === 14); // 18 - 4 margin
    expect(badgeBoxes.length).toBe(20);

    // Check if they are on different Y coordinates (indicating multiple rows)
    const yCoords = new Set(badgeBoxes.map(b => (b as any).y));
    expect(yCoords.size).toBeGreaterThan(1);
  });

  it("renders tag titles in all-caps inside badges", () => {
    const root = node("Header", [{ uuid: "t1", title: "my-tag" }]);
    const result = layoutERD(root, 5);
    const tagTextEl = result.elements.find(e => e.type === "text" && (e as any).text === "MY-TAG");
    expect(tagTextEl).toBeDefined();
  });

  it("adds divider line between every individual property row", () => {
    const root = node("Header", [], [
      { name: "P1", value: "V1" },
      { name: "P2", value: "V2" }
    ]);
    const result = layoutERD(root, 5);
    const lines = result.elements.filter(e => e.type === "line");
    expect(lines.length).toBe(3); // 1 header divider + 2 prop dividers
  });
});
