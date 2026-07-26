# Feature: Unified ERD Traversal (Recursive depth-agnostic relationship discovery)

## Problem Statement
Currently, the OutlineCanvas codebase maintains two competing and divergent traversal implementations for the Entity Relationship Diagram (ERD) view:
1. **`expandOutOfScopeRefs`** (Single-Hop External References, active by default).
2. **`expandDatabaseWide`** (Recursive Multi-Hop External References, opt-in via the `databaseWideDiscovery` setting).

Because the single-hop traversal is the default, multi-hop property chains silently fail to appear for most users. Furthermore, maintaining two separate traversal engines duplicates complex graph walking code and increases maintenance overhead.

## Proposed Solution
We propose retiring both `expandOutOfScopeRefs` and `expandDatabaseWide` in favor of a single, always-on, depth-agnostic traversal function:
`export async function expandRelationships(...)` in `src/adapter.ts`.

This function will:
- Always run the full queue/visited Breadth-First Search (BFS) algorithm to recursively discover and expand relationship nodes across the entire database graph.
- Traversal is generic and schema-driven: it considers any property under `:user.property/*` with an explicit schema `type` of `node` (using the existing `getNodeTypePropertyNames()` and `extractAllRefsGenerically()` machinery).
- Ensure cycle safety by maintaining a `visited` set of block UUIDs to prevent infinite loops, duplicate node boxes, or redundant database fetches.
- Correctly preserve loop edges for self-references instead of dropping them, and keep already-visited targets as references (`NodeRef`) to allow overlay edges to connect them.

## Settings and User-Facing Changes
- **Removal of `databaseWideDiscovery`**: The `databaseWideDiscovery` setting (and its schema registration in `src/settings.ts`) will be completely **REMOVED**.
- **Always-On Multi-Hop**: Multi-hop discovery becomes the default, always-on behavior when showing relationships in the ERD view, making deep relationships work out-of-the-box.

## Performance Safety Valve (`maxNodes`)
- We will strictly **retain the `maxNodes` safety cap** (default `500`).
- **Critical Distinction**: The cap is a safety limit on the total number of newly discovered synthetic nodes added to the tree to safeguard rendering performance. It is **not** a hardcoded limit on traversal depth, meaning deep property paths are fully supported up to the budget of 500 nodes.

## Impacted Files in Future Prompts
- **`src/adapter.ts`**: Retire `expandOutOfScopeRefs` and `expandDatabaseWide`, and implement `expandRelationships`.
- **`src/adapter.test.ts`**: Update unit tests to use `expandRelationships` and test edge cases.
- **`src/adapter.database-wide.test.ts`**: Adapt existing multi-hop discovery tests to target `expandRelationships`.
- **`src/index.ts`**: Wire `expandRelationships` directly into `rebuildLayout()` for the ERD view, removing references to the deprecated setting.
- **`src/settings.ts`**: Remove `databaseWideDiscovery` from setting defaults, schema definitions, and registration.
- **`src/ui.ts`**: Remove any UI controls/labels referencing the `databaseWideDiscovery` setting.
- **`docs/feature-erd-out-of-scope-references.md`**: Mark as superseded by this document.
- **`docs/feature-database-wide-discovery.md`**: Mark as superseded by this document.
