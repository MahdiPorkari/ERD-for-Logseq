/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveNodeRefs, buildTree, DefaultTagProvider, LogseqBlock, extractDisplayProperties, filterRefsByKind, resolveEntityTitle, fetchPropertiesReliably, expandRelationships, flattenDeep } from "./adapter";
import { TreeNode } from "./types";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";

describe("resolveEntityTitle", () => {
  it("resolves page-shaped entity with original-name", () => {
    const page: any = {
      ":block/name": "test-page",
      ":block/original-name": "Test Page Original",
    };
    expect(resolveEntityTitle(page)).toBe("Test Page Original");
  });

  it("resolves page-shaped entity with block/name and block/original-name", () => {
    const page: any = {
      "block/name": "test-page",
      "block/original-name": "Test Page Original Non-Colon",
    };
    expect(resolveEntityTitle(page)).toBe("Test Page Original Non-Colon");
  });

  it("resolves page-shaped entity when only name/originalName is present", () => {
    const page: any = {
      ":block/name": "test-page",
    };
    expect(resolveEntityTitle(page)).toBe("test-page");
  });

  it("resolves block-shaped entity with :block/title", () => {
    const block: any = {
      ":block/title": "Block Title Colon",
      title: "Block Title Normal",
      content: "Block Content",
    };
    expect(resolveEntityTitle(block)).toBe("Block Title Colon");
  });

  it("resolves block-shaped entity falling back to title and content", () => {
    const block: any = {
      title: "Block Title Fallback",
      content: "Block Content Fallback",
    };
    expect(resolveEntityTitle(block)).toBe("Block Title Fallback");

    const block2: any = {
      content: "Block Content Only",
    };
    expect(resolveEntityTitle(block2)).toBe("Block Content Only");
  });

  it("returns empty string if nothing is found", () => {
    const empty: any = {};
    expect(resolveEntityTitle(empty)).toBe("");
  });
});

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
  beforeEach(() => {
    vi.stubGlobal("logseq", {
      DB: {
        datascriptQuery: vi.fn().mockResolvedValue([])
      },
      Editor: {
        getBlock: vi.fn().mockResolvedValue(null)
      }
    });
  });

  it("extracts tags from authoritative Tier 1 query", async () => {
    const tagUuid = "tag-uuid";
    const tagTitle = "AuthoritativeTag";
    (logseq.DB.datascriptQuery as any).mockResolvedValueOnce([
      [{ ":block/uuid": tagUuid, ":block/title": tagTitle }]
    ]);

    const provider = new DefaultTagProvider();
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(1);
    expect(tags[0].title).toBe(tagTitle);
    expect(tags[0].uuid).toBe(tagUuid);
    expect(logseq.DB.datascriptQuery).toHaveBeenCalledTimes(1);
    expect(logseq.DB.datascriptQuery).toHaveBeenCalledWith(expect.any(String), '#uuid "b1"');
  });



  it("falls back to Tier 3 properties and handles multi-word tags", async () => {
    const block: LogseqBlock = {
      uuid: "b1",
      content: "#tag1",
      properties: {
        tags: "tag1, tag2, #tag3, [[tag 4]], [[Multi Word Tag]]"
      }
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(5);
    const titles = tags.map(t => t.title);
    expect(titles).toContain("tag1");
    expect(titles).toContain("tag2");
    expect(titles).toContain("tag3");
    expect(titles).toContain("tag 4");
    expect(titles).toContain("Multi Word Tag");
  });



  it("ignores page references in non-tag properties", async () => {
    const block: LogseqBlock = {
      uuid: "b1",
      properties: {
        tags: "RealTag",
        status: "[[Doing]]",
        project: "[[Logseq ERD]]"
      }
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(1);
    expect(tags[0].title).toBe("RealTag");
  });

  it("handles multi-word tags with commas correctly", async () => {
    const block: LogseqBlock = {
      uuid: "b1",
      properties: {
        tags: "[[Direct Link]], Important, [[Another Tag]]"
      }
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(3);
    const titles = tags.map(t => t.title);
    expect(titles).toContain("Direct Link");
    expect(titles).toContain("Important");
    expect(titles).toContain("Another Tag");
  });


  it("merges all tiers and sorts results", async () => {
    (logseq.DB.datascriptQuery as any).mockResolvedValueOnce([
      [{ ":block/title": "Zebra" }]
    ]);
    const block: LogseqBlock = {
      uuid: "b1",
      properties: {
        tags: "Banana, Apple"
      }
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(3);
    expect(tags[0].title).toBe("Apple");
    expect(tags[1].title).toBe("Banana");
    expect(tags[2].title).toBe("Zebra");
  });
});

describe("buildTree with tags", () => {
  it("populates tags on TreeNode via provider", async () => {
    vi.stubGlobal("logseq", {
      DB: {
        datascriptQuery: vi.fn().mockImplementation((query, uuid) => {
           if (uuid === '#uuid "b1"') return Promise.resolve([[{ ":block/uuid": "t1", ":block/title": "Tag1" }]]);
           if (uuid === '#uuid "b2"') return Promise.resolve([[{ ":block/uuid": "t2", ":block/title": "Tag2" }]]);
           return Promise.resolve([]);
        })
      },
      Editor: {
        getBlock: vi.fn().mockResolvedValue(null)
      }
    });
    const blocks: LogseqBlock[] = [
      {
        uuid: "b1",
        content: "Block 1"
      },
      {
        uuid: "b2",
        content: "Block 2"
      }
    ];
    const tree = await buildTree(blocks, "Page", false);
    // Page node with two children
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].tags).toHaveLength(1);
    expect(tree.children[0].tags![0].title).toBe("Tag1");
    expect(tree.children[1].tags).toHaveLength(1);
    expect(tree.children[1].tags![0].title).toBe("Tag2");
  });
});

