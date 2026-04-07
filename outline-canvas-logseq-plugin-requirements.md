# OutlineCanvas — Logseq DB Plugin Requirements

**Version:** 1.0  
**Date:** April 6, 2026  
**Status:** Draft  
**Target Platform:** Logseq DB (SQLite) version (v0.11.x+)

---

## 1. Product Overview

### 1.1 Purpose

OutlineCanvas is a Logseq plugin that renders hierarchical block trees as interactive visual diagrams directly within the Logseq application. Users select any page or zoomed-in block, and OutlineCanvas presents its nested outline structure as one of 8 diagram views — from tree charts and mind maps to roadmaps, fishbone diagrams, and treemaps.

### 1.2 Problem Statement

Logseq's outliner is powerful for authoring hierarchical information, but the text-based indented view makes it difficult to see the shape and structure of complex outlines at a glance. Users currently have no way to visualize an outline's hierarchy, compare the depth and breadth of branches, or see a project roadmap without leaving Logseq and using external diagramming tools.

### 1.3 Target Users

Logseq DB users who create structured outlines for project planning, knowledge organization, brainstorming, or documentation. Users who want visual overviews of their block trees without exporting data to third-party tools.

### 1.4 Value Proposition

One-click transformation of any Logseq block tree into 8 polished diagram views, rendered in a side panel or full-screen overlay, with zero data export and zero configuration required.

---

## 2. Logseq DB Platform Constraints

### 2.1 DB Graph Architecture

The plugin targets Logseq's new database (SQLite) version exclusively. Key differences from file-based graphs that affect the plugin design:

- **`:block/content` no longer exists.** Use `:block/title` for node text content.
- **`:block/original-name` was renamed to `:block/title`.**
- **Properties are namespaced** to `:plugin.property._api` for plugin-created properties.
- **`upsertBlockProperty` works** with DB graphs. Property values support numbers and booleans.
- **Whiteboards are disabled** in the DB version. This plugin fills the visual diagramming gap.
- **UI is rewritten with shadcn components** — the plugin's own UI should match this design language.
- **Plugins can run from the web**, but only "no-effect" plugins for now. The plugin should be designed as a read-only visualization (no-effect) for maximum compatibility.
- **MCP server available** for AI integration if needed for future features.

### 2.2 Plugin API Surface

The plugin will use these Logseq Plugin API capabilities:

| API | Purpose |
|-----|---------|
| `logseq.Editor.getBlock(uuid, {includeChildren: true})` | Retrieve a block and its full subtree |
| `logseq.Editor.getCurrentPage()` | Get the active page context |
| `logseq.Editor.getCurrentBlock()` | Get the focused block for scoped visualization |
| `logseq.Editor.getPageBlocksTree(pageName)` | Get the full block tree for a page |
| `logseq.App.registerUIItem('toolbar', {...})` | Register toolbar button to launch the viewer |
| `logseq.App.registerCommand(...)` | Register slash command and keyboard shortcut |
| `logseq.provideUI({...})` | Inject the canvas viewer into a plugin panel |
| `logseq.provideModel({...})` | Handle click events from the toolbar button |
| `logseq.DB.onChanged(callback)` | Watch for block changes to live-update the diagram |

### 2.3 Plugin Manifest

```json
{
  "name": "logseq-plugin-outline-canvas",
  "version": "1.0.0",
  "main": "dist/index.html",
  "logseq": {
    "id": "outline-canvas",
    "title": "OutlineCanvas — Visual Outline Diagrams",
    "icon": "icon.png",
    "unsupportedGraphType": "file"
  }
}
```

The `unsupportedGraphType: "file"` flag ensures the plugin only loads on DB graphs.

---

