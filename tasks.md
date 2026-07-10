# OutlineCanvas — Task Tracker

**Last Updated:** 2026-05-16

## Production-hardening pass (2026-05-16)

Ran `/production-readiness` after the dock-mode rework. Baseline clean: 64 tests pass, typecheck + build green, `npm audit` reports 0 vulnerabilities. `.gitignore` and dev-server binding still aligned with the v1.0.0 pass.

**Applied:** C1 (CHANGELOG `[Unreleased]` section describing `dockBehavior`, `dockWidth`, drag handle), C2 (README docked-mode section rewritten to match the new behavior).

**Deferred:** B1 — decompose `src/index.ts` (778 lines) into `dock-mode.ts` / `macro-renderer.ts` / `event-wiring.ts`. Not urgent; pick up in a focused session.

## Completed (unreleased)

### Feature: dockWidth setting + drag handle (2026-05-16)
Users couldn't trade canvas width for sidebar room. Added a live drag handle and a persisted vw value.
- [x] New `dockWidth` setting (vw, default 40, clamped 20–70) drives both the iframe width and the host `margin-right`
- [x] Drag handle (5px strip on iframe left edge) with `setPointerCapture`; uses `e.movementX` to accumulate pixel delta (immune to iframe-repositioning-during-drag)
- [x] Parent viewport size derived once at drag-start from `iframeWidthPx / (currentVw / 100)` so we can convert px → vw on release
- [x] During drag: re-injects host CSS with px width and `transition: none`; on release: `updateSettings` persists vw, settings-change handler re-injects with vw + transition restored
- [x] Handle hidden in full-screen mode (`.oc-fullscreen .oc-resize-handle { display: none }`)