describe("extractDisplayProperties", () => {
  it("excludes 'tags', 'relates_to', and 'depends_on'", async () => {
    const block: LogseqBlock = {
      uuid: "b1",
      "user.property/tags": "t1",
      "user.property/relates_to": "r1",
      "user.property/depends_on": "d1",
      "user.property/custom": "value"
    };
    const fetcher = vi.fn();
    const idResolver = vi.fn();
    const idCache = new Map();
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);

    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("Custom");
    expect(props[0].value).toBe("value");
  });

  it("extracts simple user properties from block.properties while ignoring system and namespaced properties", async () => {
    const block: LogseqBlock = {
      uuid: "b1",
      properties: {
        "status": "In Progress",
        "priority": "A",
        ":internal-key": "ignore-me",
        "some.namespaced/key": "ignore-me",
        "relates_to": "r1", // should be excluded
        "tags": "t1" // should be excluded
      }
    };
    const fetcher = vi.fn();
    const idResolver = vi.fn();
    const idCache = new Map();
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);

    expect(props).toHaveLength(2);
    expect(props[0].name).toBe("Priority");
    expect(props[0].value).toBe("A");
    expect(props[1].name).toBe("Status");
    expect(props[1].value).toBe("In Progress");
  });
});

describe("DefaultTagProvider edge cases", () => {
  it("handles non-plugin environment gracefully", async () => {
    vi.stubGlobal("logseq", undefined);
    const block: LogseqBlock = {
      uuid: "b1",
      properties: {
        tags: "tag1"
      }
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");
    expect(tags).toHaveLength(1);
    expect(tags[0].title).toBe("tag1");
  });

  it("handles complex property values", async () => {
    vi.stubGlobal("logseq", {
       DB: { datascriptQuery: vi.fn().mockResolvedValue([]) },
       Editor: { getBlock: vi.fn().mockResolvedValue(null) }
    });
    const block: LogseqBlock = {
      uuid: "b1",
      properties: {
        tags: [
          { uuid: "t1", title: "ObjectTag" },
          "StringTag",
          "#PrefixedTag"
        ]
      }
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");
    expect(tags).toHaveLength(3);
    const titles = tags.map(t => t.title);
    expect(titles).toContain("ObjectTag");
    expect(titles).toContain("StringTag");
    expect(titles).toContain("PrefixedTag");
  });
});

describe("buildTree with pageUuid (bug fix)", () => {
  it("populates tags for synthetic root node when pageUuid is provided", async () => {
    vi.stubGlobal("logseq", {
      DB: {
        datascriptQuery: vi.fn().mockImplementation((query, uuid) => {
           if (uuid === '#uuid "page-123"') return Promise.resolve([[{ ":block/uuid": "t-page", ":block/title": "PageTag" }]]);
           return Promise.resolve([]);
        })
      },
      Editor: {
        getBlock: vi.fn().mockResolvedValue(null)
      }
    });

    const blocks: LogseqBlock[] = [
      { uuid: "b1", content: "B1" },
      { uuid: "b2", content: "B2" }
    ];

    // Call with pageUuid
    const tree = await (buildTree as any)(blocks, "My Page", false, undefined, undefined, undefined, "page-123");

    expect(tree.name).toBe("My Page");
    expect(tree.uuid).toBe("page-123");
    expect(tree.tags).toBeDefined();
    expect(tree.tags).toHaveLength(1);
    expect(tree.tags![0].title).toBe("PageTag");
  });

  it("leaves root tags empty and uuid blank when pageUuid is omitted (backward compatibility)", async () => {
    vi.stubGlobal("logseq", {
      DB: {
        datascriptQuery: vi.fn().mockResolvedValue([])
      },
      Editor: {
        getBlock: vi.fn().mockResolvedValue(null)
      }
    });

    const blocks: LogseqBlock[] = [
      { uuid: "b1", content: "B1" },
      { uuid: "b2", content: "B2" }
    ];

    const tree = await buildTree(blocks, "My Page", false);

    expect(tree.name).toBe("My Page");
    expect(tree.uuid).toBe("");
    expect(tree.tags).toHaveLength(0);
  });
});

describe("filterRefsByKind", () => {
  it("filters refs by allowed kinds recursively", () => {
    const tree: any = {
      uuid: "root",
      children: [
        {
          uuid: "c1",
          children: [],
          refs: [
            { kind: "relates_to", targetUuid: "t1" },
            { kind: "custom", targetUuid: "t2" }
          ]
        }
      ],
      refs: [
        { kind: "depends_on", targetUuid: "t3" }
      ]
    };
    const filtered = filterRefsByKind(tree, new Set(["relates_to", "depends_on"]));
    expect(filtered.refs).toHaveLength(1);
    expect(filtered.refs![0].kind).toBe("depends_on");
    expect(filtered.children[0].refs).toHaveLength(1);
    expect(filtered.children[0].refs![0].kind).toBe("relates_to");
  });
});

describe("fetchPropertiesReliably", () => {
  it("calls getBlockProperties when isPage is false", async () => {
    const getBlockProperties = vi.fn().mockResolvedValue({ status: "done" });
    vi.stubGlobal("logseq", {
      Editor: {
        getBlockProperties,
      }
    });

    const result = await fetchPropertiesReliably("block-uuid", false);
    expect(getBlockProperties).toHaveBeenCalledWith("block-uuid");
    expect(result).toEqual({ status: "done" });

    vi.unstubAllGlobals();
  });

  it("calls getPageProperties when isPage is true", async () => {
    const getPageProperties = vi.fn().mockResolvedValue({ type: "item" });
    vi.stubGlobal("logseq", {
      Editor: {
        getPageProperties,
      }
    });

    const result = await fetchPropertiesReliably("page-uuid", true);
    expect(getPageProperties).toHaveBeenCalledWith("page-uuid");
    expect(result).toEqual({ type: "item" });

    vi.unstubAllGlobals();
  });

  it("falls back to resolving the page name via getPage and retries if pageProperties returns null or empty", async () => {
    const getPageProperties = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ type: "item-retry" });

    const getPage = vi.fn().mockResolvedValue({ originalName: "Some Page" });

    vi.stubGlobal("logseq", {
      Editor: {
        getPageProperties,
        getPage,
      }
    });

    const result = await fetchPropertiesReliably("page-uuid-missing", true);
    expect(getPageProperties).toHaveBeenCalledTimes(2);
    expect(getPageProperties).toHaveBeenNthCalledWith(1, "page-uuid-missing");
    expect(getPage).toHaveBeenCalledWith("page-uuid-missing");
    expect(getPageProperties).toHaveBeenNthCalledWith(2, "Some Page");
    expect(result).toEqual({ type: "item-retry" });

    vi.unstubAllGlobals();
  });
});


