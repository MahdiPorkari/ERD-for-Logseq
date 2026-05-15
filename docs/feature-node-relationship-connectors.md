# Feature: Node Relationship Connectors

**Version:** 1.0
**Date:** May 15, 2026
**Status:** Scoped
**Target Release:** v1.1.0

---

## 1. Summary

Render cross-hierarchy relationships between blocks as visual connectors on the canvas. Two user-created Logseq DB properties of type `:node` drive the overlay:

- **`relates_to`** — symmetric association between two blocks.
- **`depends_on`** — directional dependency: source depends on target.

When OutlineCanvas renders a subtree, any block carrying these properties whose target is **also** in the rendered subtree gets a connector drawn between the two boxes. The tree hierarchy still drives layout; relationships are an overlay pass.

## 2. Motivation

Block hierarchy alone can't capture all real-world structure. Project tasks under one parent often depend on tasks under a different parent. Concepts in one branch of a knowledge tree relate to concepts in another. Today, users can express these relationships in Logseq as node-typed properties — but the diagram drops the signal because it only walks parent → child links.

Connectors make the second graph visible without flattening the first.

## 3. Scope

### In scope (v1.1)

- Reading `relates_to` and `depends_on` properties off DB-graph blocks.
- Supporting both `:db.cardinality/one` and `:db.cardinality/many` value shapes.
- Connectors in three views: **Tree Chart**, **Right Tree**, **Mind Map**.
- Drawing connectors only between nodes already visible in the rendered subtree (intra-tree only).
- Differentiated visual encoding: `depends_on` = solid line with arrowhead, `relates_to` = dashed line without arrow.
- Light + dark theme support.
- Settings toggle to hide the overlay (default on).
- Inclusion in off-screen PNG renderer (inline macro output).

### Out of scope (deferred or never)

- **External targets.** If `A depends_on B` and only A is in the rendered subtree, the edge is dropped silently. No phantom nodes, no edge-of-canvas stubs. (Deferred — possibly v1.2.)
- **Other views.** Treemap, Fishbone, Roadmap ↕, Roadmap →, Tree Table render the source/target nodes as usual but draw no connector.
- **Generic property discovery.** Only `relates_to` and `depends_on` (matched by `:block/title`). Arbitrary node-typed properties are ignored.
- **Connector hover/click affordances.** Nodes remain the only clickable surface. (Deferred.)
- **Orthogonal / collision-avoiding edge routing.** v1.1 uses simple bezier curves between anchor points. May visually cross tree branches in dense subtrees.
- **Edge labels.** No text on connectors.

## 4. Data Model

### 4.1 Property storage in Logseq DB graphs

User-created properties have auto-generated namespaced idents with random suffixes:

```edn
:user.property/relates_to-HG66AZUl
:user.property/depends_on-SfjMwya6
```

The ident is **immutable** once assigned. The user-visible name lives on the property entity as `:block/title`:

```edn
:user.property/relates_to-HG66AZUl
{:db/cardinality :db.cardinality/one
 :logseq.property/type :node
 :block/title "relates_to"}
```

A block carrying a relationship looks like:

```edn
{:block/title "**User-defined properties**: ..."
 :build/properties {:user.property/relates_to-HG66AZUl
                    [:block/uuid #uuid "69e2f7b5-0784-..."]}}
```

The value is a ref tuple (or array of ref tuples for `:cardinality/many`).

### 4.2 Property identification strategy

The plugin **must match by `:block/title`**, not by raw ident.

- Ident prefix matching (`relates_to-*`) is brittle: if the user renames the property to "blocks", the underlying ident keeps the old prefix and we'd silently keep treating it as `relates_to`.
- Title matching produces the intuitive "the property you currently see called `relates_to`" semantics.

Implementation: maintain a per-build cache `Map<propertyIdent, RelKind | null>` to avoid re-resolving the same property entity multiple times.

### 4.3 Adapter additions

`TreeNode` gains a new field:

```ts
interface NodeRef {
  kind: "relates_to" | "depends_on";
  targetUuid: string;
}

interface TreeNode {
  // ... existing fields
  refs: NodeRef[];  // outgoing relationship edges declared on this block
}
```

`convertBlock` walks `block.properties`, resolves each `user.property/*` key via `Editor.getBlock(ident)`, filters by title, and pushes `NodeRef` entries with the target UUID(s) into `node.refs`. Single-value and many-value shapes are normalized in this step.

### 4.4 Intra-tree filter

After `buildTree` returns, a single pass collects every node UUID in the tree into a `Set<string>`, then walks the tree again and drops any `NodeRef` whose `targetUuid` is not in the set. External refs never reach the layout layer.

This pass runs **after** depth pruning (`flattenDeep` / `pruneAtDepth`), so refs into pruned-away subtrees are also dropped.

## 5. Layout & Rendering

### 5.1 Layout responsibility

The three connector-supporting views each currently produce a `RenderElement[]` flat list. They will additionally produce a `nodeRectsByUuid: Map<string, Rect>` mapping every laid-out node's UUID to its final on-canvas rect (after the view's transform, before pan/zoom).

```ts
interface LayoutResult {
  elements: RenderElement[];
  width: number;
  height: number;
  nodeRectsByUuid: Map<string, Rect>;  // NEW
}
```

