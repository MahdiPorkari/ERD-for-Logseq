# AGENTS.md

*Merged file — combines the repo-specific operational guide (originally `AGENTS.md`) with the Logseq DB Plugin API skill reference (originally uploaded as `AGENTS.md` but structured as a skill document with its own frontmatter). Nothing from either source was removed; headings were nested/renumbered so both documents coexist in one file. See Part 1 for day-to-day agent rules and Part 2 for the API reference.*

## Part 1: Repository Operational Guide


Operational landmines and workflow expectations for agents in this repo. For architecture, modules, and commands, read `CLAUDE.md` — that's the discoverable side of things. **Don't duplicate** what's in `CLAUDE.md`, `README.md`, or `package.json` here.

> **Note on the section below**: this repeats the canvas rendering spec that (per the rule above) should live in `CLAUDE.md`. It's kept here too, deliberately, as direct context for Google Jules, which reads `AGENTS.md` as its primary source of repo instructions. If `CLAUDE.md` is updated, update this section to match.

### Plugin Description: Canvas Rendering Spec (Nodes, Edges & Traversal)

This section defines how the interactive canvas renders the graph as an ERD-style diagram: what a `node` looks like, how `edge`s are derived from property values, and how the traversal loop discovers and expands the graph with no depth limit.

#### Inside the Canvas: Nodes

##### `Target Node` Resolution

- Fetch the full entity via `:db/id`. **Do not assume one fetch call covers both pages and blocks.** Attempt the block-oriented fetch first; if it returns null/undefined, fall back to the page-oriented fetch for the same `:db/id`. The fallback only changes *which SDK call* retrieves the entity — both paths still feed the identical downstream pipeline (added to `visited`, scanned for further references).
- **If both the block-oriented and page-oriented fetch return null/undefined** (e.g. a stale reference to a soft-deleted entity — common in RTC-synced graphs), do not throw or silently skip. Log a warning identifying the unresolvable `:db/id` and treat it per the `Edge Visibility` exception below, rather than as a normal resolved node.
- **Diagnostic step, required before trusting this against the live graph:** log the raw shape of a known page-typed target and a known block-typed target, both fetched by `:db/id`. Confirm both actually expose `:block/title`. If a page-typed entity does not, extract its label from `:block/original-name` / `:block/name` instead (see `Title Rows`).
- **This is not a separate fetch path.** Resolving a `target node` for display purposes and expanding it for `Relationship Discovery & Traversal` are the SAME entity lookup and must go through the SAME pipeline (see `Traversal: Algorithm` → `The Traversal Loop`). Rendering a node's label must never happen through a resolution-only shortcut that skips adding it to `visited` and scanning its own properties — a node that is only ever "resolved for label" and never "expanded" will render correctly at its own hop but produce no further hops beneath it.

##### Overall Node Shape

- Each `node` must be a rounded rectangle.

##### Overall Rows Order

1. Tag Row
2. Title Row
3. Property Rows

##### Tag Rows

> Above the title row of any `node`, add a row including the tags which the `node` has.

The tag row must have two columns:

- **Right Column:**
  - Alignment: right-aligned
    - If a value exceeds the available horizontal space:
      - Wrap the value onto additional lines within the same row, increasing the entity card's height as needed to accommodate it.
      - Do not truncate property values.
  - Content: the tags which the `node` has.
- **Left Column:**
  - Alignment: left-aligned
  - Content: the word "Tags"

##### Title Rows

- Alignment: centered
- Style: bold
- Size: slightly larger than the rest.
- Content:

  > Both pages and blocks render as a single "Node" shape in the ERD, but they are not guaranteed to expose the same title attribute — verify before assuming uniformity (see `Target Node Resolution` diagnostic step).

  - Extract the display label with a fallback chain, checked in this order: `:block/title` → `:block/original-name`.

    > Stop there — do not fall through to `:block/name`, which stores the lowercase, normalized indexing string and will render unformatted casing (e.g. "project" instead of "Project").

  - Do not treat `:block/title` alone as sufficient for page-typed nodes until confirmed against a real fixture.

