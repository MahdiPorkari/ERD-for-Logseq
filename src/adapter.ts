/* eslint-disable */
import "@logseq/libs";
import type { TreeNode, NodeRef, RelKind } from "./types";

/** Match relates_to / depends_on property idents (with optional random suffix) */
const REL_KEY_RE = /^:?user\.property\/(relates_to|depends_on)(?:-[A-Za-z0-9_-]+)?$/;
/** Match any user property ident */
const USER_PROP_RE = /^:?user\.property\/(.+)$/;
/** Match UUIDs */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface LogseqBlock {
  uuid: string;
  content?: string;
  title?: string;
  children?: LogseqBlock[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Resolves a UUID to the referenced entity's display title. Return null if unresolvable. */
export type RefFetcher = (uuid: string) => Promise<string | null>;
/** Resolves a block UUID to its tags. */
export type TagResolver = (uuid: string) => Promise<string[]>;
/** Resolves a numeric ID to a UUID string. */
export type IdResolver = (id: number) => Promise<string | null>;

let nextId = 0;

/** Default ID resolver: calls Logseq Editor API. */
const defaultIdResolver: IdResolver = async (id) => {
  try {
    const b = await logseq.Editor.getBlock(id);
    return b?.uuid || null;
  } catch {
    return null;
  }
};

/** Default tag resolver: calls Logseq Datascript query. */
const defaultTagResolver: TagResolver = async (uuid) => {
  try {
    if (typeof logseq === "undefined" || !logseq.DB) return [];

    // Use direct interpolation for #uuid literal - most reliable in Logseq SDK
    // Pulling both :block/name (lowercase) and :block/original-name
    const query = `[:find (pull ?t [:block/name :block/original-name :block/title])
                    :where [?b :block/uuid #uuid "${uuid}"]
                           [?b :block/tags ?t]]`;

    const results = await logseq.DB.datascriptQuery(query);
    if (!results || !Array.isArray(results)) return [];

    return results
      .flat()
      .map((t: any) => {
        // Datascript result keys have leading colons in DB graphs
        return t[":block/original-name"] || t["block/original-name"] ||
               t[":block/name"] || t["block/name"] ||
               t[":block/title"] || t["block/title"];
      })
      .filter(Boolean) as string[];
  } catch (err) {
    console.error("extractTags: datascript query failed", err);
    return [];
  }
};

/** Strip inline markdown formatting from text */
export function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\{\{\s?renderer\s[^}]*\}\}/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\`(.+?)\`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .trim();
}

/**
 * Walk a block's UUID refs and resolve them to titles.
 */
export async function resolveNodeRefs(
  text: string,
  fetcher: RefFetcher,
  cache: Map<string, string> = new Map(),
  resolving: Set<string> = new Set()
): Promise<string> {
  if (!text) return "";

  const re = /\[\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi;
  const uuids = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    uuids.add(m[1]);
  }

  if (uuids.size === 0) return text;

  let out = text;
  for (const uuid of uuids) {
    if (resolving.has(uuid)) continue;

    let resolved: string | null | undefined = cache.get(uuid);
    if (resolved === undefined) {
      try {
        resolving.add(uuid);
        resolved = await fetcher(uuid);
        if (resolved) {
          resolved = await resolveNodeRefs(resolved, fetcher, cache, resolving);
          cache.set(uuid, resolved);
        } else {
          resolved = `((unresolved-${uuid.slice(0, 8)}))`;
        }
      } catch (err) {
        resolved = `((error-${uuid.slice(0, 8)}))`;
      } finally {
        resolving.delete(uuid);
      }
    }

    if (resolved) {
      const escapedUuid = uuid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\[\\[${escapedUuid}\\]\\]`, "gi"), resolved);
    }
  }
  return out;
}

async function extractRefUuids(
  value: unknown,
  idCache: Map<number, string | null>,
  idResolver: IdResolver
): Promise<string[]> {
  if (value == null) return [];
  if (Array.isArray(value)) {
    const all = await Promise.all(value.map((v) => extractRefUuids(v, idCache, idResolver)));
    return all.flat();
  }
  if (typeof value === "string") return UUID_RE.test(value) ? [value] : [];
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const blockUuid = obj["block/uuid"];
    if (typeof blockUuid === "string" && UUID_RE.test(blockUuid)) return [blockUuid];
    if (typeof obj.uuid === "string" && UUID_RE.test(obj.uuid as string)) {
      return [obj.uuid as string];
    }
    if (typeof obj.id === "number") {
      const id = obj.id as number;
      let cached = idCache.get(id);
      if (cached === undefined) {
        cached = await idResolver(id);
        idCache.set(id, cached);
      }
      return cached ? [cached] : [];
    }
  }
  return [];
}

