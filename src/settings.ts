import type { ViewId } from "./types";

export type DepthMode = "recursive" | "flat";
export type DockBehavior = "mirror" | "overlay";

export interface PluginSettings {
  defaultView: ViewId;
  maxDepth: number;
  depthMode: DepthMode;
  showEmptyBlocks: boolean;
  animateViewSwitch: boolean;
  showRelationships: boolean;
  showRelationshipLabels: boolean;
  databaseWideDiscovery: boolean;
  dockBehavior: DockBehavior;
  dockWidth: number;
}

export const DOCK_WIDTH_MIN = 20;
export const DOCK_WIDTH_MAX = 70;
export const RELPROP_PREFIX = "relprop_";

export const DEFAULTS: PluginSettings = {
  defaultView: "tree",
  maxDepth: 3,
  depthMode: "recursive",
  showEmptyBlocks: false,
  animateViewSwitch: true,
  showRelationships: true,
  showRelationshipLabels: false,
  databaseWideDiscovery: false,
  dockBehavior: "mirror",
  dockWidth: 40,
};

function normalizeForExclusion(name: string): string {
  return name.replace(/[_-]/g, " ").toLowerCase().trim().replace(/\s+/g, "_");
}

function stripNamespace(name: string): string {
  if (name.startsWith("user.property/")) {
    return name.slice("user.property/".length);
  }
  if (name.startsWith("logseq.")) {
    return name.slice("logseq.".length);
  }
  return name;
}

export async function getCustomTagPropertyNames(): Promise<string[]> {
  try {
    if (typeof logseq === "undefined" || !logseq.Editor || !logseq.Editor.getAllProperties) {
      return [];
    }
    const allProperties = await logseq.Editor.getAllProperties();
    if (!allProperties) return [];

    console.log("AdditionalRelationship: getAllProperties raw sample", allProperties.slice(0, 3));

    const discovered = new Map<string, string>(); // normalized -> raw
    const exclusions = new Set(["relates_to", "depends_on", "tags"]);

    for (const entry of allProperties) {
      if (!entry) continue;

      let rawIdentifier: string | undefined;
      let rawDisplayName: string | undefined;

      if (typeof entry === "string") {
        rawIdentifier = entry;
      } else if (typeof entry === "object") {
        const obj = entry as any;
        rawIdentifier = obj.title || obj.name || obj.originalName || obj["block/title"] || obj["db/ident"];
        if (!rawIdentifier) {
          console.warn("AdditionalRelationship: unrecognized property entry shape, skipping", entry);
          continue;
        }
      }

      if (rawIdentifier) {
        if (rawIdentifier.toLowerCase().startsWith("logseq")) {
          continue;
        }
        rawDisplayName = stripNamespace(rawIdentifier);
        const normalized = normalizeForExclusion(rawDisplayName);
        if (exclusions.has(normalized)) {
          continue;
        }
        if (!discovered.has(normalized)) {
          discovered.set(normalized, rawDisplayName);
        }
      }
    }

    return Array.from(discovered.values()).sort((a, b) => a.localeCompare(b));
  } catch (e) {
    return [];
  }
}

