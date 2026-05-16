import "@logseq/libs";
import type { ViewId, ViewDef, RenderElement, TreeNode, LayoutResult } from "./types";
import { registerSettings, getSettings } from "./settings";
import { fetchTree, fetchBlockTree, flattenDeep, buildTree, filterIntraTreeRefs } from "./adapter";
import type { LogseqBlock } from "./adapter";
import { buildEdgeElements, buildEdgeLabels } from "./views/edges";
import { buildBadges, buildFocusHalo } from "./views/badges";
import { render, hitTest } from "./renderer";
import { createState, fitToView, zoomIn, zoomOut, attachHandlers } from "./controller";
import { buildUI, STYLES, setActiveView, applyThemeToUI, updateDockButton, applyPlatformClass, updateFullscreenClass } from "./ui";
import { setTheme } from "./colors";
import { renderToDataURL, exportCurrentViewAsDataURL } from "./offscreen";
import { layoutTreeChart } from "./views/tree-chart";
import { layoutTreeTable } from "./views/tree-table";
import { layoutRoadmapAlt, layoutRoadmapLinear } from "./views/roadmap";
import { layoutMindMap } from "./views/mind-map";
import { layoutRightTree } from "./views/right-tree";
import { layoutFishbone } from "./views/fishbone";
import { layoutTreemap, treemapHitBoxes } from "./views/treemap";

const VIEWS: ViewDef[] = [
  { id: "tree", label: "Tree Chart", icon: "⎅", layout: layoutTreeChart },
  { id: "table", label: "Tree Table", icon: "⊟", layout: layoutTreeTable },
  { id: "roadmap_alt", label: "Roadmap ↕", icon: "⟿", layout: layoutRoadmapAlt },
  { id: "roadmap", label: "Roadmap →", icon: "→", layout: layoutRoadmapLinear },
  { id: "mind", label: "Mind Map", icon: "◎", layout: layoutMindMap },
  { id: "rtree", label: "Right Tree", icon: "⊳", layout: layoutRightTree },
  { id: "fish", label: "Fishbone", icon: "⟜", layout: layoutFishbone },
  { id: "tmap", label: "Treemap", icon: "▦", layout: layoutTreemap },
];

// Plugin state
let activeView: ViewId = "tree";
let currentTree: TreeNode | null = null;
let currentDisplayTree: TreeNode | null = null;
let currentLayout: LayoutResult | null = null;
let focusedUuid: string | null = null;
let currentElements: RenderElement[] = [];
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let controllerState = createState();
let cleanupController: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isDocked = true; // default to docked mode

/**
 * Logseq persists plugin container layout and silently ignores
 * setMainUIInlineStyle's position/size keys once `data-inited_layout` is set
 * (see libs/src/LSPlugin.core.ts main-ui:style handler). Apply our dock /
 * full-screen styles directly to the container instead — bypasses both the
 * gate and the async Postmate round-trip.
 */
function getPluginContainer(): HTMLElement | null {
  try {
    const id = (logseq as { baseInfo?: { id?: string } }).baseInfo?.id;
    const doc = parent.document;
    const byPid = id
      ? (doc.querySelector(`.lsp-iframe-sandbox-container[data-pid="${id}"]`) as HTMLElement | null)
      : null;
    if (byPid) return byPid;
    return (window.frameElement?.parentElement as HTMLElement | null) ?? null;
  } catch {
    return null;
  }
}

