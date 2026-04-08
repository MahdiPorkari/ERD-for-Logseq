import { FONT } from "./colors";

/** Off-screen canvas for text measurement during layout */
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d")!;
  }
  return measureCtx;
}

/** Word-wrap text into lines that fit within maxWidth */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: number = 400
): string[] {
  const ctx = getMeasureCtx();
  ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;

  const words = text.split(/\s+/);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + " " + words[i];
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  return lines;
}

/** Line height multiplier for wrapped text */
export const LINE_HEIGHT = 1.4;

/** Padding inside a box around text (horizontal per side) */
export const TEXT_PAD_X = 8;

/** Padding inside a box around text (vertical per side) */
export const TEXT_PAD_Y = 6;

/**
 * Compute an adaptive box width based on text length.
 * Short text keeps the base width; longer text gets wider to keep
 * the box at a readable aspect ratio (~4 lines max).
 */
export function adaptiveWidth(
  text: string,
  baseWidth: number,
  fontSize: number,
  fontWeight: number = 400,
  maxWidth: number = 600
): number {
  const ctx = getMeasureCtx();
  ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
  const fullTextWidth = ctx.measureText(text).width;
  const textAreaWidth = baseWidth - TEXT_PAD_X * 2;

  // If text fits in one line at base width, keep it
  if (fullTextWidth <= textAreaWidth) return baseWidth;

  // Target max ~4 wrapped lines: width = fullTextWidth / targetLines
  const targetLines = 4;
  const idealTextWidth = fullTextWidth / targetLines;
  const idealBoxWidth = idealTextWidth + TEXT_PAD_X * 2;

  return Math.min(Math.max(idealBoxWidth, baseWidth), maxWidth);
}

/**
 * Compute the height a box needs to fit wrapped text.
 * Returns the total box height including vertical padding.
 */
export function measureBoxHeight(
  text: string,
  boxWidth: number,
  fontSize: number,
  fontWeight: number = 400,
  minHeight: number = 28
): number {
  const maxTextWidth = boxWidth - TEXT_PAD_X * 2;
  if (maxTextWidth <= 0) return minHeight;

  const lines = wrapText(text, maxTextWidth, fontSize, fontWeight);
  const lineH = fontSize * LINE_HEIGHT;
  const textBlockH = lines.length * lineH;
  const totalH = textBlockH + TEXT_PAD_Y * 2;

  return Math.max(totalH, minHeight);
}
