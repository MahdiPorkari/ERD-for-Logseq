import type { ViewId, ViewDef } from "./types";
import { theme } from "./colors";

// Tabler Icons (https://tabler-icons.io) — same library Logseq uses, so the
// plugin's iconography matches the host UI. Inlined here because the plugin
// iframe is cross-origin and can't share Logseq's icon CSS. Stroke uses
// currentColor so icons pick up the button color + hover state automatically.
const ICON_DOWNLOAD = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/></svg>`;

const ICON_COPY = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8m0 2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-8a2 2 0 0 1 -2 -2z"/><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2"/></svg>`;

const ICON_REFRESH = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>`;

/** Build the HTML for the main UI panel (injected into #app in the iframe) */
export function buildUI(views: ViewDef[], activeView: ViewId): string {
  const viewButtons = views
    .map(
      (v) =>
        `<button class="oc-vb${v.id === activeView ? " oc-vb--active" : ""}" data-view="${v.id}" title="${v.label}">
          <span class="oc-vb-icon">${v.icon}</span>
          <span class="oc-vb-label">${v.label}</span>
        </button>`
    )
    .join("");

  return `
    <div class="oc-root">
      <div class="oc-resize-handle" id="oc-resize-handle" title="Drag to resize canvas"></div>
      <div class="oc-toolbar">
        <div class="oc-views">${viewButtons}</div>
        <div class="oc-toolbar-right">
          <button class="oc-ctrl oc-ctrl--icon" id="oc-refresh" title="Refresh index and re-render">${ICON_REFRESH}</button>
          <button class="oc-ctrl oc-ctrl--icon" id="oc-copy" title="Copy current view to clipboard">${ICON_COPY}</button>
          <button class="oc-ctrl oc-ctrl--icon" id="oc-export" title="Download current view as PNG">${ICON_DOWNLOAD}</button>
          <button class="oc-ctrl" id="oc-dock-toggle" title="Toggle docked/full-screen">⊟</button>
          <button class="oc-close" id="oc-close" title="Close (Esc)">✕</button>
        </div>
      </div>
      <div class="oc-canvas-wrap">
        <canvas id="oc-canvas"></canvas>
        <div class="oc-breadcrumb" id="oc-breadcrumb"></div>
        <div class="oc-controls">
          <button class="oc-ctrl" id="oc-zoom-in" title="Zoom in (+)">+</button>
          <button class="oc-ctrl" id="oc-zoom-out" title="Zoom out (-)">−</button>
          <button class="oc-ctrl" id="oc-fit" title="Fit to view (0)">⊞</button>
        </div>
      </div>
    </div>
  `;
}

/** CSS styles for the plugin UI */
export const STYLES = `
:root {
  --oc-radius: 6px;
  --oc-font: 'IBM Plex Mono', 'SF Mono', monospace;
}

html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
}

:root.oc-dark {
  --oc-bg: #0d0f14;
  --oc-surface: #1e1f24;
  --oc-border: #2b2d35;
  --oc-border2: #363842;
  --oc-text: #b0b4ba;
  --oc-text-muted: #6f7380;
  --oc-accent: #46a758;
  --oc-accent-dim: #46a75820;
  --oc-accent-text: #7ccf8e;
}

:root.oc-light {
  --oc-bg: #f8f9fa;
  --oc-surface: #ffffff;
  --oc-border: #d8dae0;
  --oc-border2: #c0c3cc;
  --oc-text: #3a3a4a;
  --oc-text-muted: #8888a0;
  --oc-accent: #388e3c;
  --oc-accent-dim: #46a75818;
  --oc-accent-text: #2d7a30;
}

.oc-root {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--oc-bg);
  font-family: -apple-system, 'SF Pro', system-ui, sans-serif;
  color: var(--oc-text);
  overflow: hidden;
  position: relative;
}

/* Drag handle along the iframe's left edge. Slim (5px) so it doesn't intrude
   on content; widens visually on hover. Hidden in full-screen mode where
   width is fixed at 100vw. */
