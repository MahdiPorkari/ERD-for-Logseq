import re

with open('src/adapter.ts', 'r') as f:
    content = f.read()

pv_replacement = r"""  private processValue(val: unknown, tagsMap: Map<string, TagInfo>) {
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
    } else if (Array.isArray(val)) {"""

# Use a simpler replacement by finding the function start and the next branch
pattern = r'private processValue\(val: unknown, tagsMap: Map<string, TagInfo>\) \{\s+if \(typeof val === "string"\) \{.*?\} else if \(Array\.isArray\(val\)\) \{'

# Need to escape backslashes in replacement string for re.sub if it's not a raw string with double backslashes
# But here I'm using raw string for replacement, the error was because re.sub interprets backslashes in repl.
# Use a lambda to avoid backslash interpretation in repl
content = re.sub(pattern, lambda m: pv_replacement, content, flags=re.DOTALL)

with open('src/adapter.ts', 'w') as f:
    f.write(content)
