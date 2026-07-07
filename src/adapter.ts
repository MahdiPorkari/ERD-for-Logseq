/* eslint-disable */
import "@logseq/libs";
import type { TreeNode, NodeRef, RelKind, TagInfo } from "./types";

const REL_KEY_RE_BASE = /^:?user\.property\/(relates_to|depends_on)(?:-[A-Za-z0-9_-]+)?$/;
const CUSTOM_REL_KEY_RE = /^:?user\.property\/(.+)(?:-[A-Za-z0-9_-]+)?$/;
const USER_PROP_RE = /^:?user\.property\/(.+)$/;

/**
 * Discover all custom properties in the Logseq DB with type 'node'.
 * Excludes built-in relationships to avoid duplication in settings.
 */
export async function discoverNodeProperties(): Promise<string[]> {
  if (typeof logseq === "undefined" || !logseq.DB) return [];
  try {
    const query = `[:find (pull ?p [:block/name :logseq.property/schema])
                    :where [?p :block/type "property"]
                           [?p :logseq.property/schema ?s]
                           [(= (:type ?s) "node")]]`;
    const results = await logseq.DB.datascriptQuery(query);
    if (!Array.isArray(results)) return [];
    return results
      .flat()
      .map((p: any) => p["block/name"] || p[":block/name"])
      .filter((name: string) => name && name !== "relates_to" && name !== "depends_on" && name !== "relates-to" && name !== "depends-on");
  } catch (err) {
    console.error("discoverNodeProperties failed", err);
    return [];
  }
}

const REAL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extended block interface to support Logseq DB-style namespaced keys */
export interface LogseqBlock {
  uuid: string;
  content?: string;
  title?: string;
  ":block/title"?: string;
  "block/title"?: string;
  children?: LogseqBlock[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export type RefFetcher = (uuid: string) => Promise<string | null>;
export interface TagProvider { getTags(blockUuid: string): Promise<readonly TagInfo[]>; }
export type IdResolver = (id: number) => Promise<string | null>;

let nextId = 0;

const defaultIdResolver: IdResolver = async (id) => {
  try {
    const b = await logseq.Editor.getBlock(id);
    if (b?.uuid) return b.uuid;
  } catch { }
  try {
    const p = await logseq.Editor.getPage(id);
    if (p?.uuid) return p.uuid;
  } catch { }
  return null;
};

export class DefaultTagProvider implements TagProvider {
  private cache = new Map<string, readonly TagInfo[]>();
  constructor(private blockMap?: Map<string, LogseqBlock>) {}

  async getTags(blockUuid: string): Promise<readonly TagInfo[]> {
    if (this.cache.has(blockUuid)) return this.cache.get(blockUuid)!;
    const tagsMap = new Map<string, TagInfo>();

    if (typeof logseq !== "undefined" && logseq.DB) {
      try {
        const query = `[:find (pull ?t [:block/uuid :block/title])
                        :in $ ?uuid
                        :where [?b :block/uuid ?uuid]
                               [?b :block/tags ?t]]`;
        const results = await logseq.DB.datascriptQuery(query, `#uuid "${blockUuid}"`);
        if (Array.isArray(results)) {
          results.flat().forEach((t: any) => {
            const title = t[":block/title"] || t["block/title"] || t["title"] || t["name"] || t[":block/name"];
            const uuid = t[":block/uuid"] || t["block/uuid"] || t["uuid"];
            if (title) {
              const normalized = title.toString().toLowerCase().trim();
              if (normalized) {
                tagsMap.set(normalized, { uuid: uuid || title.toString(), title: title.toString() });
              }
            }
          });
        }
      } catch (err) { console.error("TagProvider Datascript query failed", err); }
    }

    let block = this.blockMap?.get(blockUuid);
    if (!block && typeof logseq !== "undefined" && logseq.Editor) {
      block = await logseq.Editor.getBlock(blockUuid) as any;
    }
    if (block) {
      this.extractFromProperties(block, tagsMap);
    }

    const result = Array.from(tagsMap.values()).sort((a, b) => a.title.localeCompare(b.title));
    this.cache.set(blockUuid, result);
    return result;
  }

  private extractFromProperties(obj: Record<string, any>, tagsMap: Map<string, TagInfo>) {
    for (const [key, value] of Object.entries(obj)) {
      const k = key.startsWith(":") ? key.slice(1) : key;
      if (k === "tags" || k === "block/tags" || k.startsWith("user.property/tags")) {
        this.processValue(value, tagsMap);
      }
    }
    if (obj.properties) {
      for (const [key, value] of Object.entries(obj.properties)) {
        if (key === "tags") {
          this.processValue(value, tagsMap);
        }
      }
    }
  }

  private processValue(value: unknown, tagsMap: Map<string, TagInfo>) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(v => this.processValue(v, tagsMap));
    } else if (typeof value === "string") {
      const rawMatches = value.split(",").map(s => s.trim()).filter(Boolean);
      rawMatches.forEach(tag => {
        let title = tag.startsWith("#") ? tag.slice(1) : tag;
        title = title.replace(/^\[\[(.*)\]\]$/, "$1");
        const normalized = title.toLowerCase().trim();
        if (normalized) {
          if (!tagsMap.has(normalized)) {
            tagsMap.set(normalized, { uuid: title, title });
          }
        }
      });
    } else if (typeof value === "object") {
      const obj = value as Record<string, any>;
      let title = obj[":block/title"] || obj["block/title"] || obj["title"] || obj["name"];
      const uuid = obj[":block/uuid"] || obj["block/uuid"] || obj["uuid"];
      if (title) {
        if (typeof title === "string") title = title.replace(/^\[\[(.*)\]\]$/, "$1");
        const normalized = title.toString().toLowerCase().trim();
        if (normalized) {
          tagsMap.set(normalized, { uuid: uuid || title.toString(), title: title.toString() });
        }
      }
    }
  }
}

