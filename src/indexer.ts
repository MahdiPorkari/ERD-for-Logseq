import "@logseq/libs";
import type { TreeNode, NodeRef, TagInfo } from "./types";
import { getNodeTypePropertyNames, DefaultTagProvider, resolveNodeRefs, stripMarkdown, extractDisplayProperties, LogseqBlock } from "./adapter";

export type EdgeType = "reference" | "tag" | "property" | "parent-child";

export interface AdjacencyEdge {
  targetId: string;
  edgeType: EdgeType;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BackgroundIndexer {
  // Adjacency graph: sourceUuid -> list of edges
  public adjacencyGraph = new Map<string, AdjacencyEdge[]>();

  // Normalized page name -> page UUID
  public pageNameMap = new Map<string, string>();

  // dbId -> UUID string
  public idMap = new Map<number, string>();

  // UUID -> block/page entity cache for fast access during BFS
  public entityCache = new Map<string, any>();

  // Debounce timer for onChanged
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Node-type property names set
  private nodeTypeProps = new Set<string>();

  constructor() {}

  /**
   * Performs a full walk of the graph and builds the initial adjacency graph.
   */
  public async initialize(): Promise<void> {
    try {
      if (typeof logseq === "undefined" || !logseq.DB || !logseq.DB.datascriptQuery) {
        console.warn("[BackgroundIndexer] Logseq DB is not available.");
        return;
      }

      console.log("[BackgroundIndexer] Initializing full graph scan...");

      // Fetch node-type properties
      const props = await getNodeTypePropertyNames();
      this.nodeTypeProps = props;
      // Add standard ones
      this.nodeTypeProps.add("relates_to");
      this.nodeTypeProps.add("depends_on");

      // Query all blocks/pages that have a UUID
      const query = `[:find (pull ?b [*]) :where [?b :block/uuid]]`;
      const results = await logseq.DB.datascriptQuery(query);

      if (!Array.isArray(results)) {
        console.warn("[BackgroundIndexer] Datascript query returned invalid result.");
        return;
      }

      const flatEntities = results.flat() as any[];
      console.log(`[BackgroundIndexer] Pulled ${flatEntities.length} entities.`);

      this.clear();

      // First pass: Build idMap and pageNameMap
      for (const ent of flatEntities) {
        if (!ent || typeof ent !== "object") continue;

        const dbId = ent[":db/id"] ?? ent["db/id"];
        const uuidObj = ent[":block/uuid"] ?? ent["block/uuid"];
        let uuidStr = "";
        if (typeof uuidObj === "string") {
          uuidStr = uuidObj;
        } else if (uuidObj && typeof uuidObj === "object") {
          uuidStr = uuidObj.toString(); // handle if it's #uuid representation
        }

        if (dbId && uuidStr) {
          this.idMap.set(dbId, uuidStr);
          this.entityCache.set(uuidStr, ent);
        }

        // Detect pages (tolerant of both colon-prefixed and raw keys)
        const isPage = ent[":block/name"] !== undefined || ent["block/name"] !== undefined ||
                       ent[":block/title"] !== undefined || ent["block/title"] !== undefined;
        if (isPage && uuidStr) {
          const rawName = ent[":block/title"] ?? ent["block/title"] ?? ent[":block/name"] ?? ent["block/name"];
          if (rawName) {
            const normalized = rawName.toString().toLowerCase().trim();
            this.pageNameMap.set(normalized, uuidStr);
          }
        }
      }

      // Second pass: Extract edges for every entity
      for (const ent of flatEntities) {
        const uuidObj = ent[":block/uuid"] ?? ent["block/uuid"];
        let uuidStr = "";
        if (typeof uuidObj === "string") {
          uuidStr = uuidObj;
        } else if (uuidObj && typeof uuidObj === "object") {
          uuidStr = uuidObj.toString();
        }

        if (uuidStr) {
          const edges = await this.extractEntityEdges(ent);
          this.adjacencyGraph.set(uuidStr, edges);
        }
      }

      console.log(`[BackgroundIndexer] Built adjacency graph with ${this.adjacencyGraph.size} nodes.`);
    } catch (err) {
      console.error("[BackgroundIndexer] Initialization failed:", err);
    }
  }

  /**
   * Resets the entire index.
   */
  public clear(): void {
    this.adjacencyGraph.clear();
    this.pageNameMap.clear();
    this.idMap.clear();
    this.entityCache.clear();
  }

  /**
   * Extracts outbound relationships for a single entity (page or block).
   */
  public async extractEntityEdges(ent: any): Promise<AdjacencyEdge[]> {
    const edges: AdjacencyEdge[] = [];
    const seen = new Set<string>();

    const addEdge = (targetId: string, edgeType: EdgeType) => {
      const sig = `${targetId}|${edgeType}`;
      if (!seen.has(sig) && targetId) {
        seen.add(sig);
        edges.push({ targetId, edgeType });
      }
    };

    // --- a. Parent/Child Relationships ---
    const parentVal = ent[":block/parent"] ?? ent["block/parent"];
    if (parentVal) {
      let parentDbId: number | null = null;
      if (typeof parentVal === "number") {
        parentDbId = parentVal;
      } else if (typeof parentVal === "object" && parentVal !== null) {
        parentDbId = parentVal["db/id"] ?? parentVal[":db/id"] ?? parentVal["id"];
      }

      if (parentDbId) {
        const parentUuid = this.idMap.get(parentDbId);
        const childUuid = ent[":block/uuid"] ?? ent["block/uuid"];
        // In Logseq, parent-child flows from Parent -> Child.
        // If B has parent A, then A has child B, meaning an edge from parentUuid to childUuid.
        if (parentUuid && childUuid) {
          let parentEdges = this.adjacencyGraph.get(parentUuid);
          if (!parentEdges) {
            parentEdges = [];
            this.adjacencyGraph.set(parentUuid, parentEdges);
          }
          if (!parentEdges.some(e => e.targetId === childUuid && e.edgeType === "parent-child")) {
            parentEdges.push({ targetId: childUuid as string, edgeType: "parent-child" });
          }
        }
      }
    }

    // --- b. Page/Block References ([[...]] links) ---
    const content = ent[":block/content"] ?? ent["block/content"] ?? ent[":block/title"] ?? ent["block/title"] ?? "";
    if (typeof content === "string" && content) {
      // Find all [[...]] references
      const uuidRe = /\[\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/gi;
      const uuidMatches = content.matchAll(uuidRe);
      for (const m of uuidMatches) {
        addEdge(m[1], "reference");
      }

      // Find page name links (non-UUID bracket links)
      const nameRe = /\[\[([^\]]+)\]\]/g;
      let nameMatch;
      while ((nameMatch = nameRe.exec(content)) !== null) {
        const pageName = nameMatch[1].trim();
        if (!UUID_RE.test(pageName)) {
          const norm = pageName.toLowerCase();
          const targetUuid = this.pageNameMap.get(norm);
          if (targetUuid) {
            addEdge(targetUuid, "reference");
          }
        }
      }

      // Find hashtags (e.g. #tag)
      const tagRe = /#([a-zA-Z0-9_-]+)/g;
      let tagMatch;
      while ((tagMatch = tagRe.exec(content)) !== null) {
        const tagName = tagMatch[1].toLowerCase().trim();
        const targetUuid = this.pageNameMap.get(tagName);
        if (targetUuid) {
          addEdge(targetUuid, "reference");
        }
      }
    }

    // --- c. Tag and Class Relationships ---
    const tagsVal = ent[":block/tags"] ?? ent["block/tags"];
    if (tagsVal) {
      const tagUuids = await this.extractRefUuidsFromVal(tagsVal);
      for (const tagUuid of tagUuids) {
        addEdge(tagUuid, "tag");
      }
    }

    // Class extends
    const extendsVal = ent[":logseq.property.class/extends"] ?? ent["logseq.property.class/extends"];
    if (extendsVal) {
      const extUuids = await this.extractRefUuidsFromVal(extendsVal);
      for (const extUuid of extUuids) {
        addEdge(extUuid, "tag");
      }
    }

    // Also parse properties.tags or tags:: property
    const props = ent.properties ?? ent[":properties"] ?? {};
    if (props.tags) {
      const tagUuids = await this.extractRefUuidsFromVal(props.tags);
      for (const tagUuid of tagUuids) {
        addEdge(tagUuid, "tag");
      }
    }

    // --- d. Node-type Property Values ---
    for (const [key, value] of Object.entries(ent)) {
      const normKey = this.normalizePropertyName(key);
      if (this.nodeTypeProps.has(normKey) && normKey !== "tags") {
        const uuids = await this.extractRefUuidsFromVal(value);
        for (const targetUuid of uuids) {
          addEdge(targetUuid, "property");
        }
      }
    }
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        const normKey = this.normalizePropertyName(key);
        if (this.nodeTypeProps.has(normKey) && normKey !== "tags") {
          const uuids = await this.extractRefUuidsFromVal(value);
          for (const targetUuid of uuids) {
            addEdge(targetUuid, "property");
          }
        }
      }
    }