## 3. Plugin Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│  Logseq Application                                 │
│                                                     │
│  ┌──────────┐    Plugin API     ┌────────────────┐  │
│  │ DB Graph │ ◄──────────────► │ OutlineCanvas  │  │
│  │ (SQLite) │   getBlock()     │   Plugin       │  │
│  │          │   onChanged()    │                │  │
│  └──────────┘                  │  ┌───────────┐ │  │
│                                │  │ Data      │ │  │
│  ┌──────────┐                  │  │ Adapter   │ │  │
│  │ Toolbar  │ ─── click ────►  │  ├───────────┤ │  │
│  │ Button   │                  │  │ Layout    │ │  │
│  └──────────┘                  │  │ Engines   │ │  │
│                                │  ├───────────┤ │  │
│  ┌──────────┐                  │  │ Canvas2D  │ │  │
│  │ Slash    │ ─── /outline ──► │  │ Renderer  │ │  │
│  │ Command  │                  │  ├───────────┤ │  │
│  └──────────┘                  │  │ Pan/Zoom  │ │  │
│                                │  │ Controller│ │  │
│                                │  └───────────┘ │  │
│                                └────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 3.2 Module Breakdown

| Module | Responsibility | Input | Output |
|--------|---------------|-------|--------|
| **Data Adapter** | Converts Logseq block tree to internal tree format | Logseq BlockEntity[] | `{name, children[], depth, id, uuid}` |
| **Layout Engines** (×8) | Computes positioned element arrays from tree | Tree node | `Element[]` with x,y,w,h coordinates |
| **Canvas2D Renderer** | Draws element arrays to an HTML Canvas | Element[] | Canvas pixels |
| **Pan/Zoom Controller** | Handles pointer drag, wheel zoom, pinch-to-zoom | DOM events | Transform matrix updates |
| **View Manager** | Switches between views, manages state | User input | Layout rebuild + render |
| **Plugin Shell** | Logseq API integration, toolbar, commands | Logseq events | Panel lifecycle |

### 3.3 Data Flow

```
User clicks toolbar button or runs /outline command
    │
    ▼
Plugin Shell calls logseq.Editor.getPageBlocksTree(currentPage)
    │
    ▼
Data Adapter transforms BlockEntity[] → internal tree
    • Maps :block/title → node.name
    • Maps :block/uuid → node.uuid
    • Preserves :block/children hierarchy
    • Filters collapsed/empty blocks (configurable)
    │
    ▼
Active Layout Engine computes positions
    • Pure function: tree → Element[]
    • No side effects, no DOM access
    • Returns {elements[], bounds{x,y,w,h}}
    │
    ▼
Canvas2D Renderer draws elements
    • Applies pan/zoom transform
    • HiDPI scaling (devicePixelRatio)
    • Draws boxes, curves, lines, text, dots
    │
    ▼
User interacts (pan, zoom, switch view, click node)
    │
    ├──► Switch view → re-run Layout Engine with same tree
    ├──► Pan/zoom → re-render with updated transform
    └──► Click node → navigate to block in Logseq editor
```

### 3.4 Rendering Strategy

The plugin renders to an **HTML Canvas element inside an iframe** (standard Logseq plugin sandbox).

**Why Canvas2D over SVG or DOM:**
- Zero DOM elements in the render path means consistent performance at any outline depth
- HiDPI rendering via `devicePixelRatio` scaling
- Immediate-mode rendering avoids reconciliation overhead
- Pan/zoom is a simple transform — no need to recompute layout
- Identical rendering path across desktop and web

**Iframe dimensions:** The plugin panel will fill the right sidebar slot. The canvas must handle resize events via `ResizeObserver` and re-render at the new dimensions.

---

## 4. View Specifications

### 4.1 View Registry

| # | View ID | Label | Icon | Description |
|---|---------|-------|------|-------------|
| 1 | `tree` | Tree Chart | ⎅ | Vertical spine from root, branches right with bezier S-curves, background zones per branch |
| 2 | `table` | Tree Table | ⊟ | Spanning-cell matrix with alternating row stripes, semantic column headers, colored left-edge accent bars |
| 3 | `roadmap_alt` | Roadmap ↕ | ⟿ | Horizontal spine with phase cards alternating above/below, children contained inside cards |
| 4 | `roadmap` | Roadmap → | → | Horizontal spine with all phase cards below, children inside cards |
| 5 | `mind` | Mind Map | ◎ | Bilateral layout — branches split left/right from central root, bezier curves everywhere |
| 6 | `rtree` | Right Tree | ⊳ | Root left, all branches stacked right, leaves further right, bezier curves |
| 7 | `fish` | Fishbone | ⟜ | Horizontal spine with arrow-head box, angled bones, sub-bones in boxes |
| 8 | `tmap` | Treemap | ▦ | Nested rectangles with inner padding, hover breadcrumb trail, always-visible category labels |

