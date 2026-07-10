# Feature: ERD Out-of-Scope References (Single-Hop External References)

## Problem Statement
In the Entity Relationship Diagram (ERD) view, blocks can define relationships to other blocks in the graph using "Additional Relationship" properties (e.g., custom properties that point to another block's UUID). If the referenced target block exists outside the current parent-child page subtree being rendered, it is omitted from the diagram. Currently, the `filterIntraTreeRefs` pipeline trims any references pointing to blocks that are not already nodes in the rendered subtree. This prevents users from visualizing cross-database relationships in the ERD.

To solve this, when an "Additional Relationship" points to a block outside the current tree, that target block should be injected as a "synthetic child" of the referencing block (ERD view only). This will allow the target block to appear as a normal node in the layout and receive a connector line from the referencing block.

## Proposed Behavior
1. **Trigger**: A checked "Additional Relationship" property (configured in the settings) on a block whose value is a block UUID that is NOT present in the currently rendered subtree.
2. **Behavior**:
   - Resolve the target block via a block fetcher.
   - If found, construct a synthetic `TreeNode` for the target block using the same name/tag/property extraction logic as normal nodes.
   - Inject the synthetic node into the `children` array of the referencing node.
   - Force the synthetic node's `children` to `[]` (empty array) and clear/ignore any of its own nested references (Single-Hop).
   - Dedup: If a node references the same target block via multiple properties (or the same property multiple times), only inject it once.
   - Remove the matching reference from the referencing node's `refs` array so that the standard overlay-edge pipeline doesn't attempt to draw a duplicate line.
3. **Scope - Single-Hop Only**: Do not recurse into the injected block's own children or references. It behaves strictly as a leaf node in the diagram.
4. **Scope - ERD Only**: This behavior is strictly applied to the ERD view when `settings.showRelationships` is enabled. Other views are completely unaffected.
5. **Relationship Exclusion**: The core `relates_to` and `depends_on` relationship properties keep their existing "drop external refs" behavior and are explicitly NOT in scope for this synthetic injection.

## Known Limitations / Out of Scope
- **Duplication**: If the same external block is referenced by two different blocks in the same tree, it will appear as two separate boxes in the diagram (one under each referencing parent). This is intentional for v1 and mirrors how tag/property duplication already works in other views.
- **No Multi-Hop**: Recursive expansion is not supported. Injected nodes do not expand their own relationships or children.

## Key Changes
- **`src/adapter.ts`**: Add an exported `expandOutOfScopeRefs` function to clone the tree and inject external target blocks as synthetic leaf nodes.
- **`src/index.ts`**: Wire `expandOutOfScopeRefs` into `rebuildLayout()` for the ERD view, making `rebuildLayout` and its call sites asynchronous.
