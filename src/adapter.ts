import type { TreeNode } from "./types";

interface LogseqBlock {
  uuid: string;
  content?: string;
  title?: string;
  children?: LogseqBlock[];
  properties?: Record<string, unknown>;
}

let nextId = 0;

/** Strip inline markdown formatting from text */
function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/__(.+?)__/g, "$1") // bold alt
    .replace(/_(.+?)_/g, "$1") // italic alt
    .replace(/~~(.+?)~~/g, "$1") // strikethrough
    .replace(/`(.+?)`/g, "$1") // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/\[\[([^\]]+)\]\]/g, "$1") // wiki links
    .trim();
}

/** Convert a Logseq block tree to an internal TreeNode tree */
function convertBlock(
  block: LogseqBlock,
  depth: number,
  showEmpty: boolean
): TreeNode | null {
  const rawText = block.content ?? block.title ?? "";
  const name = stripMarkdown(rawText);

  if (!name && (!block.children || block.children.length === 0) && !showEmpty) {
    return null;
  }

  const children: TreeNode[] = [];
  if (block.children) {
    for (const child of block.children) {
      const node = convertBlock(child, depth + 1, showEmpty);
      if (node) children.push(node);
    }
  }

  return {
    name: name || "(empty)",
    children,
    depth,
    id: nextId++,
    uuid: block.uuid,
  };
}

/** Build a tree from a page's block tree, wrapping multiple roots in a virtual node */
export function buildTree(
  blocks: LogseqBlock[],
  pageName: string,
  showEmpty: boolean
): TreeNode {
  nextId = 0;

  const children: TreeNode[] = [];
  for (const block of blocks) {
    const node = convertBlock(block, 1, showEmpty);
    if (node) children.push(node);
  }

  if (children.length === 1 && children[0].name) {
    // Single top-level block becomes root
    children[0].depth = 0;
    return reindex(children[0], 0);
  }

  // Multiple top-level blocks: wrap in a virtual root
  return {
    name: pageName,
    children,
    depth: 0,
    id: nextId++,
    uuid: "",
  };
}

/** Re-index depths after restructuring */
function reindex(node: TreeNode, depth: number): TreeNode {
  node.depth = depth;
  for (const child of node.children) {
    reindex(child, depth + 1);
  }
  return node;
}

/**
 * Produce a 3-level tree (root → branches → leaves) for rendering.
 *
 * maxDepth controls how many levels of the original tree are expanded
 * before collapsing into breadcrumb-style leaf labels:
 * - maxDepth=3 (default): root → depth-1 children → depth-2 grandchildren
 * - maxDepth=4: root → depth-1 → depth-2, with depth-3 nodes shown as
 *   leaves with "parent > child" breadcrumb labels
 * - maxDepth=6: deeper nesting is preserved in breadcrumb labels
 *
 * The output always has exactly 3 rendering levels so views don't need
 * to handle arbitrary depth.
 */
export function flattenDeep(root: TreeNode, maxDepth: number): TreeNode {
  const clone = structuredClone(root);
  // Prune everything beyond maxDepth by flattening deep descendants
  pruneDeep(clone, maxDepth);
  // Now collapse to exactly 3 levels: root → branches → leaves
  collapseToThreeLevels(clone);
  return clone;
}

/** Prune nodes beyond maxDepth: flatten their descendants into breadcrumb leaves */
function pruneDeep(node: TreeNode, maxDepth: number): void {
  if (node.depth >= maxDepth - 1) {
    // Collapse all descendants into flat leaves with breadcrumb names
    node.children = collectAllLeaves(node);
    return;
  }
  for (const child of node.children) {
    pruneDeep(child, maxDepth);
  }
}

/** Collect all leaf-level descendants, flattening intermediate nodes into breadcrumb labels */
function collectAllLeaves(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) return [];
  const leaves: TreeNode[] = [];
  for (const child of node.children) {
    gatherLeaves(child, "", leaves, node.depth + 1);
  }
  return leaves;
}

function gatherLeaves(node: TreeNode, prefix: string, out: TreeNode[], targetDepth: number): void {
  const label = prefix ? `${prefix} > ${node.name}` : node.name;
  if (node.children.length === 0) {
    out.push({ ...node, name: label, depth: targetDepth, children: [] });
  } else {
    for (const child of node.children) {
      gatherLeaves(child, label, out, targetDepth);
    }
  }
}

/**
 * Collapse a tree of arbitrary depth into exactly 3 levels.
 * Depth-2+ nodes that still have children get their descendants
 * flattened into breadcrumb-style leaf names.
 */
function collapseToThreeLevels(root: TreeNode): void {
  for (const branch of root.children) {
    // Branch is depth 1. Its children become depth 2 (leaves).
    const newLeaves: TreeNode[] = [];
    for (const child of branch.children) {
      if (child.children.length === 0) {
        child.depth = 2;
        newLeaves.push(child);
      } else {
        // This node has sub-children — flatten them into breadcrumb leaves
        child.depth = 2;
        gatherLeaves(child, "", newLeaves, 2);
      }
    }
    branch.children = newLeaves;
    branch.depth = 1;
  }
  root.depth = 0;
}

/** Fetch the current page's block tree from Logseq and build an internal tree */
export async function fetchTree(showEmpty: boolean): Promise<TreeNode | null> {
  const page = await logseq.Editor.getCurrentPage();
  if (!page) return null;

  const pageName =
    (page as Record<string, unknown>).originalName as string ??
    (page as Record<string, unknown>).name as string ??
    "Untitled";

  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (!blocks || blocks.length === 0) return null;

  return buildTree(blocks as unknown as LogseqBlock[], pageName, showEmpty);
}

/** Fetch a specific block and its children as a tree */
export async function fetchBlockTree(
  uuid: string,
  showEmpty: boolean
): Promise<TreeNode | null> {
  const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
  if (!block) return null;

  nextId = 0;
  const node = convertBlock(block as unknown as LogseqBlock, 0, showEmpty);
  return node;
}
