import type { TreeNode, LayoutResult, RenderElement, Rect } from "../types";
import { nodeSize, drawERDNode } from "./erd";

interface SimNode {
  uuid: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
}

/**
 * Force-directed layout view for graph-wide relationships
 */
export function layoutGraph(root: TreeNode, _maxDepth: number): LayoutResult {
  const nodes = root.children;
  if (nodes.length === 0) {
    return {
      elements: [],
      bounds: { x: 0, y: 0, w: 100, h: 100 },
      nodeRectsByUuid: new Map()
    };
  }

  // Pre-calculate node sizes
  const nodeSizes = new Map<string, ReturnType<typeof nodeSize>>();
  nodes.forEach(node => {
    nodeSizes.set(node.uuid, nodeSize(node));
  });

  // Extract edges
  const edges: { sourceUuid: string; targetUuid: string }[] = [];
  nodes.forEach(node => {
    if (node.refs) {
      node.refs.forEach(ref => {
        edges.push({ sourceUuid: node.uuid, targetUuid: ref.targetUuid });
      });
    }
  });

  const numNodes = nodes.length;

  // Initialize simulation nodes
  const simNodes: SimNode[] = nodes.map((node, i) => {
    const size = nodeSizes.get(node.uuid)!;
    // Circular initial layout to distribute nodes evenly
    const angle = (i / numNodes) * 2 * Math.PI;
    const initialRadius = Math.max(150, numNodes * 12);
    return {
      uuid: node.uuid,
      x: initialRadius * Math.cos(angle),
      y: initialRadius * Math.sin(angle),
      vx: 0,
      vy: 0,
      w: size.w,
      h: size.h
    };
  });

  const numIterations = 120;
  const linkDistance = 250;
  const springStrength = 0.04;
  const charge = -40000; // Repulsion strength
  const gravity = 0.015;
  const friction = 0.82;

  const simNodeMap = new Map<string, SimNode>();
  simNodes.forEach(sn => simNodeMap.set(sn.uuid, sn));

  for (let step = 0; step < numIterations; step++) {
    // 1. Repulsion force between all pairs of nodes (Coulomb's law)
    for (let i = 0; i < simNodes.length; i++) {
      for (let j = i + 1; j < simNodes.length; j++) {
        const u = simNodes[i];
        const v = simNodes[j];
        let dx = v.x - u.x;
        let dy = v.y - u.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          dist = Math.sqrt(dx * dx + dy * dy);
        }

        // Avoid overlap by using node dimensions as minimum distance
        const minDist = (u.w + v.w) / 2 + 50;
        const d = Math.max(dist, minDist);
        const force = charge / (d * d);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        u.vx += fx;
        u.vy += fy;
        v.vx -= fx;
        v.vy -= fy;
      }
    }

    // 2. Spring attraction along links/edges (Hooke's law)
    edges.forEach(edge => {
      const u = simNodeMap.get(edge.sourceUuid);
      const v = simNodeMap.get(edge.targetUuid);
      if (!u || !v) return;

      const dx = v.x - u.x;
      const dy = v.y - u.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const desiredLen = linkDistance + (u.w + v.w) / 4;
      const force = (dist - desiredLen) * springStrength;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      u.vx += fx;
      u.vy += fy;
      v.vx -= fx;
      v.vy -= fy;
    });

    // 3. Gravity / Central attraction to anchor the graph
    simNodes.forEach(sn => {
      sn.vx -= sn.x * gravity;
      sn.vy -= sn.y * gravity;
    });

    // 4. Update positions & velocities with friction damping
    simNodes.forEach(sn => {
      sn.x += sn.vx;
      sn.y += sn.vy;
      sn.vx *= friction;
      sn.vy *= friction;
    });
  }

  // Find bounding box and shift coordinate origin
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  simNodes.forEach(sn => {
    const left = sn.x - sn.w / 2;
    const top = sn.y - sn.h / 2;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, left + sn.w);
    maxY = Math.max(maxY, top + sn.h);
  });

  const padding = 100;
  const shiftX = padding - minX;
  const shiftY = padding - minY;

  simNodes.forEach(sn => {
    sn.x += shiftX;
    sn.y += shiftY;
  });

  const bounds = {
    x: 0,
    y: 0,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2
  };

  const els: RenderElement[] = [];
  const nodeRectsByUuid = new Map<string, Rect>();

  nodes.forEach((node, idx) => {
    const sn = simNodeMap.get(node.uuid)!;
    const size = nodeSizes.get(node.uuid)!;
    const boxX = sn.x - sn.w / 2;
    const boxY = sn.y - sn.h / 2;

    const nodeEls = drawERDNode(
      node,
      boxX,
      boxY,
      sn.w,
      sn.h,
      size.headerH,
      size.tagsValue,
      size.propRows,
      false, // isRoot
      false, // isLeaf
      idx // parentColorIndex used for node coloring variety
    );
    els.push(...nodeEls);

    nodeRectsByUuid.set(node.uuid, { x: boxX, y: boxY, w: sn.w, h: sn.h });
  });

  return {
    elements: els,
    bounds,
    nodeRectsByUuid
  };
}
