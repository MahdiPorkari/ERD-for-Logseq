import re

with open('src/adapter.test.ts', 'r') as f:
    content = f.read()

# Update Tier 1 test to account for two queries
old_tier1_test = r"""  it\("extracts tags from authoritative Tier 1 query", async \(\) => \{
    const tagUuid = "tag-uuid";
    const tagTitle = "AuthoritativeTag";
    \(logseq\.DB\.datascriptQuery as any\)\.mockResolvedValueOnce\(\[
      \[\{ ":block/uuid": tagUuid, ":block/title": tagTitle \}\]
    \]\);

    const provider = new DefaultTagProvider\(\);
    const tags = await provider\.getTags\("b1"\);

    expect\(tags\)\.toHaveLength\(1\);
    expect\(tags\[0\]\.title\)\.toBe\(tagTitle\);
    expect\(tags\[0\]\.uuid\)\.toBe\(tagUuid\);
    expect\(logseq\.DB\.datascriptQuery\)\.toHaveBeenCalledWith\(expect\.any\(String\), '#uuid "b1"'\);
  \}\);"""

new_tier1_test = r"""  it("extracts tags from Tier 1a and Tier 1b queries", async () => {
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
  });"""

content = re.sub(old_tier1_test, new_tier1_test, content, flags=re.DOTALL)

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

    // world, Multi Word, Direct Link
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
    expect(titles).toContain("Multi Word Tag");
  });"""

content = re.sub(old_tier3_test, new_tier3_test, content, flags=re.DOTALL)

with open('src/adapter.test.ts', 'w') as f:
    f.write(content)
