/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCustomTagPropertyNames, getSelectedAdditionalRelationshipProperties, registerSettings, RELPROP_PREFIX } from "./settings";

describe("getCustomTagPropertyNames", () => {
  beforeEach(() => {
    vi.stubGlobal("logseq", {
      Editor: {
        getAllProperties: vi.fn(),
      },
    });
  });

  it("handles plain strings and strips namespaces", async () => {
    (logseq.Editor.getAllProperties as any).mockResolvedValue([
      "user.property/due-date",
      "priority",
      "logseq.invalid", // excluded by prefix
      "tags", // excluded by name
    ]);

    const props = await getCustomTagPropertyNames();
    expect(props).toEqual(["due-date", "priority"]);
  });

  it("handles objects with various title fields", async () => {
    (logseq.Editor.getAllProperties as any).mockResolvedValue([
      { title: "user.property/status" },
      { name: "category" },
      { originalName: "user.property/original" },
      { "block/title": "btitle" },
      { "db/ident": "dbident" },
      { unknown: "skip" }, // skipped + warning
    ]);

    const props = await getCustomTagPropertyNames();
    expect(props).toEqual(["btitle", "category", "dbident", "original", "status"]);
  });

  it("excludes built-in and system properties", async () => {
    (logseq.Editor.getAllProperties as any).mockResolvedValue([
      "logseq.property/created-at",
      "logseq.system/something",
      "tags",
      "relates_to",
      "depends_on",
      "TAGS",
      "RELATES-TO",
      "Depends_On",
      "custom-prop",
    ]);

    const props = await getCustomTagPropertyNames();
    expect(props).toEqual(["custom-prop"]);
  });

  it("handles deduplication and sorting", async () => {
    (logseq.Editor.getAllProperties as any).mockResolvedValue([
      "zebra",
      "apple",
      "user.property/apple", // duplicate of "apple" after normalization
    ]);

    const props = await getCustomTagPropertyNames();
    expect(props).toEqual(["apple", "zebra"]);
  });

  it("returns [] when getAllProperties is unavailable or fails", async () => {
    (logseq.Editor.getAllProperties as any).mockRejectedValue(new Error("failed"));
    const props1 = await getCustomTagPropertyNames();
    expect(props1).toEqual([]);

    vi.stubGlobal("logseq", {});
    const props2 = await getCustomTagPropertyNames();
    expect(props2).toEqual([]);
  });
});

describe("getSelectedAdditionalRelationshipProperties", () => {
  it("filters checked relprop_ entries", () => {
    vi.stubGlobal("logseq", {
      settings: {
        [`${RELPROP_PREFIX}status`]: true,
        [`${RELPROP_PREFIX}category`]: false,
        "other_setting": true,
      },
    });

    const selected = getSelectedAdditionalRelationshipProperties();
    expect(selected).toEqual(["status"]);
  });

  it("handles empty or missing settings", () => {
    vi.stubGlobal("logseq", { settings: {} });
    expect(getSelectedAdditionalRelationshipProperties()).toEqual([]);

    vi.stubGlobal("logseq", { settings: undefined });
    expect(getSelectedAdditionalRelationshipProperties()).toEqual([]);
  });
});

describe("registerSettings", () => {
  it("appends dynamic checkboxes to schema", async () => {
    vi.stubGlobal("logseq", {
      useSettingsSchema: vi.fn(),
      Editor: {
        getAllProperties: vi.fn().mockResolvedValue(["status"]),
      },
    });

    await registerSettings();

    const schema = (logseq.useSettingsSchema as any).mock.calls[0][0];
    expect(schema.some((i: any) => i.key === "additionalRelationshipHeading")).toBe(true);
    expect(schema.some((i: any) => i.key === `${RELPROP_PREFIX}status`)).toBe(true);
  });

  it("does not append heading if no custom props found", async () => {
    vi.stubGlobal("logseq", {
      useSettingsSchema: vi.fn(),
      Editor: {
        getAllProperties: vi.fn().mockResolvedValue(["tags"]),
      },
    });

    await registerSettings();

    const schema = (logseq.useSettingsSchema as any).mock.calls[0][0];
    expect(schema.some((i: any) => i.key === "additionalRelationshipHeading")).toBe(false);
  });
});
