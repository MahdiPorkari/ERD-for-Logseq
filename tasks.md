# OutlineCanvas — Task Tracker

**Last Updated:** 2026-05-15

## Released

### v1.0.1 — bug fix release (2026-05-15)
- [x] DB-graph node refs resolved to titles (UUID-form `[[uuid]]` → entity title)
- [x] Long URLs / file paths wrap inside node boxes (grow-to-fit + separator-break fallback)
- [x] Vitest runner + 22 unit tests (adapter + text)
- [x] Tagged `v1.0.1`, release zip auto-built

### v1.0.0 — first marketplace-ready release (2026-05-02)
- [x] Production-readiness pass (overrides for dompurify+lodash-es, vite^8, postcss bump, dev server bound to 127.0.0.1, repo hygiene, dead code drop)
- [x] LICENSE (MIT) added
- [x] GitHub Actions: ci.yml (typecheck+build) and publish.yml (build+zip+release on v* tag), Node 22 LTS
- [x] GitHub repo: https://github.com/hdansou/logseq-outline-canvas (public)
- [x] Tag v1.0.0 pushed; release zip auto-built and attached
- [x] Marketplace PR opened: https://github.com/logseq/marketplace/pull/794

## Completed

### Bug Fix: DB-graph node ref resolution (completed 2026-05-07)
Block titles in DB graphs encode node references as `[[uuid]]`. The adapter stripped only the brackets, so the rendered diagram showed raw UUIDs instead of the referenced entity's title.
- [x] `resolveNodeRefs(text, fetcher, cache?, depth?)` resolves UUID-form refs via `logseq.Editor.getBlock` then `getPage` fallback
- [x] Per-build cache dedupes lookups (including parallel-race when same UUID appears multiple times)
- [x] Bounded recursion (`MAX_REF_DEPTH = 3`) for nested refs without cycle risk
- [x] Visible placeholder (`↗ <8-char-uuid>`) when a ref can't be resolved
- [x] `convertBlock` / `buildTree` / `fetchBlockTree` now async; threading is internal
- [x] Vitest set up; 11 unit tests cover happy paths, dedup, recursion, cycles, fetch failures, end-to-end

### Bug Fix: URL & long-token rendering (completed 2026-05-07)
URLs and file paths overflowed node boxes and collided with sibling nodes — `wrapText` only split on whitespace, so a single URL was treated as one unbreakable token wider than the box.
- [x] `adaptiveWidth` grows the box to fit the longest whitespace-separated token, capped at `DEFAULT_MAX_NODE_WIDTH = 720`
- [x] `wrapText` falls back to URL/path separator breaks (`/ ? & = - _ . :`), then character-wise as last resort
- [x] Universal invariant: every returned line measures ≤ maxWidth (covered by a fuzz-style test)
- [x] All three text helpers accept an optional `MeasureFn` for deterministic testing under vitest's node environment
- [x] 11 unit tests in `src/text.test.ts`

### Feature: Project Scaffold (completed 2026-04-06)
- [x] Requirements defined (docs/outline-canvas-logseq-plugin-requirements.md)
- [x] HTML prototype created (docs/outline-canvas-v2.html)
- [x] Scaffold TypeScript project (package.json, vite, tsconfig)
- [x] Create all source modules with layout logic ported from prototype
- [x] Type check passes (`npm run typecheck`)
- [x] Build passes (`npm run build`)
- [x] Committed

### Feature: Canvas Interactions (completed 2026-04-06)
- [x] Pan (pointer drag)
- [x] Zoom (wheel, +/- buttons, keyboard)
- [x] Fit-to-view (button, 0 key)
- [x] Click-to-navigate (block UUID → scrollToBlockInPage)
- [x] View switch with fade animation
- [x] Treemap breadcrumb on hover

### Feature: Plugin Integration (completed 2026-04-06)
- [x] Toolbar button opens OutlineCanvas
- [x] Slash command /outline focuses on current block
- [x] Cmd+Shift+O keyboard shortcut
- [x] Escape closes panel
- [x] Close button (X) in toolbar
- [x] Live updates via DB.onChanged (500ms debounce)
- [x] Plugin settings (defaultView, maxDepth, depthMode, showEmptyBlocks, animateViewSwitch)

### Feature: Multi-line Text Wrapping (completed 2026-04-06)
- [x] Word-wrap utility (src/text.ts) with off-screen canvas measurement
- [x] Renderer draws multi-line text in boxes
- [x] All 8 views use measureBoxHeight for dynamic box sizing
- [x] Adaptive node widths based on text length (adaptiveWidth)
- [x] Fixed node overlap in Right Tree and Mind Map

### Feature: Light & Dark Theme Support (completed 2026-04-07)
- [x] Theme interface with semantic tokens (bg, rootText, accent, etc.)
- [x] Dark and light BranchColor palettes
- [x] All 8 views read from theme() instead of hardcoded hex
- [x] UI CSS variables split into .oc-dark/.oc-light classes
- [x] Live theme switching via onThemeModeChanged
- [x] Plugin icon (128x128 PNG)

### Feature: Inline Macro Renderer (completed 2026-04-07)
- [x] {{renderer :outline-canvas}} renders static PNG diagram inline
- [x] Optional view argument: {{renderer :outline-canvas, mind}}
- [x] Click inline image opens full interactive overlay
- [x] /outline-canvas slash command inserts the macro
- [x] Off-screen rendering module (src/offscreen.ts)
- [x] Works in right sidebar (Logseq fires renderer for all slots)

