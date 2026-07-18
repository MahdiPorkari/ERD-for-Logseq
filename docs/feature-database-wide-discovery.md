# Feature: Database-wide Discovery (Recursive Multi-Hop External References)

## Problem Statement
The single-hop external relationship reference feature (`expandOutOfScopeRefs`) resolved cross-page references in the Entity Relationship Diagram (ERD) view, but only for a single hop. It also explicitly excluded core relationship properties like `relates_to` and `depends_on`. For complex graphs and schemas, users need to recursively traverse these relationships across the entire graph to visualize complete, multi-hop relationship structures.

This feature introduces a recursive, database-wide relationship discovery mechanism for the ERD view, allowing deep traversal across the whole database graph.

## Proposed Behavior
1. **Trigger**: A new boolean setting **"Database-wide Discovery"** (default off) configured in Settings under the relationship section.
2. **Behavior (when ON)**:
   - When active, OutlineCanvas traverses relationship properties recursively.
   - Core relationship properties (`relates_to`, `depends_on`) AND enabled "Additional Relationship" properties are all treated as traversable.
   - Traversals are cycle-safe. A single `visited` set of UUIDs is maintained across the entire walk to prevent duplicate fetching, duplicate nodes, or infinite loops.
   - Every block or page reachable this way is fetched and added as a TreeNode, and traversal continues from each newly discovered block/page.
   - Outgoing references of a synthetic node are resolved into children (if unvisited) or kept as references (if already visited, to allow overlay edges to connect them).
3. **Queue-based Breadth-First Traversal**: The algorithm uses a queue to discover targets breadth-first.
4. **Node Cap**: To safeguard performance on large graphs, a safety cap (`maxNodes`, default `500`) is enforced. The cap only counts *newly discovered* synthetic nodes, ensuring a large starting root tree doesn't exhaust the budget. When hit, discovery stops gracefully, logs a warning, and retains already discovered nodes.

## Known Limitations / Out of Scope
- **View Limitation**: Applied strictly to the ERD view when relationship rendering is active.
- **Node Cap Limitation**: Traversal stops when reaching `maxNodes` (500). Some far-off relationships may not be rendered if the graph is extremely large and the budget is exceeded.

## Key Changes
- **`src/settings.ts`**: Added `databaseWideDiscovery` to `PluginSettings`, `DEFAULTS`, schema registration, and setting getter.
- **`src/adapter.ts`**: Implemented `expandDatabaseWide` with queue-based cycle-safe breadth-first traversal and the `maxNodes` cap. Added comments linking to `docs/feature-erd-out-of-scope-references.md`.
- **`src/index.ts`**: Wired `expandDatabaseWide` into `rebuildLayout` under the active-view/relationships conditions, branching on the `databaseWideDiscovery` setting.
- **`src/adapter.database-wide.test.ts`**: Added comprehensive unit tests validating regression (single-hop behavior unchanged with setting off), multi-hop discovery, cycle-safety, cap limit enforcement, and relates-to/depends-on support.
