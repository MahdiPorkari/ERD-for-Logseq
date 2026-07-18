/* eslint-disable */
import "@logseq/libs";
import type { TreeNode, NodeRef, RelKind, TagInfo } from "./types";

const REL_KEY_RE = /^:?user\.property\/(relates_to|depends_on)(?:-[A-Za-z0-9_-]+)?$/;
const USER_PROP_RE = /^:?user\.property\/(.+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return b?.uuid || null;
  } catch { return null; }
};

export class DefaultTagProvider implements TagProvider {
  private cache = new Map<string, readonly TagInfo[]>();
  constructor(private blockMap?: Map<string, LogseqBlock>) {}

  async getTags(blockUuid: string): Promise<readonly TagInfo[]> {
    if (this.cache.has(blockUuid)) return this.cache.get(blockUuid)!;

    // Key: normalized title (lowercase, trimmed), Value: TagInfo
    const tagsMap = new Map<string, TagInfo>();

    // --- Tier 1: Authoritative Datascript query ---
    // Strictly queries :block/tags to find actual tags (inline #tag or [[tag]] or tags:: property)
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

    // Tier 2: Properties fallback
    // Strictly checks only 'tags' related properties to avoid capturing other page references
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
    // Only process values for keys that are strictly related to tags
    for (const [key, value] of Object.entries(obj)) {
      const k = key.startsWith(":") ? key.slice(1) : key;
      if (k === "tags" || k === "block/tags" || k.startsWith("user.property/tags")) {
        this.processValue(value, tagsMap);
      }
    }
    // Also check the nested properties object if it exists
    if (obj.properties) {
      for (const [key, value] of Object.entries(obj.properties)) {
        if (key === "tags") {
          this.processValue(value, tagsMap);
        }
      }
    }
  }

  private processValue(val: unknown, tagsMap: Map<string, TagInfo>) {
    if (typeof val === "string") {
      // Split on commas first to separate multiple tags
      const items = val.split(/\s*,\s*/);
      for (let item of items) {
        item = item.trim();
        if (!item) continue;

        let title = item;
        // If it's enclosed in [[...]], extract inner text (multi-word support)
        const bracketMatch = title.match(/^\[\[(.+)\]\]$/);
        if (bracketMatch) {
          title = bracketMatch[1].trim();
        } else {
          // Remove leading '#' if present
          if (title.startsWith("#")) title = title.slice(1).trim();
        }

        const normalized = title.toLowerCase().trim();
        if (normalized && !tagsMap.has(normalized)) {
          tagsMap.set(normalized, { uuid: title, title });
        }
      }
    } else if (Array.isArray(val)) {
      val.forEach(v => this.processValue(v, tagsMap));
    } else if (typeof val === "object" && val !== null) {
      const v = val as any;
      const title = v.title || v.name || v[":block/title"] || v["block/title"] || v[":block/original-name"] || v["block/original-name"];
      const uuid = v.uuid || v[":block/uuid"] || v["block/uuid"];
      if (title) {
        const normalized = title.toLowerCase().trim();
        if (normalized && !tagsMap.has(normalized)) {
          tagsMap.set(normalized, { uuid: uuid || title, title });
        }
      }
    }
  }
}

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