### Feature: Docked Sidebar Mode (completed 2026-04-08)
- [x] Canvas docks to right sidebar position (overlays #right-sidebar-container)
- [x] Opens Logseq's right sidebar for natural layout reflow
- [x] Toggle between docked and full-screen via toolbar button
- [x] Cmd+Shift+O toggles dock/full-screen when already open
- [x] Sidebar content hidden while canvas is docked
- [x] Sidebar restored to previous state on close

### Feature: Recursive Depth Rendering (completed 2026-04-08)
- [x] Tree Chart, Right Tree, Mind Map rewritten as recursive layout engines
- [x] Render arbitrary depth levels as independent connected nodes
- [x] Configurable depth mode: "recursive" (independent nodes) or "flat" (breadcrumb labels)
- [x] maxDepth setting prunes tree at specified depth
- [x] depthMode setting added to plugin settings

### Feature: Logseq plugin-libs refactor compatibility (completed 2026-04-19)
After Logseq's April 2026 plugin-libs refactor (PR #12395) the docked canvas rendered empty and the maximize / close buttons stopped working. Fix covers both.
- [x] `setContainerStyle` writes inline styles directly to `.lsp-iframe-sandbox-container` with `setProperty(..., "important")`, bypassing the `data-inited_layout` gate that was silently dropping position/size updates
- [x] `setMainUIInlineStyle` kept as a fallback for cross-origin installs where direct writes aren't allowed
- [x] Host-side `:has()` rule hides `#right-sidebar` while the plugin iframe has `.visible` — no cross-origin DOM mutation, no click-stealing from `-webkit-app-region: drag` on the sidebar topbar
- [x] Plugin id in the `:has()` selector sourced from `logseq.baseInfo.id`
- [x] Dock-refine timer tracked & cancelled on mode change so it can't overwrite full-screen styles
- [x] Toolbar button handlers unified into a single delegated capture-phase listener on `#app`
- [x] Defensive `html, body, #app { height: 100% }` so the iframe's flex layout can't collapse to toolbar height
- [x] End-to-end verified via Playwright: docked → maximize → view switch → dock back → close, both modes
- [x] Docked sidebar positioning — verified

## In Progress

### Feature: Node Relationship Connectors (target v1.1.0)
Cross-hierarchy edges between blocks via `relates_to` / `depends_on` properties (DB type `:node`). Specced in `docs/feature-node-relationship-connectors.md`.

**Adapter (TDD)**
- [ ] Extend `TreeNode` with `refs: { kind: "relates_to" | "depends_on"; targetUuid: string }[]`
- [ ] Probe `block.properties[ident]` value shape via `logseq-plugin-tester` (one-shot, log + read)
- [ ] `resolveRelProperty(ident, cache)` — resolves property ident → `RelKind | null` via `Editor.getBlock` title match (fallback: `DB.datascriptQuery` if `getBlock` rejects idents)
- [ ] `convertBlock` walks `block.properties`, normalizes `:cardinality/one` and `:cardinality/many` value shapes into `NodeRef[]`
- [ ] `filterIntraTreeRefs(root)` — collects every UUID in tree, drops `refs` whose target isn't in the set; runs **after** `flattenDeep` pruning
- [ ] `refs` survives `flattenDeep` in both `recursive` and `flat` modes (deep-clone preserves them)
- [ ] Unit tests: cardinality one + many, title-match (not ident-prefix), rename scenario, external-ref drop, pruned-subtree drop, cache dedup

**Layout & overlay**
- [ ] Add `nodeRectsByUuid: Map<string, Rect>` to `LayoutResult` shape; populate from Tree Chart, Right Tree, Mind Map layouts
- [ ] New `src/views/edges.ts` — `buildEdgeElements(root, rectsByUuid, theme): RenderElement[]`
- [ ] Anchor selection: midpoint of closest face per source/target relative position (4 quadrants)
- [ ] `drawArrowHead(ctx, from, to, color)` primitive in `renderer.ts`
- [ ] Pass `dash` through `RenderElement` line element for `relates_to` style
- [ ] Three connector-supporting views invoke the overlay; other 5 views skip silently
- [ ] Unit tests: anchor picks correct face in each quadrant, missing target rect handled, no element emitted when `showRelationships` is false

**Theme + settings**
- [ ] `connectorDepends` and `connectorRelates` tokens in `src/colors.ts` (light + dark)
- [ ] WCAG 3:1 contrast verified for both tokens against canvas bg
- [ ] `showRelationships: boolean` (default `true`) added to `src/settings.ts`

**Verification**
- [ ] Manual smoke: create `relates_to` + `depends_on` properties, link two blocks, render Tree Chart / Right Tree / Mind Map, verify connectors
- [ ] PNG macro renderer includes connectors (no code change expected — verify)
- [ ] Live update via `DB.onChanged` reflects property add/remove within 500ms debounce
- [ ] CHANGELOG entry under `[Unreleased]`

### Feature: Visual Validation
- [ ] Tree Chart — visual validation with real data
- [ ] Tree Table — visual validation with real data
- [ ] Roadmap ↕ (alternating) — visual validation
- [ ] Roadmap → (linear) — visual validation
- [ ] Mind Map — visual validation
- [ ] Right Tree — visual validation
- [ ] Fishbone — visual validation
- [ ] Treemap — visual validation + breadcrumb hover

### Feature: Polish & Accessibility
- [ ] WCAG 4.5:1 contrast validation on all text
- [ ] Dash patterns visible on all leaf borders
- [ ] Keyboard navigation (Tab, arrows, +/-, 0, Esc)
- [ ] HiDPI rendering verified on Retina display
- [ ] README.md

## Deferred (v1.1)
- [ ] Export as PNG via canvas.toDataURL()
- [ ] Drill-down navigation (click leaf to re-root)