### 4.2 View: Tree Chart

**Layout:** Root box top-left. Vertical spine drops from root bottom edge. Branches stacked vertically to the right. Leaves extend further right from each branch.

**Connectors:** Bezier S-curves for all connections. Root→branch curves: exit root right edge, arc to branch left edge. Branch→leaf curves: exit branch right edge, arc to leaf left edge. Control points at horizontal midpoint between source and target for natural arcs.

**Visual features:**
- Background zones: faint colored rectangles behind each branch + its leaves, with dashed border matching the branch color's unique dash pattern
- Depth-based branch sizing: branches with more children render with slightly taller boxes
- Leaf boxes: dashed borders using the parent branch's unique dash pattern for accessibility

**Depth levels rendered:** Root → Branches (depth 1) → Leaves (depth 2). Deeper nesting is flattened into the leaf level with truncated labels.

### 4.3 View: Tree Table

**Layout:** A spanning-cell matrix where each depth level occupies a column. Parent nodes span multiple rows matching their child count.

**Visual features:**
- Alternating row stripes (every other row slightly lighter) for horizontal scanability
- Semantic column headers derived from data depth: "Group → Category → Sub-category → Item → Detail → Attribute"
- Colored left-edge accent bar (3px) on spanning cells to indicate branch color
- No connectors — hierarchy is communicated by cell spanning and column position

### 4.4 View: Roadmap ↕ (Alternating)

**Layout:** Horizontal spine with root box at left. Phase cards sit above and below the spine in alternating positions. Children are listed INSIDE each card as stacked item rows.

**Visual features:**
- Numbered phase indicators (colored circles) on the spine at each phase position
- Short vertical connector lines from spine dots to card edges
- Directional chevrons between phases on the spine
- Arrow at spine terminus for left-to-right reading direction
- Phase header bar inside each card, followed by child items as small rounded boxes
- No external connectors between cards and floating nodes — containment replaces connection

### 4.5 View: Roadmap → (Linear)

**Layout:** Same as Roadmap ↕ except all cards are positioned below the spine. Simpler, linear reading flow.

### 4.6 View: Mind Map

**Layout:** Root box centered. Branches split into two groups: first half radiates right, second half radiates left. Creates a balanced bilateral layout.

**Connectors:** Bezier S-curves from root edge to branch edge (right or left depending on side). Same bezier style from branch edge to leaf edge. All curves use the horizontal midpoint between source and target as control point.

**Visual features:**
- Root glow: two concentric semi-transparent circles behind the root box
- Depth-scaled branch sizing: wider and taller boxes for branches with more children
- Leaf boxes with dashed borders using parent branch's dash pattern

### 4.7 View: Right Tree

**Layout:** Root on the left, all branches stacked vertically to the right. Leaves extend further right from each branch. Reads left-to-right like a document outline.

**Connectors:** Bezier S-curves from root right edge to each branch left edge, and from each branch right edge to each leaf left edge. Same control point strategy as Mind Map.

### 4.8 View: Fishbone (Ishikawa)

**Layout:** Horizontal spine with directional arrow. Head box at right end containing root name. Bones alternate above/below at slight angle from spine. Sub-bones fork off main bones at intermediate positions.

**Visual features:**
- Branch labels in rounded boxes (not bare text)
- Sub-bone items in small rounded boxes with dashed borders
- Angled bones (~15° from vertical) for classic fishbone appearance
- Wider spacing between sub-bones to prevent collision with adjacent main bones

### 4.9 View: Treemap

**Layout:** Nested rectangles filling a fixed viewport area (900×580 logical units). Squarified algorithm: parent rectangles subdivided horizontally or vertically based on aspect ratio. Children fill the parent area minus inner padding.

**Visual features:**
- Inner padding (24px top, 4px sides) between parent border and child regions — makes nesting hierarchy visible
- Always-visible category labels at depth 0-1, regardless of cell width
- Thicker borders (1.5px) on depth 0-1 containers for visual hierarchy
- Leaf cell dashed borders using parent branch's dash pattern

