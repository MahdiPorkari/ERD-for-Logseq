# OutlineCanvas — Logseq Plugin

## What This Is

A Logseq DB plugin that renders hierarchical block trees as interactive visual diagrams. 8 diagram views (tree chart, tree table, roadmap ×2, mind map, right tree, fishbone, treemap) rendered to Canvas2D with zero external rendering dependencies.

## Architecture

- **Entry**: `src/index.ts` — plugin lifecycle, toolbar, commands, main UI panel
- **Data**: `src/adapter.ts` — Logseq BlockEntity → TreeNode conversion
- **Rendering**: `src/renderer.ts` — Canvas2D drawing primitives (box, line, curve, text, dot)
- **Interaction**: `src/controller.ts` — pan/zoom/resize with pointer events
- **UI**: `src/ui.ts` — HTML/CSS for view switcher bar and zoom controls
- **Views**: `src/views/*.ts` — each file is a pure layout function: `(TreeNode, maxDepth) → LayoutResult`
- **Design**: `src/colors.ts` — 8-color palette with dash patterns for accessibility
- **Config**: `src/settings.ts` — plugin settings schema

## Key Patterns

- Layout engines are pure functions with no side effects or DOM access
- All rendering goes through a flat `RenderElement[]` array drawn by `renderer.ts`
- Pan/zoom is a transform applied at render time, not a layout recalculation
- The plugin uses `showMainUI`/`hideMainUI` for a full-screen overlay panel
- Live updates use `logseq.DB.onChanged` with 500ms debounce
- Targets DB graphs only (`unsupportedGraphType: "file"` in manifest)

## Build & Dev

```bash
npm run dev        # Vite dev server at http://localhost:8080
npm run typecheck  # TypeScript type checking
npm run build      # Production build to dist/
```

## Reference

- HTML prototype: `outline-canvas-v2.html` (standalone reference for all 8 views)
- Requirements: `outline-canvas-logseq-plugin-requirements.md`
- Task tracker: `tasks.md`