export async function registerSettings(): Promise<void> {
  const customProps = await getCustomTagPropertyNames();

  const schema: any[] = [
    {
      key: "defaultView",
      type: "enum",
      enumChoices: [
        "tree",
        "table",
        "roadmap_alt",
        "roadmap",
        "mind",
        "rtree",
        "fish",
        "tmap",
        "erd",
      ],
      enumPicker: "select",
      default: DEFAULTS.defaultView,
      title: "Default View",
      description: "Which diagram view to show when opening OutlineCanvas.",
    },
    {
      key: "maxDepth",
      type: "number",
      default: DEFAULTS.maxDepth,
      title: "Maximum Depth",
      description:
        "Maximum nesting depth to render (deeper nodes are flattened).",
    },
    {
      key: "depthMode",
      type: "enum",
      enumChoices: ["recursive", "flat"],
      enumPicker: "select",
      default: DEFAULTS.depthMode,
      title: "Depth Mode",
      description:
        "Recursive: show each depth level as independent connected nodes. Flat: collapse deeper levels into breadcrumb-style leaf labels.",
    },
    {
      key: "showEmptyBlocks",
      type: "boolean",
      default: DEFAULTS.showEmptyBlocks,
      title: "Show Empty Blocks",
      description: "Include blocks with no title in the diagram.",
    },
    {
      key: "animateViewSwitch",
      type: "boolean",
      default: DEFAULTS.animateViewSwitch,
      title: "Animate View Transitions",
      description: "Enable fade animation when switching diagram views.",
    },
    {
      key: "showRelationships",
      type: "boolean",
      default: DEFAULTS.showRelationships,
      title: "Show Relationship Connectors",
      description:
        "Draw lines between blocks that reference each other via 'relates_to' or 'depends_on' node properties (Tree Chart, Right Tree, Mind Map only).",
    },
    {
      key: "showRelationshipLabels",
      type: "boolean",
      default: DEFAULTS.showRelationshipLabels,
      title: "Label Relationship Connectors",
      description:
        "Display the property name ('depends_on' / 'relates_to') as a small pill at the midpoint of each connector. Useful as a visual cue at first; turn off once the line styles are familiar.",
    },
    {
      key: "databaseWideDiscovery",
      type: "boolean",
      default: DEFAULTS.databaseWideDiscovery,
      title: "Database-wide Discovery",
      description:
        "ERD view only. When enabled, relationship traversal is not limited " +
        "to the current page: the diagram recursively follows any user property " +
        "containing a valid page or block reference across the entire graph " +
        "until no further references are found. Can be slow on large graphs.",
    },
    {
      key: "dockBehavior",
      type: "enum",
      enumChoices: ["mirror", "overlay"],
      enumPicker: "select",
      default: DEFAULTS.dockBehavior,
      title: "Dock Behavior",
      description:
        "Mirror: canvas reserves its strip in the host layout so the right sidebar opens to the left of the canvas. Overlay: canvas floats above the app without resizing it, sidebar opens under it. In both modes the sidebar can be toggled (T R) independently — the canvas only closes via ✕ or Escape.",
    },
    {
      key: "dockWidth",
      type: "number",
      default: DEFAULTS.dockWidth,
      title: "Canvas Width (vw)",
      description: `Width of the docked canvas as a percentage of the viewport (${DOCK_WIDTH_MIN}–${DOCK_WIDTH_MAX}). Drag the left edge of the canvas to adjust live; this number is the persisted value.`,
    },
  ];

  if (customProps.length > 0) {
    schema.push({
      key: "additionalRelationshipHeading",
      type: "heading",
      title: "Additional Relationship",
      description: "Select which custom tag properties to treat as additional relationships.",
      default: null,
    });

    for (const name of customProps) {
      schema.push({
        key: `${RELPROP_PREFIX}${name}`,
        type: "boolean",
        title: name,
        description: `Include "${name}" as an additional relationship property.`,
        default: false,
      });
    }
  }

  logseq.useSettingsSchema(schema);
}

export function getSettings(): PluginSettings {
  return {
    defaultView:
      (logseq.settings?.defaultView as ViewId) ?? DEFAULTS.defaultView,
    maxDepth: (logseq.settings?.maxDepth as number) ?? DEFAULTS.maxDepth,
    depthMode:
      (logseq.settings?.depthMode as DepthMode) ?? DEFAULTS.depthMode,
    showEmptyBlocks:
      (logseq.settings?.showEmptyBlocks as boolean) ?? DEFAULTS.showEmptyBlocks,
    animateViewSwitch:
      (logseq.settings?.animateViewSwitch as boolean) ??
      DEFAULTS.animateViewSwitch,
    showRelationships:
      (logseq.settings?.showRelationships as boolean) ??
      DEFAULTS.showRelationships,
    showRelationshipLabels:
      (logseq.settings?.showRelationshipLabels as boolean) ??
      DEFAULTS.showRelationshipLabels,
    databaseWideDiscovery:
      (logseq.settings?.databaseWideDiscovery as boolean) ??
      DEFAULTS.databaseWideDiscovery,
    dockBehavior:
      (logseq.settings?.dockBehavior as DockBehavior) ?? DEFAULTS.dockBehavior,
    dockWidth: Math.max(
      DOCK_WIDTH_MIN,
      Math.min(
        DOCK_WIDTH_MAX,
        (logseq.settings?.dockWidth as number) ?? DEFAULTS.dockWidth
      )
    ),
  };
}

export function getSelectedAdditionalRelationshipProperties(): string[] {
  const settings = (logseq.settings || {}) as Record<string, any>;
  return Object.keys(settings)
    .filter((key) => key.startsWith(RELPROP_PREFIX) && settings[key] === true)
    .map((key) => key.slice(RELPROP_PREFIX.length));
}