describe("Unlimited Relationship Depth & Automatic Discovery (v1.2.0)", () => {
  const UUID_A = "11111111-1111-1111-1111-111111111111";
  const UUID_B = "22222222-2222-2222-2222-222222222222";
  const UUID_C = "33333333-3333-3333-3333-333333333333";
  const UUID_D = "44444444-4444-4444-4444-444444444444";
  const UUID_ROOT = "99999999-9999-9999-9999-999999999999";

  beforeEach(() => {
    vi.stubGlobal("logseq", {
      DB: {
        datascriptQuery: vi.fn().mockResolvedValue([])
      },
      Editor: {
        getBlock: vi.fn().mockResolvedValue(null)
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("survives 3-hop relationship chain (A->B->C->D) under default maxDepth=3", async () => {
    const root: TreeNode = {
      name: "A",
      uuid: UUID_A,
      depth: 0,
      id: 1,
      children: [],
      properties: [],
      tags: [],
      refs: [{ kind: "depends_on", targetUuid: UUID_B }]
    };

    const blockMap = new Map<string, any>([
      [UUID_A, { uuid: UUID_A, content: "A", "user.property/depends_on": UUID_B }],
      [UUID_B, { uuid: UUID_B, content: "B", "user.property/depends_on": UUID_C }],
      [UUID_C, { uuid: UUID_C, content: "C", "user.property/depends_on": UUID_D }],
      [UUID_D, { uuid: UUID_D, content: "D" }],
    ]);

    const fetcher = async (uuid: string) => blockMap.get(uuid)?.content || null;
    const blockFetcher = async (uuid: string) => blockMap.get(uuid) || null;
    const idResolver = async (id: number) => null;
    const tagProvider = new DefaultTagProvider();

    const pruned = flattenDeep(root, 3, "recursive");
    const expanded = await expandRelationships(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    expect(expanded.uuid).toBe(UUID_A);
    expect(expanded.children).toHaveLength(1);

    const nodeB = expanded.children[0];
    expect(nodeB.uuid).toBe(UUID_B);
    expect(nodeB.children).toHaveLength(1);

    const nodeC = nodeB.children[0];
    expect(nodeC.uuid).toBe(UUID_C);
    expect(nodeC.children).toHaveLength(1);

    const nodeD = nodeC.children[0];
    expect(nodeD.uuid).toBe(UUID_D);
  });

  it("rediscovers outline-pruned node via relationship reference", async () => {
    const root: TreeNode = {
      name: "Root",
      uuid: UUID_ROOT,
      depth: 0,
      id: 1,
      children: [
        {
          name: "A",
          uuid: UUID_A,
          depth: 1,
          id: 2,
          children: [
            {
              name: "B",
              uuid: UUID_B,
              depth: 2,
              id: 3,
              children: [],
              properties: [],
              tags: [],
              refs: []
            }
          ],
          properties: [],
          tags: [],
          refs: []
        }
      ],
      properties: [],
      tags: [],
      refs: [{ kind: "relates_to", targetUuid: UUID_B }]
    };

    const blockMap = new Map<string, any>([
      [UUID_ROOT, { uuid: UUID_ROOT, content: "Root", "user.property/relates_to": UUID_B }],
      [UUID_A, { uuid: UUID_A, content: "A" }],
      [UUID_B, { uuid: UUID_B, content: "B" }],
    ]);

    const fetcher = async (uuid: string) => blockMap.get(uuid)?.content || null;
    const blockFetcher = async (uuid: string) => blockMap.get(uuid) || null;
    const idResolver = async (id: number) => null;
    const tagProvider = new DefaultTagProvider();

    const pruned = flattenDeep(root, 2, "recursive");
    expect(pruned.children[0].children).toHaveLength(0);

    const expanded = await expandRelationships(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    expect(expanded.children).toHaveLength(2);
    const foundB = expanded.children.find(n => n.uuid === UUID_B);
    expect(foundB).toBeDefined();
    expect(foundB!.name).toBe("B");
  });

  it("handles diamond relationship correctly producing exactly one synthetic node", async () => {
    const root: TreeNode = {
      name: "Root",
      uuid: UUID_ROOT,
      depth: 0,
      id: 1,
      children: [
        {
          name: "A",
          uuid: UUID_A,
          depth: 1,
          id: 2,
          children: [],
          properties: [],
          tags: [],
          refs: [{ kind: "depends_on", targetUuid: UUID_C }]
        },
        {
          name: "B",
          uuid: UUID_B,
          depth: 1,
          id: 3,
          children: [],
          properties: [],
          tags: [],
          refs: [{ kind: "depends_on", targetUuid: UUID_C }]
        }
      ],
      properties: [],
      tags: [],
      refs: []
    };

    const blockMap = new Map<string, any>([
      [UUID_ROOT, { uuid: UUID_ROOT, content: "Root" }],
      [UUID_A, { uuid: UUID_A, content: "A", "user.property/depends_on": UUID_C }],
      [UUID_B, { uuid: UUID_B, content: "B", "user.property/depends_on": UUID_C }],
      [UUID_C, { uuid: UUID_C, content: "C" }],
    ]);

    const fetcher = async (uuid: string) => blockMap.get(uuid)?.content || null;
    const blockFetcher = async (uuid: string) => blockMap.get(uuid) || null;
    const idResolver = async (id: number) => null;
    const tagProvider = new DefaultTagProvider();

    const pruned = flattenDeep(root, 3, "recursive");
    const expanded = await expandRelationships(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    let totalNodes = 0;
    const collect = (n: TreeNode) => {
      totalNodes++;
      for (const c of n.children) collect(c);
    };
    collect(expanded);
    expect(totalNodes).toBe(4);

    const nodeA = expanded.children[0];
    const nodeB = expanded.children[1];
    expect(nodeA.children.length + nodeB.children.length).toBe(1);
  });

  it("self-reference loop edge survives without infinite recursion", async () => {
    const root: TreeNode = {
      name: "Root",
      uuid: UUID_ROOT,
      depth: 0,
      id: 1,
      children: [],
      properties: [],
      tags: [],
      refs: [{ kind: "relates_to", targetUuid: UUID_ROOT }]
    };

    const blockMap = new Map<string, any>([
      [UUID_ROOT, { uuid: UUID_ROOT, content: "Root", "user.property/relates_to": UUID_ROOT }],
    ]);

    const fetcher = async (uuid: string) => blockMap.get(uuid)?.content || null;
    const blockFetcher = async (uuid: string) => blockMap.get(uuid) || null;
    const idResolver = async (id: number) => null;
    const tagProvider = new DefaultTagProvider();

    const pruned = flattenDeep(root, 3, "recursive");
    const expanded = await expandRelationships(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    expect(expanded.children).toHaveLength(0);
    expect(expanded.refs).toBeDefined();
  });

  it("relationship source block at maxDepth boundary (depth 2 with maxDepth: 3) still fully expands", async () => {
    const root: TreeNode = {
      name: "Root",
      uuid: UUID_ROOT,
      depth: 0,
      id: 1,
      children: [
        {
          name: "A",
          uuid: UUID_A,
          depth: 1,
          id: 2,
          children: [
            {
              name: "B",
              uuid: UUID_B,
              depth: 2,
              id: 3,
              children: [],
              properties: [],
              tags: [],
              refs: [{ kind: "depends_on", targetUuid: UUID_C }]
            }
          ],
          properties: [],
          tags: [],
          refs: []
        }
      ],
      properties: [],
      tags: [],
      refs: []
    };

    const blockMap = new Map<string, any>([
      [UUID_ROOT, { uuid: UUID_ROOT, content: "Root" }],
      [UUID_A, { uuid: UUID_A, content: "A" }],
      [UUID_B, { uuid: UUID_B, content: "B", "user.property/depends_on": UUID_C }],
      [UUID_C, { uuid: UUID_C, content: "C" }],
    ]);

    const fetcher = async (uuid: string) => blockMap.get(uuid)?.content || null;
    const blockFetcher = async (uuid: string) => blockMap.get(uuid) || null;
    const idResolver = async (id: number) => null;
    const tagProvider = new DefaultTagProvider();

    const pruned = flattenDeep(root, 3, "recursive");
    const expanded = await expandRelationships(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    const nodeA = expanded.children[0];
    const nodeB = nodeA.children[0];
    expect(nodeB.uuid).toBe(UUID_B);
    expect(nodeB.children).toHaveLength(1);
    expect(nodeB.children[0].uuid).toBe(UUID_C);
  });

  it("handles cardinality-many multiple references producing one edge per reference", async () => {
    const root: TreeNode = {
      name: "A",
      uuid: UUID_A,
      depth: 0,
      id: 1,
      children: [],
      properties: [],
      tags: [],
      refs: [
        { kind: "depends_on", targetUuid: UUID_B },
        { kind: "depends_on", targetUuid: UUID_C }
      ]
    };

    const blockMap = new Map<string, any>([
      [UUID_A, { uuid: UUID_A, content: "A", "user.property/depends_on": [UUID_B, UUID_C] }],
      [UUID_B, { uuid: UUID_B, content: "B" }],
      [UUID_C, { uuid: UUID_C, content: "C" }],
    ]);

    const fetcher = async (uuid: string) => blockMap.get(uuid)?.content || null;
    const blockFetcher = async (uuid: string) => blockMap.get(uuid) || null;
    const idResolver = async (id: number) => null;
    const tagProvider = new DefaultTagProvider();

    const pruned = flattenDeep(root, 3, "recursive");
    const expanded = await expandRelationships(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    expect(expanded.children).toHaveLength(2);
    expect(expanded.children.map(n => n.uuid)).toContain(UUID_B);
    expect(expanded.children.map(n => n.uuid)).toContain(UUID_C);
  });

  it("regression: page with showRelationships on and zero node-typed properties renders identically", async () => {
    const root: TreeNode = {
      name: "A",
      uuid: UUID_A,
      depth: 0,
      id: 1,
      children: [
        {
          name: "B",
          uuid: UUID_B,
          depth: 1,
          id: 2,
          children: [],
          properties: [],
          tags: [],
          refs: []
        }
      ],
      properties: [],
      tags: [],
      refs: []
    };

    const blockMap = new Map<string, any>([
      [UUID_A, { uuid: UUID_A, content: "A" }],
      [UUID_B, { uuid: UUID_B, content: "B" }],
    ]);

    const fetcher = async (uuid: string) => blockMap.get(uuid)?.content || null;
    const blockFetcher = async (uuid: string) => blockMap.get(uuid) || null;
    const idResolver = async (id: number) => null;
    const tagProvider = new DefaultTagProvider();

    const pruned = flattenDeep(root, 3, "recursive");
    const expanded = await expandRelationships(
      pruned,
      fetcher,
      idResolver,
      tagProvider,
      blockFetcher,
      []
    );

    expect(expanded.children).toHaveLength(1);
    expect(expanded.children[0].uuid).toBe(UUID_B);
  });
});