/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { layoutERD } from "./erd";
import type { TreeNode, TagInfo } from "../types";

describe("layoutERD updated layout with Tags row", () => {
  const node = (name: string, tags: TagInfo[] = [], properties: { name: string; value: string }[] = []): TreeNode => ({
    name,
    uuid: "u",
    depth: 0,
    id: 1,
    children: [],
    tags,
    properties
  });

  it("renders 'Tags: N/A' when no tags are present", () => {
    const root = node("Header");
    const result = layoutERD(root, 5);

    const tagsLabel = result.elements.find(e => e.type === "text" && (e as any).text === "Tags:");
    const tagsValue = result.elements.find(e => e.type === "text" && (e as any).text === "N/A");

    expect(tagsLabel).toBeDefined();
    expect(tagsValue).toBeDefined();
  });

  it("renders tag titles in the Tags row", () => {
    const root = node("Header", [{ uuid: "t1", title: "my-tag" }]);
    const result = layoutERD(root, 5);

    const tagsValue = result.elements.find(e => e.type === "text" && (e as any).text === "my-tag");
    expect(tagsValue).toBeDefined();
  });

  it("adds divider line below the Tags row", () => {
    const root = node("Header");
    const result = layoutERD(root, 5);

    const lines = result.elements.filter(e => e.type === "line");
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it("adds divider line between every individual property row", () => {
    const root = node("Header", [], [
      { name: "P1", value: "V1" },
      { name: "P2", value: "V2" }
    ]);
    const result = layoutERD(root, 5);
    const lines = result.elements.filter(e => e.type === "line");
    // 1 tag divider + 1 header/prop divider + 2 prop dividers = 4
    expect(lines.length).toBe(4);
  });
});
