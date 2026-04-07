import type { ViewId, ViewDef } from "./types";

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
      <div class="oc-toolbar">
        <div class="oc-views">${viewButtons}</div>
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
  --oc-bg: #0d0f14;
  --oc-surface: #1e1f24;
  --oc-border: #2b2d35;
  --oc-border2: #363842;
  --oc-text: #b0b4ba;
  --oc-text-muted: #6f7380;
  --oc-accent: #46a758;
  --oc-accent-dim: #46a75820;
  --oc-accent-text: #7ccf8e;
  --oc-radius: 6px;
  --oc-font: 'IBM Plex Mono', 'SF Mono', monospace;
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
}

.oc-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--oc-border);
  flex-shrink: 0;
}

.oc-views {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
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