.oc-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  width: 5px;
  height: 100%;
  cursor: ew-resize;
  z-index: 200;
  background: transparent;
  transition: background 0.12s;
}
.oc-resize-handle:hover,
.oc-resize-handle.oc-dragging {
  background: var(--oc-accent-dim);
}
.oc-fullscreen .oc-resize-handle {
  display: none;
}

.oc-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--oc-border);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* macOS in full-screen mode: the iframe covers the whole window, so the
   native window controls (traffic lights, ~70px wide at top-left) draw on
   top of our toolbar. Reserve that space so they don't occlude the first
   view button. Docked mode doesn't need this — the iframe is on the right. */
.oc-fullscreen.oc-platform-mac .oc-toolbar {
  padding-left: 84px;
}

.oc-views {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.oc-toolbar-right {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}

.oc-close {
  width: 28px;
  height: 28px;
  border-radius: var(--oc-radius);
  background: var(--oc-surface);
  border: 1px solid var(--oc-border);
  color: var(--oc-text-muted);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.12s;
}

.oc-close:hover {
  border-color: #e5484d;
  color: #ff9592;
  background: #e5484d18;
}

.oc-vb {
  padding: 5px 8px;
  border-radius: var(--oc-radius);
  font-size: 10px;
  font-weight: 500;
  background: var(--oc-surface);
  color: var(--oc-text-muted);
  border: 1px solid var(--oc-border);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.12s;
}

.oc-vb:hover {
  border-color: var(--oc-border2);
  color: var(--oc-text);
}

.oc-vb--active {
  background: var(--oc-accent-dim);
  border-color: var(--oc-accent);
  color: var(--oc-accent-text);
}

.oc-vb-icon {
  font-size: 13px;
}

.oc-canvas-wrap {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.oc-canvas-wrap canvas {
  display: block;
  width: 100%;
  height: 100%;
  transition: opacity 0.18s ease;
}

.oc-canvas-wrap canvas.oc-fading {
  opacity: 0;
}

.oc-breadcrumb {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 4px 10px;
  background: var(--oc-surface);
  border: 1px solid var(--oc-border);
  border-radius: var(--oc-radius);
  font-size: 11px;
  color: var(--oc-accent-text);
  font-family: var(--oc-font);
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
}

.oc-breadcrumb.oc-show {
  opacity: 1;
}

.oc-controls {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
}

.oc-ctrl {
  width: 28px;
  height: 28px;
  border-radius: var(--oc-radius);
  background: var(--oc-surface);
  border: 1px solid var(--oc-border);
  color: var(--oc-text-muted);
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.oc-ctrl:hover {
  border-color: var(--oc-border2);
  color: var(--oc-text);
}

.oc-ctrl--icon svg {
  display: block;
}
`;

/** Update the active view button in the toolbar */
export function setActiveView(container: Element, viewId: ViewId): void {
  container.querySelectorAll(".oc-vb").forEach((btn) => {
    btn.classList.toggle(
      "oc-vb--active",
      btn.getAttribute("data-view") === viewId
    );
  });
}

/** Apply the current theme mode to the UI CSS variables */
export function applyThemeToUI(): void {
  const mode = theme().mode;
  document.documentElement.classList.remove("oc-dark", "oc-light");
  document.documentElement.classList.add(mode === "light" ? "oc-light" : "oc-dark");
}

/** Update the dock toggle button icon based on current mode */
export function updateDockButton(isDocked: boolean): void {
  const btn = document.getElementById("oc-dock-toggle");
  if (btn) {
    btn.textContent = isDocked ? "⊞" : "⊟";
    btn.title = isDocked ? "Expand to full-screen" : "Dock to right side";
  }
}

/** Detect macOS so we can reserve space for native window controls in full-screen mode. */
export function applyPlatformClass(): void {
  try {
    const p = (navigator as { platform?: string }).platform ?? "";
    if (/Mac|iPhone|iPad/.test(p)) {
      document.documentElement.classList.add("oc-platform-mac");
    }
  } catch { /* navigator unavailable — skip */ }
}

/** Toggle the fullscreen class so platform-specific CSS (traffic-light padding) kicks in. */
export function updateFullscreenClass(isDocked: boolean): void {
  document.documentElement.classList.toggle("oc-fullscreen", !isDocked);
}