**Interaction:** Hover breadcrumb trail — when the cursor hovers over any treemap cell, display the full hierarchy path (e.g., "Product Launch → Development → Frontend → React components") in a fixed overlay at the top-left of the canvas area.

---

## 5. Design System

### 5.1 Color Palette

8 colors ordered for deuteranopia-safe adjacent contrast. No red-green adjacency.

| Index | Name | Stroke | Text | Fill (18% alpha) | Dash Pattern |
|-------|------|--------|------|-------------------|--------------|
| 0 | Blue | `#3e63dd` | `#8da4ef` | `#3e63dd18` | `[8,4]` |
| 1 | Orange | `#f76800` | `#ffa057` | `#f7680018` | `[12,3]` |
| 2 | Purple | `#6e56cf` | `#b4a3e8` | `#6e56cf18` | `[4,4]` |
| 3 | Cyan | `#00a2c7` | `#6cd4e8` | `#00a2c718` | `[16,4]` |
| 4 | Red | `#e5484d` | `#ff9592` | `#e5484d18` | `[6,2,2,2]` |
| 5 | Pink | `#d6409f` | `#ef8fcc` | `#d6409f18` | `[10,5]` |
| 6 | Green | `#46a758` | `#7ccf8e` | `#46a75818` | `[3,3]` |
| 7 | Yellow | `#ffe070` | `#f5d56a` | `#ffe07018` | `[14,2,4,2]` |

Each color also defines `leaf fill` (12% alpha), `leaf stroke` (35% alpha), and `zone fill` (8% alpha) variants.

The unique dash pattern per color serves as a secondary visual differentiator for color-blind users, applied to all leaf node borders across all views.

### 5.2 Typography

- **Primary font:** `IBM Plex Mono` (loaded via Google Fonts CDN). Fallback: `SF Mono, monospace`.
- **Root labels:** 14–16px, weight 700, color `#edeef0`
- **Branch labels:** 11–12px, weight 600, branch theme text color
- **Leaf labels:** 12px minimum, weight 400, color `#a8a8b2`
- **Minimum font size:** 12px for all data labels (WCAG compliance)

### 5.3 Contrast Requirements

- All text must meet WCAG 2.1 AA contrast ratio of 4.5:1 against its background
- Leaf text color `#a8a8b2` on canvas background `#0d0f14` yields ~5.2:1 ratio
- Branch text uses themed colors that all exceed 4.5:1 on their respective fill backgrounds

### 5.4 Connector Design Principles

- **Bezier S-curves** for all node-link diagram views (tree chart, mind map, right tree)
- **Containment** for grouped views (roadmap cards, treemap rectangles)
- **No orthogonal bus lines** — these cause visual clutter
- All connectors anchor at node **edges**, never pass through nodes
- Control points at horizontal midpoint between source and target for natural arcs

---

## 6. Interaction Model

### 6.1 Plugin Activation

| Trigger | Action |
|---------|--------|
| Toolbar button click | Opens OutlineCanvas panel in right sidebar with current page's block tree |
| Slash command `/outline` | Opens OutlineCanvas panel focused on the current block and its children |
| Keyboard shortcut `Ctrl+Shift+O` | Same as toolbar button |

### 6.2 Canvas Interactions

| Input | Action |
|-------|--------|
| Pointer drag | Pan the canvas (translate transform) |
| Scroll wheel / trackpad pinch | Zoom toward cursor position |
| View button click | Switch layout engine, fade transition (180ms), auto fit-to-view |
| Click on a node | Navigate Logseq editor to that block (using stored UUID) |
| Hover over treemap cell | Show breadcrumb path overlay |
| Fit button (⊞) | Reset pan/zoom to fit entire diagram in viewport |
| + / − buttons | Step zoom in/out by 20% |

### 6.3 Live Updates

When `logseq.DB.onChanged()` fires and the affected blocks are within the currently visualized tree, the plugin should re-fetch the block tree, re-run the data adapter, and re-render with the current view and pan/zoom state preserved.

Debounce the update to 500ms to avoid rapid re-renders during fast editing.

### 6.4 View Switch Animation