##### Property Rows

> Under the title row of any `node`, add a row (including the property and its value) per each property a `node` has.

Property rows must have two columns:

- **Left Column:**
  - Alignment: left-aligned
  - Content: `property name`

    ```typescript
    const NAMESPACE_PREFIXES = [
      ':user.property/',              // user-defined properties
      ':logseq.property/',            // built-in system properties
    ];
    const PLUGIN_PREFIX_RE = /^:plugin\.property\.[^/]+\//; // :plugin.property.<plugin_id>/

    function stripNamespace(key: string): string {
      for (const prefix of NAMESPACE_PREFIXES) {
        if (key.startsWith(prefix)) return key.slice(prefix.length);
      }
      const m = key.match(PLUGIN_PREFIX_RE);
      if (m) return key.slice(m[0].length);
      return key; // unknown namespace — leave as-is, don't guess
    }
    ```

- **Right Column:**
  - Alignment: left-aligned
    - If a value exceeds the available horizontal space:
      - Wrap the value onto additional lines within the same row, increasing the entity card's height as needed to accommodate it.
      - Do not truncate property values.
  - Content: `property value`s

#### Inside the Canvas: Edges

##### Edge Anchors

- **Source Anchor**
  - **Location**: right edge of a property row, where the property row's value is a **`node` reference** (an entity ref of a `page` or `block`, both stored as `:db/id` pointers)
  - **Internal Name:** call this the `source node` and `source property row`
  - Cardinality: if a single `property` holds multiple `node references`, emit one edge per reference — all sharing the same source anchor, fanning out to different target anchors
