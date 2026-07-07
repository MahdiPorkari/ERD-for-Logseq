import re

with open('src/adapter.ts', 'r') as f:
    content = f.read()

# Update getTags to remove Tier 1b and Tier 2, and refine Tier 1a
get_tags_old = r"""  async getTags(blockUuid: string): Promise<readonly TagInfo[]> {
    if (this.cache.has(blockUuid)) return this.cache.get(blockUuid)!;

    // Key: normalized title (lowercase, trimmed), Value: TagInfo
    const tagsMap = new Map<string, TagInfo>();

    // --- Tier 1: Authoritative Datascript queries ---
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
    }

    // Fetch block for Tiers 2 & 3 fallbacks
    let block = this.blockMap?.get(blockUuid);
    if (!block && typeof logseq !== "undefined" && logseq.Editor) {
      block = await logseq.Editor.getBlock(blockUuid) as any;
    }

    if (block) {
      // --- Tier 2: Legacy inline fallback (regex) ---
      const content = block.content || block.title || block[":block/title"] || block["block/title"] || "";
      const inlineRegex = /\[\[([^\]]+)\]\]|#([a-zA-Z0-9_-]+)/g;
      let match;
      while ((match = inlineRegex.exec(content)) !== null) {
        const raw = match[1] || match[2];
        if (raw) {
          const title = raw.trim();
          const normalized = title.toLowerCase();
          if (normalized && !tagsMap.has(normalized)) {
            tagsMap.set(normalized, { uuid: title, title });
          }
        }
      }

      // --- Tier 3: Properties fallback ---
      this.extractFromProperties(block, tagsMap);
    }

    const result = Array.from(tagsMap.values()).sort((a, b) => a.title.localeCompare(b.title));
    this.cache.set(blockUuid, result);
    return result;
  }"""

get_tags_new = r"""  async getTags(blockUuid: string): Promise<readonly TagInfo[]> {
    if (this.cache.has(blockUuid)) return this.cache.get(blockUuid)!;

    // Key: normalized title (lowercase, trimmed), Value: TagInfo
    const tagsMap = new Map<string, TagInfo>();

    // --- Tier 1: Authoritative Datascript query ---
    // Strictly queries :block/tags to find actual tags (inline #tag or [[tag]] or tags:: property)
    if (typeof logseq !== "undefined" && logseq.DB) {
      try {
        const query = `[:find (pull ?t [:block/uuid :block/title])
                        :in $ ?uuid
                        :where [?b :block/uuid ?uuid]
                               [?b :block/tags ?t]]`;
        const results = await logseq.DB.datascriptQuery(query, `#uuid "${blockUuid}"`);
        if (Array.isArray(results)) {
          results.flat().forEach((t: any) => {
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
      } catch (err) { console.error("TagProvider Datascript query failed", err); }
    }

    // Tier 2: Properties fallback
    // Strictly checks only 'tags' related properties to avoid capturing other page references
    let block = this.blockMap?.get(blockUuid);
    if (!block && typeof logseq !== "undefined" && logseq.Editor) {
      block = await logseq.Editor.getBlock(blockUuid) as any;
    }

    if (block) {
      this.extractFromProperties(block, tagsMap);
    }

    const result = Array.from(tagsMap.values()).sort((a, b) => a.title.localeCompare(b.title));
    this.cache.set(blockUuid, result);
    return result;
  }"""

content = content.replace(get_tags_old, get_tags_new)

# Update extractFromProperties to be more strict
old_efp = r"""  private extractFromProperties(obj: Record<string, any>, tagsMap: Map<string, TagInfo>) {
    for (const [key, value] of Object.entries(obj)) {
      const k = key.startsWith(":") ? key.slice(1) : key;
      if (k === "tags" || k === "block/tags" || k.startsWith("user.property/tags")) {
        this.processValue(value, tagsMap);
      }
    }
    if (obj.properties?.tags) {
      this.processValue(obj.properties.tags, tagsMap);
    }
  }"""

new_efp = r"""  private extractFromProperties(obj: Record<string, any>, tagsMap: Map<string, TagInfo>) {
    // Only process values for keys that are strictly related to tags
    for (const [key, value] of Object.entries(obj)) {
      const k = key.startsWith(":") ? key.slice(1) : key;
      if (k === "tags" || k === "block/tags" || k.startsWith("user.property/tags")) {
        this.processValue(value, tagsMap);
      }
    }
    // Also check the nested properties object if it exists
    if (obj.properties) {
      for (const [key, value] of Object.entries(obj.properties)) {
        if (key === "tags") {
          this.processValue(value, tagsMap);
        }
      }
    }
  }"""

content = content.replace(old_efp, new_efp)

# Update processValue to split by comma first and handle [[...]]
old_pv = r"""  private processValue(val: unknown, tagsMap: Map<string, TagInfo>) {
    if (typeof val === "string") {
      // Tokenize by capturing [[...]] or other words (ignore commas/spaces)
      const tokens = Array.from(val.matchAll(/\[\[([^\]]+)\]\]|[^\s,]+/g), m => m[0]);
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

new_pv = r"""  private processValue(val: unknown, tagsMap: Map<string, TagInfo>) {
    if (typeof val === "string") {
      // Split on commas first to separate multiple tags
      const items = val.split(/\s*,\s*/);
      for (let item of items) {
        item = item.trim();
        if (!item) continue;

        let title = item;
        // If it's enclosed in [[...]], extract inner text (multi-word support)
        const bracketMatch = title.match(/^\[\[(.+)\]\]$/);
        if (bracketMatch) {
          title = bracketMatch[1].trim();
        } else {
          // Remove leading '#' if present
          if (title.startsWith("#")) title = title.slice(1).trim();
        }

        const normalized = title.toLowerCase().trim();
        if (normalized && !tagsMap.has(normalized)) {
          tagsMap.set(normalized, { uuid: title, title });
        }
      }
    }"""

content = content.replace(old_pv, new_pv)

with open('src/adapter.ts', 'w') as f:
    f.write(content)
