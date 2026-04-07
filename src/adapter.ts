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

/** Flatten nodes deeper than maxDepth into the maxDepth-1 level */
export function flattenDeep(root: TreeNode, maxDepth: number): TreeNode {
  return flattenNode(structuredClone(root), maxDepth, []);
}

function flattenNode(
  node: TreeNode,
  maxDepth: number,
  breadcrumb: string[]
): TreeNode {
  if (node.depth >= maxDepth - 1) {
    // Flatten all descendants into this level
    const flattened = collectLeaves(node, breadcrumb);
    node.children = flattened;
    return node;
  }

  node.children = node.children.map((child) =>
    flattenNode(child, maxDepth, [...breadcrumb, node.name])
  );
  return node;
}

function collectLeaves(node: TreeNode, breadcrumb: string[]): TreeNode[] {
  if (node.children.length === 0) return [];

  const leaves: TreeNode[] = [];
  for (const child of node.children) {
    if (child.children.length === 0) {
      leaves.push(child);
    } else {
      // Flatten with breadcrumb prefix
      const prefix =
        breadcrumb.length > 0 ? `${child.name} > ` : `${child.name} > `;
      for (const grandchild of collectDeep(child)) {
        leaves.push({
          ...grandchild,
          name: `${prefix}${grandchild.name}`,
          depth: node.depth + 1,
          children: [],
        });
      }
    }
  }
  return leaves;
}

function collectDeep(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) return [node];
  const result: TreeNode[] = [];
  for (const child of node.children) {
    result.push(...collectDeep(child));
  }
  return result;
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
