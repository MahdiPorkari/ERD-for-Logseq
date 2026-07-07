import re

with open('src/adapter.test.ts', 'r') as f:
    content = f.read()

# 1. Update Tier 1 test (only one query now)
tier1_old = r"""  it\("extracts tags from Tier 1a and Tier 1b queries", async \(\) => \{
    const tagUuid1 = "tag-uuid-1";
    const tagTitle1 = "TagA";
    const tagUuid2 = "tag-uuid-2";
    const tagTitle2 = "TagB";

    // Mock Tier 1a and Tier 1b
    \(logseq\.DB\.datascriptQuery as any\)
      \.mockResolvedValueOnce\(\[\[\{ ":block/uuid": tagUuid1, ":block/title": tagTitle1 \}\]\]\) // Query 1
      \.mockResolvedValueOnce\(\[\[\{ ":block/uuid": tagUuid2, ":block/title": tagTitle2 \}\]\]\); // Query 2

    const provider = new DefaultTagProvider\(\);
    const tags = await provider\.getTags\("b1"\);

    expect\(tags\)\.toHaveLength\(2\);
    expect\(tags\[0\]\.title\)\.toBe\("TagA"\);
    expect\(tags\[1\]\.title\)\.toBe\("TagB"\);
    expect\(logseq\.DB\.datascriptQuery\)\.toHaveBeenCalledTimes\(2\);
  \}\);"""

tier1_new = r"""  it("extracts tags from authoritative Tier 1 query", async () => {
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
  });"""

content = re.sub(tier1_old, tier1_new, content, flags=re.DOTALL)

# 2. Remove Tier 2 regex tests (they are forbidden now)
content = re.sub(r'  it\("falls back to Tier 2 regex parsing of content".*?\}\);', '', content, flags=re.DOTALL)
content = re.sub(r'  it\("handles complex inline regex correctly".*?\}\);', '', content, flags=re.DOTALL)

# 3. Add test for ignoring non-tag properties
ignore_props_test = r"""  it("ignores page references in non-tag properties", async () => {
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
  });"""

# Insert before "merges all tiers"
content = content.replace('  it("merges all tiers', ignore_props_test + '\n\n  it("merges all tiers')

with open('src/adapter.test.ts', 'w') as f:
    f.write(content)
