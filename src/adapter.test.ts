/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveNodeRefs, buildTree, DefaultTagProvider, LogseqBlock, extractDisplayProperties } from "./adapter";

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

  it("extracts tags from Tier 1a and Tier 1b queries", async () => {
    const tagUuid1 = "tag-uuid-1";
    const tagTitle1 = "TagA";
    const tagUuid2 = "tag-uuid-2";
    const tagTitle2 = "TagB";

    // Mock Tier 1a and Tier 1b
    (logseq.DB.datascriptQuery as any)
      .mockResolvedValueOnce([[{ ":block/uuid": tagUuid1, ":block/title": tagTitle1 }]]) // Query 1
      .mockResolvedValueOnce([[{ ":block/uuid": tagUuid2, ":block/title": tagTitle2 }]]); // Query 2

    const provider = new DefaultTagProvider();
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(2);
    expect(tags[0].title).toBe("TagA");
    expect(tags[1].title).toBe("TagB");
    expect(logseq.DB.datascriptQuery).toHaveBeenCalledTimes(2);
  });

  it("falls back to Tier 2 regex parsing of content", async () => {
    const block: LogseqBlock = {
      uuid: "b1",
      content: "Hello #world and #[[Multi Word]] and [[Direct Link]]"
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    // world, Multi Word, Direct Link
    expect(tags).toHaveLength(3);
    const titles = tags.map(t => t.title);
    expect(titles).toContain("world");
    expect(titles).toContain("Multi Word");
    expect(titles).toContain("Direct Link");
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

  it("handles complex inline regex correctly", async () => {
    const block: LogseqBlock = {
      uuid: "b1",
      content: "Mixed [[Multi Word Tag]] and #simpleTag and [[Another Tag]]"
    };
    const provider = new DefaultTagProvider(new Map([["b1", block]]));
    const tags = await provider.getTags("b1");

    expect(tags).toHaveLength(3);
    const titles = tags.map(t => t.title);
    expect(titles).toContain("Multi Word Tag");
    expect(titles).toContain("simpleTag");
    expect(titles).toContain("Another Tag");
  });

  it("merges all tiers and sorts results", async () => {
    (logseq.DB.datascriptQuery as any).mockResolvedValueOnce([
      [{ ":block/title": "Zebra" }]
    ]);
    const block: LogseqBlock = {
      uuid: "b1",
      content: "#Apple",
      properties: {
        tags: "Banana"
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
});

describe("DefaultTagProvider edge cases", () => {
  it("handles non-plugin environment gracefully", async () => {
    vi.stubGlobal("logseq", undefined);
    const block: LogseqBlock = {
      uuid: "b1",
      content: "#tag1"
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
