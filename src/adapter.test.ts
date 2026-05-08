import { describe, it, expect, vi } from "vitest";
import { resolveNodeRefs, buildTree } from "./adapter";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_BUG = "69fd1b8a-9fda-4a4b-982b-836e19aeb5e6"; // from the reported bug

describe("resolveNodeRefs", () => {
  it("returns text unchanged and never calls the fetcher when there are no refs", async () => {
    const fetcher = vi.fn(async () => null);
    const result = await resolveNodeRefs("just plain text", fetcher);
    expect(result).toBe("just plain text");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("leaves non-UUID page-name refs alone (only UUID-form refs are resolved)", async () => {
    const fetcher = vi.fn(async () => null);
    const result = await resolveNodeRefs("see [[Some Page]]", fetcher);
    expect(result).toBe("see [[Some Page]]");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves a single UUID ref to the referenced title (the reported bug)", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_BUG ? "tasky-reference child" : null
    );
    const result = await resolveNodeRefs(`[[${UUID_BUG}]]`, fetcher);
    expect(result).toBe("tasky-reference child");
  });

  it("resolves multiple UUID refs interleaved with other text", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? "Alpha" : id === UUID_B ? "Beta" : null
    );
    const result = await resolveNodeRefs(
      `before [[${UUID_A}]] middle [[${UUID_B}]] after`,
      fetcher
    );
    expect(result).toBe("before Alpha middle Beta after");
  });

  it("dedupes lookups: same UUID appearing twice triggers fetcher once", async () => {
    const fetcher = vi.fn(async () => "Title");
    await resolveNodeRefs(`[[${UUID_A}]] and again [[${UUID_A}]]`, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("recursively resolves nested refs when a resolved title contains another ref", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? `outer with [[${UUID_B}]]` : "inner"
    );
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(result).toBe("outer with inner");
  });

  it("does not infinite-loop on cyclic refs (depth cap)", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? `[[${UUID_B}]]` : `[[${UUID_A}]]`
    );
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    // Cache means each uuid is fetched at most once
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(2);
    expect(typeof result).toBe("string");
  });

  it("falls back to a non-UUID placeholder when the fetcher returns null", async () => {
    const fetcher = vi.fn(async () => null);
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(result).not.toContain(UUID_A);
    expect(result.length).toBeGreaterThan(0);
  });

  it("survives a fetcher that throws (treats as unresolved)", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(typeof result).toBe("string");
    expect(result).not.toContain(UUID_A);
  });
});

describe("buildTree (end-to-end ref resolution)", () => {
  it("resolves UUID refs in a block title so the rendered name is the referenced entity's title", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_BUG ? "Referenced Block Title" : null
    );
    const blocks = [
      {
        uuid: "block-1",
        title: `[[${UUID_BUG}]]`,
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher);
    // Single top-level block becomes root, so its resolved title shows up at the root
    expect(tree.name).toBe("Referenced Block Title");
  });

  it("resolves refs inside child blocks too", async () => {
    const fetcher = vi.fn(async (id: string) =>
      id === UUID_A ? "Child Title" : null
    );
    const blocks = [
      {
        uuid: "parent",
        title: "Parent",
        children: [
          { uuid: "child-1", title: `[[${UUID_A}]]`, children: [] },
        ],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher);
    expect(tree.name).toBe("Parent");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].name).toBe("Child Title");
  });
});
