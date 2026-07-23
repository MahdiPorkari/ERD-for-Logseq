/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { layoutGraph } from "./graph";
import type { TreeNode } from "../types";

describe("layoutGraph force-directed layout", () => {
  const makeNode = (uuid: string, name: string, refs: string[] = []): TreeNode => ({
    name,
    uuid,
    depth: 1,
    id: Math.floor(Math.random() * 1000),
    children: [],
    tags: [],
    properties: [],
    refs: refs.map(targetUuid => ({ kind: "reference", targetUuid }))
  });

  it("handles empty node list gracefully", () => {
    const root: TreeNode = {
      name: "Root",
      uuid: "root",
      depth: 0,
      id: 0,
      children: [],
      tags: [],
      properties: []
    };
    const result = layoutGraph(root, 5);
    expect(result.elements).toEqual([]);
    expect(result.bounds).toBeDefined();
    expect(result.nodeRectsByUuid?.size).toBe(0);
  });

  it("positions nodes in 2D space and populates nodeRectsByUuid", () => {
    const n1 = makeNode("node1", "First Block", ["node2"]);
    const n2 = makeNode("node2", "Second Block");
    const root: TreeNode = {
      name: "Root",
      uuid: "root",
      depth: 0,
      id: 0,
      children: [n1, n2],
      tags: [],
      properties: []
    };

    const result = layoutGraph(root, 5);

    expect(result.nodeRectsByUuid).toBeDefined();
    expect(result.nodeRectsByUuid?.has("node1")).toBe(true);
    expect(result.nodeRectsByUuid?.has("node2")).toBe(true);

    const r1 = result.nodeRectsByUuid?.get("node1")!;
    const r2 = result.nodeRectsByUuid?.get("node2")!;

    expect(r1.w).toBeGreaterThan(0);
    expect(r1.h).toBeGreaterThan(0);
    expect(r2.w).toBeGreaterThan(0);
    expect(r2.h).toBeGreaterThan(0);

    // The bounds should encompass both nodes with padding
    expect(result.bounds.w).toBeGreaterThan(r1.w);
    expect(result.bounds.h).toBeGreaterThan(r1.h);
  });
});
