# OutlineCanvas — Logseq Plugin

## What This Is

A Logseq DB plugin that renders hierarchical block trees as interactive visual diagrams. 8 diagram views (tree chart, tree table, roadmap x2, mind map, right tree, fishbone, treemap) rendered to Canvas2D with zero external rendering dependencies.

## Architecture

- **Entry**: `src/index.ts` — plugin lifecycle, toolbar, commands, docked/full-screen modes, macro renderer
- **Data**: `src/adapter.ts` — Logseq BlockEntity → TreeNode conversion, depth pruning (recursive/flat modes)
- **Rendering**: `src/renderer.ts` — Canvas2D drawing primitives (box, line, curve, text, dot) with multi-line text wrapping
- **Off-screen**: `src/offscreen.ts` — renders tree to PNG data URL for inline macro
- **Text**: `src/text.ts` — text measurement, word-wrap, adaptive width calculation
- **Interaction**: `src/controller.ts` — pan/zoom/resize with pointer events
- **UI**: `src/ui.ts` — HTML/CSS for view switcher, zoom controls, close/dock buttons
- **Views**: `src/views/*.ts` — layout engines: `(TreeNode, maxDepth) → LayoutResult`
  - Tree Chart, Right Tree, Mind Map: recursive (arbitrary depth)
  - Tree Table, Roadmap x2, Fishbone, Treemap: 3-level
- **Theme**: `src/colors.ts` — light/dark palettes, semantic tokens, theme switching
- **Config**: `src/settings.ts` — plugin settings (defaultView, maxDepth, depthMode, etc.)

## Key Patterns

- Tree Chart, Right Tree, Mind Map use recursive layout — they render all depth levels in the tree as connected nodes
- Other views render 3 levels; deeper nodes are handled by `flattenDeep` based on `depthMode` setting
- All rendering goes through a flat `RenderElement[]` array drawn by `renderer.ts`
- `adaptiveWidth()` computes node width from text length (wider for longer text, ~4 lines target)
- Pan/zoom is a transform applied at render time, not a layout recalculation
- Docked mode: opens Logseq's right sidebar, overlays iframe on `#right-sidebar-container`
- Full-screen mode: fixed overlay covering entire viewport
- Inline macro: `{{renderer :outline-canvas}}` renders static PNG via off-screen canvas
- Theme: `theme()` returns active palette; `setTheme()` switches; views read semantic tokens
- Live updates use `logseq.DB.onChanged` with 500ms debounce
- Targets DB graphs only (`unsupportedGraphType: "file"` in manifest)

## Build & Dev

```bash
npm run dev        # Vite dev server at http://localhost:8080
npm run typecheck  # TypeScript type checking
npm run build      # Production build to dist/
```

## End-to-End Testing

```bash
scripts/logseq-dev-up.sh   # idempotent: starts yarn watch + npx vite if needed
scripts/logseq-smoke.sh    # opens canvas, clicks ⊞ / ✕ / Treemap, asserts state
```

The smoke script uses `window.frontend.handler.plugin.load_plugin_from_web_url_BANG_` for programmatic install (no Developer-mode UI dance) and asserts host-side state — `.lsp-iframe-sandbox-container.style.cssText` and `#right-sidebar` visibility — because the iframe at :8080 is cross-origin from Logseq at :3001.

Run after every non-trivial change touching dock/full-screen, toolbar buttons, or the `provideStyle` rules.

## Reference

- HTML prototype: `outline-canvas-v2.html` (standalone reference for all 8 views)
- Requirements: `outline-canvas-logseq-plugin-requirements.md`
- Task tracker: `tasks.md`
- Changelog: `CHANGELOG.md`
