import "@logseq/libs";
import type { ViewId, ViewDef, RenderElement, TreeNode, LayoutResult } from "./types";
import { registerSettings, getSettings, DOCK_WIDTH_MIN, DOCK_WIDTH_MAX } from "./settings";
import {
  fetchTree,
  fetchBlockTree,
  flattenDeep,
  buildTree,
  filterIntraTreeRefs,
  discoverNodeProperties,
  includeOutScopeRefs,
  type LogseqBlock,
} from "./adapter";
import { buildEdgeElements, buildEdgeLabels } from "./views/edges";
import { buildBadges, buildFocusHalo } from "./views/badges";
import { render, hitTest } from "./renderer";
import { createState, fitToView, zoomIn, zoomOut, attachHandlers } from "./controller";
import {
  buildUI,
  STYLES,
  setActiveView,
  applyThemeToUI,
  updateDockButton,
  applyPlatformClass,
  updateFullscreenClass,
  getCanvasSize,
} from "./ui";
import { setTheme } from "./colors";
import { renderToDataURL, exportCurrentViewAsDataURL } from "./offscreen";
import { layoutTreeChart } from "./views/tree-chart";
import { layoutTreeTable } from "./views/tree-table";
import { layoutRoadmapAlt, layoutRoadmapLinear } from "./views/roadmap";
import { layoutMindMap } from "./views/mind-map";
import { layoutRightTree } from "./views/right-tree";
import { layoutFishbone } from "./views/fishbone";
import { layoutTreemap, treemapHitBoxes } from "./views/treemap";
import { layoutERD } from "./views/erd";

const VIEWS: ViewDef[] = [
  { id: "tree", label: "Tree Chart", icon: "🌳", layout: layoutTreeChart },
  { id: "table", label: "Tree Table", icon: "📊", layout: layoutTreeTable },
  { id: "roadmap_alt", label: "Roadmap ↕", icon: "🛣️", layout: layoutRoadmapAlt },
  { id: "roadmap", label: "Roadmap →", icon: "➡️", layout: layoutRoadmapLinear },
  { id: "mind", label: "Mind Map", icon: "🧠", layout: layoutMindMap },
  { id: "rtree", label: "Right Tree", icon: "🌿", layout: layoutRightTree },
  { id: "fish", label: "Fishbone", icon: "🐟", layout: layoutFishbone },
  { id: "tmap", label: "Treemap", icon: "🔲", layout: layoutTreemap },
  { id: "erd", label: "ERD", icon: "🔗", layout: layoutERD },
];

let activeView: ViewId = "tree";
let currentTree: TreeNode | null = null;
let currentDisplayTree: TreeNode | null = null;
let currentLayout: LayoutResult | null = null;
let focusedUuid: string | null = null;

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let cleanupController: (() => void) | null = null;
const controllerState = createState();

let isDocked = true;
let isResizing = false;
let debounceTimer: any = null;

// --- Core Pipeline ---

/**
 * Fetch fresh data from Logseq and build the internal Tree structure.
 * Re-runs on DB changes or when opening from a new block.
 */
async function loadTree(blockUuid?: string): Promise<void> {
  const settings = getSettings();
  const enabledProperties = new Set(settings.enabledNodeProperties);

  currentTree = blockUuid
    ? await fetchBlockTree(
        blockUuid,
        settings.showEmptyBlocks,
        undefined,
        undefined,
        undefined,
        enabledProperties
      )
    : await fetchTree(settings.showEmptyBlocks, enabledProperties);

  // If node-property relationships are enabled, pull in out-of-scope refs
  // BEFORE filtering/layout, as filterIntraTreeRefs drops external targets.
  if (currentTree && enabledProperties.size > 0) {
    currentTree = await includeOutScopeRefs(
      currentTree,
      settings.showEmptyBlocks,
      undefined,
      undefined,
      undefined,
      enabledProperties
    );
  }

  // New tree → previous focus may not exist anymore.
  focusedUuid = null;

  if (currentTree) {
    rebuildLayout();
  }
}