export async function resolveNodeRefs(
  text: string,
  fetcher: RefFetcher,
  cache: Map<string, string> = new Map(),
  depth: number = 0
): Promise<string> {
  if (!text || depth > 10) return text;
  const re = /\[\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi;
  const matches = Array.from(text.matchAll(re));
  if (matches.length === 0) return text;

  let out = text;
  for (const m of matches) {
    const uuid = m[1];
    const fullMatch = m[0];
    let resolved: string | null | undefined = cache.get(uuid);
    if (resolved === undefined) {
      try {
        const title = await fetcher(uuid);
        if (title) {
          resolved = await resolveNodeRefs(title, fetcher, cache, depth + 1);
          cache.set(uuid, resolved);
        } else {
          resolved = `((unresolved-${uuid.slice(0, 8)}))`;
        }
      } catch (err) {
        resolved = `((error-${uuid.slice(0, 8)}))`;
      }
    }
    out = out.replace(fullMatch, resolved!);
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
    if (typeof obj.uuid === "string" && UUID_RE.test(obj.uuid as string)) return [obj.uuid as string];
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


function matchAdditionalRelKey(key: string, selected: string[]): string | null {
  if (selected.length === 0) return null;
  const map = new Map<string, string>();
  for (const s of selected) {
    const norm = s.replace(/[_-]/g, " ").toLowerCase().trim().replace(/\s+/g, "_");
    map.set(norm, s);
  }
  const m = USER_PROP_RE.exec(key);
  if (!m) return null;
  let rawName = m[1];
  const suffixMatch = rawName.match(/^(.+)-[a-zA-Z0-9]+$/);
  if (suffixMatch) rawName = suffixMatch[1];
  const normKey = rawName.replace(/[_-]/g, " ").toLowerCase().trim().replace(/\s+/g, "_");
  return map.get(normKey) || null;
}

async function extractRefs(
  block: LogseqBlock,
  idCache: Map<number, string | null>,
  idResolver: IdResolver,
  additionalRelKeys: string[] = []
): Promise<{ kind: RelKind; targetUuid: string }[]> {
  const out: { kind: RelKind; targetUuid: string }[] = [];
  const seen = new Set<string>();
  const addFrom = async (key: string, value: unknown): Promise<void> => {
    const m = REL_KEY_RE.exec(key);
    let kind: RelKind | null = null;
    if (m) {
      kind = m[1] as RelKind;
    } else {
      kind = matchAdditionalRelKey(key, additionalRelKeys);
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
  fetcher: RefFetcher
): Promise<{ name: string; value: string }[]> {
  const propsMap = new Map<string, { rawName: string; value: unknown }>();
  const processEntry = (key: string, value: unknown) => {
    const m = USER_PROP_RE.exec(key);
    if (!m) return;
    let rawName = m[1];
    const suffixMatch = rawName.match(/^(.+)-[a-zA-Z0-9]+$/);
    if (suffixMatch) rawName = suffixMatch[1];
    const normalizedKey = rawName.replace(/[_-]/g, " ").toLowerCase().trim().replace(/\s+/g, "_");
    if (normalizedKey === "relates_to" || normalizedKey === "depends_on" || normalizedKey === "tags") return;
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
  additionalRelKeys: string[] = []
): Promise<TreeNode | null> {
  const rawText = block.content ?? block.title ?? (block as any)[":block/title"] ?? "";
  const resolved = await resolveNodeRefs(rawText, fetcher, cache);
  const name = stripMarkdown(resolved);
  if (!name && (!block.children || block.children.length === 0) && !showEmpty) return null;
  const properties = await extractDisplayProperties(block, idCache, idResolver, fetcher);
  const tags = await tagProvider.getTags(block.uuid);
  const refs = await extractRefs(block, idCache, idResolver, additionalRelKeys);
  const children: TreeNode[] = [];
  if (block.children) {
    for (const child of block.children) {
      const node = await convertBlock(child, depth + 1, showEmpty, fetcher, cache, idResolver, idCache, tagProvider, additionalRelKeys);
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
  additionalRelKeys: string[] = []
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
    const node = await convertBlock(block, 1, showEmpty, fetcher, cache, idResolver, idCache, tagProvider, additionalRelKeys);
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

export async function fetchTree(showEmpty: boolean, additionalRelKeys: string[] = []): Promise<TreeNode | null> {
  const page = await logseq.Editor.getCurrentPage();
  if (!page) return null;
  const pageName = (page as any).originalName ?? (page as any).name ?? "Untitled";
  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (!blocks || blocks.length === 0) return null;
  return buildTree(blocks as unknown as LogseqBlock[], pageName, showEmpty, defaultFetcher, defaultIdResolver, undefined, (page as any).uuid, additionalRelKeys);
}

export async function fetchBlockTree(
  uuid: string,
  showEmpty: boolean,
  fetcher: RefFetcher = defaultFetcher,
  idResolver: IdResolver = defaultIdResolver,
  tagProvider?: TagProvider,
  additionalRelKeys: string[] = []
): Promise<TreeNode | null> {
  const block = await logseq.Editor.getBlock(uuid, { includeChildren: true });
  if (!block) return null;
  nextId = 0;
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  if (!tagProvider) tagProvider = new DefaultTagProvider(new Map([[block.uuid, block as any]]));
  return await convertBlock(block as unknown as LogseqBlock, 0, showEmpty, fetcher, cache, idResolver, idCache, tagProvider, additionalRelKeys);
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

export function filterRefsByKind(root: TreeNode, allowedKinds: Set<RelKind>): TreeNode {
  return (function walk(n: TreeNode): TreeNode {
    const refs = n.refs?.filter((r) => allowedKinds.has(r.kind));
    return { ...n, children: n.children.map(walk), refs: refs && refs.length ? refs : [] };
  })(root);
}

export async function expandOutOfScopeRefs(
  root: TreeNode,
  allowedKinds: string[],
  fetcher: RefFetcher,
  idResolver: IdResolver,
  tagProvider: TagProvider,
  blockFetcher: (uuid: string) => Promise<LogseqBlock | null>
): Promise<TreeNode> {
  const present = new Set<string>();
  (function collect(n: TreeNode): void {
    if (n.uuid) present.add(n.uuid);
    for (const c of n.children) collect(c);
  })(root);

  const cloned = structuredClone(root);
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  let localNextId = 1000000 + Math.floor(Math.random() * 1000000);

  async function walk(node: TreeNode): Promise<void> {
    for (const child of node.children) {
      await walk(child);
    }

    if (!node.refs || node.refs.length === 0) return;

    const syntheticChildren: TreeNode[] = [];
    const newRefs: NodeRef[] = [];
    const seenTargetsForThisNode = new Set<string>();

    for (const ref of node.refs) {
      const isAllowed = allowedKinds.includes(ref.kind);
      const isOutOfTree = !present.has(ref.targetUuid);

      if (isAllowed && isOutOfTree) {
        if (!seenTargetsForThisNode.has(ref.targetUuid)) {
          seenTargetsForThisNode.add(ref.targetUuid);
          try {
            const targetBlock = await blockFetcher(ref.targetUuid);
            if (targetBlock) {
              const rawText = targetBlock.content ?? targetBlock.title ?? (targetBlock as any)[":block/title"] ?? "";
              const resolved = await resolveNodeRefs(rawText, fetcher, cache);
              const name = stripMarkdown(resolved) || "(empty)";
              const tags = await tagProvider.getTags(targetBlock.uuid);
              const properties = await extractDisplayProperties(targetBlock, idCache, idResolver, fetcher);

              const syntheticNode: TreeNode = {
                name,
                children: [],
                depth: node.depth + 1,
                id: localNextId++,
                uuid: targetBlock.uuid,
                properties,
                tags: [...tags],
                refs: []
              };
              syntheticChildren.push(syntheticNode);
            }
          } catch (err) {
            console.error("expandOutOfScopeRefs: failed to fetch block", ref.targetUuid, err);
          }
        }
      } else {
        newRefs.push(ref);
      }
    }

    node.children.push(...syntheticChildren);
    node.refs = newRefs;
  }

  await walk(cloned);
  return cloned;
}


export interface DatabaseWideDiscoveryOptions {
  /** Safety cap on total nodes added by discovery. Default 500. */
  maxNodes?: number;
}

export async function expandDatabaseWide(
  root: TreeNode,
  fetcher: RefFetcher,
  idResolver: IdResolver,
  tagProvider: TagProvider,
  blockFetcher: (uuid: string) => Promise<LogseqBlock | null>,
  additionalRelKeys: string[] = [],
  options: DatabaseWideDiscoveryOptions = {}
): Promise<TreeNode> {
  // Relationship Exclusion: unlike expandOutOfScopeRefs which excludes relates_to and depends_on,
  // expandDatabaseWide treats relates_to, depends_on, AND any custom additionalRelKeys as traversable.
  // Refer to docs/feature-erd-out-of-scope-references.md's "Relationship Exclusion" section.

  const cloned = structuredClone(root);
  const cache = new Map<string, string>();
  const idCache = new Map<number, string | null>();
  let localNextId = 1000000 + Math.floor(Math.random() * 1000000);

  const visited = new Set<string>();
  function collectUuids(node: TreeNode) {
    if (node.uuid) {
      visited.add(node.uuid);
    }
    for (const child of node.children) {
      collectUuids(child);
    }
  }
  collectUuids(cloned);

  const limit = options.maxNodes ?? 500;
  let addedNodesCount = 0;
  let loggedWarning = false;

  const queue: TreeNode[] = [];
  function enqueueExisting(node: TreeNode) {
    queue.push(node);
    for (const child of node.children) {
      enqueueExisting(child);
    }
  }
  enqueueExisting(cloned);

  while (queue.length > 0) {
    const parent = queue.shift()!;
    if (!parent.refs || parent.refs.length === 0) continue;

    const keepRefs: NodeRef[] = [];
    const seenTargetsForThisNode = new Set<string>();

    for (const ref of parent.refs) {
      const isAllowed = ref.kind === "relates_to" || ref.kind === "depends_on" || additionalRelKeys.includes(ref.kind);
      const isNotVisited = !visited.has(ref.targetUuid);

      if (isAllowed && isNotVisited) {
        if (seenTargetsForThisNode.has(ref.targetUuid)) {
          continue;
        }
        seenTargetsForThisNode.add(ref.targetUuid);

        if (addedNodesCount >= limit) {
          if (!loggedWarning) {
            console.warn("[OutlineCanvas] Database-wide Discovery stopped at maxNodes=" + limit);
            loggedWarning = true;
          }
          continue;
        }

        if (visited.has(ref.targetUuid)) {
          // Visited by another node in the queue while this was waiting.
          // Keep the ref so overlay edges can draw it.
          keepRefs.push(ref);
          continue;
        }

        visited.add(ref.targetUuid);

        try {
          const targetBlock = await blockFetcher(ref.targetUuid);
          if (targetBlock) {
            const rawText = targetBlock.content ?? targetBlock.title ?? (targetBlock as any)[":block/title"] ?? "";
            const resolved = await resolveNodeRefs(rawText, fetcher, cache);
            const name = stripMarkdown(resolved) || "(empty)";
            const tags = await tagProvider.getTags(targetBlock.uuid);
            const properties = await extractDisplayProperties(targetBlock, idCache, idResolver, fetcher);
            const childRefs = await extractRefs(targetBlock, idCache, idResolver, additionalRelKeys);

            const syntheticNode: TreeNode = {
              name,
              children: [],
              depth: parent.depth + 1,
              id: localNextId++,
              uuid: targetBlock.uuid,
              properties,
              tags: [...tags],
              refs: childRefs
            };

            parent.children.push(syntheticNode);
            addedNodesCount++;
            queue.push(syntheticNode);
          }
        } catch (err) {
          console.error("expandDatabaseWide: failed to fetch block", ref.targetUuid, err);
        }
      } else {
        keepRefs.push(ref);
      }
    }

    parent.refs = keepRefs;
  }

  return cloned;
}
