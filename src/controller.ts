import type { Transform, LayoutResult } from "./types";

const MIN_SCALE = 0.05;
const MAX_SCALE = 10;
const ZOOM_STEP = 0.2;

export interface ControllerState {
  transform: Transform;
  isDragging: boolean;
  lastPointerX: number;
  lastPointerY: number;
}

export function createState(): ControllerState {
  return {
    transform: { ox: 0, oy: 0, scale: 1 },
    isDragging: false,
    lastPointerX: 0,
    lastPointerY: 0,
  };
}

/** Calculate transform to fit bounds within viewport with padding */
export function fitToView(
  bounds: LayoutResult["bounds"],
  viewW: number,
  viewH: number,
  padding: number = 40
): Transform {
  const scaleX = (viewW - padding * 2) / bounds.w;
  const scaleY = (viewH - padding * 2) / bounds.h;
  const scale = Math.min(scaleX, scaleY, 2); // cap at 2x

  const ox = (viewW - bounds.w * scale) / 2 - bounds.x * scale;
  const oy = (viewH - bounds.h * scale) / 2 - bounds.y * scale;

  return { ox, oy, scale };
}

/** Zoom toward a point by a factor */
export function zoomAt(
  t: Transform,
  cx: number,
  cy: number,
  factor: number
): Transform {
  const newScale = clampScale(t.scale * factor);
  const ratio = newScale / t.scale;
  return {
    ox: cx - (cx - t.ox) * ratio,
    oy: cy - (cy - t.oy) * ratio,
    scale: newScale,
  };
}

/** Step zoom in */
export function zoomIn(t: Transform, cx: number, cy: number): Transform {
  return zoomAt(t, cx, cy, 1 + ZOOM_STEP);
}

/** Step zoom out */
export function zoomOut(t: Transform, cx: number, cy: number): Transform {
  return zoomAt(t, cx, cy, 1 / (1 + ZOOM_STEP));
}

function clampScale(s: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
}

/** Attach pointer and wheel handlers to a canvas element */
export function attachHandlers(
  canvas: HTMLCanvasElement,
  state: ControllerState,
  onTransformChange: () => void
): () => void {
  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    state.isDragging = true;
    state.lastPointerX = e.clientX;
    state.lastPointerY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  }

  function onPointerMove(e: PointerEvent): void {
    if (!state.isDragging) return;
    const dx = e.clientX - state.lastPointerX;
    const dy = e.clientY - state.lastPointerY;
    state.lastPointerX = e.clientX;
    state.lastPointerY = e.clientY;
    state.transform.ox += dx;
    state.transform.oy += dy;
    onTransformChange();
  }

  function onPointerUp(e: PointerEvent): void {
    if (!state.isDragging) return;
    state.isDragging = false;
    canvas.releasePointerCapture(e.pointerId);
    canvas.style.cursor = "grab";
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    state.transform = zoomAt(state.transform, cx, cy, factor);
    onTransformChange();
  }

  function onKeyDown(e: KeyboardEvent): void {
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    switch (e.key) {
      case "+":
      case "=":
        state.transform = zoomIn(state.transform, cx, cy);
        onTransformChange();
        break;
      case "-":
        state.transform = zoomOut(state.transform, cx, cy);
        onTransformChange();
        break;
      case "ArrowUp":
        state.transform.oy += 40;
        onTransformChange();
        break;
      case "ArrowDown":
        state.transform.oy -= 40;
        onTransformChange();
        break;
      case "ArrowLeft":
        state.transform.ox += 40;
        onTransformChange();
        break;
      case "ArrowRight":
        state.transform.ox -= 40;
        onTransformChange();
        break;
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);
  canvas.tabIndex = 0;
  canvas.style.cursor = "grab";
  canvas.style.touchAction = "none";
  canvas.style.outline = "none";

  // Cleanup function
  return () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKeyDown);
  };
}