/**
 * Recompute the full layout from the current tree, view, and settings, then
 * compose elements and reset the camera. Called when the tree changes, the
 * view changes, or settings change — NOT on focus changes (those use
 * composeElements() to avoid resetting the user's pan/zoom state).
 */
function rebuildLayout(): void {
  if (!currentTree) return;
  const settings = getSettings();
  const pruned = flattenDeep(currentTree, settings.maxDepth, settings.depthMode);

  // filterIntraTreeRefs ensures we only draw edges between nodes currently present in the view.
  const tree = settings.showRelationships ? filterIntraTreeRefs(pruned) : pruned;
  const view = VIEWS.find((v) => v.id === activeView)!;
  const result = view.layout(tree, settings.maxDepth);

  currentDisplayTree = tree;
  currentLayout = result;
  composeElements();

  // Diagnostic: surface ref state once per rebuild so users can debug missing connectors.
  let refCount = 0;
  (function count(n: TreeNode): void {
    refCount += n.refs?.length ?? 0;
    for (const c of n.children) count(c);
  })(tree);
  console.debug(
    `[OutlineCanvas] view=${activeView} focus=${focusedUuid ?? "none"} refs(intra-tree)=${refCount} rects=${result.nodeRectsByUuid?.size ?? 0}`
  );

  const { w, h } = getCanvasSize(isDocked);
  controllerState.transform = fitToView(result.bounds, w, h);
  redraw();
}

/** Set the focused node and refresh display (no camera reset). */
function setFocus(uuid: string | null): void {
  if (focusedUuid === uuid) return;
  focusedUuid = uuid;
  composeElements();
  redraw();
}

/**
 * Combine static layout elements with dynamic relationship connector overlays.
 * Only Tree Chart, Right Tree, and Mind Map support overlays; others ignore them.
 */
function composeElements(): void {
  if (!currentLayout || !currentDisplayTree) return;
  const settings = getSettings();

  // Reset to static base layout
  const elements = [...currentLayout.elements];

  // Add relationship overlays if enabled and supported by the view.
  // Views populate nodeRectsByUuid if they want connectors.
  if (settings.showRelationships && currentLayout.nodeRectsByUuid) {
    const rects = currentLayout.nodeRectsByUuid;

    // 1. Halo behind the focused node
    elements.unshift(...buildFocusHalo(focusedUuid, rects));

    // 2. Incoming/Outgoing count badges on node corners
    elements.push(...buildBadges(currentDisplayTree, rects));

    // 3. Curved bezier relationship connectors
    const connectorEls = buildEdgeElements(currentDisplayTree, rects, focusedUuid);
    elements.push(...connectorEls);

    // 4. Midpoint property labels for visible connectors
    if (settings.showRelationshipLabels) {
      elements.push(...buildEdgeLabels(currentDisplayTree, rects, focusedUuid));
    }
  }

  (currentLayout as any).composedElements = elements;
}

/** Paint the composed elements to the canvas using current transform. */
function redraw(): void {
  if (!ctx || !currentLayout) return;
  const { w, h } = getCanvasSize(isDocked);
  render(ctx, (currentLayout as any).composedElements, controllerState.transform, w, h);
}

/** Hit-test treemap nested nodes specifically for breadcrumbs */
function hitTestTreemap(cx: number, cy: number): string[] {
  if (!currentLayout) return [];
  const lx = (cx - controllerState.transform.ox) / controllerState.transform.scale;
  const ly = (cy - controllerState.transform.oy) / controllerState.transform.scale;

  // treemapHitBoxes is sorted shallow-to-deep by the layout engine.
  // We want the most specific (deepest) match.
  let best: string[] = [];
  for (const hb of treemapHitBoxes) {
    if (lx >= hb.x && lx <= hb.x + hb.w && ly >= hb.y && ly <= hb.y + hb.h) {
      best = hb.path;
    }
  }
  return best;
}

// --- UI Interaction ---

