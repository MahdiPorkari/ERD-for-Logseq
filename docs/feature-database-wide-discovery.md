# Feature: Database-wide Discovery (Recursive Multi-Hop External References)

## Problem Statement
The single-hop external relationship reference feature (`expandOutOfScopeRefs`) resolved cross-page references in the Entity Relationship Diagram (ERD) view, but only for a single hop. It also explicitly excluded core relationship properties like `relates_to` and `depends_on`. For complex graphs and schemas, users need to recursively traverse these relationships across the entire graph to visualize complete, multi-hop relationship structures.

This feature introduces a recursive, database-wide relationship discovery mechanism for the ERD view, allowing deep traversal across the whole database graph.

## Proposed Behavior
1. **Trigger**: A new boolean setting **"Database-wide Discovery"** (default off) configured in Settings under the relationship section.
2. **Behavior (when ON)**:
   - When active, OutlineCanvas traverses relationship properties recursively.
   - Traversal is generic and driven by the database schema: instead of value shape sniffing or simple key-name matches, the traversal considers any property under `:user.property/*` that has an explicit schema `type` of `node` as defined in the graph database schema (retrieved via `getAllProperties()`).
   - The default/core properties `relates_to` and `depends_on` are always treated as node relationship properties for backward compatibility.
   - Supported entity reference shapes include plain string UUIDs, `{uuid: "..."}`, `{"block/uuid": "..."}`, `{"db/id": N}`, and arrays of any of these shapes, but these are only extracted for properties explicitly declared with the schema `type: 'node'`.
   - Internal/system properties (e.g., `:block/*`, `:db/*`, `:logseq.property/*`) and `:block/tags` or `:user.property/tags` properties are explicitly excluded from traversal to prevent structural elements and class taxonomies from being treated as relationship nodes.
   - Traversals are cycle-safe. A single `visited` set of UUIDs is maintained across the entire walk to prevent duplicate fetching, duplicate nodes, or infinite loops.
   - Every block or page reachable this way is fetched and added as a TreeNode, and traversal continues from each newly discovered block/page.
   - Outgoing references of a synthetic node are resolved into children (if unvisited) or kept as references (if already visited, to allow overlay edges to connect them).
3. **Queue-based Breadth-First Traversal**: The algorithm uses a queue to discover targets breadth-first.
4. **Node Cap**: To safeguard performance on large graphs, a safety cap (`maxNodes`, default `500`) is enforced. The cap only counts *newly discovered* synthetic nodes, ensuring a large starting root tree doesn't exhaust the budget. When hit, discovery stops gracefully, logs a warning, and retains already discovered nodes.

## Known Limitations / Out of Scope
- **View Limitation**: Applied strictly to the ERD view when relationship rendering is active.
- **Node Cap Limitation**: Traversal stops when reaching `maxNodes` (500). Some far-off relationships may not be rendered if the graph is extremely large and the budget is exceeded.
- **View Limitation (when OFF)**: Single-hop expandOutOfScopeRefs (non-database-wide mode) still restricts itself to the configured "Additional Relationship" property allow-list.

## Key Changes
- **`src/settings.ts`**: Added `databaseWideDiscovery` to `PluginSettings`, `DEFAULTS`, schema registration, and setting getter with updated generic behavior description.
- **`src/adapter.ts`**: Implemented `expandDatabaseWide` with generic breadth-first traversal over `:user.property/*` values (excluding tags) that are explicitly configured with the schema `type` of `'node'`. Added dynamic extraction and caching of node-type properties using `getAllProperties()` and `getProperty()`.
- **`src/index.ts`**: Wired `expandDatabaseWide` into `rebuildLayout` under the active-view/relationships conditions, branching on the `databaseWideDiscovery` setting.
- **`src/adapter.database-wide.test.ts`**: Added comprehensive unit tests validating generic discovery of properties with schema `type: 'node'`, ensuring that other property types (e.g. `'default'`) containing reference value shapes are skipped, while reference shapes (`db/id`, `block/uuid`, plain UUID string) inside `'node'`-type properties are correctly extracted, and internal properties are correctly excluded.
