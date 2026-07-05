/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { layoutERD } from "./erd";
import type { TreeNode } from "../types";

describe("layoutERD box growth", () => {
  const node = (name: string, properties: { name: string; value: string }[] = []): TreeNode => ({
    name,
    uuid: "u",
    depth: 0,
    id: 1,
    children: [],
    properties,
  });

  it("grows height when properties are added", () => {
    const root0 = node("Header");
    const result0 = layoutERD(root0, 5);
    const box0 = result0.elements.find(e => e.type === "box") as any;
    const h0 = box0.h;

    const root1 = node("Header", [{ name: "Prop", value: "Value" }]);
    const result1 = layoutERD(root1, 5);
    const box1 = result1.elements.find(e => e.type === "box") as any;
    const h1 = box1.h;

    expect(h1).toBeGreaterThan(h0);
  });

  it("grows unbounded with many properties", () => {
    const root5 = node("Header", Array(5).fill({ name: "P", value: "V" }));
    const result5 = layoutERD(root5, 5);
    const box5 = result5.elements.find(e => e.type === "box") as any;
    const h5 = box5.h;

    const root10 = node("Header", Array(10).fill({ name: "P", value: "V" }));
    const result10 = layoutERD(root10, 5);
    const box10 = result10.elements.find(e => e.type === "box") as any;
    const h10 = box10.h;

    expect(h10).toBeGreaterThan(h5);
  });

  it("grows with wrapped long property values", () => {
    const short = node("H", [{ name: "P", value: "Short" }]);
    const hShort = (layoutERD(short, 5).elements.find(e => e.type === "box") as any).h;

    const long = node("H", [{ name: "P", value: "A very long property value that will definitely wrap across multiple lines in the ERD view entity box" }]);
    const hLong = (layoutERD(long, 5).elements.find(e => e.type === "box") as any).h;

    expect(hLong).toBeGreaterThan(hShort);
  });

  it("includes divider and property rows as separate elements", () => {
    const root = node("Header", [{ name: "Prop", value: "Value" }]);
    const result = layoutERD(root, 5);

    expect(result.elements.some(e => e.type === "line")).toBe(true);
    expect(result.elements.filter(e => e.type === "text").length).toBeGreaterThan(0);
  });
});