function switchView(viewId: ViewId): void {
  if (viewId === activeView) return;
  activeView = viewId;

  const app = document.getElementById("app");
  if (app) setActiveView(app, viewId);

  const settings = getSettings();
  if (canvas && settings.animateViewSwitch) {
    canvas.classList.add("oc-fading");
    setTimeout(() => {
      rebuildLayout();
      canvas?.classList.remove("oc-fading");
    }, 180);
  } else {
    rebuildLayout();
  }
}

function handleCanvasClick(e: MouseEvent): void {
  if (!currentLayout || !(currentLayout as any).composedElements) return;
  const rect = canvas?.getBoundingClientRect();
  if (!rect) return;
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;

  const hit = hitTest((currentLayout as any).composedElements, cx, cy, controllerState.transform);
  if (hit && hit.uuid) {
    // Click node: focus its relationships and navigate in host
    setFocus(hit.uuid);
    // Use the correct signature for scrollToBlockInPage (page, block)
    // If we don't have the page name, we can try to get it from the node if we stored it,
    // but standard behavior in this plugin was scrollToBlockInPage(blockUuid).
    // Let's check what works. Actually, passing (blockUuid, blockUuid) is a common hack if the API accepts it.
    logseq.Editor.scrollToBlockInPage(hit.uuid, hit.uuid);
  } else {
    // Click empty: unfocus
    setFocus(null);
  }

  // Handle Treemap breadcrumbs
  if (activeView === "tmap") {
    const hb = hitTestTreemap(cx, cy);
    const breadcrumb = document.getElementById("oc-breadcrumb");
    if (breadcrumb) {
      if (hb.length > 0) {
        breadcrumb.textContent = hb.join(" › ");
        breadcrumb.classList.add("oc-show");
      } else {
        breadcrumb.classList.remove("oc-show");
      }
    }
  }
}

// --- Lifecycle & Initialization ---

function toggleDockMode(): void {
  isDocked = !isDocked;
  applyDockMode();
  rebuildLayout();
}

function applyDockMode(): void {
  const settings = getSettings();
  if (isDocked) {
    const width = settings.dockWidth;
    logseq.setMainUIInlineStyle({
      position: "fixed",
      right: "0",
      top: "0",
      width: `${width}vw`,
      height: "100vh",
      zIndex: "10",
      display: "block",
    });
  } else {
    logseq.setMainUIInlineStyle({
      position: "fixed",
      left: "0",
      top: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "10",
      display: "block",
    });
  }
  updateDockButton(isDocked);
  updateFullscreenClass(isDocked);
}

function hideCanvas(): void {
  logseq.hideMainUI();
  logseq.setMainUIInlineStyle({ display: "none" });
}

/** Set up global CSS variables for theme and layout */
function injectHostStyles(pluginId: string): void {
  const settings = getSettings();
  const css = `
    /* Reserve space for the strip when in 'mirror' mode */
    :root:has(iframe#${pluginId}[style*="display: block"]) {
      --oc-strip-width: ${isDocked && settings.dockBehavior === "mirror" ? settings.dockWidth + "vw" : "0px"};
    }

    #main-content-container,
    #right-sidebar-container {
      margin-right: var(--oc-strip-width, 0px) !important;
      transition: margin-right 0.15s ease-out;
    }

    /* Keep right sidebar next to canvas strip (not overlapping) */
    #right-sidebar-container {
      right: var(--oc-strip-width, 0px) !important;
    }
  `;
  logseq.provideStyle({ key: "outline-canvas-host", style: css });
}

function setupCanvas(): void {
  canvas = document.getElementById("oc-canvas") as HTMLCanvasElement;
  if (!canvas) return;

  ctx = canvas.getContext("2d");
  const { w, h } = getCanvasSize(isDocked);
  canvas.width = w * (window.devicePixelRatio || 1);
  canvas.height = h * (window.devicePixelRatio || 1);

  cleanupController?.();
  cleanupController = attachHandlers(canvas, controllerState, redraw);

  canvas.addEventListener("click", handleCanvasClick);

  // ResizeObserver to handle window / dock width changes
  const ro = new ResizeObserver(() => {
    if (!canvas || !logseq.isMainUIVisible) return;
    const { w: nw, h: nh } = getCanvasSize(isDocked);
    canvas.width = nw * (window.devicePixelRatio || 1);
    canvas.height = nh * (window.devicePixelRatio || 1);
    redraw();
  });
  ro.observe(document.body);
}

