/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveNodeRefs,
  buildTree,
  DefaultTagProvider,
  type LogseqBlock,
  extractDisplayProperties,
  includeOutScopeRefs,
  extractRefs,
} from "./adapter";

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
    const fetcher = vi.fn(async (id: string) => (id === UUID_A ? `[[${UUID_B}]]` : "End"));
    const result = await resolveNodeRefs(`[[${UUID_A}]]`, fetcher);
    expect(result).toBe("End");
  });
});

describe("DefaultTagProvider", () => {
  beforeEach(() => {
    vi.stubGlobal("logseq", {
      DB: {
        datascriptQuery: vi.fn().mockResolvedValue([]),
      },
      Editor: {
        getBlock: vi.fn().mockResolvedValue(null),
      },
    });
  });

  it("extracts tags from authoritative Tier 1 query", async () => {
    const tagUuid = "tag-uuid";
    const tagTitle = "AuthoritativeTag";
    (logseq.DB.datascriptQuery as any).mockResolvedValueOnce([
      [{ ":block/uuid": tagUuid, ":block/title": tagTitle }],
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
        tags: "tag1, tag2, #tag3, [[tag 4]], [[Multi Word Tag]]",
      },
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(5);
    const titles = tags.map((t) => t.title);
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
        project: "[[Logseq ERD]]",
      },
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
        tags: "[[Direct Link]], Important, [[Another Tag]]",
      },
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(3);
    const titles = tags.map((t) => t.title);
    expect(titles).toContain("Direct Link");
    expect(titles).toContain("Important");
    expect(titles).toContain("Another Tag");
  });

  it("merges all tiers and sorts results", async () => {
    (logseq.DB.datascriptQuery as any).mockResolvedValueOnce([[{ ":block/title": "Zebra" }]]);
    const block: LogseqBlock = {
      uuid: "b1",
      properties: {
        tags: "Banana, Apple",
      },
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
        }),
      },
      Editor: {
        getBlock: vi.fn().mockResolvedValue(null),
      },
    });
    const blocks: LogseqBlock[] = [
      {
        uuid: "b1",
        content: "Block 1",
      },
      {
        uuid: "b2",
        content: "Block 2",
      },
    ];
    const tree = await buildTree(blocks, "Page", false);
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
      "user.property/custom": "value",
    };
    const fetcher = vi.fn();
    const idResolver = vi.fn();
    const idCache = new Map();
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);

    expect(props).toHaveLength(1);
    expect(props[0].name).toBe("Custom");
    expect(props[0].value).toBe("value");
  });
});

describe("extractRefs with custom properties", () => {
  it("extracts refs from enabled custom properties", async () => {
    const targetUuid = "33333333-3333-3333-3333-333333333333";
    const block: LogseqBlock = {
      uuid: "b1",
      "user.property/custom-prop": targetUuid,
      properties: {
        "custom-prop": targetUuid,
      },
    };
    const idCache = new Map();
    const idResolver = vi.fn();
    const enabledProperties = new Set(["custom-prop"]);

    const refs = await extractRefs(block, idCache, idResolver, enabledProperties);
    expect(refs).toHaveLength(1);
    expect(refs[0].kind).toBe("custom-prop");
    expect(refs[0].targetUuid).toBe(targetUuid);
  });
});

describe("includeOutScopeRefs", () => {
  it("adds out-of-scope nodes to a virtual branch", async () => {
    const targetUuid = "44444444-4444-4444-4444-444444444444";
    const root: any = {
      uuid: "root",
      name: "Root",
      children: [
        {
          uuid: "child",
          name: "Child",
          children: [],
          refs: [{ kind: "custom-prop", targetUuid }],
        },
      ],
      refs: [],
    };

    vi.stubGlobal("logseq", {
      Editor: {
        getBlock: vi.fn().mockImplementation((uuid) => {
          if (uuid === targetUuid) return Promise.resolve({ uuid: targetUuid, content: "External Block" });
          return Promise.resolve(null);
        }),
        getPage: vi.fn().mockResolvedValue(null),
      },
      DB: {
        datascriptQuery: vi.fn().mockResolvedValue([]),
      },
    });

    const result = await includeOutScopeRefs(root, false);
    expect(result.children).toHaveLength(2);
    expect(result.children[1].name).toBe("Out of Scope References");
    expect(result.children[1].children).toHaveLength(1);
    expect(result.children[1].children[0].uuid).toBe(targetUuid);
  });
});

describe("Integration: Custom Relationship + Out-of-Scope Inclusion", () => {
  it("pulls in an out-of-scope node via a custom property relationship", async () => {
    const targetUuid = "55555555-5555-5555-5555-555555555555";
    const customProp = "my-custom-relationship";
    const enabledProperties = new Set([customProp]);

    // 1. Setup blocks with a custom property reference.
    // Use two blocks so the root remains the virtual "Root" instead of being collapsed.
    const blocks: LogseqBlock[] = [
      {
        uuid: "b1",
        content: "Source Block",
        "user.property/my-custom-relationship": targetUuid,
        properties: { [customProp]: targetUuid },
      },
      {
        uuid: "b2",
        content: "Other Block",
      }
    ];

    // 2. Mock Logseq API to return the target block
    vi.stubGlobal("logseq", {
      Editor: {
        getBlock: vi.fn().mockImplementation((uuid) => {
          if (uuid === targetUuid) return Promise.resolve({ uuid: targetUuid, content: "Target Block" });
          return Promise.resolve(null);
        }),
        getPage: vi.fn().mockResolvedValue(null),
      },
      DB: {
        datascriptQuery: vi.fn().mockResolvedValue([]),
      },
    });

    // 3. Run the pipeline: buildTree -> includeOutScopeRefs
    const tree = await buildTree(blocks, "Root", false, undefined, undefined, undefined, undefined, enabledProperties);

    // Virtual root (Root) -> Source Block (b1), Other Block (b2)
    expect(tree.children[0].refs).toHaveLength(1);
    expect(tree.children[0].refs![0].targetUuid).toBe(targetUuid);

    const combinedTree = await includeOutScopeRefs(tree, false, undefined, undefined, undefined, enabledProperties);

    // 4. Assert: virtual root added, target node present
    // combinedTree.children: [b1, b2, virtualRoot]
    expect(combinedTree.children).toHaveLength(3);
    const outScopeRoot = combinedTree.children.find(c => c.name === "Out of Scope References");
    expect(outScopeRoot).toBeDefined();
    expect(outScopeRoot!.children).toHaveLength(1);
    expect(outScopeRoot!.children[0].uuid).toBe(targetUuid);
    expect(outScopeRoot!.children[0].name).toBe("Target Block");
  });
});