function camelToKebab(k: string): string {
  return k.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function setContainerStyle(style: Partial<CSSStyleDeclaration>): void {
  const el = getPluginContainer();
  if (!el) {
    logseq.setMainUIInlineStyle(style as Record<string, string>);
    return;
  }
  if (el.dataset?.inited_layout) delete el.dataset.inited_layout;
  Object.entries(style).forEach(([k, v]) => {
    el.style.setProperty(camelToKebab(k), String(v), "important");
  });
}

function getCanvasSize(): { w: number; h: number } {
  const rect = canvas!.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function redraw(): void {
  if (!canvas || !ctx) return;
  const { w, h } = getCanvasSize();
  render(ctx, currentElements, controllerState.transform, w, h);
}

/**
 * Compose the flat RenderElement list from the cached layout, current focus,
 * and badges/halo. Cheap — called on every focus change or theme refresh.
 * Caller is responsible for triggering a redraw afterward.
 */
function composeElements(): void {
  if (!currentDisplayTree || !currentLayout) {
    currentElements = currentLayout?.elements ?? [];
    return;
  }
  const settings = getSettings();
  const rects = currentLayout.nodeRectsByUuid;
  const wantOverlay = settings.showRelationships && !!rects;

  const overlay = wantOverlay
    ? buildEdgeElements(currentDisplayTree, rects!, focusedUuid)
    : [];
  const labels = wantOverlay && settings.showRelationshipLabels
    ? buildEdgeLabels(currentDisplayTree, rects!, focusedUuid)
    : [];
  const badges = wantOverlay
    ? buildBadges(currentDisplayTree, rects!)
    : [];
  const halo = wantOverlay
    ? buildFocusHalo(focusedUuid, rects!)
    : [];

  // Render order (low → high z): halo, layout elements, edges, labels, badges.
  currentElements = [...halo, ...currentLayout.elements, ...overlay, ...labels, ...badges];
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

  const { w, h } = getCanvasSize();
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

async function loadTree(blockUuid?: string): Promise<void> {
  const settings = getSettings();
  currentTree = blockUuid
    ? await fetchBlockTree(blockUuid, settings.showEmptyBlocks)
    : await fetchTree(settings.showEmptyBlocks);

  // New tree → previous focus may not exist anymore.
  focusedUuid = null;

  if (currentTree) {
    rebuildLayout();
  }
}

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

// --- Dock / Full-screen mode ---

let sidebarWasOpen = false;
let dockRefineTimer: ReturnType<typeof setTimeout> | null = null;

function setDockedStyle(): void {
  // Default geometry: right 40vw stripe. parent.document access is blocked
  // cross-origin for web-URL-installed plugins, so we silently fall back.
  // For same-origin installs (dotdir), we refine to the sidebar's exact rect.
  let geom: Partial<CSSStyleDeclaration> = {
    top: "0",
    right: "0",
    left: "auto",
    width: "40vw",
    height: "100vh",
  };
  try {
    const sidebar = parent.document.getElementById("right-sidebar-container");
    if (sidebar && sidebar.offsetWidth > 50) {
      const rect = sidebar.getBoundingClientRect();
      geom = {
        top: `${Math.round(rect.top)}px`,
        left: `${Math.round(rect.left)}px`,
        right: "auto",
        width: `${Math.round(rect.width)}px`,
        height: `${Math.round(rect.height)}px`,
      };
    }
  } catch { /* cross-origin — stick with 40vw fallback */ }
  setContainerStyle({ position: "fixed", zIndex: "999", borderLeft: "none", ...geom });
}

async function applyDockMode(): Promise<void> {
  if (dockRefineTimer) {
    clearTimeout(dockRefineTimer);
    dockRefineTimer = null;
  }
  if (isDocked) {
    // Remember if sidebar was already open
    sidebarWasOpen = await isSidebarOpen();

    // Open Logseq's right sidebar so the app layout makes room for our iframe.
    // The provideStyle :has() rule auto-hides the sidebar contents while our
    // iframe is visible — no DOM mutation needed (iframe is cross-origin).
    logseq.App.setRightSidebarVisible(true);

    // Set initial position immediately (visible right away)
    setDockedStyle();

    // Refine position after sidebar finishes opening
    dockRefineTimer = setTimeout(() => {
      dockRefineTimer = null;
      if (!isDocked) return;
      setDockedStyle();
      if (currentTree) rebuildLayout();
    }, 300);
  } else {
    // Full-screen mode
    setContainerStyle({
      position: "fixed",
      zIndex: "999",
      top: "0",
      left: "0",
      right: "auto",
      width: "100vw",
      height: "100vh",
      borderLeft: "none",
    });
    // (Sidebar auto-unhides when our iframe loses its .visible class)
  }
  updateDockButton(isDocked);
  updateFullscreenClass(isDocked);
  setTimeout(() => {
    if (currentTree) rebuildLayout();
  }, 100);
}

async function isSidebarOpen(): Promise<boolean> {
  try {
    const sidebar = parent.document.getElementById("right-sidebar-container");
    return sidebar !== null && sidebar.offsetWidth > 0;
  } catch {
    return false;
  }
}

function hideCanvas(): void {
  logseq.hideMainUI({ restoreEditingCursor: true });
  if (isDocked && !sidebarWasOpen) {
    logseq.App.setRightSidebarVisible(false);
  }
}

function toggleDockMode(): void {
  isDocked = !isDocked;
  applyDockMode();
}

function setupCanvas(): void {
  canvas = document.getElementById("oc-canvas") as HTMLCanvasElement;
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  if (!ctx) return;

  const resizeObserver = new ResizeObserver(() => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas!.getBoundingClientRect();
    canvas!.width = rect.width * dpr;
    canvas!.height = rect.height * dpr;
    redraw();
  });
  resizeObserver.observe(canvas);

  controllerState = createState();
  cleanupController = attachHandlers(canvas, controllerState, redraw);

  // Click on a node: focus its relationships AND navigate Logseq to the block.
  // Click on empty canvas: clear focus (edges fade out).
  canvas.addEventListener("click", async (e) => {
    if (controllerState.isDragging) return;
    const rect = canvas!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = hitTest(currentElements, cx, cy, controllerState.transform);
    if (hit?.uuid) {
      setFocus(hit.uuid);
      const block = await logseq.Editor.getBlock(hit.uuid);
      if (block) {
        const page = await logseq.Editor.getPage((block as Record<string, unknown>).page as number);
        const pageName = (page as Record<string, unknown>)?.originalName as string
          ?? (page as Record<string, unknown>)?.name as string ?? "";
        if (pageName) {
          await logseq.Editor.scrollToBlockInPage(pageName, hit.uuid);
        }
      }
    } else {
      setFocus(null);
    }
  });

  // Treemap breadcrumb hover
  canvas.addEventListener("mousemove", (e) => {
    if (activeView !== "tmap" || !treemapHitBoxes.length) return;
    const bcEl = document.getElementById("oc-breadcrumb");
    if (!bcEl) return;

    const rect = canvas!.getBoundingClientRect();
    const mx = (e.clientX - rect.left - controllerState.transform.ox) / controllerState.transform.scale;
    const my = (e.clientY - rect.top - controllerState.transform.oy) / controllerState.transform.scale;

    let found: (typeof treemapHitBoxes)[0] | null = null;
    for (let i = treemapHitBoxes.length - 1; i >= 0; i--) {
      const h = treemapHitBoxes[i];
      if (mx >= h.x && mx <= h.x + h.w && my >= h.y && my <= h.y + h.h) {
        found = h;
        break;
      }
    }

    if (found) {
      bcEl.textContent = found.path.join(" → ");
      bcEl.classList.add("oc-show");
    } else {
      bcEl.classList.remove("oc-show");
    }
  });

  // Delegated click handler on #app in capture phase. Covers both the
  // toolbar controls (by id) and the view switcher buttons (by class).
  const app = document.getElementById("app");
  app?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest("button") as HTMLButtonElement | null;
    if (!btn) return;
    if (btn.classList.contains("oc-vb")) {
      const viewId = btn.getAttribute("data-view") as ViewId | null;
      if (viewId) switchView(viewId);
      return;
    }
    switch (btn.id) {
      case "oc-close": hideCanvas(); break;
      case "oc-dock-toggle": toggleDockMode(); break;
      case "oc-zoom-in": {
        const { w, h } = getCanvasSize();
        controllerState.transform = zoomIn(controllerState.transform, w / 2, h / 2);
        redraw();
        break;
      }
      case "oc-zoom-out": {
        const { w, h } = getCanvasSize();
        controllerState.transform = zoomOut(controllerState.transform, w / 2, h / 2);
        redraw();
        break;
      }
      case "oc-fit": rebuildLayout(); break;
      case "oc-export": exportCurrentView(); break;
      case "oc-copy": copyCurrentView(); break;
    }
  }, true);
}

