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

## 3. Render Layer (src/views/erd.ts)
- **Box Growth**: `nodeSize()` and `subtreeHeight()` recomputed to account for:
  - Header height.
  - Divider line.
  - Property rows (including wrapped multi-line values).
- **Layout Logic**:
  - `box` element remains centered on `cy`, but height is calculated based on content.
  - Header text (block content) is top-aligned in the header area.
  - A `line` element (divider) is drawn between header and properties.
  - Each property is a `text` element: `Name: Value`.
  - Color/Font: `theme().muted` for property text, `theme().tableBorder` for divider, small font (~10-11px).
  - Multi-line wrap for long property values.

## 4. Non-Goals
- No property rows in any other view (tree, mind map, etc.).
- No settings toggle (always-on for ERD).
- No capping of row count.
