import "@logseq/libs";
import type { ViewId, ViewDef, RenderElement, TreeNode } from "./types";
import { registerSettings, getSettings } from "./settings";
import { fetchTree, fetchBlockTree, flattenDeep } from "./adapter";
import { render, hitTest } from "./renderer";
import { createState, fitToView, zoomIn, zoomOut, attachHandlers } from "./controller";
import { buildUI, STYLES, setActiveView, applyThemeToUI } from "./ui";
import { setTheme } from "./colors";
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
  const tree = flattenDeep(currentTree, settings.maxDepth);
  const view = VIEWS.find((v) => v.id === activeView)!;
  const result = view.layout(tree, settings.maxDepth);
  currentElements = result.elements;

  // Auto fit-to-view
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

function setupCanvas(): void {
  canvas = document.getElementById("oc-canvas") as HTMLCanvasElement;
  if (!canvas) return;
  ctx = canvas.getContext("2d");
  if (!ctx) return;

  // HiDPI setup handled in render()
  const resizeObserver = new ResizeObserver(() => {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas!.getBoundingClientRect();
    canvas!.width = rect.width * dpr;
    canvas!.height = rect.height * dpr;
    redraw();
  });
  resizeObserver.observe(canvas);

  // Pan/zoom controller
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
    rebuildLayout(); // re-fits to view
  });

  // Close button
  document.getElementById("oc-close")?.addEventListener("click", () => {
    logseq.hideMainUI({ restoreEditingCursor: true });
  });
}

function setupUI(): void {
  const app = document.getElementById("app");
  if (!app) return;

  app.innerHTML = buildUI(VIEWS, activeView);
  setupCanvas();

  // View switch buttons
  app.querySelectorAll(".oc-vb").forEach((btn) => {
    btn.addEventListener("click", () => {
      const viewId = btn.getAttribute("data-view") as ViewId;
      if (viewId) switchView(viewId);
    });
  });
}

async function main(): Promise<void> {
  console.log("OutlineCanvas loaded!");
  const offHooks: Array<() => void> = [];

  // Settings
  registerSettings();

  // Set default view from settings
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
  `);

  // Main UI panel setup
  logseq.setMainUIInlineStyle({
    position: "fixed",
    zIndex: "999",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
  });

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

  // Model for toolbar click handler
  logseq.provideModel({
    async openOutlineCanvas() {
      logseq.showMainUI({ autoFocus: true });
      await loadTree();
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
      logseq.showMainUI({ autoFocus: true });
      await loadTree();
    }
  );

  // Slash command — opens focused on current block
  logseq.Editor.registerSlashCommand("outline", async () => {
    const block = await logseq.Editor.getCurrentBlock();
    logseq.showMainUI({ autoFocus: true });
    if (block) {
      await loadTree(block.uuid);
    } else {
      await loadTree();
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      logseq.hideMainUI({ restoreEditingCursor: true });
    }
    if (e.key === "0" && !e.ctrlKey && !e.metaKey) {
      rebuildLayout();
    }
  });

  // Close when clicking outside canvas area
  document.addEventListener("mousedown", (e) => {
    const target = e.target as HTMLElement;
    if (!target.closest(".oc-root")) {
      logseq.hideMainUI({ restoreEditingCursor: true });
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