/**
 * Capture the current view as a PNG (WYSIWYG — uses the live transform and
 * canvas dimensions). Includes both `depends_on` and `relates_to` edges
 * regardless of focus / showRelationships. Triggers a browser download.
 */
function exportCurrentView(): void {
  if (!currentDisplayTree || !currentLayout) return;
  const settings = getSettings();
  const { w, h } = getCanvasSize();
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
  const { w, h } = getCanvasSize();
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

function setupUI(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = buildUI(VIEWS, activeView);
  setupCanvas();
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

  // CSS — injected into parent frame
  const pluginId = (logseq as { baseInfo?: { id?: string } }).baseInfo?.id ?? "";
  logseq.provideStyle(`
    .outline-canvas-btn {
      display: flex;
      align-items: center;
    }
    /* Hide Logseq's right sidebar while our plugin iframe is visible. The
       iframe is cross-origin from Logseq when installed from a URL, so we
       can't mutate the parent DOM; this host-side :has() rule reacts to the
       container's .visible class automatically. Required for click-through:
       .cp__right-sidebar-topbar has -webkit-app-region: drag which silently
       eats clicks on macOS, so hiding the sidebar is what keeps the right-
       side toolbar buttons (maximize, close) clickable. */
    body:has(.lsp-iframe-sandbox-container.visible[data-pid="${pluginId}"]) #right-sidebar {
      visibility: hidden !important;
    }
    .outline-canvas-inline {
      width: 100%;
      padding: 8px 0;
      cursor: pointer;
    }
    .outline-canvas-inline img {
      width: 100%;
      height: auto;
      border-radius: 8px;
      border: 1px solid var(--ls-border-color, #333);
      transition: border-color 0.15s;
    }
    .outline-canvas-inline img:hover {
      border-color: var(--ls-link-ref-text-color, #46a758);
    }
    .outline-canvas-inline .oc-inline-label {
      font-size: 11px;
      color: var(--ls-secondary-text-color, #888);
      margin-top: 4px;
      text-align: center;
    }
  `);

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
  applyThemeToUI();
  applyPlatformClass();

  // Model for click handlers
  logseq.provideModel({
    async openOutlineCanvas() {
      await applyDockMode();
      logseq.showMainUI({ autoFocus: true });
      await loadTree();
    },
    async openOutlineCanvasForBlock(e: { dataset: Record<string, string> }) {
      const uuid = e.dataset.blockUuid;
      if (uuid) {
        await applyDockMode();
        logseq.showMainUI({ autoFocus: true });
        await loadTree(uuid);
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
    async () => {
      if (logseq.isMainUIVisible) {
        // Toggle dock/full when already open
        toggleDockMode();
      } else {
        await applyDockMode();
        logseq.showMainUI({ autoFocus: true });
        await loadTree();
      }
    }
  );

  // Slash command — opens focused on current block (interactive overlay)
  logseq.Editor.registerSlashCommand("outline", async () => {
    const block = await logseq.Editor.getCurrentBlock();
    await applyDockMode();
    logseq.showMainUI({ autoFocus: true });
    if (block) {
      await loadTree(block.uuid);
    } else {
      await loadTree();
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
      const tree = await buildTree(
        block.children as unknown as LogseqBlock[],
        rootLabel,
        settings.showEmptyBlocks
      );
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
          <div class="oc-inline-label">◈ ${escapeHtml(VIEWS.find(v => v.id === viewId)?.label ?? "Tree Chart")} · Click to interact</div>
        </div>`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      logseq.provideUI({
        key: `outline-canvas-${blockUuid}`,
        slot,
        template: `<div class="outline-canvas-inline">
          <div class="oc-inline-label" style="color: var(--ls-error-text-color, #e55);">
            OutlineCanvas error: ${escapeHtml(msg)}
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

  // Settings change
  logseq.onSettingsChanged(() => {
    if (logseq.isMainUIVisible) {
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