const REF_RE = /\[\[([^\]]+)\]\]|\(\(([^\)]+)\)\)/g;

/**
 * Recursively resolve [[page]] and ((block)) references in text.
 * Uses a depth limit to prevent infinite loops.
 */
export async function resolveNodeRefs(
  text: string,
  fetcher: RefFetcher,
  cache: Map<string, string> = new Map(),
  depth: number = 0
): Promise<string> {
  if (!text || depth > 10) return text || "";
  const matches = Array.from(text.matchAll(REF_RE));
  if (matches.length === 0) return text;

  let out = text;
  let changed = false;

  for (const m of matches) {
    const raw = m[0];
    const ref = m[1] || m[2];
    let resolved: string | null = null;
    if (cache.has(ref)) {
      resolved = cache.get(ref)!;
    } else {
      resolved = await fetcher(ref);
      if (resolved) cache.set(ref, resolved);
    }

    if (resolved && resolved !== raw) {
      const newOut = out.split(raw).join(resolved);
      if (newOut !== out) {
        out = newOut;
        changed = true;
      }
    }
  }

  if (changed) {
    return resolveNodeRefs(out, fetcher, cache, depth + 1);
  }
  return out;
}

export function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/[#*`~]/g, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .trim();
}

async function extractRefUuids(
  value: unknown,
  idCache: Map<number, string | null>,
  idResolver: IdResolver
): Promise<string[]> {
  if (!value) return [];
  if (Array.isArray(value)) {
    const results = await Promise.all(value.map((v) => extractRefUuids(v, idCache, idResolver)));
    return results.flat();
  }
  if (typeof value === "string") {
    if (REAL_UUID_RE.test(value)) return [value];
    return [];
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const blockUuid = obj["block/uuid"] || obj.uuid;
    if (typeof blockUuid === "string" && REAL_UUID_RE.test(blockUuid)) return [blockUuid];
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

export async function extractRefs(
  block: LogseqBlock,
  idCache: Map<number, string | null>,
  idResolver: IdResolver,
  enabledProperties: Set<string> = new Set()
): Promise<{ kind: RelKind; targetUuid: string }[]> {
  const out: { kind: RelKind; targetUuid: string }[] = [];
  const seen = new Set<string>();
  const addFrom = async (key: string, value: unknown): Promise<void> => {
    let kind: RelKind | null = null;
    const mBase = REL_KEY_RE_BASE.exec(key);
    if (mBase) {
      kind = mBase[1];
    } else {
      const mCustom = CUSTOM_REL_KEY_RE.exec(key);
      if (mCustom && enabledProperties.has(mCustom[1])) {
        kind = mCustom[1];
      }
    }
    if (!kind) return;

    const uuids = await extractRefUuids(value, idCache, idResolver);
    for (const targetUuid of uuids) {
      const sig = `${kind}|${targetUuid}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        out.push({ kind, targetUuid });
      }
    }
  };
  for (const [key, value] of Object.entries(block)) await addFrom(key, value);
  if (block.properties) {
    for (const [key, value] of Object.entries(block.properties)) await addFrom(key, value);
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
    const formatted = await Promise.all(value.map((v) => formatPropertyValue(v, idCache, idResolver, fetcher)));
    return formatted.filter(v => v !== "").join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return stripMarkdown(value);
  if (typeof value === "object") {
    const uuids = await extractRefUuids(value, idCache, idResolver);
    if (uuids.length > 0) {
      const titles = await Promise.all(uuids.map(async (uuid) => (await fetcher(uuid)) || uuid));
      return titles.join(", ");
    }
  }
  return String(value);
}

function titleCase(name: string): string {
  return name.replace(/[_-]/g, " ").split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export async function extractDisplayProperties(
  block: LogseqBlock,
  idCache: Map<number, string | null>,
  idResolver: IdResolver,
  fetcher: RefFetcher,
  enabledProperties: Set<string> = new Set()
): Promise<{ name: string; value: string }[]> {
  const propsMap = new Map<string, { rawName: string; value: unknown }>();
  const processEntry = (key: string, value: unknown) => {
    const m = USER_PROP_RE.exec(key);
    if (!m) return;
    let rawName = m[1];
    const suffixMatch = rawName.match(/^(.+)-[a-zA-Z0-9]+$/);
    if (suffixMatch) rawName = suffixMatch[1];
    const normalizedKey = rawName.replace(/[_-]/g, " ").toLowerCase().trim().replace(/\s+/g, "_");
    if (normalizedKey === "relates_to" || normalizedKey === "depends_on" || normalizedKey === "tags" || enabledProperties.has(normalizedKey)) return;
    if (!propsMap.has(normalizedKey)) propsMap.set(normalizedKey, { rawName, value });
  };
  for (const [key, value] of Object.entries(block)) processEntry(key, value);
  if (block.properties) {
    for (const [key, value] of Object.entries(block.properties)) processEntry(key, value);
  }
  const out = await Promise.all(
    Array.from(propsMap.values()).map(async ({ rawName, value }) => {
      let displayName = rawName;
      const suffixMatch = rawName.match(/^(.+)-[a-zA-Z0-9]+$/);
      if (suffixMatch) displayName = suffixMatch[1];
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
  tagProvider: TagProvider,
  enabledProperties: Set<string> = new Set()
): Promise<TreeNode | null> {
  const rawText = block.content ?? block.title ?? (block as any)[":block/title"] ?? "";
  const resolved = await resolveNodeRefs(rawText, fetcher, cache);
  const name = stripMarkdown(resolved);
  if (!name && (!block.children || block.children.length === 0) && !showEmpty) return null;
  const properties = await extractDisplayProperties(block, idCache, idResolver, fetcher, enabledProperties);
  const tags = await tagProvider.getTags(block.uuid);
  const refs = await extractRefs(block, idCache, idResolver, enabledProperties);
  const children: TreeNode[] = [];
  if (block.children) {
    for (const child of block.children) {
      const node = await convertBlock(child, depth + 1, showEmpty, fetcher, cache, idResolver, idCache, tagProvider, enabledProperties);
      if (node) children.push(node);
    }
  }
  return { name: name || "(empty)", children, depth, id: nextId++, uuid: block.uuid, properties, tags: [...tags], refs };
}

export async function buildTree(
  blocks: LogseqBlock[],
  pageName: string,
  showEmpty: boolean,
  fetcher: RefFetcher = async () => null,
  idResolver: IdResolver = async () => null,
  tagProvider?: TagProvider,
  pageUuid?: string,
  enabledProperties: Set<string> = new Set()
): Promise<TreeNode> {
  nextId = 0;
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  if (!tagProvider) {
    const blockMap = new Map<string, LogseqBlock>();
    const walk = (blks: LogseqBlock[]) => {
      blks.forEach(b => {
        blockMap.set(b.uuid, b);
        if (b.children) walk(b.children);
      });
    };
    walk(blocks);
    tagProvider = new DefaultTagProvider(blockMap);
  }
  const children: TreeNode[] = [];
  for (const block of blocks) {
    const node = await convertBlock(block, 1, showEmpty, fetcher, cache, idResolver, idCache, tagProvider, enabledProperties);
    if (node) children.push(node);
  }
  if (children.length === 1 && children[0].name) {
    children[0].depth = 0;
    return reindex(children[0], 0);
  }
  const rootTags = pageUuid ? await tagProvider.getTags(pageUuid) : [];
  return { name: pageName, children, depth: 0, id: nextId++, uuid: pageUuid || "", tags: [...rootTags], refs: [] };
}

function reindex(node: TreeNode, depth: number): TreeNode {
  node.depth = depth;
  for (const child of node.children) reindex(child, depth + 1);
  return node;
}

export function flattenDeep(root: TreeNode, maxDepth: number, mode: "recursive" | "flat" = "recursive"): TreeNode {
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
  for (const child of node.children) pruneAtDepth(child, maxDepth);
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

function gatherLeaves(node: TreeNode, prefix: string, out: TreeNode[], targetDepth: number): void {
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
      const t = (block as any)[":block/title"] || (block as any).title || (block as any).content;
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

export async function fetchTree(showEmpty: boolean, enabledProperties: Set<string> = new Set()): Promise<TreeNode | null> {
  const page = await logseq.Editor.getCurrentPage();
  if (!page) return null;
  const pageName = (page as any).originalName ?? (page as any).name ?? "Untitled";
  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (!blocks || blocks.length === 0) return null;
  return buildTree(blocks as unknown as LogseqBlock[], pageName, showEmpty, defaultFetcher, defaultIdResolver, undefined, (page as any).uuid, enabledProperties);
}

export async function fetchBlockTree(
  uuid: string,
  showEmpty: boolean,
  fetcher: RefFetcher = defaultFetcher,
  idResolver: IdResolver = defaultIdResolver,
  tagProvider?: TagProvider,
  enabledProperties: Set<string> = new Set()
): Promise<TreeNode | null> {
  const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
  if (!block) return null;
  nextId = 0;
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  if (!tagProvider) tagProvider = new DefaultTagProvider(new Map([[block.uuid, block as any]]));
  return await convertBlock(block as unknown as LogseqBlock, 0, showEmpty, fetcher, cache, idResolver, idCache, tagProvider, enabledProperties);
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

/**
 * Scan for references to nodes outside the current tree and add them as a virtual branch.
 */
export async function includeOutScopeRefs(
  root: TreeNode,
  showEmpty: boolean,
  fetcher: RefFetcher = defaultFetcher,
  idResolver: IdResolver = defaultIdResolver,
  tagProvider?: TagProvider,
  enabledProperties: Set<string> = new Set()
): Promise<TreeNode> {
  const present = new Set<string>();
  (function collect(n: TreeNode): void {
    if (n.uuid) present.add(n.uuid);
    for (const c of n.children) collect(c);
  })(root);

  const outScopeUuids = new Set<string>();
  (function findOutScope(n: TreeNode): void {
    if (n.refs) {
      for (const ref of n.refs) {
        if (ref.targetUuid && !present.has(ref.targetUuid)) {
          outScopeUuids.add(ref.targetUuid);
        }
      }
    }
    for (const c of n.children) findOutScope(c);
  })(root);

  if (outScopeUuids.size === 0) return root;

  const virtualRoot: TreeNode = {
    name: "Out of Scope References",
    children: [],
    depth: 1,
    id: nextId++,
    uuid: "virtual-out-scope-root",
    tags: [],
    refs: [],
    properties: []
  };

  const idCache = new Map<number, string | null>();
  const cache = new Map<string, string>();
  if (!tagProvider) tagProvider = new DefaultTagProvider();

  for (const uuid of outScopeUuids) {
    const block = await logseq.Editor.getBlock(uuid);
    if (block) {
       const node = await convertBlock(block as unknown as LogseqBlock, 2, showEmpty, fetcher, cache, idResolver, idCache, tagProvider, enabledProperties);
       if (node) {
         node.depth = 2;
         virtualRoot.children.push(node);
       }
    } else {
       const page = await logseq.Editor.getPage(uuid);
       if (page) {
         const name = (page as any).originalName ?? (page as any).name ?? (page as any).title ?? uuid;
         const tags = await tagProvider.getTags(uuid);
         virtualRoot.children.push({
           name,
           children: [],
           depth: 2,
           id: nextId++,
           uuid,
           tags: [...tags],
           refs: [],
           properties: []
         });
       }
    }
  }

  if (virtualRoot.children.length > 0) {
    root.children.push(virtualRoot);
  }

  return root;
}
