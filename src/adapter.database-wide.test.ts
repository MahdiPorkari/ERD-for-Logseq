/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { expandDatabaseWide, expandOutOfScopeRefs, flattenDeep } from "./adapter";
import { TreeNode } from "./types";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";
const UUID_D = "44444444-4444-4444-4444-444444444444";
const UUID_E = "55555555-5555-5555-5555-555555555555";

describe("Database-wide Discovery Tests", () => {
  const fetcher = vi.fn(async () => null);
  const idResolver = vi.fn(async () => null);
  const tagProvider = {
    getTags: vi.fn(async () => [])
  };

  // 1. Regression: Calling expandOutOfScopeRefs behaves as before (relates_to/depends_on are excluded).
  it("regression: expandOutOfScopeRefs behaves as before, excluding relates_to and depends_on", async () => {
    const root: TreeNode = {
      name: "Root",
      depth: 0,
      id: 0,
      uuid: "root-uuid",
      children: [
        {
          name: "Block A",
          depth: 1,
          id: 1,
          uuid: UUID_A,
          children: [],
          refs: [
            { kind: "relates_to", targetUuid: UUID_B },
            { kind: "rel_custom", targetUuid: UUID_C }
          ]
        }
      ],
      refs: []
    };

    const blockFetcher = vi.fn(async (uuid: string) => {
      if (uuid === UUID_B) return { uuid: UUID_B, content: "Block B" };
      if (uuid === UUID_C) return { uuid: UUID_C, content: "Block C" };
      return null;
    });

    const result = await expandOutOfScopeRefs(
      root,
      ["rel_custom"],
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher
    );

    const sourceNode = result.children[0];
    // B (relates_to) is NOT expanded (so it's not a child, and ref is kept).
    // C (rel_custom) IS expanded (so it's a child, and ref is removed).
    expect(sourceNode.children).toHaveLength(1);
    expect(sourceNode.children[0].uuid).toBe(UUID_C);
    expect(sourceNode.refs).toHaveLength(1);
    expect(sourceNode.refs![0].kind).toBe("relates_to");
  });

  // 2. Multi-hop discovery: chains A->B->C->D linked via custom relationship property
  it("multi-hop discovery: recursively follows references A->B->C->D", async () => {
    const root: TreeNode = {
      name: "Root",
      depth: 0,
      id: 0,
      uuid: "root-uuid",
      children: [
        {
          name: "Block A",
          depth: 1,
          id: 1,
          uuid: UUID_A,
          children: [],
          refs: [
            { kind: "rel_custom", targetUuid: UUID_B }
          ]
        }
      ],
      refs: []
    };

    const blockFetcher = vi.fn(async (uuid: string) => {
      if (uuid === UUID_B) {
        return {
          uuid: UUID_B,
          content: "Block B",
          "user.property/rel_custom": UUID_C
        };
      }
      if (uuid === UUID_C) {
        return {
          uuid: UUID_C,
          content: "Block C",
          "user.property/rel_custom": UUID_D
        };
      }
      if (uuid === UUID_D) {
        return {
          uuid: UUID_D,
          content: "Block D"
        };
      }
      return null;
    });

    const result = await expandDatabaseWide(
      root,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      ["rel_custom"]
    );

    const nodeA = result.children[0];
    expect(nodeA.children).toHaveLength(1);

    const nodeB = nodeA.children[0];
    expect(nodeB.uuid).toBe(UUID_B);
    expect(nodeB.children).toHaveLength(1);

    const nodeC = nodeB.children[0];
    expect(nodeC.uuid).toBe(UUID_C);
    expect(nodeC.children).toHaveLength(1);

    const nodeD = nodeC.children[0];
    expect(nodeD.uuid).toBe(UUID_D);
    expect(nodeD.children).toHaveLength(0);

    // Verify all refs that were resolved are cleared/removed from refs array
    expect(nodeA.refs).toHaveLength(0);
    expect(nodeB.refs).toHaveLength(0);
    expect(nodeC.refs).toHaveLength(0);
  });

  // 3. Cycle safety: A->B->C->A cycle is handled safely without hanging or duplication
  it("cycle safety: handles cycles (A->B->C->A) gracefully", async () => {
    const root: TreeNode = {
      name: "Root",
      depth: 0,
      id: 0,
      uuid: "root-uuid",
      children: [
        {
          name: "Block A",
          depth: 1,
          id: 1,
          uuid: UUID_A,
          children: [],
          refs: [
            { kind: "rel_custom", targetUuid: UUID_B }
          ]
        }
      ],
      refs: []
    };

    const blockFetcher = vi.fn(async (uuid: string) => {
      if (uuid === UUID_B) {
        return {
          uuid: UUID_B,
          content: "Block B",
          "user.property/rel_custom": UUID_C
        };
      }
      if (uuid === UUID_C) {
        return {
          uuid: UUID_C,
          content: "Block C",
          "user.property/rel_custom": UUID_A // points back to A
        };
      }
      return null;
    });

    const result = await expandDatabaseWide(
      root,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      ["rel_custom"]
    );

    const nodeA = result.children[0];
    expect(nodeA.children).toHaveLength(1);

    const nodeB = nodeA.children[0];
    expect(nodeB.uuid).toBe(UUID_B);
    expect(nodeB.children).toHaveLength(1);

    const nodeC = nodeB.children[0];
    expect(nodeC.uuid).toBe(UUID_C);
    // Since node C references node A which is already visited, it must NOT recurse or add duplicate node.
    expect(nodeC.children).toHaveLength(0);
    // But since node A was visited, the ref on node C is kept for overlay-edge drawing!
    expect(nodeC.refs).toHaveLength(1);
    expect(nodeC.refs![0].targetUuid).toBe(UUID_A);
  });

  // 4. Node cap (options.maxNodes):
  it("maxNodes cap: limits discovery and logs warning, while large root does not eat into the limit", async () => {
    const root: TreeNode = {
      name: "Root",
      depth: 0,
      id: 0,
      uuid: "root-uuid",
      children: [
        {
          name: "Root Child 1",
          depth: 1,
          id: 1,
          uuid: "root-child-1",
          children: [],
          refs: []
        },
        {
          name: "Root Child 2",
          depth: 1,
          id: 2,
          uuid: "root-child-2",
          children: [],
          refs: []
        },
        {
          name: "Block A",
          depth: 1,
          id: 3,
          uuid: UUID_A,
          children: [],
          refs: [
            { kind: "rel_custom", targetUuid: UUID_B }
          ]
        }
      ],
      refs: []
    };

    const blockFetcher = vi.fn(async (uuid: string) => {
      if (uuid === UUID_B) {
        return {
          uuid: UUID_B,
          content: "Block B",
          "user.property/rel_custom": UUID_C
        };
      }
      if (uuid === UUID_C) {
        return {
          uuid: UUID_C,
          content: "Block C",
          "user.property/rel_custom": UUID_D
        };
      }
      if (uuid === UUID_D) {
        return {
          uuid: UUID_D,
          content: "Block D",
          "user.property/rel_custom": UUID_E
        };
      }
      if (uuid === UUID_E) {
        return {
          uuid: UUID_E,
          content: "Block E"
        };
      }
      return null;
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Set maxNodes to 2.
    // The chain is A -> B -> C -> D -> E.
    // Discovery should add B and C, but stop before adding D or E.
    const result = await expandDatabaseWide(
      root,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      ["rel_custom"],
      { maxNodes: 2 }
    );

    const nodeA = result.children[2];
    expect(nodeA.children).toHaveLength(1);

    const nodeB = nodeA.children[0];
    expect(nodeB.uuid).toBe(UUID_B);
    expect(nodeB.children).toHaveLength(1);

    const nodeC = nodeB.children[0];
    expect(nodeC.uuid).toBe(UUID_C);
    // Node D should NOT be added as child of C because we hit the cap of 2.
    expect(nodeC.children).toHaveLength(0);

    // Verify warning is logged.
    expect(warnSpy).toHaveBeenCalledWith("[OutlineCanvas] Database-wide Discovery stopped at maxNodes=2");
    warnSpy.mockRestore();
  });

  // 5. relates_to/depends_on are included in traversal
  it("relates_to and depends_on are included by default in expandDatabaseWide", async () => {
    const root: TreeNode = {
      name: "Root",
      depth: 0,
      id: 0,
      uuid: "root-uuid",
      children: [
        {
          name: "Block A",
          depth: 1,
          id: 1,
          uuid: UUID_A,
          children: [],
          refs: [
            { kind: "relates_to", targetUuid: UUID_B },
            { kind: "depends_on", targetUuid: UUID_C }
          ]
        }
      ],
      refs: []
    };

    const blockFetcher = vi.fn(async (uuid: string) => {
      if (uuid === UUID_B) {
        return {
          uuid: UUID_B,
          content: "Block B"
        };
      }
      if (uuid === UUID_C) {
        return {
          uuid: UUID_C,
          content: "Block C"
        };
      }
      return null;
    });

    const result = await expandDatabaseWide(
      root,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    const nodeA = result.children[0];
    expect(nodeA.children).toHaveLength(2);

    const childUuids = nodeA.children.map(c => c.uuid);
    expect(childUuids).toContain(UUID_B);
    expect(childUuids).toContain(UUID_C);
  });

  // 6. Depth-pruning-before-discovery regression test:
  it("depth-pruning-before-discovery regression test: deep ref at depth >= maxDepth", async () => {
    const tree: TreeNode = {
      name: "Root (depth 0)",
      depth: 0,
      id: 0,
      uuid: "uuid-root",
      children: [
        {
          name: "Child (depth 1)",
          depth: 1,
          id: 1,
          uuid: "uuid-depth-1",
          children: [
            {
              name: "Grandchild (depth 2)",
              depth: 2,
              id: 2,
              uuid: "uuid-depth-2",
              children: [
                {
                  name: "Great-grandchild (depth 3)",
                  depth: 3,
                  id: 3,
                  uuid: "uuid-depth-3",
                  children: [],
                  refs: [
                    { kind: "rel_custom", targetUuid: UUID_B }
                  ]
                }
              ],
              refs: []
            }
          ],
          refs: []
        }
      ],
      refs: []
    };

    const blockFetcher = vi.fn(async (uuid: string) => {
      if (uuid === UUID_B) {
        return {
          uuid: UUID_B,
          content: "Block B"
        };
      }
      return null;
    });

    // 6a. Calling flattenDeep(tree, 3, "recursive") then expandDatabaseWide on pruned result
    // does NOT find or expand the deep ref because flattenDeep at maxDepth=3 deletes everything at depth >= 2
    const pruned = flattenDeep(tree, 3, "recursive");
    const resultPruned = await expandDatabaseWide(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      ["rel_custom"]
    );

    // Deepest child in pruned will be "Grandchild (depth 2)" which has children: []
    const grandchildPruned = resultPruned.children[0].children[0];
    expect(grandchildPruned.children).toHaveLength(0); // Great-grandchild is pruned away entirely!

    // 6b. Calling expandDatabaseWide directly on un-pruned tree DOES find and expand it
    const resultUnpruned = await expandDatabaseWide(
      tree,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      ["rel_custom"]
    );

    const nodeA = resultUnpruned.children[0]; // Child (depth 1)
    const node1 = nodeA.children[0];          // Grandchild (depth 2)
    const node2 = node1.children[0];          // Great-grandchild (depth 3)

    expect(node2.uuid).toBe("uuid-depth-3");
    expect(node2.children).toHaveLength(1);
    expect(node2.children[0].uuid).toBe(UUID_B);
  });
});
