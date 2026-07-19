# AGENTS.md

## Part 1: Repository Operational Guide


Operational landmines and workflow expectations for agents in this repo. For architecture, modules, and commands, read `CLAUDE.md` — that's the discoverable side of things. **Don't duplicate** what's in `CLAUDE.md`, `README.md`, or `package.json` here.

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

- **Logseq split into two products in April 2026.** "Logseq OG" (file/Markdown graphs) moved to a separate repo (`logseq/og`) and is in maintenance-only mode (security/Electron fixes, no new features). "Logseq" (what used to be called "Logseq DB") kept the original repo (`logseq/logseq`) and is where all new plugin-API work happens — this is the product this plugin targets. Per Logseq's own public roadmap (`https://logseq.io/p/NX4mc_ggEV`), the **DB-graph plugin API is still listed as "Beta testing"**, not stable/GA. Treat any plugin-API behavior as subject to change without a deprecation window, and re-check the roadmap before assuming a gap is a bug vs. a known in-flight item (e.g. a "Custom block render API" is on that roadmap and could eventually offer a first-class alternative to the current macro-renderer-based ERD rendering approach).

- **`scripts/sync-logseq-docs.sh` is pinned to a path that no longer exists upstream.** As of this writing, `logseq/logseq` renamed `libs/development-notes/` → `libs/guides/`, and added a new top-level `libs/SKILL.md` (upstream's own skill file for their SDK) plus two new guides not yet mirrored into this repo: `commands_api_guide.md` (new unified `logseq.Commands` register/execute API — old `registerSlashCommand`/`registerCommandPalette`/etc. still work and internally route through it) and `custom_theme_guide.md`. `db_tag_property_idents_notes.md` was also renamed to `db_tag_property_idents_guide.md`, and a new `db_properties_references.md` was added as a dedicated API-call reference (separate from the more conceptual `db_properties_guide.md`) — it documents `getBlockProperties(blockId)` and `getBlockProperty(blockId, key)` as official supported calls for reading properties, which may be worth evaluating as an alternative/supplement to the manual namespaced-key iteration in `src/adapter.ts` (don't assume it's more reliable than the current approach without testing against a real DB graph — the "mostly empty `block.properties`" pitfall this repo already worked around could apply here too). Before running the sync script again, update its source path and file list, or it will silently no-op / fail to find anything.

- **`block.content` (and the Datalog attribute `:block/content`) is now explicitly documented upstream as deprecated in favor of `block.title` / `:block/title`.** `:block/original-name` was also folded into `:block/title`. `src/adapter.ts` already falls back through `block.content ?? block.title ?? (block as any)[":block/title"]` — given the deprecation, the fallback order should arguably be flipped to try `block.title` first, with `block.content` kept only as a legacy/File-graph fallback. Note there's an unresolved inconsistency between two upstream sources here: the mirrored SDK guide (`db_query_guide.md`) still lists `:block/content`, `:block/marker`, and `:block/journal?` as valid **DB-graph** attributes in its comparison table, while Logseq's user-facing docs (`logseq/docs` → `db-version-changes.md`) say `:block/content`→`:block/title`, `:block/journal?` is gone entirely (use `[?p :blocks/tags :logseq.class/Journal]`), `:block/left`→`:block/order`, `:block/path-refs`→`(has-ref ?b ?ref)`, and the task attributes `:block/marker`/`:block/priority`/`:block/deadline`/`:block/scheduled` were renamed to `:logseq.property/status`/`:logseq.property/priority`/`:logseq.property/deadline`/`:logseq.property/scheduled`. **Don't trust either source blindly for raw Datalog attribute names — test against a live DB graph** (`logseq.DB.datascriptQuery`) before writing or changing any advanced query.

- **`IBatchBlock.properties` is silently ignored on DB graphs.** If any future feature batch-inserts blocks (`Editor.insertBatchBlock`) with inline `properties`, those properties will not be set — use `Editor.upsertBlockProperty` / `upsertProperty` afterward instead. Not currently an issue in this repo (no `insertBatchBlock` usage found as of this writing), but worth flagging before adding one.

- **Graph directory layout changed.** On desktop, the graph cache root moved from `~/.logseq/graphs/` to `~/logseq/graphs/<GRAPH-NAME>/`, and the per-graph contents are now just `db.sqlite` + `assets/` (no nested `logseq/` folder). This matters for the self-hosted sync (Docker + `yshalsager/logseq-selfhost` + Tailscale) and the Python/pyvis SQLite-decoding pipeline described elsewhere in this project's history — any hardcoded old-style paths there will need updating.

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

- **Logseq**: 0.11.0+ (for full DB graph support) — note version numbers below predate an April 2026 product split (see below) and haven't been re-verified against the post-split "Logseq" app; treat as approximate, not authoritative.
- **@logseq/libs**: 0.3.0+ (minimum for DB graphs)
- **Node.js**: 18+ recommended
- **Build tools**: Vite + vite-plugin-logseq

#### Product context (important, easy to get confused by)

In April 2026, Logseq split into two separate products:

- **Logseq OG** — the original file/Markdown-graph app, now in maintenance-only mode (security + Electron updates only, no new features), moved to its own repo (`logseq/og`).
- **Logseq** — the database-graph app (what used to be informally called "Logseq DB"), which kept the main `logseq/logseq` repo and is where all plugin-API development continues. **This is the product this plugin targets.**

Per Logseq's own public roadmap (`https://logseq.io/p/NX4mc_ggEV`), the **DB-graph plugin API's status is "Beta testing,"** not GA. Expect continued renames, deprecations, and doc restructuring (see the Layer 1 warning above) — don't assume behavior documented months ago is still exactly accurate without a quick sanity check against current upstream.

#### Layer 1: Authoritative Upstream Docs

**Precedence**: Layer 1 is authoritative ground truth for API contracts. Layer 2 adds production-validated context and patterns not covered by official docs. When they conflict, **Layer 1 wins on API facts**; **Layer 2 wins on real-world pitfalls** (things that work on paper but fail in practice).

**Source**: mirrored verbatim from [logseq/logseq `libs/development-notes/`](https://github.com/logseq/logseq/tree/master/libs/development-notes) via `scripts/sync-logseq-docs.sh`. Each file carries a footer recording upstream commit SHA and fetch timestamp. License: AGPL-3.0 (see [`references/logseq-official/LICENSE`](./references/logseq-official/LICENSE)).

> ⚠️ **This table and the sync script's source path are stale.** The last sync pinned commit `6c05b9d66efd893d13ae2eb6a4f98525d7f51ed6` (fetched 2026-04-16). As of July 2026, upstream no longer has a `libs/development-notes/` directory at all — it was renamed to `libs/guides/`, and a new top-level `libs/SKILL.md` was added as the entry point. Content-wise, the 7 mirrored files are still ~95% intact (only the package-manager examples changed from `npm`/`yarn` to `pnpm`, and `experiments_api_guide.md` was substantially rewritten — see below), but three things are genuinely new upstream and **not mirrored here at all**:
> - `libs/guides/commands_api_guide.md` — the new unified `logseq.Commands` register/execute API.
> - `libs/guides/custom_theme_guide.md` — theme-plugin authoring guide.
> - `libs/guides/db_properties_references.md` — a practical call-by-call API reference (`upsertProperty`, `createTag`, `addTagProperty`, `addBlockTag`, `upsertBlockProperty`, `getBlockProperty`, `getBlockProperties`, etc.) that's more directly actionable for property-reading/writing code than the conceptual `db_properties_guide.md`.
>
> Also, `db_tag_property_idents_notes.md` was renamed `db_tag_property_idents_guide.md` (content is consistent with what's mirrored here). Before running `scripts/sync-logseq-docs.sh` again, update its hardcoded source path from `libs/development-notes/` to `libs/guides/` and add the three new files to its file list, or it will fail to find anything and silently no-op.
>
> **`experiments_api_guide.md` rewrite highlights** (not yet reflected in the mirrored copy): current Logseq hosts ship **React 19.x** for `logseq.Experiments.React`/`ReactDOM` — don't mix host React elements/hooks/portals with a separately bundled React copy, and avoid legacy root APIs (`ReactDOM.render`, `ReactDOM.hydrate`, `findDOMNode`) which may not work under React 19. The experimental renderer surface also expanded: alongside the previously-documented code/route/daemon renderers there's now `registerHostedRenderer`, `registerSidebarRenderer`, `registerBlockPropertiesRenderer`, and `registerBlockRenderer`. None of this is currently used by this plugin (it uses the stable `onMacroRendererSlotted` + `provideUI`, not `logseq.Experiments`), but it's relevant if the interactive canvas is ever reworked to use a host-native renderer instead of the current macro-renderer/offscreen-image approach.

| File | Covers |
|------|--------|
| [`references/logseq-official/AGENTS.md`](./references/logseq-official/AGENTS.md) | AI-agent development guide — SDK repo structure, core patterns, conventions |
| [`references/logseq-official/starter_guide.md`](./references/logseq-official/starter_guide.md) | Plugin setup walkthrough: Node/TypeScript install, Logseq dev environment, hello world |
| [`references/logseq-official/db_properties_skill.md`](./references/logseq-official/db_properties_skill.md) | DB properties SDK reference — schema definition, tags-as-classes, property operations |
| [`references/logseq-official/db_properties_guide.md`](./references/logseq-official/db_properties_guide.md) | File graph vs DB graph properties — text vs typed entities, SDK API differences |
| [`references/logseq-official/db_query_guide.md`](./references/logseq-official/db_query_guide.md) | Datascript query guide — `logseq.DB.q`, `datascriptQuery`, parameterized Datalog |
| [`references/logseq-official/db_tag_property_idents_notes.md`](./references/logseq-official/db_tag_property_idents_notes.md) | Ident system — namespace conventions (`:logseq.property/`, `:plugin.property.*`), when idents apply |
| [`references/logseq-official/experiments_api_guide.md`](./references/logseq-official/experiments_api_guide.md) | `logseq.Experiments` — React integration, custom renderers, script loading, ClojureScript interop |
| *(missing)* `commands_api_guide.md` | New unified `logseq.Commands` API — not yet pulled into this repo, see note above |
| *(missing)* `custom_theme_guide.md` | Theme plugin authoring — not yet pulled into this repo |
| *(missing)* `db_properties_references.md` | Property/tag CRUD call reference — not yet pulled into this repo, likely useful for `src/adapter.ts` |

**Refresh**: `bash scripts/sync-logseq-docs.sh` from repo root — **but fix its source path first** (see warning above). Idempotent — no-op if upstream HEAD matches `.last-synced-sha`.

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

**Newly documented upstream, not yet validated in this repo**: `Editor.getBlockProperty(blockId, key)` and `Editor.getBlockProperties(blockId)` are official supported calls for reading a single property or all properties off a block/page, as an alternative to manual namespaced-key iteration. Worth a spike to see whether they suffer from the same "mostly empty in DB graphs" unreliability that `block.properties` does, before adopting them in `src/adapter.ts` — don't swap the existing dedup'd iteration logic out for these on faith alone.

**Also newly documented**: `await logseq.App.checkCurrentIsDbGraph()` is the official way to detect DB-graph mode at runtime, if this plugin ever needs to branch behavior between graph types.

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

##### New unified command API (optional modernization, not required)

Upstream added `logseq.Commands.register(id, options, action)` / `logseq.Commands.execute(id, ...args)` as a unified replacement for `registerSlashCommand`, `registerCommandPalette`, `registerBlockContextMenuItem`, `registerCommandShortcut`, `registerHighlightContextMenuItem`, and `registerPageMenuItem`. **The old APIs still work** and internally route through the same registration path — this repo's existing `registerSlashCommand("outline", ...)` / `registerSlashCommand("outline-canvas", ...)` calls in `src/index.ts` don't need to change. `Commands.register` is worth reaching for on *new* commands (it returns an idempotent unregister function and supports multiple `placements` for one logical command in a single call), but there's no forcing function to migrate existing ones.

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

**Attribute renames reported upstream (verify empirically before relying on either side)**: Logseq's user-facing docs (`db-version-changes.md`) state that on DB graphs, `:block/content` and `:block/original-name` were both folded into `:block/title`; `:block/journal?` no longer exists (use `[?p :blocks/tags :logseq.class/Journal]`); `:block/left` was replaced by `:block/order`; `:block/path-refs` was replaced by the rule `(has-ref ?b ?ref)`; and the task attributes `:block/marker` / `:block/priority` / `:block/deadline` / `:block/scheduled` were renamed to `:logseq.property/status` / `:logseq.property/priority` / `:logseq.property/deadline` / `:logseq.property/scheduled`. The mirrored SDK guide in this repo, by contrast, still lists several of these (`:block/content`, `:block/marker`, `:block/journal?`) as valid on DB graphs. These two sources disagree — run a `datascriptQuery` against a real DB graph to confirm current behavior before writing or changing any query that touches these attributes, rather than trusting either doc.

If this plugin ever surfaces or emulates Logseq's built-in query filters, note that several were renamed on DB graphs: `(page-tags)` → `(tags)`, `(page-property)` → `(property)`, `(has-page-property)` → `(has-property)`, `(priority A)` → `(priority high)`; and `all-page-tags` / `sort-by` filters were removed entirely.

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
8. **Batch inserts with properties**: `IBatchBlock.properties` is silently ignored on DB graphs — set properties with `upsertBlockProperty`/`upsertProperty` after the block exists, not inline in `insertBatchBlock`
9. **Deprecated field**: `block.content` (and `:block/content` in Datalog) is documented as deprecated in favor of `block.title` / `:block/title` — prefer `title` first in any fallback chain

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
7. **Check current status directly** — given the plugin API is beta and churns (see Product Context above), when something seems off, check upstream directly rather than assuming this doc is current: the public roadmap (`https://logseq.io/p/NX4mc_ggEV`), the `libs/CHANGELOG.md` in `logseq/logseq`, and the `#announcements` category at `https://discuss.logseq.com/c/announcements/12`

#### Summary

Three layers, in order of priority:

1. **Layer 1 — Official upstream docs** (ground truth for API contracts)
2. **Layer 2 — Production patterns** (tag-detection + pitfalls are unique contributions; others supplement Layer 1)
3. **Layer 3 — Related skills** (logseq-schema, logseq-electron-debug, logseq-db-knowledge, logseq-cli-skill)

Load the files you need for the current task. Layer 1 answers "what does the API do"; Layer 2 answers "what breaks in practice"; Layer 3 answers adjacent concerns that deserve their own skill activation.

