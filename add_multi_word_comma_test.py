import re

with open('src/adapter.test.ts', 'r') as f:
    content = f.read()

multi_word_comma_test = r"""  it("handles multi-word tags with commas correctly", async () => {
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
"""

# Insert before "merges all tiers"
content = content.replace('  it("merges all tiers', multi_word_comma_test + '\n\n  it("merges all tiers')

with open('src/adapter.test.ts', 'w') as f:
    f.write(content)
