# OutlineCanvas — Task Tracker

**Last Updated:** 2026-04-06

## v1.0 Milestone

### Feature: Project Scaffold
- [x] Requirements defined (outline-canvas-logseq-plugin-requirements.md)
- [x] HTML prototype created (outline-canvas-v2.html)
- [x] Scaffold TypeScript project (package.json, vite, tsconfig)
- [x] Create all source modules with layout logic ported from prototype
- [ ] Type check passes (`npm run typecheck`)
- [ ] Build passes (`npm run build`)
- [ ] Committed

### Feature: Data Adapter (Logseq API Integration)
- [ ] Test fetchTree with a real DB graph page
- [ ] Test fetchBlockTree with /outline slash command
- [ ] Verify empty block filtering
- [ ] Verify depth flattening (maxDepth > 3)
- [ ] Validate markdown stripping on real block content

### Feature: All 8 Views
- [ ] Tree Chart — visual validation
- [ ] Tree Table — visual validation
- [ ] Roadmap ↕ (alternating) — visual validation
- [ ] Roadmap → (linear) — visual validation
- [ ] Mind Map — visual validation
- [ ] Right Tree — visual validation
- [ ] Fishbone — visual validation
- [ ] Treemap — visual validation + breadcrumb hover

### Feature: Canvas Interactions
- [ ] Pan (pointer drag)
- [ ] Zoom (wheel, +/- buttons, keyboard)
- [ ] Fit-to-view (⊞ button, 0 key)
- [ ] Click-to-navigate (block UUID → scrollToBlockInPage)
- [ ] View switch with fade animation
- [ ] Treemap breadcrumb on hover

### Feature: Plugin Integration
- [ ] Toolbar button opens OutlineCanvas
- [ ] Slash command /outline focuses on current block
- [ ] Ctrl+Shift+O keyboard shortcut
- [ ] Escape closes panel
- [ ] Live updates via DB.onChanged (500ms debounce)
- [ ] Plugin settings (defaultView, maxDepth, showEmptyBlocks, animateViewSwitch)

### Feature: Polish & Accessibility
- [ ] WCAG 4.5:1 contrast validation on all text
- [ ] Dash patterns visible on all leaf borders
- [ ] Keyboard navigation (Tab, arrows, +/-, 0, Esc)
- [ ] HiDPI rendering verified on Retina display
- [ ] Plugin icon (128x128 PNG)
- [ ] README.md

## Deferred (v1.1)
- [ ] Export as PNG via canvas.toDataURL()
- [ ] Drill-down navigation (click leaf to re-root)
- [ ] Maximize toggle (sidebar → full-screen)
- [ ] Light theme support
- [ ] Inline renderer macro ({{renderer :outline-canvas}})

## Completed
<!-- Move completed feature sections here with completion date -->
