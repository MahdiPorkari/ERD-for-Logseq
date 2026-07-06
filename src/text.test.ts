import { describe, it, expect } from "vitest";
import { wrapText, adaptiveWidth, measureBoxHeight, truncateWithEllipsis } from "./text";

// Deterministic measurer: 8px per character (vitest runs in node — no canvas).
const CHAR_PX = 8;
const fakeMeasure = (text: string) => text.length * CHAR_PX;
const TEXT_PAD = 16; // TEXT_PAD_X * 2

describe("adaptiveWidth", () => {
  it("returns baseWidth unchanged when text fits comfortably (regression)", () => {
    expect(adaptiveWidth("short text", 200, 12, 400, 720, fakeMeasure)).toBe(200);
  });

  it("grows the box to fit a long URL on one line (longest token)", () => {
    // URL is one token (no whitespace) of ~60 chars = 480px
    const url = "https://example.com/reasonably/long/path/that/is/below/the/cap";
    const w = adaptiveWidth(url, 155, 12, 400, 720, fakeMeasure);
    expect(w).toBeGreaterThanOrEqual(fakeMeasure(url) + TEXT_PAD);
    expect(w).toBeLessThanOrEqual(720);
  });

  it("caps at maxWidth for pathologically wide tokens", () => {
    const w = adaptiveWidth("x".repeat(200), 155, 12, 400, 720, fakeMeasure);
    expect(w).toBe(720);
  });

  it("does not grow for short tokens even when total prose is long", () => {
    // Many short whitespace-separated tokens — longest token is short
    const text = "the quick brown fox jumps over the lazy dog several times today";
    const w = adaptiveWidth(text, 200, 12, 400, 720, fakeMeasure);
    expect(w).toBe(200);
  });
});

describe("wrapText", () => {
  it("wraps plain prose on whitespace (regression)", () => {
    const lines = wrapText("the quick brown fox jumps over", 80, 12, 400, fakeMeasure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(fakeMeasure(line)).toBeLessThanOrEqual(80);
    }
  });

  it("keeps a URL on one line when it fits within maxWidth", () => {
    const url = "https://example.com/short";
    const lines = wrapText(url, 720, 12, 400, fakeMeasure);
    expect(lines).toEqual([url]);
  });

  it("breaks an over-cap URL at slash boundaries, not mid-segment", () => {
    const url = "https://example.com/" + "segment/".repeat(40); // way over 720
    const lines = wrapText(url, 720, 12, 400, fakeMeasure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(fakeMeasure(line)).toBeLessThanOrEqual(720);
    }
    // Every non-final line should end with a separator (clean break)
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i]).toMatch(/[/?&=._\-:]$/);
    }
  });

  it("falls back to character-break for a separator-free blob over maxWidth", () => {
    const blob = "x".repeat(200);
    const lines = wrapText(blob, 720, 12, 400, fakeMeasure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(fakeMeasure(line)).toBeLessThanOrEqual(720);
    }
  });

  it("guarantees every line fits within maxWidth (universal invariant)", () => {
    const inputs = [
      "plain prose works fine",
      "https://verylong.example.com/path/that/keeps/going/and/going",
      "x".repeat(500),
      "mixed prose with a https://example.com/url/in/the/middle of it",
      "/absolute/path/to/some/file.cljs",
      "deps/db/src/logseq/db/frontend/property.cljs1-47",
    ];
    for (const input of inputs) {
      const lines = wrapText(input, 200, 12, 400, fakeMeasure);
      for (const line of lines) {
        expect(fakeMeasure(line), `line "${line}" from input "${input}"`).toBeLessThanOrEqual(200);
      }
    }
  });
});

describe("measureBoxHeight", () => {
  it("reports compact height when adaptiveWidth has grown the box to fit on one line", () => {
    const url = "https://example.com/some/medium/path";
    const w = adaptiveWidth(url, 155, 12, 400, 720, fakeMeasure);
    const h = measureBoxHeight(url, w, 12, 400, 28, fakeMeasure);
    // One line × line-height (12*1.4=16.8) + padding (12) ≈ 29 — but minHeight=28 wins
    expect(h).toBeLessThanOrEqual(40);
  });

  it("reports multi-line height when forced to wrap inside the cap", () => {
    const url = "https://example.com/" + "segment/".repeat(40);
    const h = measureBoxHeight(url, 720, 12, 400, 28, fakeMeasure);
    expect(h).toBeGreaterThan(60);
  });
});

describe("truncateWithEllipsis", () => {
  it("leaves short text alone", () => {
    const s = "short";
    expect(truncateWithEllipsis(s, 100, 12, 400, fakeMeasure)).toBe(s);
  });

  it("truncates long text and adds an ellipsis", () => {
    // 10 chars * 8px = 80px. maxWidth 50px.
    const s = "0123456789";
    const res = truncateWithEllipsis(s, 50, 12, 400, fakeMeasure);
    expect(res).toMatch(/…$/);
    expect(fakeMeasure(res)).toBeLessThanOrEqual(50);
  });

  it("returns empty string when maxWidth is too small even for ellipsis", () => {
    const s = "some text";
    // Ellipsis is 1 char * 8px = 8px. maxWidth 5px.
    expect(truncateWithEllipsis(s, 5, 12, 400, fakeMeasure)).toBe("");
  });
});
