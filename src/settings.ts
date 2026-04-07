import type { ViewId } from "./types";

export interface PluginSettings {
  defaultView: ViewId;
  maxDepth: number;
  showEmptyBlocks: boolean;
  animateViewSwitch: boolean;
}

export const DEFAULTS: PluginSettings = {
  defaultView: "tree",
  maxDepth: 3,
  showEmptyBlocks: false,
  animateViewSwitch: true,
};

export function registerSettings(): void {
  logseq.useSettingsSchema([
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
  ]);
}

export function getSettings(): PluginSettings {
  return {
    defaultView:
      (logseq.settings?.defaultView as ViewId) ?? DEFAULTS.defaultView,
    maxDepth: (logseq.settings?.maxDepth as number) ?? DEFAULTS.maxDepth,
    showEmptyBlocks:
      (logseq.settings?.showEmptyBlocks as boolean) ?? DEFAULTS.showEmptyBlocks,
    animateViewSwitch:
      (logseq.settings?.animateViewSwitch as boolean) ??
      DEFAULTS.animateViewSwitch,
  };
}
