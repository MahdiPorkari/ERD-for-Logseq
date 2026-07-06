/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveNodeRefs, buildTree, filterIntraTreeRefs, flattenDeep, extractDisplayProperties, extractTags } from "./adapter";
import type { TreeNode } from "./types";

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_BUG = "69fd1b8a-9fda-4a4b-982b-836e19aeb5e6"; // from the reported bug

describe("resolveNodeRefs", () => {
  it("returns text unchanged and never calls the fetcher when there are no refs", async () => {
    const fetcher = vi.fn();
    const result = await resolveNodeRefs("no refs here", fetcher);
    expect(result).toBe("no refs here");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("leaves non-UUID page-name refs alone (only UUID-form refs are resolved)", async () => {
    const fetcher = vi.fn();
    const result = await resolveNodeRefs("[[Some Page]]", fetcher);
    expect(result).toBe("[[Some Page]]");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves a single UUID ref to the referenced title (the reported bug)", async () => {
    const fetcher = vi.fn(async () => "Referenced Title");
    const result = await resolveNodeRefs(`[[${UUID_BUG}]]`, fetcher);
    expect(result).toBe("Referenced Title");
    expect(fetcher).toHaveBeenCalledWith(UUID_BUG);
  });

  it("resolves multiple UUID refs interleaved with other text", async () => {
    const fetcher = vi.fn(async (id: string) => (id === UUID_A ? "Alpha" : "Beta"));
    const result = await resolveNodeRefs(`start [[${UUID_A}]] mid [[${UUID_B}]] end`, fetcher);
    expect(result).toBe("start Alpha mid Beta end");
  });

  it("dedupes lookups: same UUID appearing twice triggers fetcher once", async () => {
    const fetcher = vi.fn(async () => "Title");
    await resolveNodeRefs(`[[${UUID_A}]] and [[${UUID_A}]]`, fetcher);
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
    const blocks: any[] = [
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
    const blocks: any[] = [
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

describe("buildTree with relates_to / depends_on properties", () => {
  const PROP_RELATES = "user.property/relates_to-HG66AZUl";
  const PROP_DEPENDS = "user.property/depends_on-SfjMwya6";
  const PROP_RELATES_COLON = ":user.property/relates_to-HG66AZUl";
  const PROP_DEPENDS_COLON = ":user.property/depends_on-SfjMwya6";
  const PROP_OTHER = "user.property/blocks-XYZ";
  const TGT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const TGT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const noResolve = vi.fn(async () => null);

  it("extracts a single :cardinality/one ref via {block/uuid} value shape, from .properties", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: any[] = [
      {
        uuid: "p",
        title: "Parent",
        children: [
          {
            uuid: "c",
            title: "Child",
            properties: { [PROP_DEPENDS]: { "block/uuid": TGT_A } },
            children: [],
          },
        ],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.children[0].refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("extracts refs from top-level namespaced keys (DB-graph style)", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: any[] = [
      {
        uuid: "c",
        title: "Block",
        // Property as top-level key (no .properties wrapper)
        [PROP_DEPENDS]: { "block/uuid": TGT_A },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("tolerates leading-colon keys (:user.property/...)", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: any[] = [
      {
        uuid: "c",
        title: "Block",
        [PROP_RELATES_COLON]: { uuid: TGT_A },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "relates_to", targetUuid: TGT_A }]);
  });

  it("extracts multiple targets from :cardinality/many (array value)", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: any[] = [
      {
        uuid: "c",
        title: "Block",
        properties: { [PROP_RELATES]: [{ "block/uuid": TGT_A }, { uuid: TGT_B }] },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([
      { kind: "relates_to", targetUuid: TGT_A },
      { kind: "relates_to", targetUuid: TGT_B },
    ]);
  });

  it("accepts bare UUID string values", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: any[] = [
      { uuid: "c", title: "Block", properties: { [PROP_DEPENDS]: TGT_A }, children: [] },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("resolves :db/id-shaped ref values via the idResolver", async () => {
    const fetcher = vi.fn(async () => null);
    const idResolver = vi.fn(async (id: number) => (id === 99 ? TGT_A : null));
    const blocks: any[] = [
      { uuid: "c", title: "Block", properties: { [PROP_DEPENDS]: { id: 99 } }, children: [] },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, idResolver);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });

  it("caches id-resolver lookups (one call per unique numeric id)", async () => {
    const fetcher = vi.fn(async () => null);
    const idResolver = vi.fn(async (id: number) => (id === 99 ? TGT_A : null));
    const blocks: any[] = [
      {
        uuid: "p",
        title: "Parent",
        properties: { [PROP_DEPENDS]: { id: 99 } },
        children: [
          { uuid: "c1", title: "C1", properties: { [PROP_DEPENDS]: { id: 99 } }, children: [] },
        ],
      },
    ];
    await buildTree(blocks, "Page", false, fetcher, idResolver);
    expect(idResolver).toHaveBeenCalledTimes(1);
  });

  it("ignores user-properties whose ident is not relates_to / depends_on", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: any[] = [
      {
        uuid: "c",
        title: "Block",
        properties: { [PROP_OTHER]: { "block/uuid": TGT_A } },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs ?? []).toEqual([]);
  });

  it("dedupes when the same property appears at top level and in .properties", async () => {
    const fetcher = vi.fn(async () => null);
    const blocks: any[] = [
      {
        uuid: "c",
        title: "Block",
        [PROP_DEPENDS]: { "block/uuid": TGT_A },
        properties: { [PROP_DEPENDS]: { "block/uuid": TGT_A } },
        children: [],
      },
    ];
    const tree = await buildTree(blocks, "Page", false, fetcher, noResolve);
    expect(tree.refs).toEqual([{ kind: "depends_on", targetUuid: TGT_A }]);
  });
});

describe("filterIntraTreeRefs", () => {
  const node = (uuid: string, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
    name: uuid, uuid, depth: 0, id: 0, children, refs,
  });

  it("keeps refs whose target is in the tree", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "depends_on", targetUuid: "C" }]),
      node("C"),
    ]);
    const filtered = filterIntraTreeRefs(tree);
    expect(filtered.children[0].refs).toEqual([{ kind: "depends_on", targetUuid: "C" }]);
  });

  it("drops refs whose target is not in the tree", () => {
    const tree = node("A", [
      node("B", [], [{ kind: "depends_on", targetUuid: "OUTSIDE" }]),
    ]);
    const filtered = filterIntraTreeRefs(tree);
    expect(filtered.children[0].refs ?? []).toEqual([]);
  });

  it("does not mutate the input tree", () => {
    const inputRefs = [{ kind: "depends_on" as const, targetUuid: "OUTSIDE" }];
    const tree = node("A", [node("B", [], inputRefs)]);
    filterIntraTreeRefs(tree);
    expect(tree.children[0].refs).toEqual(inputRefs);
  });

  it("handles a node with no refs gracefully", () => {
    const tree = node("A", [node("B")]);
    const filtered = filterIntraTreeRefs(tree);
    expect(filtered.children[0].refs ?? []).toEqual([]);
  });
});

describe("flattenDeep preserves refs", () => {
  const node = (uuid: string, depth: number, children: TreeNode[] = [], refs?: TreeNode["refs"]): TreeNode => ({
    name: uuid, uuid, depth, id: 0, children, refs,
  });

  it("preserves refs through recursive mode", () => {
    const tree = node("A", 0, [
      node("B", 1, [], [{ kind: "relates_to", targetUuid: "C" }]),
      node("C", 1),
    ]);
    const out = flattenDeep(tree, 5, "recursive");
    expect(out.children[0].refs).toEqual([{ kind: "relates_to", targetUuid: "C" }]);
  });

  it("drops refs to nodes that were pruned away at maxDepth", () => {
    // B has a depends_on ref to C, which is at depth 3 and gets pruned at maxDepth=2
    const tree = node("A", 0, [
      node("B", 1, [], [{ kind: "depends_on", targetUuid: "C" }]),
      node("X", 1, [node("C", 2)]),  // C is at depth 2; with maxDepth=2, X is rendered but its children (C) are pruned
    ]);
    const pruned = flattenDeep(tree, 2, "recursive");
    const afterFilter = filterIntraTreeRefs(pruned);
    expect(afterFilter.children[0].refs ?? []).toEqual([]);
  });
});

describe("extractDisplayProperties", () => {
  const PROP_DUE = "user.property/due_date-ABC";
  const PROP_STATUS = ":user.property/status-XYZ";
  const PROP_TAGS = "user.property/tags";
  const PROP_REL = "user.property/relates_to-123";
  const UUID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  const fetcher = vi.fn(async (id: string) => (id === UUID_A ? "Target Block" : null));
  const idResolver = vi.fn(async (id: number) => (id === 99 ? UUID_A : null));
  const idCache = new Map<number, string | null>();

  it("extracts and formats string, number, and boolean properties", async () => {
    const block: any = {
      uuid: "u",
      [PROP_DUE]: "2024-05-20",
      properties: {
        [PROP_STATUS]: "active",
        "user.property/is_urgent": true,
        "user.property/priority": 5,
      },
    };
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);
    expect(props).toEqual([
      { name: "Due Date", value: "2024-05-20" },
      { name: "Is Urgent", value: "Yes" },
      { name: "Priority", value: "5" },
      { name: "Status", value: "active" },
    ]);
  });

  it("excludes relates_to and depends_on", async () => {
    const block: any = {
      uuid: "u",
      [PROP_REL]: "some-uuid",
      properties: {
        "user.property/depends_on-456": "other-uuid",
        "user.property/custom": "value",
      },
    };
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);
    expect(props).toEqual([{ name: "Custom", value: "value" }]);
  });

  it("resolves ref-shaped objects to titles", async () => {
    const block: any = {
      uuid: "u",
      properties: {
        "user.property/link": { "block/uuid": UUID_A },
        "user.property/ref_id": { id: 99 },
      },
    };
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);
    expect(props).toEqual([
      { name: "Link", value: "Target Block" },
      { name: "Ref Id", value: "Target Block" },
    ]);
  });

  it("formats arrays by joining formatted elements", async () => {
    const block: any = {
      uuid: "u",
      properties: {
        "user.property/list": ["a", 1, true, { uuid: UUID_A }],
      },
    };
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);
    expect(props).toEqual([
      { name: "List", value: "a, 1, Yes, Target Block" },
    ]);
  });

  it("dedups properties across top-level and .properties", async () => {
    const block: any = {
      uuid: "u",
      "user.property/same-1": "top",
      properties: {
        "user.property/same-2": "nested",
      },
    };
    // They share the same raw name "same" after stripping suffixes
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);
    expect(props.length).toBe(1);
    expect(props[0].name).toBe("Same");
  });

  it("strips markdown from string values", async () => {
    const block: any = {
      uuid: "u",
      properties: {
        "user.property/note": "This is **bold** and [[Page]]",
      },
    };
    const props = await extractDisplayProperties(block, idCache, idResolver, fetcher);
    expect(props[0].value).toBe("This is bold and Page");
  });
});

describe("extractTags", () => {
  const noTags = vi.fn(async () => []);
  let tagCache = new Map<string, string[]>();
  beforeEach(() => { tagCache = new Map(); });

  it("extracts inline tags with # prefix", async () => {
    const block: any = { uuid: "u", content: "hello #tag1 and #[[Multi Word Tag]]" };
    const tags = await extractTags(block, tagCache, noTags);
    expect(tags).toEqual(["Multi Word Tag", "tag1"]);
  });

  it("extracts tags from block.properties.tags (legacy)", async () => {
    const block: any = { uuid: "u", properties: { tags: ["propTag"] } };
    const tags = await extractTags(block, tagCache, noTags);
    expect(tags).toEqual(["propTag"]);
  });

  it("extracts tags from namespaced keys (DB graph)", async () => {
    const block: any = {
      uuid: "u",
      ":block/tags": ["dbTag"],
      "user.property/tags-XYZ": "anotherTag"
    };
    const tags = await extractTags(block, tagCache, noTags);
    expect(tags).toEqual(["anotherTag", "dbTag"]);
  });

  it("calls TagResolver for reliable pass", async () => {
    const resolver = vi.fn(async () => ["reliableTag"]);
    const block: any = { uuid: "u", content: "no tags" };
    const tags = await extractTags(block, tagCache, resolver);
    expect(tags).toEqual(["reliableTag"]);
    expect(resolver).toHaveBeenCalledWith("u");
  });

  it("dedups and sorts tags from all sources", async () => {
    const resolver = vi.fn(async () => ["reliableTag", "tag1"]);
    const block: any = {
      uuid: "u",
      content: "#tag1",
      ":block/tags": ["dbTag"]
    };
    const tags = await extractTags(block, tagCache, resolver);
    expect(tags).toEqual(["dbTag", "reliableTag", "tag1"]);
  });

  it("caches resolved tags per uuid", async () => {
    const resolver = vi.fn(async () => ["dbTag"]);
    const block: any = { uuid: "u", content: "" };
    await extractTags(block, tagCache, resolver);
    await extractTags(block, tagCache, resolver);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