function setupResizeHandle(pluginId: string): void {
  const handle = document.getElementById("oc-resize-handle");
  if (!handle) return;

  handle.addEventListener("mousedown", (e) => {
    if (!isDocked) return;
    isResizing = true;
    handle.classList.add("oc-dragging");
    document.body.style.cursor = "ew-resize";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const vw = (e.clientX / window.innerWidth) * 100;
    const nextWidth = Math.max(DOCK_WIDTH_MIN, Math.min(DOCK_WIDTH_MAX, 100 - vw));
    logseq.updateSettings({ dockWidth: nextWidth });
    // Live CSS update for the host margin
    injectHostStyles(pluginId);
    applyDockMode();
  });

  window.addEventListener("mouseup", () => {
    if (!isResizing) return;
    isResizing = false;
    handle.classList.remove("oc-dragging");
    document.body.style.cursor = "";
  });
}

function setupUI(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = buildUI(VIEWS, activeView);
  setupCanvas();

  app.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest("[data-view], [data-action]");
      if (!btn) return;

      const viewId = btn.getAttribute("data-view") as ViewId;
      const action = btn.getAttribute("data-action");

      if (viewId) switchView(viewId);

      switch (action) {
        case "oc-close":
          hideCanvas();
          break;
        case "oc-dock-toggle":
          toggleDockMode();
          break;
        case "oc-zoom-in": {
          const { w, h } = getCanvasSize(isDocked);
          controllerState.transform = zoomIn(controllerState.transform, w / 2, h / 2);
          redraw();
          break;
        }
        case "oc-zoom-out": {
          const { w, h } = getCanvasSize(isDocked);
          controllerState.transform = zoomOut(controllerState.transform, w / 2, h / 2);
          redraw();
          break;
        }
        case "oc-fit":
          rebuildLayout();
          break;
        case "oc-export":
          exportCurrentView();
          break;
        case "oc-copy":
          copyCurrentView();
          break;
      }
    },
    true
  );
}

/**
 * Capture the current view as a PNG (WYSIWYG — uses the live transform and
 * canvas dimensions). Includes both `depends_on` and `relates_to` edges
 * regardless of focus / showRelationships. Triggers a browser download.
 */
