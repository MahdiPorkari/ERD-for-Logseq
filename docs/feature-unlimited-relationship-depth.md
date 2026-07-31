# Feature: Unlimited Relationship Depth & Automatic Node-Property Discovery

**Version:** 1.2
**Date:** May 16, 2026
**Status:** Approved / In Progress
**Related Feature:** Node Relationship Connectors (v1.1)

---

## 1. Summary

This feature resolves structural limitations in the ERD view (view id `"erd"`) regarding relationship depth and discovery:

1. **Unlimited Relationship Depth**: Correctly separates outline nesting depth from relationship hop depth, allowing relationships to expand infinitely (up to the safety node budget of 500 nodes) across multiple hops (e.g., `A -> B -> C -> D`), even under the default `maxDepth=3` setting.
2. **Automatic Node-Property Discovery**: Automatically discovers and visualizes all custom properties of schema type `node` in the database, removing the manual "Additional Relationship" settings checkboxes for a zero-config, plug-and-play experience.
3. **Eager/Eager-adjacent Edge Visibility**: Eliminates the "lazy edges" restriction, rendering all discovered relationship connectors eagerly at all times instead of suppressing them until a node is focused. This aligns directly with `AGENTS.md`'s `Edge Visibility` rule.

---

## 2. Motivation

In the previous v1.1 implementation, the ERD view would immediately pipe the relationship-expanded tree through `flattenDeep(expanded, settings.maxDepth, ...)`, which prunes nodes at depths greater than or equal to `maxDepth - 1`.

Because relationship-discovered synthetic nodes inherit depth from their parent, any relationships that spanned beyond the outline's `maxDepth` limit were cut off. This conflated "outline nesting depth" (how deep the user nests blocks in the outliner document structure) with "relationship hop depth" (the network path between blocks via references), violating the "no depth limit" rule of the Canvas Rendering Spec in `AGENTS.md`.

Furthermore, requiring users to manually toggle "Additional Relationship" properties in settings was clunky and hindered discoverability. Automatic schema discovery of `node`-type properties allows all custom attributes representing links to be drawn instantly.

Finally, suppressing all relationship connectors when no node was focused contradicted the requirement that "every property row whose value is a node reference must produce a visible edge."

---

## 3. Decisions & Justifications

### 3.1 Depth Pruning Re-ordering (Approach a)

We prune the outline tree to `maxDepth` **BEFORE** calling `expandRelationships`, so expansion starts from an already-bounded outline seed set, and we skip `flattenDeep` afterward.

- **Justification**:
  - Separates outline nesting depth from relationship traversal depth cleanly.
  - Ensures relationship traversal can expand as deeply as needed (e.g. `A -> B -> C -> D`) without being pruned by `maxDepth` settings.
  - **Rediscovery Rule**: If a block is hidden in the outline due to `maxDepth` pruning, but is referenced by a visible block via a relationship property, it will be rediscovered and successfully rendered on the canvas as a synthetic node, fulfilling the "fetch and render it" rule of `AGENTS.md`.
  - Simplifies the data pipeline: no need to track separate outline vs relationship depths on `TreeNode`.

### 3.2 Automatic Property Discovery (Option 1)

All properties with database schema type `node` are automatically treated as relationship properties and rendered.

- **Justification**:
  - Aligns with `AGENTS.md`'s `Edge Visibility` specification.
  - Eliminates the need for manual configuration / checkboxes.
  - Simplifies the settings panel by removing the "Additional Relationship" heading and checkboxes entirely.

### 3.3 Eager Edge Visibility

We render all discovered relationship connectors on the canvas by default (eagerly), rather than suppressing them until a node is focused.

- **Justification**:
  - Aligns with `AGENTS.md`'s `Edge Visibility` requirement: "every property row whose value is a node reference must produce a visible edge... Never drop or defer an edge due to scope."
  - When no node is focused, all edges are visible. When a node is focused, we still render the focus halo and the corner badges to highlight the selected node's relationships, providing the best of both worlds (global visibility + local focus).

