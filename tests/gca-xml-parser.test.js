import { describe, expect, it } from "vitest";
import { parseGcaExport, asList, GcaImportError } from "../scripts/importer/gca-xml-parser.js";

function xml(character) {
  return `<?xml version="1.0" encoding="utf-8"?>
<root release="Foundry" version="GCA5-14">
<character>
${character}
</character>
</root>`;
}

describe("parseGcaExport", () => {
  it("rejects empty input", () => {
    expect(() => parseGcaExport("")).toThrow(GcaImportError);
    expect(() => parseGcaExport("   ")).toThrow(GcaImportError);
  });

  it("rejects malformed XML", () => {
    expect(() => parseGcaExport("<root><unclosed></root>")).toThrow(GcaImportError);
  });

  it("rejects a file with no <root> element", () => {
    expect(() => parseGcaExport("<notroot></notroot>")).toThrow(GcaImportError);
  });

  it("rejects a GCA4-style export (version doesn't start with GCA5-)", () => {
    const doc = `<root release="Foundry" version="GCA-11"><character><name type="string">Bob</name></character></root>`;
    expect(() => parseGcaExport(doc)).toThrow(GcaImportError);
  });

  it("rejects a file missing the <character> element", () => {
    expect(() => parseGcaExport(`<root release="Foundry" version="GCA5-14"></root>`)).toThrow(GcaImportError);
  });

  it("parses a leaf string and number field", () => {
    const { character } = parseGcaExport(
      xml(`<name type="string">Conan</name><attributes><strength type="number">14</strength></attributes>`),
    );
    expect(character.name).toBe("Conan");
    expect(character.attributes.strength).toBe(14);
  });

  it("treats a group of id-NNNNN children as a list, regardless of padding width", () => {
    const { character } = parseGcaExport(
      xml(
        `<skilllist><id-00001><name type="string">Karate</name></id-00001><id-00002><name type="string">Guns</name></id-00002></skilllist>`,
      ),
    );
    expect(asList(character.skilllist)).toHaveLength(2);
    expect(character.skilllist[0].name).toBe("Karate");
    expect(character.skilllist[1].name).toBe("Guns");
  });

  it("returns a non-array for an empty list element, which asList() normalizes to []", () => {
    const { character } = parseGcaExport(xml(`<skilllist></skilllist>`));
    expect(asList(character.skilllist)).toEqual([]);
  });

  it("neutralizes the vendored plugin's unescaped <br> in modifier text instead of failing to parse", () => {
    const { character } = parseGcaExport(
      xml(`<adslist><id-00001><name type="string">Combat Reflexes</name><text type="string">Reliable +20<br>a note</text></id-00001></adslist>`),
    );
    const entry = character.adslist[0];
    expect(entry.name).toBe("Combat Reflexes");
    expect(entry.text).toContain("Reliable +20");
    expect(entry.text).toContain("a note");
  });

  it("accepts any GCA5-* version", () => {
    const doc = `<root release="Foundry" version="GCA5-99"><character><name type="string">X</name></character></root>`;
    expect(() => parseGcaExport(doc)).not.toThrow();
  });
});