    return edges;
  }

  /**
   * Helper to resolve various entity reference formats into UUIDs
   */
  private async extractRefUuidsFromVal(value: unknown): Promise<string[]> {
    if (value == null) return [];
    if (Array.isArray(value)) {
      const all = await Promise.all(value.map((v) => this.extractRefUuidsFromVal(v)));
      return all.flat();
    }
    if (typeof value === "string") {
      if (UUID_RE.test(value)) return [value];
      const norm = value.toLowerCase().trim();
      const target = this.pageNameMap.get(norm);
      if (target) return [target];
      return [];
    }
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const blockUuid = obj["block/uuid"] ?? obj[":block/uuid"];
      if (typeof blockUuid === "string" && UUID_RE.test(blockUuid)) return [blockUuid];

      const uuid = obj["uuid"] ?? obj[":uuid"];
      if (typeof uuid === "string" && UUID_RE.test(uuid)) return [uuid];

      const rawId = obj["db/id"] ?? obj[":db/id"] ?? obj["id"];
      if (typeof rawId === "number") {
        const resolved = this.idMap.get(rawId);
        if (resolved) return [resolved];
      }
    }
    return [];
  }

  private normalizePropertyName(key: string): string {
    let name = key.startsWith(":") ? key.slice(1) : key;
    if (name.startsWith("user.property/")) {
      name = name.slice("user.property/".length);
    } else if (name.startsWith("logseq.")) {
      name = name.slice("logseq.".length);
    }
    const suffixMatch = name.match(/^(.+)-[a-zA-Z0-9]+$/);
    if (suffixMatch) {
      name = suffixMatch[1];
    }
    return name.replace(/[_-]/g, " ").toLowerCase().trim().replace(/\s+/g, "_");
  }

  /**
   * Set up debounced onChange DB listener
   */
  public subscribeToChanges(): () => void {
    if (typeof logseq === "undefined" || !logseq.DB || !logseq.DB.onChanged) {
      return () => {};
    }

    const off = logseq.DB.onChanged(({ blocks, txData }) => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(async () => {
        console.log("[BackgroundIndexer] DB changed, incrementally updating index...");
        await this.initialize();
      }, 300);
    });

    return () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      off();
    };
  }

  /**
   * Performs BFS to build a Spanning Tree from the seed nodes of the active page.
   */
  public async buildERDV2Tree(
    pageUuid: string,
    blockUuids: string[],
    pageName: string,
    fetcher: (uuid: string) => Promise<string | null> = async () => null
  ): Promise<TreeNode> {
    let localNextId = 0;
    const visited = new Set<string>();

    const tagProvider = new DefaultTagProvider(this.entityCache);
    const idCache = new Map<number, string | null>();
    const idResolver = async (id: number) => this.idMap.get(id) || null;

    // Helper to build a TreeNode for a UUID using cached/extracted entity details
    const createNode = async (uuid: string, depth: number): Promise<TreeNode> => {
      const ent = this.entityCache.get(uuid);
      let name = "(empty)";
      let properties: { name: string; value: string }[] = [];
      let tags: TagInfo[] = [];

      if (ent) {
        const rawText = ent[":block/content"] ?? ent["block/content"] ?? ent[":block/title"] ?? ent["block/title"] ?? "";
        const resolved = await resolveNodeRefs(rawText, fetcher);
        name = stripMarkdown(resolved) || "(empty)";
        properties = await extractDisplayProperties(ent, idCache, idResolver, fetcher);
        const extractedTags = await tagProvider.getTags(uuid);
        tags = [...extractedTags];
      } else {
        const fetchedTitle = await fetcher(uuid);
        if (fetchedTitle) {
          name = stripMarkdown(fetchedTitle);
        }
      }

      return {
        name,
        children: [],
        depth,
        id: localNextId++,
        uuid,
        properties,
        tags,
        refs: []
      };
    };

    // Initialize root node for the page
    const rootNode = await createNode(pageUuid, 0);
    rootNode.name = pageName;
    visited.add(pageUuid);

    // Build tree nodes for direct block children residing on the page
    const seedBlocks: TreeNode[] = [];
    for (const blockUuid of blockUuids) {
      if (!visited.has(blockUuid)) {
        visited.add(blockUuid);
        const bNode = await createNode(blockUuid, 1);
        seedBlocks.push(bNode);
        rootNode.children.push(bNode);
      }
    }

    // BFS queue processes nodes and expands their tree structure
    const queue: TreeNode[] = [...seedBlocks];
    // If there were no blocks, enqueue the root itself to expand from the page
    if (queue.length === 0) {
      queue.push(rootNode);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const edges = this.adjacencyGraph.get(current.uuid) || [];

      // Precedence rule sorting: parent-child comes first, then other types
      const sortedEdges = [...edges].sort((a, b) => {
        if (a.edgeType === "parent-child" && b.edgeType !== "parent-child") return -1;
        if (a.edgeType !== "parent-child" && b.edgeType === "parent-child") return 1;
        return 0;
      });

      for (const edge of sortedEdges) {
        const targetId = edge.targetId;
        if (!targetId) continue;

        if (visited.has(targetId)) {
          // If already visited, add as a .refs cross-link
          if (!current.refs) current.refs = [];
          // Avoid duplicate reference entries of the same type to the same target
          if (!current.refs.some(r => r.targetUuid === targetId && r.kind === edge.edgeType)) {
            current.refs.push({ kind: edge.edgeType, targetUuid: targetId });
          }
        } else {
          // First time seeing this target: form a tree branch child and enqueue
          visited.add(targetId);
          const childNode = await createNode(targetId, current.depth + 1);
          current.children.push(childNode);
          queue.push(childNode);
        }
      }
    }

    return rootNode;
  }
}

export const globalIndexer = new BackgroundIndexer();
