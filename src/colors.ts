/** Deuteranopia-safe color palette — 8 colors with unique dash patterns */
export interface BranchColor {
  /** Solid fill (18% alpha) */
  fill: string;
  /** Stroke color */
  stroke: string;
  /** Text color (light, for dark backgrounds) */
  text: string;
  /** Leaf fill (12% alpha) */
  leafFill: string;
  /** Leaf stroke (35% alpha) */
  leafStroke: string;
  /** Background zone fill (8% alpha) */
  zone: string;
  /** Unique dash pattern for accessibility */
  dash: number[];
}

export const COLORS: BranchColor[] = [
  {
    fill: "#3e63dd18",
    stroke: "#3e63dd",
    text: "#8da4ef",
    leafFill: "#3e63dd0c",
    leafStroke: "#3e63dd35",
    zone: "#3e63dd08",
    dash: [8, 4],
  },
  {
    fill: "#f7680018",
    stroke: "#f76800",
    text: "#ffa057",
    leafFill: "#f768000c",
    leafStroke: "#f7680035",
    zone: "#f7680008",
    dash: [12, 3],
  },
  {
    fill: "#6e56cf18",
    stroke: "#6e56cf",
    text: "#b4a3e8",
    leafFill: "#6e56cf0c",
    leafStroke: "#6e56cf35",
    zone: "#6e56cf08",
    dash: [4, 4],
  },
  {
    fill: "#00a2c718",
    stroke: "#00a2c7",
    text: "#6cd4e8",
    leafFill: "#00a2c70c",
    leafStroke: "#00a2c735",
    zone: "#00a2c708",
    dash: [16, 4],
  },
  {
    fill: "#e5484d18",
    stroke: "#e5484d",
    text: "#ff9592",
    leafFill: "#e5484d0c",
    leafStroke: "#e5484d35",
    zone: "#e5484d08",
    dash: [6, 2, 2, 2],
  },
  {
    fill: "#d6409f18",
    stroke: "#d6409f",
    text: "#ef8fcc",
    leafFill: "#d6409f0c",
    leafStroke: "#d6409f35",
    zone: "#d6409f08",
    dash: [10, 5],
  },
  {
    fill: "#46a75818",
    stroke: "#46a758",
    text: "#7ccf8e",
    leafFill: "#46a7580c",
    leafStroke: "#46a75835",
    zone: "#46a75808",
    dash: [3, 3],
  },
  {
    fill: "#ffe07018",
    stroke: "#ffe070",
    text: "#f5d56a",
    leafFill: "#ffe0700c",
    leafStroke: "#ffe07035",
    zone: "#ffe07008",
    dash: [14, 2, 4, 2],
  },
];

/** Get color for a branch index (cycles through palette) */
export function branchColor(index: number): BranchColor {
  return COLORS[index % COLORS.length];
}

/** Canvas background color */
export const BG = "#0d0f14";

/** Root label color */
export const ROOT_TEXT = "#edeef0";

/** Leaf label color */
export const LEAF_TEXT = "#a8a8b2";

/** Muted UI color */
export const MUTED = "#6f7380";

/** Font family for labels */
export const FONT = "'IBM Plex Mono', 'SF Mono', monospace";
