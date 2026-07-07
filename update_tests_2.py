import re

with open('src/adapter.test.ts', 'r') as f:
    content = f.read()

# Update Tier 3 test to include multi-word tags in properties
old_tier3_test = r"""  it\("falls back to Tier 3 properties and dedupes correctly", async \(\) => \{
    const block: LogseqBlock = \{
      uuid: "b1",
      content: "#tag1",
      properties: \{
        tags: "tag1, tag2, #tag3, \[\[tag4\]\]"
      \}
    \};
    const provider = new DefaultTagProvider\(new Map\(\[\["b1", block\]\]\)\);
    const tags = await provider\.getTags\("b1"\);

    expect\(tags\)\.toHaveLength\(4\);
    const titles = tags\.map\(t => t\.title\);
    expect\(titles\)\.toContain\("tag1"\);
    expect\(titles\)\.toContain\("tag2"\);
    expect\(titles\)\.toContain\("tag3"\);
    expect\(titles\)\.toContain\("tag4"\);
  \}\);"""

new_tier3_test = r"""  it("falls back to Tier 3 properties and handles multi-word tags", async () => {
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
    expect(titles).toContain("multi word tag");
  });"""

content = re.sub(old_tier3_test, new_tier3_test, content, flags=re.DOTALL)

with open('src/adapter.test.ts', 'w') as f:
    f.write(content)