### Feature: dockBehavior setting — mirror vs overlay (2026-05-16)
Docked mode previously force-opened Logseq's right sidebar and overlaid the iframe on top of it, hiding sidebar contents via CSS. Result: T R would expand the sidebar *under* the canvas. The new model reserves the canvas's strip in the host layout so the sidebar opens *beside* the canvas.
- [x] New `dockBehavior` setting: `"mirror"` (default — reserves canvas's 40vw strip via `margin-right` on `#app-container-wrapper`, sidebar opens to its left) or `"overlay"` (standalone fixed strip z-index 11, app layout untouched, sidebar opens under canvas)
- [x] `setDockedStyle` now uses the same fixed `right:0; width:40vw` geometry in both modes; differentiation lives in `injectHostStyles`
- [x] Dropped force-open-sidebar, sidebarWasOpen tracking, dock refine timer, and `isSidebarOpen` (parent.document inspection no longer needed)
- [x] Mirror mode also hides the toolbar's "Toggle right sidebar" button via CSS so its icon doesn't sit flush against the canvas edge — T R keyboard shortcut still toggles
- [x] Sidebar toggle (T R / button) is independent of canvas in both modes — canvas only closes via ✕ or Escape
- [x] Host CSS is built by `injectHostStyles()` and re-injected via `provideStyle({key,style})` on settings change, so the rules are dropped/restored without a reload

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

## Completed (continued)

### Production-hardening pass (2026-05-16)
Pre-v1.1.0-release sweep. `npm audit` clean (overrides from v1.0.0 hold); typecheck + 64 tests + build green.

**Applied (A — KISS / DRY)**
- [x] Extracted `renderElementsToDataURL` private primitive in `src/offscreen.ts`; both `renderToDataURL` and `exportCurrentViewAsDataURL` now call it instead of duplicating the canvas-setup/render/toDataURL sequence
- [x] Deduped `LogseqBlock` interface — exported from `src/adapter.ts`, imported in `src/index.ts` (was declared twice)
- [x] Removed dev-banner `console.log("OutlineCanvas loaded!/ready!")` calls from `src/index.ts`

**Applied (C — docs)**
- [x] `README.md` updated: added Relationship Connectors section (badges, lazy edges, focus halo, optional labels, stacked-column routing); added Export section (⬇ download + 📋 copy); Settings table now lists `Show Relationship Connectors` + `Label Relationship Connectors`; fixed git clone URL (was `logseq-dev/logseq-plugin-outline-canvas` → now `hdansou/logseq-outline-canvas` matching package.json); qualified accessibility claim to distinguish text (4.5:1) from graphical-element connectors (3:1)

**Applied (E — repo hygiene)**
- [x] `.gitignore` expanded: added `.vite/`, `.eslintcache`, `*.cache`, `*.tmp`, `*.swp`, `*~`, `.cursor/`, `.codeium/`. Added explanatory note that `AGENTS.md` is tracked (in contrast to the `.claude/` etc. local-state directories)
- [x] Verified no currently-tracked files would be retroactively ignored by the new patterns

**Deferred (B — see "Refactor: Split src/index.ts" below)**
- [ ] `src/index.ts` decomposition into `dock-mode.ts` / `macro-renderer.ts` / `event-wiring.ts`. Not urgent; pick up in a focused session.

### Feature: Node Relationship Connectors (target v1.1.0, completed 2026-05-16)
Cross-hierarchy edges between blocks via `relates_to` / `depends_on` properties (DB type `:node`). Full spec in `docs/feature-node-relationship-connectors.md`.

**Adapter**
- [x] `TreeNode.refs?: NodeRef[]` (`{ kind: RelKind; targetUuid: string }`)
- [x] `extractRefs(block, idCache, idResolver)` walks BOTH top-level namespaced keys (DB-graph surface) and `.properties` (legacy fallback), with leading-colon tolerance
- [x] **Match by ident prefix** (`user.property/(relates_to|depends_on)-…`) — synchronous, no SDK round-trip per property. (Original spec said "title match"; abandoned mid-build for simplicity and SDK independence — see §4.2 of spec.)
- [x] `extractRefUuids` normalizes all 4 value shapes: bare UUID string, `{"block/uuid": …}`, `{uuid: …}`, `{id: <number>}` via async `idResolver` (default `Editor.getBlock(id)` then read `.uuid`). Arrays flatMap'd. Dedup'd across top-level + `.properties` paths via `kind|uuid` signature.
- [x] `filterIntraTreeRefs(root)` post-prune filter — drops refs to nodes not in the rendered tree
- [x] `refs` preserved through `flattenDeep` in both `recursive` and `flat` modes (structuredClone)
- [x] 11 tests in `adapter.test.ts` (cardinality one+many, top-level keys, leading-colon keys, dedup, `{id}` async resolution, idResolver caching, intra-tree filter, pruned subtrees, missing-rect skipping)

**Layout, edges, badges, halo, labels**
- [x] `LayoutResult.nodeRectsByUuid?: Map<string, Rect>` populated by Tree Chart, Right Tree, Mind Map (others undefined; overlay yields nothing for them)
- [x] `src/views/edges.ts` — `buildEdgeElements(root, rectsByUuid, focusedUuid?)`
  - [x] Anchor selection across 3 cases: stacked column (same-side anchors + outward bulge), horizontal-dominant (facing faces + mid-x controls), vertical-dominant (top/bottom + mid-y)
  - [x] **CurveElement** (cubic bezier), not LineElement — matches existing tree-branch visual language and supports the outward bulge
  - [x] `depends_on` = solid + arrowhead (`arrowEnd: true`, tangent at endpoint); `relates_to` = dashed (`dash: [6, 4]`), no arrow
  - [x] **Lazy filter**: `focusedUuid === null` → emit none; `string` → only edges where source OR target = focused; `undefined` → emit all (for export)
- [x] `src/views/edges.ts` — `buildEdgeLabels(root, rectsByUuid, focusedUuid?)`
  - [x] `bezierMidpoint` helper (P(t=0.5) formula)
  - [x] Solid bg-colored pill (occludes crossing curves) + kind-colored border + muted text
- [x] `src/views/badges.ts` — `buildBadges(root, rects)` and `buildFocusHalo(focusedUuid, rects)`
  - [x] Outgoing badge top-right (`→N`, `connectorDepends` fill); incoming bottom-right (`←N`, `connectorRelates` fill); both with theme `bg` text for contrast
  - [x] Badges have no uuid → hitTest skips them; node body remains clickable
  - [x] Focus halo: accent-dim fill + accent stroke box behind the focused rect
- [x] `drawArrowHead` primitive in `renderer.ts`; `dash` + `arrowEnd` fields on both `LineElement` and `CurveElement`
- [x] 9 edges tests + 5 label tests + 9 badge/halo tests in `edges.test.ts` and `badges.test.ts`

**UX: lazy edges + click semantics**
- [x] Plugin state: `focusedUuid: string | null`, `currentDisplayTree`, `currentLayout`
- [x] `composeElements()` split from `rebuildLayout()` — focus changes redraw without recomputing layout or resetting camera
- [x] Click node → `setFocus(uuid)` + existing `scrollToBlockInPage` (both actions; navigation preserved)
- [x] Click empty canvas → `setFocus(null)` (fade out)
- [x] Render order (low → high z): halo → layout → edges → labels → badges
- [x] `loadTree` resets `focusedUuid` (previous focus may not exist in new tree)
- [x] Diagnostic `console.debug` per rebuild: view, focus, ref count, rect count

**Settings + theme**
- [x] `connectorDepends` (orange `#f76800d8` / `#c44d00d8`) and `connectorRelates` (gray `#a8a8b2a0` / `#555568a0`) tokens in `src/colors.ts` for light + dark
- [x] `showRelationships: boolean` (default `true`) — master toggle for edges + badges + halo + labels
- [x] `showRelationshipLabels: boolean` (default `false`) — optional property-name pills at curve midpoints

**Export PNG (download + copy)**
- [x] Inline Tabler Icons SVGs (matches Logseq's icon set) — download (`⬇`) + copy (`📋`) buttons in toolbar
- [x] `exportCurrentViewAsDataURL(displayTree, layout, w, h, transform, showLabels)` — WYSIWYG using live transform + canvas size; all edges always; labels follow setting; no badges/halo/chrome
- [x] Download button → `<a download>` trigger with `outline-canvas-<view>-<timestamp>.png`
- [x] Copy button → `navigator.clipboard.write([new ClipboardItem({"image/png": blob})])` + `logseq.UI.showMsg` feedback
- [x] PNG macro renderer (`offscreen.renderToDataURL`) — badges only, no edges (no interactivity in static image; click image opens interactive view)

**Platform**
- [x] macOS traffic-light clearance in full-screen: 84px left padding on `.oc-toolbar` via `.oc-fullscreen.oc-platform-mac` class combo
- [x] Platform detection runs once via `applyPlatformClass()`; fullscreen class toggled on every dock-mode change

**Documentation**
- [x] `docs/feature-node-relationship-connectors.md` updated to reflect implemented state (v1.1, 2026-05-16)
- [x] CHANGELOG entry under `[Unreleased]`

## In Progress

### Refactor: Split `src/index.ts` (target v1.2.0)
Behaviour-preserving decomposition of `src/index.ts` (724 lines, mixes 5+ concerns). Surfaced by the 2026-05-16 production-readiness pass. Should be its own commit / release branch, not bundled with v1.1.0.

**Proposed module split** (final names TBD during implementation):
- [ ] `src/dock-mode.ts` — `getPluginContainer`, `setContainerStyle`, `setDockedStyle`, `applyDockMode`, `isSidebarOpen`, `toggleDockMode`, `hideCanvas` (~100 lines). Owns the dock-vs-fullscreen geometry and the macOS traffic-light padding behavior.
- [ ] `src/macro.ts` — the `onMacroRendererSlotted` handler, `escapeHtml` helper (~50 lines). Owns the `{{renderer :outline-canvas}}` inline PNG path.
- [ ] `src/interaction.ts` — focus state (`focusedUuid`, `setFocus`), click + escape handlers, `hitTest` wiring (~80 lines). Owns "what happens when the user clicks the canvas."
- [ ] `src/index.ts` shrinks to ~300 lines: imports, VIEWS registry, plugin state declarations, `main()`, slash command + toolbar registration.

**Approach (TDD-compatible)**:
- [ ] Add tests against `interaction.ts` (focus state transitions) and `dock-mode.ts` (style application) before moving code
- [ ] Move one module at a time, run typecheck + tests + build after each
- [ ] Verify smoke (manual) after every move — dock toggle, full-screen toggle, macro rendering, click-to-focus
- [ ] Keep current module boundaries unchanged in `adapter.ts`, `renderer.ts`, view files — only `index.ts` is splitting

**Done when**:
- [ ] `wc -l src/index.ts` ≤ 350
- [ ] No new public API surface (only intra-plugin imports change)
- [ ] All 64+ existing tests still pass; new module tests added
- [ ] Manual smoke: dock toggle, full-screen toggle, macro insertion, click-to-focus, export PNG, copy PNG all work unchanged

### Feature: ERD Property Rows (target v1.3.0)
**Adapter**
- [x] `TreeNode.properties?: { name: string; value: string }[]` in `src/types.ts`
- [x] `extractDisplayProperties(block, idCache, idResolver, fetcher)` in `src/adapter.ts`
  - [x] Iterates top-level keys + `.properties`, dedups by raw name
  - [x] Strips prefix/suffix, title-cases names (e.g., `due_date` -> "Due Date")
  - [x] Formats values (string, number, boolean, array, ref-shaped objects to titles)
  - [x] Excludes `relates_to` / `depends_on` specifically
  - [x] Sorts alphabetically by display name
- [x] Wire into `convertBlock` to populate every TreeNode
- [x] 5+ tests in `adapter.test.ts` (types, resolution, exclusion, dedup)

**ERD Rendering**
- [x] `nodeSize()` and `subtreeHeight()` recomputed for variable content height in `src/views/erd.ts`
- [x] Header (content) + Divider line + Property rows (name: value) layout
- [x] Multi-line text wrapping for long property values (reuse `wrapText` philosophy)
- [x] Small font (~10-11px) and `theme().muted` for property rows
- [x] `src/views/erd.test.ts` verifying box growth with 0 vs N properties
- [x] `truncateWithEllipsis(text, maxWidth, fontSize, fontWeight, measure?)` in `src/text.ts`
- [x] Unit tests for `truncateWithEllipsis` in `src/text.test.ts`
- [x] Refactor `src/views/erd.ts` for side-by-side Name/Value layout
- [x] Truncate property values with ellipsis in ERD view
- [x] Divider line between EVERY property row
- [x] Update `src/views/erd.test.ts` for fixed-height rows and truncation


### Feature: ERD Tags (target v1.4.0)
- [ ] Fix page-level root tag population in `buildTree()`
**Refinement (Badge Chips)**
- [x] `TagInfo` and `TagProvider` interfaces in `src/adapter.ts`
- [x] Implement `defaultTagProvider` using primary/secondary/fallback order
- [x] Cache logic for tags in `buildTree` pipeline
- [x] Multi-line tag wrapping logic in `src/views/erd.ts`
- [x] Render tags as rounded badge chips using primitive `box` + `text` elements
- [x] Unit test for tag wrapping and badge layout
**Adapter**
- [x] `TreeNode.tags?: string[]` in `src/types.ts`
- [x] `extractTags(block, tagCache, tagResolver)` in `src/adapter.ts`
  - [x] Free pass: regex `#tag` and `#[[tag]]` + `block.properties.tags`
  - [x] Reliable pass: Datascript query for `:block/tags`
  - [x] Dedup and sort alphabetically
- [x] Wire into `convertBlock` with caching
- [x] Unit tests for `extractTags` in `adapter.test.ts`

**ERD Rendering**
- [x] Recompute `nodeSize` for optional tag row height in `src/views/erd.ts`
- [x] Layout centered all-caps tags at the top of the entity box
- [x] Reuse `truncateWithEllipsis` for tag row
- [x] Updated `src/views/erd.test.ts` covering tag row growth and rendering


### Feature: ERD Out-of-Scope References (Single-hop External References)
- [ ] TDD Checklist for expandOutOfScopeRefs:
  - [ ] A ref whose target is out-of-tree and whose kind is allowed → gets injected as a child, with correct name/tags/properties, and the ref is removed from the source node.
  - [ ] A ref whose kind is NOT in `allowedKinds` → untouched (no injection, ref stays).
  - [ ] A ref whose target IS already in-tree → untouched (no duplicate injection; this case is handled elsewhere by the existing overlay pipeline).
  - [ ] Two different properties on the same node pointing at the same external target → only one synthetic child injected.
  - [ ] blockFetcher returning null for a target → ref is dropped, no crash, no synthetic node.
  - [ ] Injected node has empty `children` even if the real block has children.


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

## Deferred (post-v1.1)
- [ ] Drill-down navigation (click leaf to re-root)
- [ ] External-target connectors (phantom stub nodes for refs whose target isn't in the rendered subtree)
- [ ] Reverse-direction graph queries (find all blocks that point INTO a given block, not just outgoing)
- [ ] Per-property visual config (custom colors / dash patterns per property name)
- [ ] Hover-to-show-edge interaction (lighter than click-to-focus)
