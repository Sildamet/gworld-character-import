/**
 * Parses the XML produced by the vendored GCA5 "Export To Foundry VTT" plugin
 * (see gca-export/GWorldVTT5Plugin/) into a plain JS object.
 *
 * The export format wraps every list's entries in sequential pseudo-tags
 * (`<id-00001>`, `<id-00002>`, ...) instead of a repeated element name, so
 * list detection here is structural (every child matches `id-\d+`) rather
 * than name-based.
 */

export class GcaImportError extends Error {}

const SUPPORTED_VERSION_PREFIX = "GCA5-";
const LIST_ITEM_PATTERN = /^id-\d+$/;

export function parseGcaExport(xmlText) {
  if (typeof xmlText !== "string" || !xmlText.trim()) {
    throw new GcaImportError("The selected file is empty.");
  }

  // The vendored plugin's advantage/disadvantage export concatenates a raw,
  // unescaped "<br>" into modifier text (see ExportAds/ExportDisads in
  // ExportToFoundryVTT.vb) whenever a trait has modifiers. That's not valid
  // XML — it opens an element that's never closed — so it's neutralized here
  // before parsing rather than left to break every character with a
  // modified trait. No legitimate element in this schema is named "br".
  const sanitized = xmlText.replace(/<br\s*\/?>/gi, "\n");

  const doc = new DOMParser().parseFromString(sanitized, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new GcaImportError(
      "This file isn't valid XML, so it couldn't be read. Make sure it was exported with GCA5's File → Export → Export To Foundry VTT.",
    );
  }

  const root = doc.documentElement;
  if (!root || root.tagName !== "root") {
    throw new GcaImportError("This file doesn't look like a GCA5 Foundry export (missing the <root> element).");
  }

  const version = root.getAttribute("version") ?? "";
  if (!version.startsWith(SUPPORTED_VERSION_PREFIX)) {
    throw new GcaImportError(
      `Unrecognized export version "${version || "(none)"}". This importer only understands GCA5 exports ` +
        `(a version starting with "${SUPPORTED_VERSION_PREFIX}"). GCA4 exports are not supported.`,
    );
  }

  const character = firstChildElement(root, "character");
  if (!character) {
    throw new GcaImportError("This file doesn't contain a <character> element.");
  }

  return { version, character: elementToObject(character) };
}

/** Always returns an array, treating a missing/empty list field as empty rather than throwing. */
export function asList(value) {
  return Array.isArray(value) ? value : [];
}

function firstChildElement(parent, tagName) {
  for (const child of parent.children) {
    if (child.tagName === tagName) return child;
  }
  return null;
}

function elementToObject(element) {
  const childElements = Array.from(element.children);

  if (childElements.length === 0) {
    return leafValue(element);
  }

  if (childElements.every((child) => LIST_ITEM_PATTERN.test(child.tagName))) {
    return childElements.map((child) => elementToObject(child));
  }

  const obj = {};
  for (const child of childElements) {
    const value = elementToObject(child);
    if (child.tagName in obj) {
      const existing = obj[child.tagName];
      obj[child.tagName] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      obj[child.tagName] = value;
    }
  }
  return obj;
}

function leafValue(element) {
  const text = element.textContent ?? "";
  if (element.getAttribute("type") === "number") {
    const n = Number(text.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return text;
}
