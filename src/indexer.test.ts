/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackgroundIndexer, AdjacencyEdge } from "./indexer";
import type { TreeNode } from "./types";

const PAGE_UUID = "page-1111-1111-1111-111111111111";
const BLOCK_A_UUID = "aaaa1111-1111-1111-1111-111111111111";
const BLOCK_B_UUID = "bbbb2222-2222-2222-2222-222222222222";
const TAG_UUID = "tagg3333-3333-3333-3333-333333333333";

describe("BackgroundIndexer", () => {
  beforeEach(() => {
    vi.stubGlobal("logseq", {
      DB: {
        datascriptQuery: vi.fn()
      },
      Editor: {
        getBlock: vi.fn(),
        getAllProperties: vi.fn().mockResolvedValue([])
      }
    });
  });

  it("builds initial graph, page maps, and extracts outbound edges correctly", async () => {
    const mockEntities = [
      {
        "db/id": 1,
        "block/uuid": PAGE_UUID,
        "block/title": "My Active Page",
        "block/type": "page"
      },
      {
        "db/id": 2,
        "block/uuid": BLOCK_A_UUID,
        "block/parent": { "db/id": 1 },
        "block/page": { "db/id": 1 },
        "block/content": `Some text referencing [[${BLOCK_B_UUID}]] and hashtag #ActiveTag`
      },
      {
        "db/id": 3,
        "block/uuid": BLOCK_B_UUID,
        "block/parent": { "db/id": 1 },
        "block/page": { "db/id": 1 },
        "block/content": "Another leaf block",
        "block/tags": [{ "db/id": 4 }],
        "user.property/relates_to": BLOCK_A_UUID
      },
      {
        "db/id": 4,
        "block/uuid": TAG_UUID,
        "block/title": "activetag",
        "block/type": "page"
      }
    ];

    (logseq.DB.datascriptQuery as any).mockImplementation(async (query: string) => {
      if (query.includes('"property"')) {
        return [];
      }
      return mockEntities.map(e => [e]);
    });

    const indexer = new BackgroundIndexer();
    await indexer.initialize();

    // Verify maps
    expect(indexer.idMap.get(1)).toBe(PAGE_UUID);
    expect(indexer.idMap.get(2)).toBe(BLOCK_A_UUID);
    expect(indexer.pageNameMap.get("my active page")).toBe(PAGE_UUID);
    expect(indexer.pageNameMap.get("activetag")).toBe(TAG_UUID);

    // Verify edges extracted for BLOCK_A (should have reference to BLOCK_B and reference to TAG_UUID)
    const blockAEdges = indexer.adjacencyGraph.get(BLOCK_A_UUID);
    expect(blockAEdges).toBeDefined();
    const bTargets = blockAEdges!.map(e => e.targetId);
    expect(bTargets).toContain(BLOCK_B_UUID);
    expect(bTargets).toContain(TAG_UUID);

    // Verify parent-child edge automatically added in adjacencyGraph
    const pageEdges = indexer.adjacencyGraph.get(PAGE_UUID);
    expect(pageEdges).toBeDefined();
    const pTargets = pageEdges!.map(e => e.targetId);
    expect(pTargets).toContain(BLOCK_A_UUID);
    expect(pTargets).toContain(BLOCK_B_UUID);

    // Verify edge extracted for BLOCK_B (relates_to -> property edge to BLOCK_A, and tag -> tag edge to TAG_UUID)
    const blockBEdges = indexer.adjacencyGraph.get(BLOCK_B_UUID);
    expect(blockBEdges).toBeDefined();
    expect(blockBEdges!.some(e => e.targetId === BLOCK_A_UUID && e.edgeType === "property")).toBe(true);
    expect(blockBEdges!.some(e => e.targetId === TAG_UUID && e.edgeType === "tag")).toBe(true);
  });

  it("builds BFS spanning tree following precedence rules", async () => {
    const indexer = new BackgroundIndexer();

    // Setup adjacency graph manually for deterministic testing
    // Page -> A (parent-child)
    // Page -> B (parent-child)
    // A -> B (reference)
    // B -> C (property)
    // C -> A (cycle: tag)
    indexer.pageNameMap.set("my active page", PAGE_UUID);
    indexer.idMap.set(1, PAGE_UUID);
    indexer.idMap.set(2, BLOCK_A_UUID);
    indexer.idMap.set(3, BLOCK_B_UUID);

    indexer.adjacencyGraph.set(PAGE_UUID, [
      { targetId: BLOCK_A_UUID, edgeType: "parent-child" },
      { targetId: BLOCK_B_UUID, edgeType: "parent-child" }
    ]);
    indexer.adjacencyGraph.set(BLOCK_A_UUID, [
      { targetId: BLOCK_B_UUID, edgeType: "reference" }
    ]);
    indexer.adjacencyGraph.set(BLOCK_B_UUID, [
      { targetId: "block-c", edgeType: "property" }
    ]);
    indexer.adjacencyGraph.set("block-c", [
      { targetId: BLOCK_A_UUID, edgeType: "tag" }
    ]);

    // Setup mock entity cache
    indexer.entityCache.set(PAGE_UUID, { "block/uuid": PAGE_UUID, "block/title": "My Active Page" });
    indexer.entityCache.set(BLOCK_A_UUID, { "block/uuid": BLOCK_A_UUID, "block/content": "Block A" });
    indexer.entityCache.set(BLOCK_B_UUID, { "block/uuid": BLOCK_B_UUID, "block/content": "Block B" });
    indexer.entityCache.set("block-c", { "block/uuid": "block-c", "block/content": "Block C" });

    const fetcher = vi.fn(async () => null);

    const root = await indexer.buildERDV2Tree(
      PAGE_UUID,
      [BLOCK_A_UUID, BLOCK_B_UUID],
      "My Active Page",
      fetcher
    );

    // Verify spanning tree shape
    expect(root.name).toBe("My Active Page");
    expect(root.children).toHaveLength(2); // Block A and Block B are direct children because they are in the seeds

    const nodeA = root.children.find(c => c.uuid === BLOCK_A_UUID)!;
    const nodeB = root.children.find(c => c.uuid === BLOCK_B_UUID)!;

    expect(nodeA).toBeDefined();
    expect(nodeB).toBeDefined();

    // Verify precedence rules and visited sets:
    // A -> B is a reference, but B is already a direct child (visited as part of seeds).
    // So A -> B becomes a .refs cross-link, NOT a child.
    expect(nodeA.children).toHaveLength(0);
    expect(nodeA.refs).toContainEqual({ kind: "reference", targetUuid: BLOCK_B_UUID });

    // B -> C is a property edge, C is NOT visited yet.
    // So C is a child of B.
    expect(nodeB.children).toHaveLength(1);
    const nodeC = nodeB.children[0];
    expect(nodeC.uuid).toBe("block-c");

    // C -> A is a tag edge, A is already visited.
    // So C -> A is a .refs cross-link, NOT a child.
    expect(nodeC.children).toHaveLength(0);
    expect(nodeC.refs).toContainEqual({ kind: "tag", targetUuid: BLOCK_A_UUID });
  });

  it("builds flat whole-graph nodes and edges in buildGraphWide", async () => {
    const indexer = new BackgroundIndexer();

    indexer.pageNameMap.set("my active page", PAGE_UUID);
    indexer.idMap.set(1, PAGE_UUID);
    indexer.idMap.set(2, BLOCK_A_UUID);
    indexer.idMap.set(3, BLOCK_B_UUID);

    indexer.adjacencyGraph.set(PAGE_UUID, [
      { targetId: BLOCK_A_UUID, edgeType: "parent-child" }
    ]);
    indexer.adjacencyGraph.set(BLOCK_A_UUID, [
      { targetId: BLOCK_B_UUID, edgeType: "reference" }
    ]);

    indexer.entityCache.set(PAGE_UUID, { "block/uuid": PAGE_UUID, "block/title": "My Active Page" });
    indexer.entityCache.set(BLOCK_A_UUID, { "block/uuid": BLOCK_A_UUID, "block/content": "Block A" });
    indexer.entityCache.set(BLOCK_B_UUID, { "block/uuid": BLOCK_B_UUID, "block/content": "Block B" });

    const result = await indexer.buildGraphWide();

    // Verify all nodes participating are in the flat list
    expect(result.nodes).toHaveLength(3);
    const nodeUuids = result.nodes.map(n => n.uuid);
    expect(nodeUuids).toContain(PAGE_UUID);
    expect(nodeUuids).toContain(BLOCK_A_UUID);
    expect(nodeUuids).toContain(BLOCK_B_UUID);

    // Verify correct flat edges are extracted
    expect(result.edges).toHaveLength(2);
    expect(result.edges).toContainEqual({ sourceUuid: PAGE_UUID, targetUuid: BLOCK_A_UUID, edgeType: "parent-child" });
    expect(result.edges).toContainEqual({ sourceUuid: BLOCK_A_UUID, targetUuid: BLOCK_B_UUID, edgeType: "reference" });

    // Verify refs are populated on node objects
    const pageNode = result.nodes.find(n => n.uuid === PAGE_UUID)!;
    expect(pageNode.refs).toContainEqual({ kind: "parent-child", targetUuid: BLOCK_A_UUID });
  });
});
