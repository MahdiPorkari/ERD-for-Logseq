import { FONT } from "./colors";

/** Measure the rendered pixel width of `text` at the given font. */
export type MeasureFn = (text: string, fontSize: number, fontWeight: number) => number;

/** Off-screen canvas for text measurement during layout */
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d")!;
  }
  return measureCtx;
}

/** Default measurer — uses a real canvas2d context. */
const canvasMeasure: MeasureFn = (text, fontSize, fontWeight) => {
  const ctx = getMeasureCtx();
  ctx.font = `${fontWeight} ${fontSize}px ${FONT}`;
  return ctx.measureText(text).width;
};

/** Characters where it's natural to break URLs and file paths. */
const BREAK_CHARS = "/?&=._-:";
const BREAK_RE = new RegExp(`[${BREAK_CHARS.replace(/[/\-]/g, "\\$&")}]`);

/**
 * Split a token wider than maxWidth into smaller chunks at URL/path separators
 * (keeping each separator at the end of its preceding chunk so breaks read
 * naturally). Falls back to character-wise splitting when no separator helps.
 */
function breakLongToken(
  token: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: number,
  measure: MeasureFn
): string[] {
  if (measure(token, fontSize, fontWeight) <= maxWidth) return [token];

  // Split on separators while keeping them attached to the preceding chunk.
  // Example: "a/b/c?d" → ["a/", "b/", "c?", "d"]
  const parts: string[] = [];
  let cursor = 0;
  for (let i = 0; i < token.length; i++) {
    if (BREAK_CHARS.includes(token[i])) {
      parts.push(token.slice(cursor, i + 1));
      cursor = i + 1;
    }
  }
  if (cursor < token.length) parts.push(token.slice(cursor));

  // No separators at all → character-break.
  if (parts.length === 1) {
    return charBreak(token, maxWidth, fontSize, fontWeight, measure);
  }

  // Any single part still wider than maxWidth → recurse with char-break.
  const out: string[] = [];
  for (const p of parts) {
    if (measure(p, fontSize, fontWeight) > maxWidth) {
      out.push(...charBreak(p, maxWidth, fontSize, fontWeight, measure));
    } else {
      out.push(p);
    }
  }
  return out;
}

function charBreak(
  s: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: number,
  measure: MeasureFn
): string[] {
  const lines: string[] = [];
  let current = "";
  for (const ch of s) {
    const test = current + ch;
    if (measure(test, fontSize, fontWeight) > maxWidth && current.length > 0) {
      lines.push(current);
      current = ch;
    } else {
      current = test;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

/**
 * Word-wrap text into lines that fit within maxWidth.
 *
 * Splits on whitespace first; any whitespace token that exceeds maxWidth is
 * further broken at URL/path separators (and ultimately by character) so the
 * universal invariant holds: every returned line measures ≤ maxWidth.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontWeight: number = 400,
  measure: MeasureFn = canvasMeasure
): string[] {
  const rawTokens = text.split(/\s+/).filter((t) => t.length > 0);
  if (rawTokens.length === 0) return [""];

  // Pre-break any oversize token; the result is a flat list of "atoms" each ≤ maxWidth.
  const atoms: string[] = [];
  for (const tok of rawTokens) {
    if (measure(tok, fontSize, fontWeight) > maxWidth) {
      atoms.push(...breakLongToken(tok, maxWidth, fontSize, fontWeight, measure));
    } else {
      atoms.push(tok);
    }
  }

  // Greedy wrap. Atoms from a broken token already carry their separator; for
  // those, joining without a space looks correct (e.g. "a/" + "b/" = "a/b/").
  // For whitespace tokens we still join with a space.
  const lines: string[] = [];
  let current = atoms[0];
  for (let i = 1; i < atoms.length; i++) {
    const atom = atoms[i];
    // Heuristic: if `current` ends in a separator and `atom` doesn't start with
    // whitespace, treat them as parts of the same broken token (no space join).
    const joiner = BREAK_RE.test(current.slice(-1)) ? "" : " ";
    const candidate = current + joiner + atom;
    if (measure(candidate, fontSize, fontWeight) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = atom;
    }
  }
  lines.push(current);
  return lines;
}

/** Line height multiplier for wrapped text */
export const LINE_HEIGHT = 1.4;

/** Padding inside a box around text (horizontal per side) */
export const TEXT_PAD_X = 8;

/** Padding inside a box around text (vertical per side) */
export const TEXT_PAD_Y = 6;

/** Default cap on adaptive box width — keeps a single long URL from
 * dominating the whole canvas while still letting most fit on one line. */
export const DEFAULT_MAX_NODE_WIDTH = 720;

/**
 * Compute an adaptive box width.
 *
 * Strategy: grow to fit the longest unbreakable (whitespace-separated) token
 * on a single line, capped at `maxWidth`. For multi-token prose, fall back to
 * the prior 4-line aspect heuristic so paragraphs stay readable.
 */
export function adaptiveWidth(
  text: string,
  baseWidth: number,
  fontSize: number,
  fontWeight: number = 400,
  maxWidth: number = DEFAULT_MAX_NODE_WIDTH,
  measure: MeasureFn = canvasMeasure
): number {
  const fullTextWidth = measure(text, fontSize, fontWeight);
  const textAreaWidth = baseWidth - TEXT_PAD_X * 2;

  // Easy case: the whole text fits on one line at base width.
  if (fullTextWidth <= textAreaWidth) return baseWidth;

  // Longest single (whitespace-separated) token — the box must be at least
  // this wide, otherwise even the best wrap leaves overflow.
  const tokens = text.split(/\s+/).filter((t) => t.length > 0);
  let longestTokenWidth = 0;
  for (const tok of tokens) {
    const w = measure(tok, fontSize, fontWeight);
    if (w > longestTokenWidth) longestTokenWidth = w;
  }

  // Soft target: keep aspect at ~4 lines of total prose.
  const fourLineWidth = fullTextWidth / 4;

  const idealTextWidth = Math.max(longestTokenWidth, fourLineWidth);
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
  minHeight: number = 28,
  measure: MeasureFn = canvasMeasure
): number {
  const maxTextWidth = boxWidth - TEXT_PAD_X * 2;
  if (maxTextWidth <= 0) return minHeight;

  const lines = wrapText(text, maxTextWidth, fontSize, fontWeight, measure);
  const lineH = fontSize * LINE_HEIGHT;
  const textBlockH = lines.length * lineH;
  const totalH = textBlockH + TEXT_PAD_Y * 2;

  return Math.max(totalH, minHeight);
}
