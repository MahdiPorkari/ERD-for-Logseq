import re

with open('src/adapter.test.ts', 'r') as f:
    content = f.read()

# 1. Update "merges all tiers" test
# Since Tier 2 (regex content) is gone, content: "#Apple" won't yield a tag.
# We should change it to use tags property or just expect 2 tags.
old_merge_test = r"""  it\("merges all tiers and sorts results", async \(\) => \{
    \(logseq\.DB\.datascriptQuery as any\)\.mockResolvedValueOnce\(\[
      \[\{ ":block/title": "Zebra" \}\]
    \]\);
    const block: LogseqBlock = \{
      uuid: "b1",
      content: "#Apple",
      properties: \{
        tags: "Banana"
      \}
    \};
    const provider = new DefaultTagProvider\(new Map\(\[\["b1", block\]\]\)\);
    const tags = await provider\.getTags\("b1"\);

    expect\(tags\)\.toHaveLength\(3\);
    expect\(tags\[0\]\.title\)\.toBe\("Apple"\);
    expect\(tags\[1\]\.title\)\.toBe\("Banana"\);
    expect\(tags\[2\]\.title\)\.toBe\("Zebra"\);
  \}\);"""

new_merge_test = r"""  it("merges all tiers and sorts results", async () => {
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
  });"""

content = re.sub(old_merge_test, new_merge_test, content, flags=re.DOTALL)

# 2. Update "handles non-plugin environment gracefully" test
old_graceful_test = r"""  it\("handles non-plugin environment gracefully", async \(\) => \{
    vi\.stubGlobal\("logseq", undefined\);
    const block: LogseqBlock = \{
      uuid: "b1",
      content: "#tag1"
    \};
    const provider = new DefaultTagProvider\(new Map\(\[\["b1", block\]\]\)\);
    const tags = await provider\.getTags\("b1"\);
    expect\(tags\)\.toHaveLength\(1\);
    expect\(tags\[0\]\.title\)\.toBe\("tag1"\);
  \}\);"""

new_graceful_test = r"""  it("handles non-plugin environment gracefully", async () => {
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
  });"""

content = re.sub(old_graceful_test, new_graceful_test, content, flags=re.DOTALL)

with open('src/adapter.test.ts', 'w') as f:
    f.write(content)