When switching between views, the canvas fades out over 180ms (CSS `opacity` transition), the layout rebuilds while invisible, then fades back in. This prevents a jarring hard-cut between different spatial arrangements.

---

## 7. Data Adapter Specification

### 7.1 Logseq BlockEntity to Internal Tree

```typescript
interface LogseqBlock {
  uuid: string;
  title: string;       // was :block/content in file graphs
  children?: LogseqBlock[];
  properties?: Record<string, any>;
  collapsed?: boolean;
}

interface TreeNode {
  name: string;        // from block.title, stripped of markdown
  children: TreeNode[];
  depth: number;
  id: number;          // sequential, for element key stability
  uuid: string;        // for click-to-navigate
}
```

### 7.2 Transformation Rules

1. Fetch tree via `logseq.Editor.getPageBlocksTree(pageName)` or `logseq.Editor.getBlock(uuid, {includeChildren: true})`
2. For each block, extract `title` (`:block/title`), strip inline markdown formatting (bold, italic, links) to get plain text for labels
3. Preserve `uuid` on each node for click-to-navigate
4. If a block has no children and no title (empty block), skip it
5. If a page has multiple top-level blocks, wrap them in a virtual root node named after the page title
6. If invoked on a zoomed-in block, use that block as the root

### 7.3 Depth Handling

Most views render 3 levels of depth (root → branch → leaf). For outlines deeper than 3 levels:
- Depth 0: Root node
- Depth 1: Branch nodes (direct children of root)
- Depth 2: Leaf nodes (grandchildren of root)
- Depth 3+: Flattened into depth 2 with truncated labels showing "Parent > Child" breadcrumb

A user preference (plugin settings) controls the maximum render depth, defaulting to 3.

---

## 8. Rendering Engine Specification

### 8.1 Element Types

The rendering engine draws a flat array of positioned elements. Each element is a plain object with a `type` field.

| Type | Required Fields | Description |
|------|----------------|-------------|
| `box` | x, y, w, h, fill, stroke, lw, rad | Rounded rectangle with optional text label |
| `line` | x1, y1, x2, y2, color, lw | Straight line segment |
| `curve` | x1, y1, cx1, cy1, cx2, cy2, x2, y2, color, lw | Cubic bezier curve |
| `text` | text, x, y, color, size, weight, align | Standalone text label |
| `dot` | x, y, r, color | Filled circle (milestone markers, glow layers) |

### 8.2 HiDPI Rendering

```javascript
const dpr = window.devicePixelRatio || 1;
canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
```

Re-apply on every frame and on resize.

### 8.3 Pan/Zoom

- Pan: pointer drag with `setPointerCapture` for reliable tracking
- Zoom: wheel event, zoom toward cursor position
- Zoom range: 5% to 1000%
- Auto fit-to-view on initial render and view switch

### 8.4 Touch Support

- Two-finger pinch-to-zoom (using pointer events, not touch events)
- Single-finger drag to pan
- `touch-action: none` on canvas element to prevent browser scroll interference

---

## 9. Plugin Settings

The plugin exposes configurable settings via Logseq's plugin settings schema.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `defaultView` | enum | `tree` | Which view to show on first open |
| `maxDepth` | number | 3 | Maximum nesting depth to render |
| `showEmptyBlocks` | boolean | false | Include blocks with no title |
| `colorScheme` | enum | `default` | Future: alternative palettes |
| `animateViewSwitch` | boolean | true | Enable/disable fade transition |

---

## 10. Accessibility

### 10.1 Color-Blind Safety

- Color palette ordered to avoid adjacent red/green
- Every leaf node border uses a unique dash pattern per branch color, providing a secondary visual channel beyond hue
- Background zones in Tree Chart use dashed borders with unique patterns
- All 8 colors are perceptually distinct under deuteranopia, protanopia, and tritanopia simulations

### 10.2 Contrast

- Minimum 4.5:1 contrast ratio for all text (WCAG 2.1 AA)
- Minimum 12px font size for all data labels
- Root labels use full white (`#edeef0`) on dark backgrounds for maximum readability

### 10.3 Keyboard Navigation

- `Tab` moves focus between view buttons, zoom controls, and the canvas
- Arrow keys pan the canvas when it has focus
- `+` / `-` keys zoom in/out
- `0` key resets to fit-to-view
- `Escape` closes the plugin panel

