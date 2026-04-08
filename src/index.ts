import "@logseq/libs";
import type { ViewId, ViewDef, RenderElement, TreeNode } from "./types";
import { registerSettings, getSettings } from "./settings";
import { fetchTree, fetchBlockTree, flattenDeep, buildTree } from "./adapter";
import { render, hitTest } from "./renderer";
import { createState, fitToView, zoomIn, zoomOut, attachHandlers } from "./controller";
import { buildUI, STYLES, setActiveView, applyThemeToUI, updateDockButton } from "./ui";
import { setTheme } from "./colors";
import { renderToDataURL } from "./offscreen";
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
let currentElements: RenderElement[] = [];
let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let controllerState = createState();
let cleanupController: (() => void) | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isDocked = true; // default to docked mode

function getCanvasSize(): { w: number; h: number } {
  if (!canvas) return { w: 800, h: 600 };
  const rect = canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function redraw(): void {
  if (!canvas || !ctx) return;
  const { w, h } = getCanvasSize();
  render(ctx, currentElements, controllerState.transform, w, h);
}

function rebuildLayout(): void {
  if (!currentTree) return;
  const settings = getSettings();
  const tree = flattenDeep(currentTree, settings.maxDepth, settings.depthMode);
  const view = VIEWS.find((v) => v.id === activeView)!;
  const result = view.layout(tree, settings.maxDepth);
  currentElements = result.elements;

  const { w, h } = getCanvasSize();
  controllerState.transform = fitToView(result.bounds, w, h);
  redraw();
}

async function loadTree(blockUuid?: string): Promise<void> {
  const settings = getSettings();
  currentTree = blockUuid
    ? await fetchBlockTree(blockUuid, settings.showEmptyBlocks)
    : await fetchTree(settings.showEmptyBlocks);

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

function setDockedStyle(): void {
  // Position iframe on the right, immediately visible
  logseq.setMainUIInlineStyle({
    position: "fixed",
    zIndex: "999",
    top: "0",
    right: "0",
    left: "auto",
    width: "40vw",
    height: "100vh",
    borderLeft: "none",
  });

  // Try to match the sidebar container's exact bounds
  try {
    const sidebar = parent.document.getElementById("right-sidebar-container");
    if (sidebar && sidebar.offsetWidth > 50) {
      const rect = sidebar.getBoundingClientRect();
      logseq.setMainUIInlineStyle({
        position: "fixed",
        zIndex: "999",
        top: `${Math.round(rect.top)}px`,
        left: `${Math.round(rect.left)}px`,
        right: "auto",
        width: `${Math.round(rect.width)}px`,
        height: `${Math.round(rect.height)}px`,
        borderLeft: "none",
      });
    }
  } catch {
    // Fallback to 40vw already set above
  }
}

async function applyDockMode(): Promise<void> {
  if (isDocked) {
    // Remember if sidebar was already open
    sidebarWasOpen = await isSidebarOpen();

    // Open Logseq's right sidebar so the app layout makes room
    logseq.App.setRightSidebarVisible(true);

    // Hide sidebar content so our canvas shows instead
    try {
      const sc = parent.document.getElementById("right-sidebar-container");
      sc?.classList.add("oc-sidebar-hidden");
    } catch { /* cross-origin safety */ }

    // Set initial position immediately (visible right away)
    setDockedStyle();

    // Refine position after sidebar finishes opening
    setTimeout(() => {
      setDockedStyle();
      if (currentTree) rebuildLayout();
    }, 300);
  } else {
    // Full-screen mode
    logseq.setMainUIInlineStyle({
      position: "fixed",
      zIndex: "999",
      top: "0",
      left: "0",
      right: "auto",
      width: "100vw",
      height: "100vh",
      borderLeft: "none",
    });
    // Restore sidebar content
    try {
      const sc = parent.document.getElementById("right-sidebar-container");
      sc?.classList.remove("oc-sidebar-hidden");
    } catch { /* cross-origin safety */ }
  }
  updateDockButton(isDocked);
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
  // Restore sidebar
  const sidebarContainer = parent.document.getElementById("right-sidebar-container");
  sidebarContainer?.classList.remove("oc-sidebar-hidden");
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

  // Click-to-navigate
  canvas.addEventListener("click", async (e) => {
    if (controllerState.isDragging) return;
    const rect = canvas!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = hitTest(currentElements, cx, cy, controllerState.transform);
    if (hit?.uuid) {
      const block = await logseq.Editor.getBlock(hit.uuid);
      if (block) {
        const page = await logseq.Editor.getPage((block as Record<string, unknown>).page as number);
        const pageName = (page as Record<string, unknown>)?.originalName as string
          ?? (page as Record<string, unknown>)?.name as string ?? "";
        if (pageName) {
          await logseq.Editor.scrollToBlockInPage(pageName, hit.uuid);
        }
      }
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

  // Zoom controls
  document.getElementById("oc-zoom-in")?.addEventListener("click", () => {
    const { w, h } = getCanvasSize();
    controllerState.transform = zoomIn(controllerState.transform, w / 2, h / 2);
    redraw();
  });
  document.getElementById("oc-zoom-out")?.addEventListener("click", () => {
    const { w, h } = getCanvasSize();
    controllerState.transform = zoomOut(controllerState.transform, w / 2, h / 2);
    redraw();
  });
  document.getElementById("oc-fit")?.addEventListener("click", () => {
    rebuildLayout();
  });

  // Close button
  document.getElementById("oc-close")?.addEventListener("click", () => {
    hideCanvas();
  });

  // Dock toggle button
  document.getElementById("oc-dock-toggle")?.addEventListener("click", () => {
    toggleDockMode();
  });
}

function setupUI(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = buildUI(VIEWS, activeView);
  setupCanvas();

  app.querySelectorAll(".oc-vb").forEach((btn) => {
    btn.addEventListener("click", () => {
      const viewId = btn.getAttribute("data-view") as ViewId;
      if (viewId) switchView(viewId);
    });
  });
}

// --- Macro Renderer ---

interface LogseqBlock {
  uuid: string;
  content?: string;
  title?: string;
  children?: LogseqBlock[];
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function main(): Promise<void> {
  console.log("OutlineCanvas loaded!");
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
  logseq.provideStyle(`
    .outline-canvas-btn {
      display: flex;
      align-items: center;
    }
    /* Hide sidebar content when canvas is docked over it */
    .oc-sidebar-hidden #right-sidebar {
      visibility: hidden;
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

  // Initial dock mode
  applyDockMode();

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

      // Build tree from children
      const tree = buildTree(
        block.children as unknown as LogseqBlock[],
        (block as Record<string, unknown>).content as string ?? "Outline",
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
    if (e.key === "0" && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName === "CANVAS") {
      rebuildLayout();
    }
  });

  // Close when clicking outside canvas area (only in full-screen mode)
  document.addEventListener("mousedown", (e) => {
    if (isDocked) return; // don't close on click-outside in docked mode
    const target = e.target as HTMLElement;
    if (!target.closest(".oc-root")) {
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

  console.log("OutlineCanvas ready!");
}

logseq.ready(main).catch(console.error);
