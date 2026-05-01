# OutlineCanvas — Task Tracker

**Last Updated:** 2026-04-19

## Completed

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
