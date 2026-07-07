import re
import sys

with open('src/adapter.ts', 'r') as f:
    content = f.read()

# Tier 1 & 1b replacement
old_tier1 = """    // --- Tier 1: Authoritative Datascript query ---
    if (typeof logseq !== "undefined" && logseq.DB) {
      try {
        const query = `[:find (pull ?t [:block/uuid :block/title])
                        :in $ ?uuid
                        :where [?b :block/uuid ?uuid]
                               [?b :block/tags ?t]]`;
        const results = await logseq.DB.datascriptQuery(query, `#uuid "${blockUuid}"`);
        if (Array.isArray(results)) {
          results.flat().forEach((t: any) => {
            const title = t[":block/title"] || t["block/title"];
            const uuid = t[":block/uuid"] || t["block/uuid"];
            if (title) {
              const normalized = title.toLowerCase().trim();
              if (normalized) {
                tagsMap.set(normalized, { uuid: uuid || title, title });
              }
            }
          });
        }
      } catch (err) { console.error("TagProvider Tier 1 query failed", err); }
    }"""

new_tier1 = """    // --- Tier 1: Authoritative Datascript queries ---
    if (typeof logseq !== "undefined" && logseq.DB) {
      try {
        // Tier 1a: Page-property tags (::tags) via :block/tags
        const query1 = `[:find (pull ?t [:block/uuid :block/title])
                         :in $ ?uuid
                         :where [?b :block/uuid ?uuid]
                                [?b :block/tags ?t]]`;
        const results1 = await logseq.DB.datascriptQuery(query1, `#uuid "${blockUuid}"`);
        if (Array.isArray(results1)) {
          results1.flat().forEach((t: any) => {
            const title = t[":block/title"] || t["block/title"] || t["title"] || t["name"] || t[":block/name"];
            const uuid = t[":block/uuid"] || t["block/uuid"] || t["uuid"];
            if (title) {
              const normalized = title.toString().toLowerCase().trim();
              if (normalized) {
                tagsMap.set(normalized, { uuid: uuid || title.toString(), title: title.toString() });
              }
            }
          });
        }

        // Tier 1b: Inline hashtags/links via block references
        const query2 = `[:find (pull ?r [:block/uuid :block/title])
                         :in $ ?uuid
                         :where [?b :block/uuid ?uuid]
                                [?b :block/refs ?r]]`;
        const results2 = await logseq.DB.datascriptQuery(query2, `#uuid "${blockUuid}"`);
        if (Array.isArray(results2)) {
          results2.flat().forEach((r: any) => {
            const title = r[":block/title"] || r["block/title"] || r["title"] || r["name"] || r[":block/name"];
            const uuid = r[":block/uuid"] || r["block/uuid"] || r["uuid"];
            if (title) {
              const normalized = title.toString().toLowerCase().trim();
              if (normalized) {
                tagsMap.set(normalized, { uuid: uuid || title.toString(), title: title.toString() });
              }
            }
          });
        }
      } catch (err) { console.error("TagProvider Datascript queries failed", err); }
    }"""

content = content.replace(old_tier1, new_tier1)

# Tier 2 regex replacement
# Original: const inlineRegex = /#([a-zA-Z0-9_-]+)|#?\[\[([^\]]+)\]\]/g;
content = content.replace(
    'const inlineRegex = /#([a-zA-Z0-9_-]+)|#?\\[\\[([^\\ ]+)\\]\\]/g;',
    'const inlineRegex = /\\[\\[([^\\ ]+)\\]\\]|#([a-zA-Z0-9_-]+)/g;'
)

# processValue replacement
old_pv = """  private processValue(val: unknown, tagsMap: Map<string, TagInfo>) {
    if (typeof val === "string") {
      // Handle comma or space separated tags, also stripping # and [[]]
      const parts = val.split(/[,\s]+/).filter(Boolean);
      for (const p of parts) {
        let title = p.trim();
        // Strip # prefix
        if (title.startsWith("#")) title = title.slice(1);
        // Strip [[ ]]
        if (title.startsWith("[[") && title.endsWith("]]")) title = title.slice(2, -2);

        const normalized = title.toLowerCase().trim();
        if (normalized && !tagsMap.has(normalized)) {
          tagsMap.set(normalized, { uuid: title, title });
        }
      }
    }"""

new_pv = """  private processValue(val: unknown, tagsMap: Map<string, TagInfo>) {
    if (typeof val === "string") {
      // Tokenize by capturing [[...]] or other words (ignore commas/spaces)
      const tokens = Array.from(val.matchAll(/\\[\\[([^\\]]+)\\]\\]|[^\\s,]+/g), m => m[0]);
      for (const seg of tokens) {
        let title = seg.trim();
        // Strip # prefix
        if (title.startsWith("#")) title = title.slice(1);
        // Strip [[ ]]
        if (title.startsWith("[[") && title.endsWith("]]")) title = title.slice(2, -2);

        const normalized = title.toLowerCase().trim();
        if (normalized && !tagsMap.has(normalized)) {
          tagsMap.set(normalized, { uuid: title, title });
        }
      }
    }"""

content = content.replace(old_pv, new_pv)

with open('src/adapter.ts', 'w') as f:
    f.write(content)