### 5.2 Overlay pass

New module `src/views/edges.ts`:

```ts
buildEdgeElements(
  root: TreeNode,
  rectsByUuid: Map<string, Rect>,
  theme: Theme
): RenderElement[]
```

Walks the tree, for each node's `refs[]`:

1. Look up source rect (the node's own rect) and target rect (from `rectsByUuid.get(targetUuid)`).
2. If either rect is missing, skip (defensive — the intra-tree filter should have handled this).
3. Pick anchor points: the midpoint of the closest face on each rect, based on relative position.
4. Push either an arrowed line element (`depends_on`) or a dashed line element (`relates_to`).

The renderer composes the overlay elements **after** the tree elements but **before** pan/zoom transformation, so connectors live in canvas coordinates and zoom proportionally with the diagram.

### 5.3 Renderer primitive

`src/renderer.ts` gains:

```ts
drawArrowHead(ctx: CanvasRenderingContext2D, from: Point, to: Point, color: string): void
```

Line drawing reuses existing `drawLine` and `drawCurve` with a new `dash` parameter passed through `RenderElement` for the dashed `relates_to` style.

### 5.4 Theme tokens

`src/colors.ts` adds two semantic tokens to both light and dark palettes:

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `connectorDepends` | warm accent, opacity 0.75 | same hue, opacity 0.85 | `depends_on` line + arrowhead |
| `connectorRelates` | neutral mid-gray, opacity 0.5 | neutral mid-gray, opacity 0.6 | `relates_to` dashed line |

WCAG contrast against the canvas background must hit 3:1 minimum (treated as a graphical UI element, not text).

## 6. Settings

Add to `src/settings.ts`:

| Key | Type | Default | Description |
|---|---|---|---|
| `showRelationships` | `boolean` | `true` | When false, the overlay pass is skipped entirely and the diagram renders as it did in v1.0. |

No per-property toggle in v1.1 — users either see both kinds or none.

## 7. Off-Screen Macro Renderer

`src/offscreen.ts` requires no logic change. Connectors are part of the `RenderElement[]` list that off-screen already drains. The inline macro PNG will include connectors automatically.

## 8. Performance Considerations

- Property entity resolution adds one `Editor.getBlock(ident)` call per **unique** property ident on the rendered tree (typically 2 — one for each of `relates_to` and `depends_on`). Cached per tree build.
- Outgoing-ref reads are zero-cost — already in the block's `properties` map.
- No reverse-direction Datascript query in v1.1. Edges are sourced exclusively from outgoing properties on visible nodes.

## 9. Testing

### Adapter (`src/adapter.test.ts`)

- Extracts a single `:cardinality/one` ref correctly.
- Extracts an array of refs from `:cardinality/many`.
- Resolves property kind via title, not ident (rename scenario: ident says `relates_to-*` but title says `blocks` → no ref extracted).
- Caches property-ident → title lookups (no duplicate fetcher calls).
- Drops external refs after intra-tree filter.
- Preserves `refs` through `flattenDeep` in both `recursive` and `flat` modes.
- Drops refs into pruned-away subtrees.

### Edge layout (`src/views/edges.test.ts`)

- Anchor selection picks the right face midpoint for each of the 4 relative-position quadrants (target up-left, up-right, down-left, down-right of source).
- Emits arrow element for `depends_on`, dashed element for `relates_to`.
- Skips refs whose target rect is missing from `nodeRectsByUuid` without throwing.
- Returns an empty array when `showRelationships` setting is false (or, equivalently, when the caller doesn't invoke the overlay pass).

### No new visual smoke required — the existing `scripts/logseq-smoke.sh` covers the rendering path.

## 10. Risk & Mitigations

| Risk | Mitigation |
|---|---|
| Property value surface in JS doesn't match EDN tuple shape | Quick probe via `logseq-plugin-tester` at implementation start — log `block.properties` on a known block. |
| Connector crossings make dense Tree Chart layouts unreadable | Visually distinguished encoding (color + dash style) makes overlap legible. Setting toggle lets users disable if it becomes a problem. |
| `Editor.getBlock(ident)` does not accept namespaced idents | Fall back to a `DB.datascriptQuery` for property entities by title. Two-line change to the resolver. |
| Renamed property leaves stale refs in DB | Title-match strategy correctly stops counting them. No corrective action needed. |

## 11. Resolved Decisions

| Decision | Choice |
|---|---|
| Property names | Hardcoded `relates_to` and `depends_on` |
| Match strategy | By current `:block/title`, cached per build |
| Endpoint scope | Intra-tree only — external refs dropped |
| Views | Tree Chart, Right Tree, Mind Map only |
| Visual: depends_on | Solid line + arrowhead |
| Visual: relates_to | Dashed line, no arrowhead |
| Settings toggle | `showRelationships`, default on |

## 12. Open Items (resolve at implementation start)

1. **Property value JS shape** — probe `block.properties[ident]` returned by `@logseq/libs`. Expected: `{ id, "block/uuid": "..." }` or a bare UUID string; possibly a hydrated block entity. Write the extraction code against the actual shape.
2. **`Editor.getBlock(ident)` acceptance of idents** — verify it resolves namespaced property idents to property entities. If not, swap to `DB.datascriptQuery`.