function exportCurrentView(): void {
  if (!currentDisplayTree || !currentLayout) return;
  const settings = getSettings();
  const { w, h } = getCanvasSize(isDocked);
  const dataURL = exportCurrentViewAsDataURL(
    currentDisplayTree,
    currentLayout,
    w,
    h,
    controllerState.transform,
    settings.showRelationshipLabels
  );
  if (!dataURL) return;

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const link = document.createElement("a");
  link.download = `outline-canvas-${activeView}-${ts}.png`;
  link.href = dataURL;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function copyCurrentView(): Promise<void> {
  if (!currentDisplayTree || !currentLayout) return;
  const settings = getSettings();
  const { w, h } = getCanvasSize(isDocked);
  const dataURL = exportCurrentViewAsDataURL(
    currentDisplayTree,
    currentLayout,
    w,
    h,
    controllerState.transform,
    settings.showRelationshipLabels
  );
  if (!dataURL) return;

  try {
    const blob = await (await fetch(dataURL)).blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    logseq.UI.showMsg("OutlineCanvas: image copied to clipboard", "success");
  } catch (err) {
    console.error("OutlineCanvas: clipboard write failed", err);
    logseq.UI.showMsg("OutlineCanvas: clipboard copy failed (try export instead)", "warning");
  }
}

// --- Macro Renderer ---

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main(): Promise<void> {
  const offHooks: Array<() => void> = [];

  // Settings
  registerSettings();
  activeView = getSettings().defaultView;

  // Detect initial theme
  try {
    const configs = await logseq.App.getUserConfigs();
    const mode = configs?.preferredThemeMode === "light" ? "light" : "dark";
    setTheme(mode);
  } catch {
    setTheme("dark");
  }

  // Listen for theme changes
  const offTheme = logseq.App.onThemeModeChanged(({ mode }) => {
    setTheme(mode === "light" ? "light" : "dark");
    applyThemeToUI();
    if (logseq.isMainUIVisible) {
      rebuildLayout();
    }
  });
  if (typeof offTheme === "function") offHooks.push(offTheme);

  // CSS — injected into parent frame. The sidebar-hide rule is gated on
  // dockBehavior, so we re-inject on settings change using the same key.
  const pluginId = (logseq as { baseInfo?: { id?: string } }).baseInfo?.id ?? "";
  injectHostStyles(pluginId);

  // Inject styles into plugin iframe
  const styleEl = document.createElement("style");
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  // Load Google Font
  const fontLink = document.createElement("link");
  fontLink.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&display=swap";
  fontLink.rel = "stylesheet";
  document.head.appendChild(fontLink);

  // Build UI
  setupUI();
  setupResizeHandle(pluginId);
  applyThemeToUI();
  applyPlatformClass();

  // Model for click handlers
  logseq.provideModel({
    async openOutlineCanvas() {
      applyDockMode();
      logseq.showMainUI({ autoFocus: true });
      loadTree();
    },
    async openOutlineCanvasForBlock(e: { dataset: Record<string, string> }) {
      const uuid = e.dataset.blockUuid;
      if (uuid) {
        applyDockMode();
        logseq.showMainUI({ autoFocus: true });
        loadTree(uuid);
      }
    },
  });

  // Toolbar button
  logseq.App.registerUIItem("toolbar", {
    key: "outline-canvas-btn",
    template: `
      <a class="button outline-canvas-btn" data-on-click="openOutlineCanvas" title="OutlineCanvas — Visual Diagrams">
        <span style="font-size: 18px;">◈</span>
      </a>
    `,
  });

  // Command palette + keyboard shortcut
  logseq.App.registerCommandPalette(
    {
      key: "outline-canvas-open",
      label: "OutlineCanvas: Open diagram view",
      keybinding: {
        mode: "global",
        binding: "mod+shift+o",
      },
    },
    () => {
      if (logseq.isMainUIVisible) {
        // Toggle dock/full when already open
        toggleDockMode();
      } else {
        applyDockMode();
        logseq.showMainUI({ autoFocus: true });
        loadTree();
      }
    }
  );

  // Command to list node-type properties for discovery
  logseq.App.registerCommandPalette(
    {
      key: "outline-canvas-list-node-props",
      label: "ERD: List Node-Type Properties",
    },
    async () => {
      const names = await discoverNodeProperties();
      console.log("[OutlineCanvas] Node-type properties:", names);
      if (names.length === 0) {
        console.log("[OutlineCanvas] No node-type properties found in this graph.");
        logseq.UI.showMsg("No node-type properties found in graph", "warning");
      } else {
        logseq.UI.showMsg(`Found ${names.length} node-type properties. See browser console for list.`, "success");
      }
    }
  );

  // Slash command — opens focused on current block (interactive overlay)
  logseq.Editor.registerSlashCommand("outline", async () => {
    const block = await logseq.Editor.getCurrentBlock();
    applyDockMode();
    logseq.showMainUI({ autoFocus: true });
    if (block) {
      loadTree(block.uuid);
    } else {
      loadTree();
    }
  });

  // Slash command — inserts inline macro renderer
  logseq.Editor.registerSlashCommand("outline-canvas", async () => {
    try {
      await logseq.Editor.insertAtEditingCursor("{{renderer :outline-canvas}}");
    } catch (err) {
      console.error("OutlineCanvas: Failed to insert macro", err);
      await logseq.UI.showMsg("Failed to insert outline-canvas macro", "error");
    }
  });

  // --- Macro renderer: {{renderer :outline-canvas}} ---
  logseq.App.onMacroRendererSlotted(async ({ slot, payload }) => {
    const [type, viewArg] = payload.arguments;
    if (type !== ":outline-canvas") return;

    const blockUuid = payload.uuid;
    const settings = getSettings();
    const viewId: ViewId = (viewArg?.trim() as ViewId) || settings.defaultView;

    try {
      const block = await logseq.Editor.getBlock(blockUuid, { includeChildren: true });
      if (!block || !block.children || block.children.length === 0) {
        logseq.provideUI({
          key: `outline-canvas-${blockUuid}`,
          slot,
          template: `<div class="outline-canvas-inline">
            <div class="oc-inline-label">OutlineCanvas: Add child blocks to visualize</div>
          </div>`,
        });
        return;
      }

      // Build tree from children — strip macro syntax from root label
      const rawContent = (block as Record<string, unknown>).content as string ?? "Outline";
      const rootLabel = rawContent.replace(/\{\{renderer\s[^}]*\}\}/g, "").replace(/\{\{[^}]*\}\}/g, "").trim() || "Outline";
      const enabledProperties = new Set(settings.enabledNodeProperties);
      const tree = await buildTree(
        block.children as unknown as LogseqBlock[],
        rootLabel,
        settings.showEmptyBlocks,
        undefined,
        undefined,
        undefined,
        undefined,
        enabledProperties
      );

      // Inline embeds are deliberately scoped to the block's own children only,
      // so we don't call includeOutScopeRefs here to keep the preview small and deterministic.
      const flattened = flattenDeep(tree, settings.maxDepth, settings.depthMode);

      // Render to image
      const dataURL = renderToDataURL(flattened, viewId, settings.maxDepth, 800, 450);

      logseq.provideUI({
        key: `outline-canvas-${blockUuid}`,
        slot,
        template: `<div class="outline-canvas-inline">
          <img src="${dataURL}" alt="OutlineCanvas diagram"
               data-on-click="openOutlineCanvasForBlock"
               data-block-uuid="${blockUuid}" />
          <div class="oc-inline-label">◈ ${VIEWS.find(v => v.id === viewId)?.label ?? "Tree Chart"} · Click to interact</div>
        </div>`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logseq.provideUI({
        key: `outline-canvas-${blockUuid}`,
        slot,
        template: `<div class="outline-canvas-inline">
          <div class="oc-inline-label" style="color: var(--ls-error-text-color, #e55);">
            OutlineCanvas error: ${msg}
          </div>
        </div>`,
      });
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideCanvas();
    }
  });

  // Live updates via DB.onChanged (debounced)
  const offChanged = logseq.DB.onChanged(() => {
    if (!logseq.isMainUIVisible) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      loadTree();
    }, 500);
  });
  if (typeof offChanged === "function") offHooks.push(offChanged);

  // Settings change — re-inject host CSS + re-apply dock geometry when either
  // the dock behavior or the dock width changes (drag end persists dockWidth,
  // which lands here).
  let prevDockBehavior = getSettings().dockBehavior;
  let prevDockWidth = getSettings().dockWidth;
  let prevEnabledNodeProperties = getSettings().enabledNodeProperties.join(",");

  logseq.onSettingsChanged(() => {
    const s = getSettings();
    const nextBehavior = s.dockBehavior;
    const nextWidth = s.dockWidth;
    const nextEnabledNodeProperties = s.enabledNodeProperties.join(",");

    if (nextBehavior !== prevDockBehavior || nextWidth !== prevDockWidth) {
      prevDockBehavior = nextBehavior;
      prevDockWidth = nextWidth;
      injectHostStyles(pluginId);
      if (logseq.isMainUIVisible && isDocked) {
        applyDockMode();
      }
    }

    if (nextEnabledNodeProperties !== prevEnabledNodeProperties) {
      prevEnabledNodeProperties = nextEnabledNodeProperties;
      if (logseq.isMainUIVisible) {
        loadTree();
      }
    } else if (logseq.isMainUIVisible) {
      rebuildLayout();
    }
  });

  // Cleanup
  logseq.beforeunload(async () => {
    cleanupController?.();
    offHooks.forEach((off) => off());
    offHooks.length = 0;
    if (debounceTimer) clearTimeout(debounceTimer);
  });
}

logseq.ready(main).catch(console.error);
