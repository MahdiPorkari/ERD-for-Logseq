# Changelog

All notable changes to OutlineCanvas are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [SemVer](https://semver.org/).

## [Unreleased]

### Fixed

- DB-graph node references now render as the referenced entity's title instead of the raw `[[uuid]]` storage form. Block titles in DB graphs encode references as `[[uuid]]`; the adapter previously stripped only the brackets, so a block titled `[[69fd1b8a-…]]` displayed its UUID. The adapter now resolves each UUID via the Editor SDK (block then page fallback), with per-build caching, bounded recursion for nested refs, and a visible placeholder when a ref can't be resolved.
- Long URLs and file paths no longer overflow node boxes or collide with sibling nodes. `adaptiveWidth` now grows the box to fit the longest unbreakable token on a single line (capped at 720 px); `wrapText` falls back to splitting on URL/path separators (`/ ? & = - _ . :`) and ultimately character-wise so the universal "every line ≤ box width" invariant always holds.

### Added

- Vitest test runner with 22 unit tests covering the adapter (UUID-ref resolution, cache dedup, recursion, cycles, fetch failures) and text layout (grow-to-fit, cap, separator-break, the line-width invariant). Functions accept an optional measurer / fetcher for deterministic testing.

## [1.0.0] — 2026-05-01

First marketplace-ready release. Stabilises the renderer macro syntax (`{{renderer :outline-canvas[, <view>]}}`), the five plugin settings (`defaultView`, `maxDepth`, `depthMode`, `showEmptyBlocks`, `animateViewSwitch`), the slash commands (`/outline`, `/outline-canvas`), and the `Cmd+Shift+O` keybinding. Future breaking changes to any of those will require a 2.0.0 release. Targets Logseq DB graphs only; gated via `unsupportedGraphType: "file"` in the manifest.

### Fixed

- Restore docked and full-screen modes after Logseq's April 2026 plugin-libs refactor (logseq/logseq#12395). Logseq now persists the plugin container's layout and silently drops `left/top/right/bottom/width/height` keys from `setMainUIInlineStyle` once `data-inited_layout="true"` — the canvas would show an empty sidebar iframe, and the maximize (⊞) / close (✕) buttons became unresponsive. Inline styles are now applied directly to `.lsp-iframe-sandbox-container` with `setProperty(..., "important")`, bypassing the gate.
- Sidebar topbar no longer steals clicks on macOS. `.cp__right-sidebar-topbar` uses `-webkit-app-region: drag`, which hijacks mouse events in its pixel region for OS window-dragging — visible symptom was Treemap / maximize / close buttons silently failing when the iframe's toolbar wrapped to two rows. A host-side `:has()` CSS rule now hides Logseq's `#right-sidebar` while the plugin iframe has `.visible`, disabling the drag region along with it.

### Changed

- Toolbar click handling consolidated into a single capture-phase delegated listener on `#app` (view switcher, maximize, close, zoom, fit-to-view).
- `:has()` CSS selector now sources plugin id from `logseq.baseInfo.id` instead of a hard-coded literal.
- `setDockedStyle` collapsed to a single `setContainerStyle` call with spread geometry, removing duplicated position/zIndex/borderLeft keys and the transient 40 vw flash before the measured rect applied.
- Dev server bound to `127.0.0.1` (loopback) instead of `0.0.0.0` to avoid LAN exposure during local development.
- Bumped `@logseq/libs` to `^0.3.3` and `vite` to `^8.0.10`. Added `overrides` for `dompurify@^3.4.2` and `lodash-es@^4.18.1` to clear known transitive vulnerabilities through the SDK.

### Removed

- Dead `mousedown` "close on click outside `.oc-root`" listener — in full-screen mode the iframe covers the viewport, so every click is inside `.oc-root` and the close path was unreachable.

## [0.1.0] — 2026-04-08

### Added

- Eight diagram views rendered to Canvas2D: Tree Chart, Tree Table, Roadmap ↕, Roadmap →, Mind Map, Right Tree, Fishbone, Treemap.
- Recursive depth rendering for Tree Chart, Right Tree, and Mind Map — configurable via `maxDepth` + `depthMode` (`recursive` | `flat`) settings.
- Inline macro renderer: `{{renderer :outline-canvas[, <view>]}}` renders a static PNG; click opens the interactive canvas.
- Docked mode (overlays `#right-sidebar-container`) and full-screen mode, toggled via toolbar button or `Cmd+Shift+O`.
- Pan / zoom / fit-to-view / click-to-navigate canvas interactions.
- Light and dark theme support with live switching via `onThemeModeChanged`.
- Multi-line text wrapping with adaptive node widths.
- Treemap hover breadcrumb.
- Live updates via `logseq.DB.onChanged` (500 ms debounced).
- Plugin settings: `defaultView`, `maxDepth`, `depthMode`, `showEmptyBlocks`, `animateViewSwitch`.
- Slash commands: `/outline` (opens focused on current block), `/outline-canvas` (inserts macro).
- DB-graph-only gate via `unsupportedGraphType: "file"` in the manifest.
