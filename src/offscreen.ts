import type { TreeNode, ViewId, RenderElement, LayoutResult } from "./types";
import { render } from "./renderer";
import { fitToView } from "./controller";
import { layoutTreeChart } from "./views/tree-chart";
import { layoutTreeTable } from "./views/tree-table";
import { layoutRoadmapAlt, layoutRoadmapLinear } from "./views/roadmap";
import { layoutMindMap } from "./views/mind-map";
import { layoutRightTree } from "./views/right-tree";
import { layoutFishbone } from "./views/fishbone";
import { layoutTreemap } from "./views/treemap";

const VIEW_LAYOUTS: Record<ViewId, (root: TreeNode, maxDepth: number) => LayoutResult> = {
  tree: layoutTreeChart,
  table: layoutTreeTable,
  roadmap_alt: layoutRoadmapAlt,
  roadmap: layoutRoadmapLinear,
  mind: layoutMindMap,
  rtree: layoutRightTree,
  fish: layoutFishbone,
  tmap: layoutTreemap,
};

/**
 * Render a tree to an off-screen canvas and return a PNG data URL.
 * Used for inline macro rendering where we can't embed an interactive canvas.
 */
export function renderToDataURL(
  tree: TreeNode,
  viewId: ViewId,
  maxDepth: number,
  width: number = 800,
  height: number = 500
): string {
  const layoutFn = VIEW_LAYOUTS[viewId] ?? layoutTreeChart;
  const result = layoutFn(tree, maxDepth);

  const canvas = document.createElement("canvas");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const transform = fitToView(result.bounds, width, height, 30);
  render(ctx, result.elements, transform, width, height);

  return canvas.toDataURL("image/png");
}