- **Target Anchor**
  - **Location:** left edge of the title row belonging to the **referenced `node`** (the entity that the `source property row`'s value points to)
  - **Internal Name:** call this the `target node`

##### Edge Directions

- edge runs from the `source property row` → to the `target node`'s title row
- **Self-Reference:** if a `source property row`'s `node reference` points back to its own parent `node`, draw a **loop edge** (source and target anchor both on the same `node`). Do not suppress or omit this edge.

##### Edge Label

- display the source property name at the middle of the edge.

##### Edge Visibility

- every `property row` whose value is a `node reference` must produce a **visible edge**, regardless of whether the `target node` is currently loaded/rendered in the visible canvas area.
- If the `target node` is out of scope, fetch and render it (see `Traversal: Algorithm`) so the edge always has a real endpoint.
- **Exception:** if the fetch itself fails to resolve any entity (both lookups return null), render the target end as an explicit "unresolved reference" placeholder instead of a real entity card, so the edge is still drawn rather than silently dropped.
- Never drop or defer an edge due to scope.

##### Edge Processing Filter

- DRAW: only draw `edge`s from `property` rows whose `property value` resolves to a `node reference`
- DON'T DRAW: skip rows holding a plain string/number

##### Design Note: Tags Are Not Traversed

- Tag Rows are intentionally excluded from traversal and from the `Edge Processing Filter` above. A tag/class page is discovered and rendered only if some *other* Property Row also references it — a tag by itself never queues a target or draws an edge.
- *(Assumption: this ERD models property-based data relationships, not class/taxonomy structure. If tag→class edges should also appear, run `:block/tags` through the same `getTargetDbId` test and draw a distinct edge type — e.g. labeled "tags" — rather than folding it into Property Rows.)*

#### Traversal: Overview

##### Scope

- the whole Logseq DB Graph
- no depth limit
- no visible-viewport limit

##### General Pattern

- IF a `node reference` exists as the `property value` of any `node` currently in the graph (whether that `node` is acting as a `source node` or a `target node` relative to some other edge)
- THEN
  - Independently fetch the `node reference`'s full data (tags, properties, etc.) from Logseq's API.
  - Render the `node reference` as an individual `target node`.
- Continue applying the rule until every reachable `node` has been scanned and has no unfetched `node reference`s remaining among its properties.

##### General Rules

- applies uniformly at every hop, not just the first two
- this rule is depth-agnostic: it applies identically whether the `node` being scanned is the original root, a 1-hop target, a 2-hop target, or any node discovered afterward. There is no special case for the first or second hop — see `Traversal: Algorithm` for how this is executed without hardcoding depth.

#### Traversal: Algorithm

> How the rule above must actually run — this is the single source of truth for depth; do not hardcode a fixed number of hops anywhere else in the implementation.
>
> This is what "continue the loop" in `Traversal: Overview` concretely means, and it is what replaces any hardcoded "check the source node, then check the target node" special-casing.

##### In-Memory Structures

Maintain three in-memory structures:

- `visited`
  - set of every `node`'s `:db/id` already fetched/expanded
  - (this is the **cycle guard**: if `node A`'s `property value` is a `node reference` back to `node B`, and `node B` already references `node A`, `visited` prevents infinite re-fetching)
- `queue`
  - `node reference`s discovered but not yet fetched/expanded
- `nodes` / `edges`
  - the accumulating graph data to render

##### Seeding the Traversal

> Before the traversal starts, `visited` is pre-populated with the `:db/id`(s) of the entry-point node(s), **NOT** via `queue`, since these are already fetched, not discovered.

###### STEP 1: Detect Entry Point

> To detect where to start the process: (a) a block or (b) a page's blocks.

- Call `logseq.Editor.getCurrentBlock()`.

  > **Known caveat:** this reflects editor focus/cursor position, and commonly returns `null` when no block is actively being edited — including some "zoomed-in but not editing" states. Before relying on this as the sole zoom detector, log its return value while manually zoomed into a block without entering edit mode, to confirm it still resolves as expected in that state.

- IF `logseq.Editor.getCurrentBlock()` returns a block,

  > it means that a block is currently open or zoomed-in

- THEN seed `visited` directly with that block's `:db/id` AND store the fetched entity in `nodes[dbId]`.
- ELSE fall back to `logseq.Editor.getCurrentPageBlocksTree()`
- THEN **recursively walk the returned tree** (each node may have a `children` array of further nodes) and seed `visited` + `nodes` with the `:db/id` of every block encountered at every depth — not just the top-level blocks. A block with children that themselves hold further properties/entity references must be seeded too, or those references are silently missed before traversal even starts.

  > it means to seed with the current page's blocks

###### STEP 2

- Scan the newly-fetched seed node properties for `node reference`s.
- For each discovered `node reference`, extract its target `:db/id`.
- Add each target `:db/id` to `queue`.
- Record the corresponding `edge` (source `:db/id` → target `:db/id`).

###### STEP 2.5: Seed the Page Node Itself

- When on the page-blocks-tree branch, also call `logseq.Editor.getCurrentPage()` to fetch the **page entity's own** record directly — page properties live on the page node itself, not nested inside its first child block, so the block-tree walk in STEP 2 never surfaces them on its own. Seed the page's `:db/id` into `visited`/`nodes`, and scan its own properties/tags the same way as any other seed node.

###### STEP 3: Handoff to Main Loop

- Once `visited` is populated with the entry `:db/id`(s) and `queue` holds the initial set of discovered `:db/id`s, the main loop runs unmodified.

##### The Traversal Loop

###### STEP 1

- Pull the next target `:db/id` off `queue`.
- IF its `:db/id` is already in `visited`

  > it means that the node has been already expanded

- THEN skip it entirely.

  > this is what stops the loop from running forever on a cycle, including the self-reference or loop-edge case

- ELSE
  - Fetch full node data via the `Target Node Resolution` procedure (block-oriented fetch, falling back to page-oriented fetch) using the target `:db/id`.
  - **If both fetch attempts return null/undefined**, render it as an "unresolved reference" placeholder (see `Edge Visibility`) instead of real entity data — do not treat this the same as a successfully resolved node downstream.
  - Store the retrieved node entity (or placeholder) in `nodes` (keyed by `:db/id`).
  - Add the target `:db/id` to `visited` regardless, so the loop doesn't retry a dead reference forever.

###### STEP 2

- Scan the newly-fetched node's own properties for further `node reference`s.
- Extract the target `:db/id` for each discovered node reference.
- Add each discovered `:db/id` to `queue`.
- Always record the corresponding `edge` (source `:db/id` → target `:db/id`).

- Repeat from step 1 until `queue` is empty
  - Termination: the loop ends when `queue` is empty

    > meaning every reachable `:db/id` at any graph depth has been fetched, scanned, and visited.

### Workflow expectation

For any non-trivial feature or bug fix:

1. **Update `docs/feature-*.md`** (or write a new one) with the scope, decisions, and tradeoffs. Lock these before coding.
2. **Update `tasks.md`** with a TDD-friendly checklist — each chunk testable, tests written first.
3. **Implement TDD-style**: failing test → minimal code to pass → refactor. Enforce DRY, KISS, YAGNI.

When user feedback mid-implementation introduces a new requirement, **pause and update the spec + tasks first**. Don't let the docs lag behind the code. The user has called this "backward" before; honor it.

### Landmines

- **`scripts/logseq-smoke.sh` is broken.** Logseq removed `window.frontend.handler.plugin.load_plugin_from_web_url_BANG_`. The script's programmatic-install path no longer works. Don't run it expecting verification — fall back to asking the user to reload the plugin manually from Logseq desktop.

- **DB-graph block property surface is non-obvious.** `block.properties` (the sub-object) is **mostly empty** in DB graphs. Properties live as **top-level namespaced keys** on the block object (e.g. `block["user.property/foo-XYZ"]`), often with leading colon (`":user.property/foo-XYZ"`). The `extractRefs` adapter pattern in `src/adapter.ts` iterates both surfaces with dedup; reuse it for any new property-reading code instead of reaching for `block.properties` directly.

- **`:node`-typed property values arrive as `{id: <number>}`** more often than as UUID-shaped objects in real graphs. Resolve via `Editor.getBlock(id)` → `.uuid` and cache the result per build. See `extractRefUuids` in `src/adapter.ts` for the canonical handling of all four shapes.

- **The inline macro renderer (`{{renderer :outline-canvas}}`) intentionally omits relationship edges** — it shows badges (counts) only. This is a UX decision (no interaction surface in a static image; click image to open interactive). Don't "fix" the apparent inconsistency by adding edges to `offscreen.renderToDataURL`.

### After code changes

The user runs the plugin from a Logseq desktop install pointed at `dist/`. After modifying any `src/**` file, **always `npm run build`** before telling the user to reload. The dev server (`npm run dev`) is for iframe-installed dev workflows, not the user's normal flow.

### Debugging connector issues

The interactive canvas logs one diagnostic line per layout rebuild:

```
[OutlineCanvas] view=<id> focus=<uuid|none> refs(intra-tree)=N rects=M
```

If a user reports "I don't see connectors," ask them to open DevTools (Cmd+Opt+I in Electron) and copy that line — `refs=0` means the adapter isn't extracting them; `refs>0` but `rects=0` means the view doesn't expose `nodeRectsByUuid`.


## Part 2: Logseq DB Plugin API Skill Reference

> Original skill frontmatter (preserved as-is; was valid YAML frontmatter in the source skill file, shown here as a reference block since it's no longer at the top of a standalone file):
>
> ```yaml
> name: logseq-db-plugin-api
> version: 2.2.0
> description: Essential knowledge for developing Logseq plugins for DB (database) graphs. Layered: (1) authoritative upstream docs mirrored from logseq/logseq master, (2) production-tested patterns from logseq-checklist v1.0.0, (3) related skills (Datascript schema, Electron debugging). Covers core APIs, event-driven updates, multi-layered tag detection, property iteration, advanced query patterns.
> ```

### Logseq DB Plugin API Skill

Comprehensive guidance for building Logseq plugins for **DB (database) graphs**, organized into three layers: authoritative upstream documentation, production-tested patterns, and related sibling skills.

#### Overview

This skill provides essential knowledge for building Logseq plugins that work with the new DB graph architecture. It covers:

- **Core APIs**: Tag/class management, property handling, block operations
- **Production Patterns**: Event-driven updates, tag detection, property iteration
- **Plugin Architecture**: File organization, settings, error handling, testing
- **Common Pitfalls**: Validation errors, query issues, property dereferencing

#### When to Use This Skill

Use this skill when developing Logseq plugins that:

- Work with **DB graphs** (not markdown graphs)
- Need to create/manage tags and properties programmatically
- Respond to database changes in real-time (DB.onChanged)
- Query the graph database with Datalog
- Handle complex tag detection or property iteration
- Require production-ready architecture patterns

#### Key Differences: DB vs. Markdown Plugins

| Aspect | Markdown Graphs | DB Graphs |
|--------|----------------|-----------|
| **Data Storage** | Files (.md) | Database (SQLite) |
| **Properties** | YAML frontmatter | Typed database entities |
| **Tags** | Simple text markers | Classes with schemas |
| **Queries** | File-based attributes | Datalog / Database relationships |
| **Property Access** | Text parsing | Namespaced keys (`:user.property/name`) |

#### Prerequisites

- **Logseq**: 0.11.0+ (for full DB graph support)
- **@logseq/libs**: 0.3.0+ (minimum for DB graphs)
- **Node.js**: 18+ recommended
- **Build tools**: Vite + vite-plugin-logseq

#### Layer 1: Authoritative Upstream Docs

**Precedence**: Layer 1 is authoritative ground truth for API contracts. Layer 2 adds production-validated context and patterns not covered by official docs. When they conflict, **Layer 1 wins on API facts**; **Layer 2 wins on real-world pitfalls** (things that work on paper but fail in practice).

**Source**: mirrored verbatim from [logseq/logseq `libs/development-notes/`](https://github.com/logseq/logseq/tree/master/libs/development-notes) via `scripts/sync-logseq-docs.sh`. Each file carries a footer recording upstream commit SHA and fetch timestamp. License: AGPL-3.0 (see [`references/logseq-official/LICENSE`](./references/logseq-official/LICENSE)).

| File | Covers |
|------|--------|
| [`references/logseq-official/AGENTS.md`](./references/logseq-official/AGENTS.md) | AI-agent development guide — SDK repo structure, core patterns, conventions |
| [`references/logseq-official/starter_guide.md`](./references/logseq-official/starter_guide.md) | Plugin setup walkthrough: Node/TypeScript install, Logseq dev environment, hello world |
| [`references/logseq-official/db_properties_skill.md`](./references/logseq-official/db_properties_skill.md) | DB properties SDK reference — schema definition, tags-as-classes, property operations |
| [`references/logseq-official/db_properties_guide.md`](./references/logseq-official/db_properties_guide.md) | File graph vs DB graph properties — text vs typed entities, SDK API differences |
| [`references/logseq-official/db_query_guide.md`](./references/logseq-official/db_query_guide.md) | Datascript query guide — `logseq.DB.q`, `datascriptQuery`, parameterized Datalog |
| [`references/logseq-official/db_tag_property_idents_notes.md`](./references/logseq-official/db_tag_property_idents_notes.md) | Ident system — namespace conventions (`:logseq.property/`, `:plugin.property.*`), when idents apply |
| [`references/logseq-official/experiments_api_guide.md`](./references/logseq-official/experiments_api_guide.md) | `logseq.Experiments` — React integration, custom renderers, script loading, ClojureScript interop |

**Refresh**: `bash scripts/sync-logseq-docs.sh` from repo root. Idempotent — no-op if upstream HEAD matches `.last-synced-sha`.

#### Layer 2: Production Patterns

Battle-tested code from real-world plugin development. All patterns validated through [logseq-checklist v1.0.0](https://github.com/kerim/logseq-checklist).

##### Unique contributions (not in official docs)

**[Tag Detection](./references/tag-detection.md)** — Reliable multi-layered detection
Three-tier approach (content → datascript → properties) for maximum reliability when `block.properties.tags` fails.

**Search for**: `hasTag`, `block.properties.tags undefined`, `multi-layered`

**[Pitfalls & Solutions](./references/pitfalls-and-solutions.md)** — Errors and fixes discovered in production
Tag creation validation, property conflicts, query syntax mistakes, `or-join` variable mismatches, method-name errors.

**Search for**: `validation errors`, `query returns no results`, `addTag not a function`

##### Supplementary (may overlap with Layer 1 — cross-linked where relevant)

**[Event Handling](./references/event-handling.md)** — DB.onChanged patterns
Database change detection, datom filtering, debouncing strategies. Essential for plugins that maintain derived state.

**Search for**: `DB.onChanged`, `debouncing`, `transaction datoms`

**[Property Management](./references/property-management.md)** — Reading property values
Iteration patterns for unknown property names, type-based detection, namespaced key access.

**Search for**: `property iteration`, `namespaced keys`, `:user.property/`

**[Core APIs](./references/core-apis.md)** — Essential methods
Tag/class management, page/block creation, property operations, icons, utilities.

**Search for**: `createTag`, `addBlockTag`, `upsertProperty`, `createPage`

**[Queries and Database](./references/queries-and-database.md)** — Datalog patterns
Query syntax, common patterns, caching strategies, tag inheritance with `or-join`, `:block/title` vs `:block/name`.

**Search for**: `datascriptQuery`, `datalog`, `caching`, `or-join`, `tag inheritance`

**[Plugin Architecture](./references/plugin-architecture.md)** — Best practices
File organization, settings registration, error handling, testing strategy, deployment checklist.

**Search for**: `file organization`, `settings schema`, `production patterns`

#### Layer 3: Related Skills

For specialized concerns, defer to sibling skills with their own activation triggers:

| Skill | Use for |
|-------|---------|
| **`logseq-schema`** (RCmerci) | Authoritative Datascript schema reference when writing Datalog queries — covers entity attributes, relationships, cardinality. Install from [github.com/RCmerci/skills](https://github.com/RCmerci/skills). |
| **`logseq-electron-debug`** (RCmerci) | Chrome DevTools against a running Logseq app — useful when debugging your plugin's runtime behavior. Install from [github.com/RCmerci/skills](https://github.com/RCmerci/skills). |
| **`logseq-db-knowledge`** | Foundational DB graph concepts — use alongside this skill for understanding why DB graphs work the way they do. |
| **`logseq-cli-skill`** | Logseq CLI usage — Datalog queries run from shell, useful for bulk operations outside plugins. |

#### Quick Start

##### 1. Project Setup

```bash
mkdir my-logseq-plugin
cd my-logseq-plugin
pnpm init
pnpm add @logseq/libs
pnpm add -D typescript vite vite-plugin-logseq @types/node
mkdir src
```

##### 2. Essential Files

**src/index.ts** — Entry point:
```typescript
import '@logseq/libs'

async function main() {
  console.log('Plugin loaded')
  // Register settings, initialize features
}

logseq.ready(main).catch(console.error)
```

**vite.config.ts**:
```typescript
import { defineConfig } from 'vite'
import logseqDevPlugin from 'vite-plugin-logseq'

export default defineConfig({
  plugins: [logseqDevPlugin()],
  build: { target: 'esnext', minify: 'esbuild', sourcemap: true }
})
```

**package.json**:
```json
{
  "name": "my-logseq-plugin",
  "version": "0.0.1",
  "main": "dist/index.js",
  "scripts": { "build": "vite build", "dev": "vite build --watch" },
  "logseq": { "id": "my-logseq-plugin", "title": "My Logseq Plugin", "main": "dist/index.html" }
}
```

##### 3. Development Workflow

```bash
pnpm run dev              # Watch mode
pnpm run build            # Production build
# Load plugin: Settings → Plugins → Load unpacked plugin
```

#### Core Concepts

##### Property Storage

Properties in DB graphs are stored as **namespaced keys** on block objects:

```typescript
const block = await logseq.Editor.getBlock(uuid)

// Direct access
const value = block[':user.property/myProperty']

// Iteration (if name unknown)
for (const [key, value] of Object.entries(block)) {
  if (key.startsWith(':user.property/')) { /* ... */ }
}
```

**CRITICAL**: `block.properties.tags` and `block.properties[name]` are often unreliable. Use direct key access or iteration instead.

##### Tag Detection

Simple property checks fail. Use multi-layered detection — see [references/tag-detection.md](./references/tag-detection.md) for the full pattern.

```typescript
// Tier 1: Content check (fast)
if (block.content.includes('#mytag')) return true

// Tier 2: Datascript query (reliable)
const results = await logseq.DB.datascriptQuery(
  `[:find (pull ?b [*]) :where [?b :block/tags ?t] [?t :block/title "mytag"]]`
)

// Tier 3: Properties fallback (rarely works)
if (block.properties?.tags?.includes('mytag')) return true
```

##### Event-Driven Updates

For plugins that maintain derived state:

```typescript
if (logseq.DB?.onChanged) {
  logseq.DB.onChanged((changeData) => {
    const { txData } = changeData
    for (const [entityId, attribute, value, txId, added] of txData) {
      if (attribute.includes('property')) scheduleUpdate(entityId)
    }
  })
}
```

See [references/event-handling.md](./references/event-handling.md) for debouncing strategies.

##### Property Type Definition

Always define property types before using them:

```typescript
await logseq.Editor.upsertProperty('title', { type: 'string' })
await logseq.Editor.upsertProperty('year', { type: 'number' })
await logseq.Editor.upsertProperty('published', { type: 'checkbox' })
await logseq.Editor.upsertProperty('modifiedAt', { type: 'datetime' })

await logseq.Editor.createPage('Item', {
  title: 'My Item',
  year: 2024,
  published: true,
  modifiedAt: Date.now()
})
```

#### Essential Workflows

##### Creating Tagged Pages with Properties

```typescript
// 1. Create tag
const tag = await logseq.Editor.createTag('zot')

// 2. Define properties FIRST
await logseq.Editor.upsertProperty('title', { type: 'string' })
await logseq.Editor.upsertProperty('author', { type: 'string' })
await logseq.Editor.upsertProperty('year', { type: 'number' })

// 3. Add properties to tag schema (parent frame API)
const parentLogseq = (window as any).parent?.logseq
await parentLogseq.api.add_tag_property(tag.uuid, 'title')
await parentLogseq.api.add_tag_property(tag.uuid, 'author')
await parentLogseq.api.add_tag_property(tag.uuid, 'year')

// 4. Create page with tag and properties
await logseq.Editor.createPage('My Item', {
  tags: ['zot'],
  title: 'Paper Title',
  author: 'Jane Doe',
  year: 2024
})
```

##### Querying Tagged Items

```typescript
const query = `
{:query [:find (pull ?b [*])
         :where
         [?b :block/tags ?t]
         [?t :block/title "zot"]]}
`
const results = await logseq.DB.datascriptQuery(query)
```

**Tag Hierarchies** (items tagged with `#task` OR any tag extending `#task`):

```typescript
const query = `
{:query [:find (pull ?b [*])
         :where
         (or-join [?b]
           (and [?b :block/tags ?t]
                [?t :block/title "task"])
           (and [?b :block/tags ?child]
                [?child :logseq.property.class/extends ?parent]
                [?parent :block/title "task"]))]}
`
```

See [references/queries-and-database.md](./references/queries-and-database.md) for advanced patterns.

##### Responding to Database Changes

```typescript
const pendingUpdates = new Set<string>()
let updateTimer: NodeJS.Timeout | null = null

function handleDatabaseChanges(changeData: any): void {
  const txData = changeData?.txData || []
  for (const [entityId, attribute, value, txId, added] of txData) {
    if (attribute.includes('property')) {
      pendingUpdates.add(String(entityId))
      if (updateTimer) clearTimeout(updateTimer)
      updateTimer = setTimeout(async () => {
        for (const id of pendingUpdates) await updateBlock(id)
        pendingUpdates.clear()
      }, 300)
    }
  }
}
```

#### Architecture Recommendations

**File Structure**:
```
src/
├── index.ts         # Entry point, initialization
├── events.ts        # DB.onChanged handlers, debouncing
├── logic.ts         # Pure business logic (testable)
├── settings.ts      # Settings schema and accessors
└── types.ts         # TypeScript interfaces
```

**Settings Registration**:
```typescript
import { SettingSchemaDesc } from '@logseq/libs/dist/LSPlugin.user'

const settings: SettingSchemaDesc[] = [
  {
    key: 'tagName',
    type: 'string',
    title: 'Tag Name',
    description: 'Tag to monitor',
    default: 'mytag'
  }
]

logseq.useSettingsSchema(settings)
```

See [references/plugin-architecture.md](./references/plugin-architecture.md) for error handling, testing, and deployment.

#### Common Mistakes to Avoid

1. **Wrong method names**: Use `addBlockTag()` not `addTag()`
2. **Property access**: Don't rely on `block.properties.tags` — iterate namespaced keys
3. **Query syntax**: Use `:block/title` not `:db/ident` for custom tags
4. **Type definition**: Define property types before using them
5. **Reserved names**: Avoid `created`, `modified` — use `dateAdded`, `dateModified`
6. **Date format**: Use `YYYY-MM-DD` for date properties
7. **Entity references**: Use Datalog queries to dereference, not `getPage()`

See [references/pitfalls-and-solutions.md](./references/pitfalls-and-solutions.md) for detailed solutions.

#### Version Requirements

- **Logseq**: 0.11.0+ (for full DB graph support)
- **@logseq/libs**: 0.3.0+ (minimum for DB graphs), 0.2.8+ recommended
- **Graph type**: Database graphs only (not markdown/file-based graphs)

#### Getting Help

When encountering issues:

1. **Check Layer 1 first** — official upstream docs are authoritative for API contracts
2. **Check Common Pitfalls** ([references/pitfalls-and-solutions.md](./references/pitfalls-and-solutions.md)) — production-observed gotchas not in official docs
3. **Search Reference Files** — grep patterns listed above
4. **Check logseq-checklist source** — real working implementation
5. **DevTools Console** — Cmd/Ctrl+Shift+I for runtime errors
6. **Invoke `logseq-electron-debug` skill** (RCmerci) — for debugging Logseq itself

#### Summary

Three layers, in order of priority:

1. **Layer 1 — Official upstream docs** (ground truth for API contracts)
2. **Layer 2 — Production patterns** (tag-detection + pitfalls are unique contributions; others supplement Layer 1)
3. **Layer 3 — Related skills** (logseq-schema, logseq-electron-debug, logseq-db-knowledge, logseq-cli-skill)

Load the files you need for the current task. Layer 1 answers "what does the API do"; Layer 2 answers "what breaks in practice"; Layer 3 answers adjacent concerns that deserve their own skill activation.

