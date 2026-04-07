import type { RenderElement, Transform } from "./types";
import { BG, FONT } from "./colors";
import { wrapText, LINE_HEIGHT, TEXT_PAD_X, TEXT_PAD_Y } from "./text";

/** Draw all elements to a canvas context with the given transform */
export function render(
  ctx: CanvasRenderingContext2D,
  elements: RenderElement[],
  transform: Transform,
  width: number,
  height: number
): void {
  const dpr = window.devicePixelRatio || 1;

  // Clear
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // Apply pan/zoom
  ctx.translate(transform.ox, transform.oy);
  ctx.scale(transform.scale, transform.scale);

  // Draw each element
  for (const el of elements) {
    switch (el.type) {
      case "box":
        drawBox(ctx, el);
        break;
      case "line":
        drawLine(ctx, el);
        break;
      case "curve":
        drawCurve(ctx, el);
        break;
      case "text":
        drawText(ctx, el);
        break;
      case "dot":
        drawDot(ctx, el);
        break;
    }
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  el: Extract<RenderElement, { type: "box" }>
): void {
  ctx.beginPath();
  ctx.roundRect(el.x, el.y, el.w, el.h, el.rad);

  if (el.fill) {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }

  if (el.stroke) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.lw;
    if (el.dash) {
      ctx.setLineDash(el.dash);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (el.text) {
    const fontSize = el.textSize ?? 12;
    const fontWeight = el.textWeight ?? 400;
    ctx.fillStyle = el.textColor ?? "#edeef0";
    ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const maxTextWidth = el.w - TEXT_PAD_X * 2;
    const lines = wrapText(el.text, maxTextWidth, fontSize, fontWeight);
    const lineH = fontSize * LINE_HEIGHT;
    const textBlockH = lines.length * lineH;
    const startY = el.y + (el.h - textBlockH) / 2 + TEXT_PAD_Y / 2;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], el.x + el.w / 2, startY + i * lineH);
    }
  }
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  el: Extract<RenderElement, { type: "line" }>
): void {
  ctx.beginPath();
  ctx.moveTo(el.x1, el.y1);
  ctx.lineTo(el.x2, el.y2);
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.lw;
  ctx.stroke();
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  el: Extract<RenderElement, { type: "curve" }>
): void {
  ctx.beginPath();
  ctx.moveTo(el.x1, el.y1);
  ctx.bezierCurveTo(el.cx1, el.cy1, el.cx2, el.cy2, el.x2, el.y2);
  ctx.strokeStyle = el.color;
  ctx.lineWidth = el.lw;
  ctx.stroke();
}

function drawText(
  ctx: CanvasRenderingContext2D,
  el: Extract<RenderElement, { type: "text" }>
): void {
  ctx.fillStyle = el.color;
  ctx.font = `${el.weight} ${el.size}px ${FONT}`;
  ctx.textAlign = el.align ?? "left";
  ctx.textBaseline = el.baseline ?? "top";
  ctx.fillText(el.text, el.x, el.y);
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  el: Extract<RenderElement, { type: "dot" }>
): void {
  ctx.beginPath();
  ctx.arc(el.x, el.y, el.r, 0, Math.PI * 2);
  ctx.fillStyle = el.color;
  ctx.fill();
}

/** Hit-test: find the topmost box element at canvas coordinates */
export function hitTest(
  elements: RenderElement[],
  cx: number,
  cy: number,
  transform: Transform
): Extract<RenderElement, { type: "box" }> | null {
  // Convert canvas coords to logical coords
  const lx = (cx - transform.ox) / transform.scale;
  const ly = (cy - transform.oy) / transform.scale;

  // Iterate in reverse (topmost first)
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (
      el.type === "box" &&
      el.uuid &&
      lx >= el.x &&
      lx <= el.x + el.w &&
      ly >= el.y &&
      ly <= el.y + el.h
    ) {
      return el;
    }
  }
  return null;
}
