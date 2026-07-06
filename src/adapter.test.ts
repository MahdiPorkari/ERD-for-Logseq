/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveNodeRefs, buildTree, filterIntraTreeRefs, flattenDeep, extractDisplayProperties, DefaultTagProvider, TagProvider } from "./adapter";
import type { TreeNode, TagInfo } from "./types";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("resolveNodeRefs", () => {
  it("returns text unchanged when there are no refs", async () => {
    const fetcher = vi.fn();
    const result = await resolveNodeRefs("no refs here", fetcher);
    expect(result).toBe("no refs here");
  });

  it("resolves multiple UUID refs", async () => {
    const fetcher = vi.fn(async (id: string) => (id === UUID_A ? "Alpha" : "Beta"));
    const result = await resolveNodeRefs(`[[${UUID_A}]] and [[${UUID_B}]]`, fetcher);
    expect(result).toBe("Alpha and Beta");
  });

  it("handles recursion and avoid infinite loops", async () => {
    const fetcher = vi.fn(async (id: string) => id === UUID_A ? `[[${UUID_B}]]` : "End");
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(result).toBe("End");
  });
});

describe("DefaultTagProvider", () => {
  it("extracts tags from block object keys", async () => {
    const block = {
      uuid: "u1",
      ":block/tags": [{ uuid: "t1", title: "Tag1" }],
      "user.property/tags": { uuid: "t2", title: "Tag2" }
    };
    const provider = new DefaultTagProvider(new Map([["u1", block as any]]));
    const tags = await provider.getTags("u1");
    expect(tags).toHaveLength(2);
    expect(tags[0].title).toBe("Tag1");
    expect(tags[1].title).toBe("Tag2");
  });
});

describe("buildTree with tags", () => {
  it("populates tags on TreeNode via provider", async () => {
    const blocks: any[] = [{
      uuid: "b1",
      content: "Block",
      ":block/tags": [{ uuid: "t1", title: "Tag1" }]
    }];
    const tree = await buildTree(blocks, "Page", false);
    expect(tree.tags).toHaveLength(1);
    expect(tree.tags![0].title).toBe("Tag1");
  });
});

describe("DefaultTagProvider improvements", () => {
  it("extracts tags even if they are strings", async () => {
    const block = {
      uuid: "u1",
      "user.property/tags-abc": "#Tag1"
    };
    const provider = new DefaultTagProvider(new Map([["u1", block as any]]));
    const tags = await provider.getTags("u1");
    expect(tags).toHaveLength(1);
    expect(tags[0].title).toBe("#Tag1");
  });
});
