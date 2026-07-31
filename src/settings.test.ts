/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { registerSettings } from "./settings";

describe("registerSettings", () => {
  it("registers static schema settings", async () => {
    vi.stubGlobal("logseq", {
      useSettingsSchema: vi.fn(),
    });

    await registerSettings();

    expect(logseq.useSettingsSchema).toHaveBeenCalled();
    const schema = (logseq.useSettingsSchema as any).mock.calls[0][0];

    // Core settings must be present in the schema
    expect(schema.some((i: any) => i.key === "defaultView")).toBe(true);
    expect(schema.some((i: any) => i.key === "maxDepth")).toBe(true);
    expect(schema.some((i: any) => i.key === "depthMode")).toBe(true);
    expect(schema.some((i: any) => i.key === "showRelationships")).toBe(true);
    expect(schema.some((i: any) => i.key === "showRelationshipLabels")).toBe(true);
  });
});
