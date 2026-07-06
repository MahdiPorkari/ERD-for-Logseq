# Feature: ERD Tags (target v1.4.0)

Render block tags as a centered, all-caps row above the title in the ERD view entity box.

## 1. Goal
In the **ERD view ONLY**, block tags should be visible at the top of the entity box. This helps identify the "type" or "class" of the entity (e.g., #table, #view, #user).

## 2. Data Layer (Adapter)
- **TreeNode Expansion**: `TreeNode` interface gains `tags?: string[]`.
- **Tag Extraction**: `extractTags(block, tagCache, tagResolver)`
  - **Free Pass**: Regex extraction from content/title (`#word`, `#[[multi word]]`) + `block.properties.tags`.
  - **Reliable Pass**: `TagResolver` calls `logseq.DB.datascriptQuery` for `[:find (pull ?t [:block/title]) :where [?b :block/uuid #uuid "uuid"] [?b :block/tags ?t]]`.
  - **Dedup & Sort**: Alphabetical and unique.
- **Wiring**: Every `TreeNode` gets `tags` populated during `convertBlock`.

## 3. Render Layer (src/views/erd.ts)
- **Box Growth**: `nodeSize()` recomputed to include a fixed single-line tag row if `tags.length > 0`.
- **Layout Logic**:
  - Tag row is the first element inside the box.
  - Text is horizontally centered.
  - Text is all-caps: `tags.map(t => t.toUpperCase()).join(" · ")`.
  - Font: `theme().muted`, smaller than title.
  - Truncated with ellipsis if too wide.

## 4. Manual Verification
- [ ] Verify that UI-assigned tags (not in text) are found via Datascript.
- [ ] Verify that inline tags are found.

## 5. Non-Goals
- No tags in other views.
- No pill/badge styling.
- No settings toggle.