async function extractRefs(
  block: LogseqBlock,
  idCache: Map<number, string | null>,
  idResolver: IdResolver
): Promise<{ kind: RelKind; targetUuid: string }[]> {
  const out: { kind: RelKind; targetUuid: string }[] = [];
  const seen = new Set<string>();

  const addFrom = async (key: string, value: unknown): Promise<void> => {
    const m = REL_KEY_RE.exec(key);
    if (!m) return;
    const kind = m[1] as RelKind;
    for (const targetUuid of await extractRefUuids(value, idCache, idResolver)) {
      const sig = `${kind}|${targetUuid}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({ kind, targetUuid });
    }
  };

  for (const [key, value] of Object.entries(block)) {
    await addFrom(key, value);
  }

  if (block.properties) {
    for (const [key, value] of Object.entries(block.properties)) {
      await addFrom(key, value);
    }
  }

  return out;
}

async function formatPropertyValue(
  value: unknown,
  idCache: Map<number, string | null>,
  idResolver: IdResolver,
  fetcher: RefFetcher
): Promise<string> {
  if (value == null) return "";
  if (Array.isArray(value)) {
    const formatted = await Promise.all(
      value.map((v) => formatPropertyValue(v, idCache, idResolver, fetcher))
    );
    return formatted.filter(v => v !== "").join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return stripMarkdown(value);

  if (typeof value === "object") {
    const uuids = await extractRefUuids(value, idCache, idResolver);
    if (uuids.length > 0) {
      const titles = await Promise.all(
        uuids.map(async (uuid) => {
          const resolved = await fetcher(uuid);
          return resolved || uuid;
        })
      );
      return titles.join(", ");
    }
  }

  return String(value);
}

function titleCase(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function extractTags(
  block: LogseqBlock,
  tagCache: Map<string, string[]>,
  tagResolver: TagResolver
): Promise<string[]> {
  if (!block.uuid) return [];
  if (tagCache.has(block.uuid)) return tagCache.get(block.uuid)!;

  const tags = new Set<string>();

  const text = (block.content || block.title || "");
  const inlineTags = text.match(/#\[\[(.+?)\]\]|#([a-zA-Z0-9_-]+)/g);
  if (inlineTags) {
    inlineTags.forEach(t => {
      if (t.startsWith("#[[")) tags.add(t.slice(3, -2));
      else tags.add(t.slice(1));
    });
  }

  const processValue = (val: unknown) => {
    if (typeof val === "string") tags.add(val);
    else if (Array.isArray(val)) {
      val.forEach(v => { if (typeof v === "string") tags.add(v); });
    }
  };

  for (const [key, value] of Object.entries(block)) {
    const k = key.startsWith(":") ? key.slice(1) : key;
    if (k === "tags" || k === "block/tags" || k === "user.property/tags" || k.startsWith("user.property/tags-")) {
      processValue(value);
    }
  }

  if (block.properties && block.properties.tags) {
    processValue(block.properties.tags);
  }

  const resolved = await tagResolver(block.uuid);
  resolved.forEach(t => tags.add(t));

  const sorted = Array.from(tags).sort((a, b) => a.localeCompare(b));
  tagCache.set(block.uuid, sorted);
  return sorted;
}

export async function extractDisplayProperties(
  block: LogseqBlock,
  idCache: Map<number, string | null>,
  idResolver: IdResolver,
  fetcher: RefFetcher
): Promise<{ name: string; value: string }[]> {
  const propsMap = new Map<string, { rawName: string; value: unknown }>();

  const processEntry = (key: string, value: unknown) => {
    const m = USER_PROP_RE.exec(key);
    if (!m) return;

    let rawName = m[1];
    const suffixMatch = rawName.match(/^(.+)-[a-zA-Z0-9]+$/);
    if (suffixMatch) {
      rawName = suffixMatch[1];
    }

    const normalizedKey = rawName.replace(/[_-]/g, " ").toLowerCase().trim().replace(/\s+/g, "_");
    if (normalizedKey === "relates_to" || normalizedKey === "depends_on" || normalizedKey === "tags") return;

    if (!propsMap.has(normalizedKey)) {
      propsMap.set(normalizedKey, { rawName, value });
    }
  };

  for (const [key, value] of Object.entries(block)) {
    processEntry(key, value);
  }

  if (block.properties) {
    for (const [key, value] of Object.entries(block.properties)) {
      processEntry(key, value);
    }
  }

  const out = await Promise.all(
    Array.from(propsMap.values()).map(async ({ rawName, value }) => {
      // Normalize rawName for titleCase to handle suffix-stripped name
      const suffixMatch = rawName.match(/^(.+)-[a-zA-Z0-9]+$/);
      const displayName = suffixMatch ? suffixMatch[1] : rawName;
      return {
        name: titleCase(displayName),
        value: await formatPropertyValue(value, idCache, idResolver, fetcher),
      };
    })
  );

  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function convertBlock(
  block: LogseqBlock,
  depth: number,
  showEmpty: boolean,
  fetcher: RefFetcher,
  cache: Map<string, string>,
  idResolver: IdResolver,
  idCache: Map<number, string | null>,
  tagResolver: TagResolver,
  tagCache: Map<string, string[]>
): Promise<TreeNode | null> {
  const rawText = block.content ?? block.title ?? "";
  const resolved = await resolveNodeRefs(rawText, fetcher, cache);
  const name = stripMarkdown(resolved);

  if (!name && (!block.children || block.children.length === 0) && !showEmpty) {
    return null;
  }

  const properties = await extractDisplayProperties(block, idCache, idResolver, fetcher);
  const tags = await extractTags(block, tagCache, tagResolver);
  const refs = await extractRefs(block, idCache, idResolver);

  const children: TreeNode[] = [];
  if (block.children) {
    for (const child of block.children) {
      const node = await convertBlock(child, depth + 1, showEmpty, fetcher, cache, idResolver, idCache, tagResolver, tagCache);
      if (node) children.push(node);
    }
  }

  return {
    name: name || "(empty)",
    children,
    depth,
    id: nextId++,
    uuid: block.uuid,
    properties,
    tags,
    refs,
  };
}

export async function buildTree(
  blocks: LogseqBlock[],
  pageName: string,
  showEmpty: boolean,
  fetcher: RefFetcher = async () => null,
  idResolver: IdResolver = async () => null,
  tagResolver: TagResolver = defaultTagResolver
): Promise<TreeNode> {
  nextId = 0;
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  const tagCache = new Map<string, string[]>();

  const children: TreeNode[] = [];
  for (const block of blocks) {
    const node = await convertBlock(block, 1, showEmpty, fetcher, cache, idResolver, idCache, tagResolver, tagCache);
    if (node) children.push(node);
  }

  if (children.length === 1 && children[0].name) {
    children[0].depth = 0;
    return reindex(children[0], 0);
  }

  return {
    name: pageName,
    children,
    depth: 0,
    id: nextId++,
    uuid: "",
    tags: [],
    refs: [],
  };
}

function reindex(node: TreeNode, depth: number): TreeNode {
  node.depth = depth;
  for (const child of node.children) {
    reindex(child, depth + 1);
  }
  return node;
}

export function flattenDeep(
  root: TreeNode,
  maxDepth: number,
  mode: "recursive" | "flat" = "recursive"
): TreeNode {
  const clone = structuredClone(root);
  pruneAtDepth(clone, maxDepth);
  if (mode === "flat") collapseToThreeLevels(clone);
  return clone;
}

function pruneAtDepth(node: TreeNode, maxDepth: number): void {
  if (node.depth >= maxDepth - 1) {
    node.children = [];
    return;
  }
  for (const child of node.children) {
    pruneAtDepth(child, maxDepth);
  }
}

function collapseToThreeLevels(root: TreeNode): void {
  for (const branch of root.children) {
    const newLeaves: TreeNode[] = [];
    for (const child of branch.children) {
      if (child.children.length === 0) {
        child.depth = 2;
        newLeaves.push(child);
      } else {
        gatherLeaves(child, "", newLeaves, 2);
      }
    }
    branch.children = newLeaves;
    branch.depth = 1;
  }
  root.depth = 0;
}

function gatherLeaves(
  node: TreeNode,
  prefix: string,
  out: TreeNode[],
  targetDepth: number
): void {
  const label = prefix ? `${prefix} > ${node.name}` : node.name;
  if (node.children.length === 0) {
    out.push({ ...node, name: label, depth: targetDepth, children: [] });
  } else {
    for (const child of node.children) gatherLeaves(child, label, out, targetDepth);
  }
}

const defaultFetcher: RefFetcher = async (uuid) => {
  try {
    const block = await logseq.Editor.getBlock(uuid);
    if (block) {
      const t = (block as any).title ?? (block as any).content;
      if (t && t.trim()) return t;
    }
  } catch { }
  try {
    const page = await logseq.Editor.getPage(uuid);
    if (page) {
      const t = (page as any).originalName ?? (page as any).name ?? (page as any).title;
      if (t && t.trim()) return t;
    }
  } catch { }
  return null;
};

export async function fetchTree(showEmpty: boolean): Promise<TreeNode | null> {
  const page = await logseq.Editor.getCurrentPage();
  if (!page) return null;
  const pageName = (page as any).originalName ?? (page as any).name ?? "Untitled";
  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (!blocks || blocks.length === 0) return null;
  return buildTree(blocks as unknown as LogseqBlock[], pageName, showEmpty, defaultFetcher, defaultIdResolver, defaultTagResolver);
}

export async function fetchBlockTree(
  uuid: string,
  showEmpty: boolean,
  fetcher: RefFetcher = defaultFetcher,
  idResolver: IdResolver = defaultIdResolver,
  tagResolver: TagResolver = defaultTagResolver
): Promise<TreeNode | null> {
  const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
  if (!block) return null;
  nextId = 0;
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  const tagCache = new Map<string, string[]>();
  return await convertBlock(block as unknown as LogseqBlock, 0, showEmpty, fetcher, cache, idResolver, idCache, tagResolver, tagCache);
}

export function filterIntraTreeRefs(root: TreeNode): TreeNode {
  const present = new Set<string>();
  (function collect(n: TreeNode): void {
    if (n.uuid) present.add(n.uuid);
    for (const c of n.children) collect(c);
  })(root);
  return (function walk(n: TreeNode): TreeNode {
    const refs = n.refs?.filter((r) => present.has(r.targetUuid));
    return { ...n, children: n.children.map(walk), refs: refs && refs.length ? refs : [] };
  })(root);
}