---

## 11. Performance Targets

| Metric | Target |
|--------|--------|
| Initial render (100-node tree) | < 100ms |
| View switch (100-node tree) | < 200ms including animation |
| Pan/zoom frame rate | 60fps on M1 Mac, 30fps minimum on low-end |
| Memory usage | < 50MB for 1000-node trees |
| Plugin load time | < 500ms |

---

## 12. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Plugin framework | `@logseq/libs` | Official Logseq plugin SDK |
| Build tool | Vite | Fast dev server, optimized builds |
| Language | TypeScript | Type safety with `@logseq/libs` type definitions |
| Rendering | Canvas2D API | Zero-dependency, HiDPI, consistent performance |
| Font loading | Google Fonts CDN (IBM Plex Mono) | Consistent typography across platforms |
| Testing | Vitest | Unit tests for layout engines and data adapter |

### 12.1 No External Rendering Libraries

The plugin intentionally avoids D3.js, React Flow, Mermaid, Cytoscape, or any other rendering/layout library. The layout math, drawing primitives, and interaction handling are self-contained. This decision was validated through evaluation of 6 rendering libraries during the prototype phase — each added significant bundle size and styling constraints without solving the core layout problem.

---

## 13. File Structure

```
logseq-plugin-outline-canvas/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── icon.png
├── src/
│   ├── index.ts              # Plugin entry: toolbar, commands, panel lifecycle
│   ├── adapter.ts            # Logseq BlockEntity → TreeNode conversion
│   ├── types.ts              # TreeNode, Element, ViewConfig interfaces
│   ├── renderer.ts           # Canvas2D drawing primitives and render loop
│   ├── controller.ts         # Pan/zoom/resize interaction handling
│   ├── views/
│   │   ├── tree-chart.ts
│   │   ├── tree-table.ts
│   │   ├── roadmap.ts
│   │   ├── mind-map.ts
│   │   ├── right-tree.ts
│   │   ├── fishbone.ts
│   │   └── treemap.ts
│   ├── colors.ts             # Color palette with dash patterns
│   ├── ui.ts                 # View switcher bar, zoom controls, breadcrumb overlay
│   └── settings.ts           # Plugin settings schema
├── test/
│   ├── adapter.test.ts
│   ├── tree-chart.test.ts
│   ├── treemap.test.ts
│   └── fixtures/             # Sample block trees for testing
└── dist/                     # Build output
    └── index.html
```

---

## 14. Reference Implementation

The standalone HTML prototype (`outline-canvas-v2.html`, ~640 lines) serves as the reference implementation for all 8 views. It contains:

- Complete parser, layout engines, renderer, and interaction controller
- All 8 color definitions with dash patterns
- Working pan/zoom with HiDPI support
- View-switch fade animation
- Treemap hover breadcrumb
- Deuteranopia-safe color ordering

The plugin development task is to decompose this monolithic HTML into the modular TypeScript structure above, replace the text-area input with the Logseq API data adapter, and wrap the canvas in the Logseq plugin panel lifecycle.

---

## 15. Open Questions

1. **Right sidebar vs. full-screen overlay?** The plugin could open in Logseq's right sidebar (consistent with other panels) or as a full-screen modal (more canvas space). Recommendation: start with right sidebar, add a "maximize" button that switches to full-screen.

2. **Depth 3+ rendering strategy.** Should the plugin show a "drill down" interaction where clicking a depth-2 leaf re-roots the visualization on that branch? This would allow navigating arbitrarily deep outlines without information overload.

3. **Export capabilities.** Should the plugin support exporting the current view as PNG, SVG, or Mermaid code block? This could be a v1.1 feature — the Canvas2D `toDataURL()` method makes PNG export trivial.

4. **Theme integration.** Should the plugin read Logseq's current theme colors and adapt its palette? The current design uses a fixed dark palette that matches Logseq's default dark theme. Supporting light themes would require a secondary palette.

5. **Block-level rendering trigger.** Should the plugin also support rendering inline within a page (e.g., via a `{{renderer :outline-canvas}}` macro)? This would allow embedding diagrams directly in notes but adds significant complexity.