---

## 4. Technical Design

### 4.1 Implementation in `src/index.ts`

In `rebuildLayout()`, change the `"erd"` branch to:

```typescript
  let tree: TreeNode;
  if (activeView === "erd" && settings.showRelationships) {
    // 1. Prune/flatten the outline tree to maxDepth first
    const pruned = flattenDeep(currentTree, settings.maxDepth, settings.depthMode);

    // 2. Expand relationships from the pruned seed tree.
    // Pass [] as additional relationship keys, since expandRelationships already
    // uses automatic discovery of node-type properties.
    const expanded = await expandRelationships(
      pruned,
      defaultFetcher,
      defaultIdResolver,
      tagProvider,
      blockFetcher,
      []
    );
    tree = expanded;
  } else {
    tree = flattenDeep(currentTree, settings.maxDepth, settings.depthMode);
  }
```

In `composeElements()`, ensure `"erd"` view respects the `showRelationships` setting but does not filter by any allowed kinds since all discovered node-type properties are automatically rendered:

```typescript
    if (activeView === "erd") {
      if (!settings.showRelationships) {
        overlayTree = filterRefsByKind(currentDisplayTree, new Set());
      }
    }
```

### 4.2 Removing "Additional Relationship" Checkboxes from `src/settings.ts`

- Remove `getCustomTagPropertyNames` and its call in `registerSettings`.
- Remove `additionalRelationshipHeading` and the dynamic `relprop_` settings checkboxes from the schema array in `registerSettings`.
- Remove `getSelectedAdditionalRelationshipProperties` function.
- Update `showRelationships` description in `registerSettings` to:
  `"Draw lines between blocks that reference each other via any 'node' schema property (e.g. 'relates_to', 'depends_on', or custom properties)."`

### 4.3 Eager Edge rendering in `src/views/edges.ts`

In `buildEdgeElements` and `buildEdgeLabels`, remove the check that suppresses edges when no node is focused (`focusedUuid === null`) and the logic that filters out edges not connected to the focused node:

```typescript
export function buildEdgeElements(
  root: TreeNode,
  rectsByUuid: Map<string, Rect>,
  focusedUuid?: string | null
): RenderElement[] {
  const els: RenderElement[] = [];

  (function walk(node: TreeNode): void {
    if (node.uuid && node.refs && node.refs.length) {
      const source = rectsByUuid.get(node.uuid);
      if (source) {
        for (const ref of node.refs) {
          const target = rectsByUuid.get(ref.targetUuid);
          if (!target) continue;

          els.push(makeEdge(source, target, ref.kind));
        }
      }
    }
    for (const child of node.children) walk(child);
  })(root);

  return els;
}
```

This ensures edges are always visible!

---

## 5. Acceptance & Verification

We will verify this implementation through extensive unit testing and visual regression checks:

1. **3-Hop Relationship Chain (`A -> B -> C -> D`)**:
   - Verify that all four nodes and three edges are successfully preserved and rendered in the `"erd"` view when `maxDepth=3` (which would normally prune anything at depth 2 or deeper).
2. **Rediscovery of Pruned Nodes**:
   - Verify that an outline block pruned due to `maxDepth` settings is successfully rediscovered and rendered as a relationship target.
3. **Diamond Relationships**:
   - Two visible blocks reference the same third block -> exactly one synthetic node is created, and both edges are drawn.
4. **Self-Reference Loop Edge**:
   - Ensure a block pointing to itself draws a loop edge and survives through the full `rebuildLayout` flow without infinite recursion or crashes.
5. **Boundary Expansion**:
   - A relationship source block located at the `maxDepth` boundary (depth 2 with `maxDepth: 3`) still fully expands its relationships.
6. **Cardinality-Many Edges**:
   - Ensure a single property with multiple node references produces one edge per reference from the same source anchor.
7. **Zero-Relationship Regression**:
   - A page with zero node-typed properties renders identically to pre-refactor outline tree views.
