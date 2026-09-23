import { describe, expect, it } from "vitest";
import { parseDamage } from "../scripts/importer/damage-parser.js";

describe("parseDamage", () => {
  it("returns the default for nullish/empty input", () => {
    for (const input of [null, undefined, "", "   "]) {
      expect(parseDamage(input)).toEqual({
        damageBase: "thr",
        damageModifier: 0,
        damageFormula: "",
        damageExtraDice: 0,
        damageType: "cr",
        armorDivisor: 1,
      });
    }
  });

  it("parses a swing-based damage with a flat modifier", () => {
    expect(parseDamage("sw+2 cut")).toMatchObject({
      damageBase: "sw",
      damageModifier: 2,
      damageExtraDice: 0,
      damageType: "cut",
      armorDivisor: 1,
    });
  });

  it("parses a thrust-based damage with a negative modifier", () => {
    expect(parseDamage("thr-1 imp")).toMatchObject({
      damageBase: "thr",
      damageModifier: -1,
      damageType: "imp",
    });
  });

  it("parses a bare thrust/swing with no modifier", () => {
    expect(parseDamage("thr cr")).toMatchObject({ damageBase: "thr", damageModifier: 0, damageType: "cr" });
    expect(parseDamage("sw pi++")).toMatchObject({ damageBase: "sw", damageModifier: 0, damageType: "pi++" });
  });

  it("parses extra dice added to a base (e.g. a chainsaw)", () => {
    expect(parseDamage("sw+1d cr")).toMatchObject({
      damageBase: "sw",
      damageExtraDice: 1,
      damageModifier: 0,
      damageType: "cr",
    });
  });

  it("parses a fixed dice formula", () => {
    expect(parseDamage("2d+2 cut")).toMatchObject({
      damageBase: "fixed",
      damageFormula: "2d+2",
      damageType: "cut",
    });
    expect(parseDamage("1d-1 tox")).toMatchObject({ damageBase: "fixed", damageFormula: "1d-1", damageType: "tox" });
  });

  it("parses an armor divisor in parentheses", () => {
    expect(parseDamage("1d+2 (2) cr")).toMatchObject({
      damageBase: "fixed",
      damageFormula: "1d+2",
      armorDivisor: 2,
      damageType: "cr",
    });
  });

  it("distinguishes pi, pi-, pi+ and pi++ correctly", () => {
    expect(parseDamage("sw pi-")).toMatchObject({ damageType: "pi-" });
    expect(parseDamage("sw pi")).toMatchObject({ damageType: "pi" });
    expect(parseDamage("sw pi+")).toMatchObject({ damageType: "pi+" });
    expect(parseDamage("sw pi++")).toMatchObject({ damageType: "pi++" });
  });

  it("falls back to a raw fixed formula for unrecognized text rather than throwing", () => {
    expect(() => parseDamage("hx (0.5) cut")).not.toThrow();
    expect(parseDamage("hx (0.5) cut")).toMatchObject({
      damageBase: "fixed",
      damageFormula: "hx",
      armorDivisor: 0.5,
      damageType: "cut",
    });
  });
});
