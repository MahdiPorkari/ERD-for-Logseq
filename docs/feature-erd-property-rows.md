# Feature: ERD Property Rows (target v1.3.0)

Render user-defined properties as distinct rows within entity boxes in the ERD view, mimicking classic Entity-Relationship diagrams.

## 1. Goal
In the **ERD view ONLY**, every user-defined property of a Logseq block should be rendered as its own row underneath the block's content. This provides a data-rich "entity" view where the block title is the header and properties are the attributes.

## 2. Data Layer (Adapter)
- **TreeNode Expansion**: `TreeNode` interface gains `properties?: { name: string; value: string }[]`.
- **Property Extraction**: `extractDisplayProperties(block, idCache, idResolver, fetcher)`
  - Iterates both top-level namespaced keys (`:user.property/...`) and the `.properties` sub-object.
  - Dedups by property name.
  - Matches `:?user\.property/<name>(-<suffix>)?`.
  - Strips prefix and random suffix.
  - Converts underscores/hyphens to spaces and Title-Cases (e.g., `due_date` -> "Due Date").
  - **EXCLUDES** `relates_to` and `depends_on` (visualized as connectors).
- **Value Formatting**:
  - `string`: Strip markdown.
  - `number`: Stringified.
  - `boolean`: "Yes" / "No".
  - `array`: Joined with ", ".
  - `ref-shaped object`: Resolved to title via `resolveNodeRefs`.
  - Fallback: `String(value)`.
- **Sorting**: Alphabetical by display name.

## 3. Render Layer (src/views/erd.ts) - Updated v1.3.1
- **Row Design**:
  - Each property row is split: **Name** (left-aligned, bold) and **Value** (right-aligned, muted).
  - **Truncation**: If the value doesn't fit the remaining space in the row, it is truncated with an ellipsis ("…") to keep every row exactly one line tall.
  - **Dividers**: A thin divider line (`theme().tableBorder`) is drawn between EVERY row (header to first prop, and between each prop).
- **Box Growth**: `nodeSize()` and `subtreeHeight()` recomputed to account for:
  - Header height (wrapped).
  - Divider lines.
  - Fixed-height property rows (`PROP_FONT_SIZE * LINE_HEIGHT + PROP_PADDING_Y * 2`).
- **Layout Logic**:
  - `box` element remains centered on `cy`, but height is calculated based on content.
  - Header text (block content) is top-aligned in the header area.
  - Divider line drawn at the bottom of header and every property row.
  - Name: `text` element at `x + TEXT_PAD_X`, align `left`, weight `600-700`.
  - Value: `text` element at `x + w - TEXT_PAD_X`, align `right`, weight `400`, color `theme().muted`.
  - Alternating backgrounds with `theme().tableStripe`.

## 4. Non-Goals
- No property rows in any other view (tree, mind map, etc.).
- No settings toggle (always-on for ERD).
- No capping of row count.
- No multi-line wrapping for property values (truncated to one line instead).
