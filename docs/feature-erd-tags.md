# Feature: ERD Tag Badges (target v1.4.0)

Render block tags as horizontal rows of rounded badge chips above the title in the ERD view entity box.

## 1. Goal
In the **ERD view ONLY**, block tags should be visible at the top of the entity box as styled badges. This helps identify the classification of entities. Tags must wrap to multiple lines if they exceed the box width.

## 2. Data Layer (Tag Provider)
- **TagInfo Interface**: `{ uuid: string; title: string }`.
- **Tag Extraction Strategy**:
  - **Primary**: `logseq.DB.datascriptQuery` fetching tag entities referencing the block.
  - **Secondary**: Re-use tag data already present in block objects (e.g., `block[":block/tags"]`).
  - **Compatibility**: Fallback to runtime-specific helpers if available.
  - **Forbidden**: No hashtag parsing from text, no regex scanning.
- **Provider Implementation**:
  - `getTags(blockUuid: string): Promise<readonly TagInfo[]>`
  - Check cache first.
  - Query DB only when necessary.
  - Invalidate cache on page change or DB change.

## 3. Render Layer (src/views/erd.ts)
- **Badge Styling**:
  - Rounded corners.
  - Compact spacing.
  - Small font.
  - Theme-aware colors.
- **Layout Logic**:
  - Tags appear in a row *above* the entity title.
  - **Automatic Wrapping**: Measure tags and wrap into multiple lines if needed.
  - **Box Growth**: `nodeSize()` recomputed to include full height of wrapped tag rows.
  - Center horizontal alignment for the tag area.

## 4. Manual Verification
- [ ] Verify that UI-assigned tags are found via Datascript.
- [ ] Verify wrapping behavior with 5+ tags on a narrow node.

## 5. Non-Goals
- No tags in other views.
- No hashtag parsing from text.
- No hard-coded design language (reuse theme tokens).
