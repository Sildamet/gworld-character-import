/**
 * Maps a parsed GCA5 "Export To Foundry VTT" character object (see
 * gca-xml-parser.js) onto GWorldVTT's `character` actor schema
 * (src/system/data/character.ts, src/system/data/items.ts in
 * sargas79/GWorldVTT) and a list of Item creation data.
 *
 * v1 "core" scope only: attributes, traits, skills, and equipment/weapons.
 * Spells, racial templates, languages and techniques are read (where
 * present) only far enough to report that they were skipped.
 */

import { asList } from "./gca-xml-parser.js";
import { parseDamage } from "./damage-parser.js";

const BASIC_SPEED_STEP = 0.25;

const ATTRIBUTE_ALIASES = { ST: "ST", DX: "DX", IQ: "IQ", HT: "HT", WILL: "Will", PER: "Per" };
const DIFFICULTY_CODES = new Set(["E", "A", "H", "VH"]);

export function mapGcaCharacterToGworld(character) {
  const warnings = [];

  const attrs = mapAttributes(character, warnings);
  const secondary = mapSecondary(character, attrs, warnings);
  const misc = mapMisc(character, warnings);
  const details = mapDetails(character);

  const traits = mapTraits(character, warnings);
  const skills = mapSkills(character, warnings);
  const equipment = mapEquipment(character, warnings);

  noteOutOfScopeContent(character, warnings);

  const actorUpdate = {
    "system.attributes.ST": attrs.ST,
    "system.attributes.DX": attrs.DX,
    "system.attributes.IQ": attrs.IQ,
    "system.attributes.HT": attrs.HT,
    "system.purchased.hp": secondary.purchased.hp,
    "system.purchased.will": secondary.purchased.will,
    "system.purchased.per": secondary.purchased.per,
    "system.purchased.fp": secondary.purchased.fp,
    "system.purchased.basicSpeed": secondary.purchased.basicSpeed,
    "system.purchased.basicMove": secondary.purchased.basicMove,
    "system.hp.value": secondary.hp,
    "system.hp.max": secondary.hp,
    "system.fp.value": secondary.fp,
    "system.fp.max": secondary.fp,
    "system.tl": misc.tl,
    "system.sm": misc.sm,
    "system.points.starting": misc.startingPoints,
    "system.details.height": details.height,
    "system.details.weight": details.weight,
    "system.details.age": details.age,
    "system.details.appearance": details.appearance,
    "system.details.biography": details.biography,
    "system.details.notes": details.notes,
  };

  const name = textOf(character?.name).trim();
  if (name) actorUpdate.name = name;

  const items = [...traits, ...skills, ...equipment];

  return { actorUpdate, items, warnings };
}

// ---------------------------------------------------------------------------
// Attributes & secondary characteristics
// ---------------------------------------------------------------------------

function mapAttributes(character, warnings) {
  const a = character?.attributes ?? {};
  return {
    ST: toInt(a.strength, 10, "ST", warnings),
    DX: toInt(a.dexterity, 10, "DX", warnings),
    IQ: toInt(a.intelligence, 10, "IQ", warnings),
    HT: toInt(a.health, 10, "HT", warnings),
  };
}

/**
 * GWorldVTT stores `purchased.*` as levels bought above the GURPS-standard
 * base (HP=ST, Will/Per=IQ, FP=HT, Basic Speed=(DX+HT)/4, Basic Move=floor
 * of Basic Speed) rather than an absolute level, while GCA exports the
 * absolute, already-resolved level. The delta is derived here rather than
 * from GCA's own `*_points` (points spent) fields, since reversing a points
 * spend into a level depends on cost multipliers this module doesn't model.
 *
 * Known limitation: a racial template or trait that grants HP/Will/etc.
 * outside the point budget would show up here as `purchased` rather than
 * `system.bonuses`, since v1 doesn't parse templates. See README.
 */
export function derivePurchasedSecondary(attrs, secondaryLevels) {
  const baseSpeed = (attrs.DX + attrs.HT) / 4;
  const finalSpeed = Number.isFinite(secondaryLevels.basicSpeed) ? secondaryLevels.basicSpeed : baseSpeed;
  const finalMove = Number.isFinite(secondaryLevels.basicMove) ? secondaryLevels.basicMove : Math.floor(finalSpeed);

  return {
    hp: Math.round(secondaryLevels.hp - attrs.ST),
    will: Math.round(secondaryLevels.will - attrs.IQ),
    per: Math.round(secondaryLevels.per - attrs.IQ),
    fp: Math.round(secondaryLevels.fp - attrs.HT),
    basicSpeed: roundToStep(finalSpeed - baseSpeed, BASIC_SPEED_STEP),
    basicMove: Math.round(finalMove - Math.floor(finalSpeed)),
  };
}

export function roundToStep(value, step) {
  return Math.round(value / step) * step;
}

function mapSecondary(character, attrs, warnings) {
  const a = character?.attributes ?? {};
  const hp = toInt(a.hitpoints, attrs.ST, "HP", warnings);
  const will = toInt(a.will, attrs.IQ, "Will", warnings);
  const per = toInt(a.perception, attrs.IQ, "Perception", warnings);
  const fp = toInt(a.fatiguepoints, attrs.HT, "FP", warnings);
  const basicSpeed = toFloat(a.basicspeed, (attrs.DX + attrs.HT) / 4, "Basic Speed", warnings);
  const basicMove = toInt(a.basicmove, Math.floor(basicSpeed), "Basic Move", warnings);

  return {
    hp,
    fp,
    purchased: derivePurchasedSecondary(attrs, { hp, will, per, fp, basicSpeed, basicMove }),
  };
}

function mapMisc(character, warnings) {
  const traits = character?.traits ?? {};
  const points = character?.pointtotals ?? {};

  const tl = toInt(traits.tl, 3, "Tech Level", warnings);
  const sm = toInt(traits.sizemodifier, 0, "Size Modifier", warnings);

  const totalPoints = points.totalpoints;
  let startingPoints = 150;
  if (typeof totalPoints === "number") {
    const unspent = typeof points.unspentpoints === "number" ? points.unspentpoints : 0;
    startingPoints = Math.round(totalPoints + unspent);
  } else {
    warnings.push("No point total found in the file; starting points left at the default (150).");
  }

  return { tl, sm, startingPoints };
}

function mapDetails(character) {
  const traits = character?.traits ?? {};
  const notes = asList(character?.notelist);
  return {
    height: textOf(traits.height),
    weight: textOf(traits.weight),
    age: textOf(traits.age),
    appearance: textOf(traits.appearance),
    biography: textOf(character?.description),
    notes: notes.length > 0 ? textOf(notes[0]?.text) : "",
  };
}

// ---------------------------------------------------------------------------
// Traits (advantages / disadvantages / perks / quirks)
// ---------------------------------------------------------------------------

function mapTraits(character, warnings) {
  const ads = asList(character?.traits?.adslist);
  const disads = asList(character?.traits?.disadslist);

  const items = [
    ...ads.map((entry) => traitItem(entry, isPerkByPoints(entry) ? "perk" : "advantage")),
    ...disads.map((entry) => traitItem(entry, isQuirkByPoints(entry) ? "quirk" : "disadvantage")),
  ].filter((item) => item.name);

  const languageCount = asList(character?.traits?.languagelist).length;
  const cultureCount = asList(character?.traits?.culturalfamiliaritylist).length;
  if (languageCount > 0 || cultureCount > 0) {
    warnings.push(
      "Languages/cultural familiarities are not distinguished from advantages in the GCA5 export, so they were " +
        "imported as generic traits rather than skipped.",
    );
  }

  return items;
}

function isPerkByPoints(entry) {
  return toInt(entry?.points, 0) === 1;
}

function isQuirkByPoints(entry) {
  return toInt(entry?.points, 0) === -1;
}

function traitItem(entry, category) {
  return {
    name: textOf(entry?.name).trim(),
    type: "trait",
    system: {
      category,
      points: toInt(entry?.points, 0),
      description: textOf(entry?.text),
      reference: textOf(entry?.pageref),
    },
  };
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

function mapSkills(character, warnings) {
  const skills = asList(character?.abilities?.skilllist);

  return skills
    .map((entry) => {
      const name = textOf(entry?.name).trim();
      const [attrPart, diffPart] = String(textOf(entry?.type)).split("/");

      const attribute = normalizeAttribute(attrPart);
      if (!attribute) {
        warnings.push(`Skill "${name}" has an unrecognized attribute ("${textOf(entry?.type)}"); defaulted to DX.`);
      }

      const difficulty = normalizeDifficulty(diffPart, name);
      if (!difficulty) {
        warnings.push(`Skill "${name}" has an unrecognized difficulty ("${textOf(entry?.type)}"); defaulted to Average.`);
      }

      return {
        name,
        type: "skill",
        system: {
          attribute: attribute ?? "DX",
          difficulty: difficulty ?? "A",
          points: toInt(entry?.points, 0),
          description: textOf(entry?.text),
          reference: textOf(entry?.pageref),
        },
      };
    })
    .filter((item) => item.name);
}

export function normalizeAttribute(raw) {
  const key = String(raw ?? "").trim().toUpperCase();
  return ATTRIBUTE_ALIASES[key] ?? null;
}

export function normalizeDifficulty(raw, skillName) {
  const key = String(raw ?? "").trim().toUpperCase();
  if (DIFFICULTY_CODES.has(key)) return key;
  if (String(skillName ?? "").trim().endsWith("!")) return "W";
  return null;
}

// ---------------------------------------------------------------------------
// Equipment & weapons
// ---------------------------------------------------------------------------

function mapEquipment(character, warnings) {
  const inventory = asList(character?.inventorylist);
  const items = [];
  const byName = new Map();

  for (const entry of inventory) {
    const name = textOf(entry?.name).trim();
    if (!name) continue;
    const item = equipmentItem(entry, name);
    items.push(item);
    byName.set(normalizeName(name), item);
  }

  for (const weapon of asList(character?.combat?.meleecombatlist)) {
    attachWeaponModes({
      weapon,
      warnings,
      items,
      byName,
      modesKey: "meleemodelist",
      buildMode: buildMeleeMode,
      itemModesField: "meleeModes",
      kind: "melee",
    });
  }

  for (const weapon of asList(character?.combat?.rangedcombatlist)) {
    attachWeaponModes({
      weapon,
      warnings,
      items,
      byName,
      modesKey: "rangedmodelist",
      buildMode: buildRangedMode,
      itemModesField: "rangedModes",
      kind: "ranged",
    });
  }

  return items;
}

function equipmentItem(entry, name) {
  const quantity = toInt(entry?.count, 1) || 1;
  return {
    name,
    type: "equipment",
    system: {
      quantity,
      weight: toFloat(entry?.weight, toFloat(entry?.weightsum, 0)),
      cost: toFloat(entry?.cost, 0),
      carried: true,
      equipped: false,
      description: textOf(entry?.notes),
      reference: textOf(entry?.pageref),
      meleeModes: [],
      rangedModes: [],
    },
  };
}

function attachWeaponModes({ weapon, warnings, items, byName, modesKey, buildMode, itemModesField, kind }) {
  const name = textOf(weapon?.name).trim();
  if (!name) return;

  const modes = asList(weapon?.[modesKey])
    .map((entry) => buildMode(entry, weapon))
    .filter(Boolean);
  if (modes.length === 0) return;

  const existing = byName.get(normalizeName(name));
  if (existing) {
    existing.system[itemModesField].push(...modes);
    return;
  }

  warnings.push(`${kind === "melee" ? "Melee" : "Ranged"} weapon "${name}" had no matching equipment entry; added it as a standalone item.`);
  const synthesized = {
    name,
    type: "equipment",
    system: {
      quantity: 1,
      weight: toFloat(weapon?.weight, 0),
      cost: toFloat(weapon?.cost, 0),
      carried: true,
      equipped: false,
      description: textOf(weapon?.text),
      reference: "",
      meleeModes: [],
      rangedModes: [],
    },
  };
  synthesized.system[itemModesField].push(...modes);
  items.push(synthesized);
  byName.set(normalizeName(name), synthesized);
}

function buildMeleeMode(entry) {
  const name = textOf(entry?.name).trim();
  const damage = parseDamage(textOf(entry?.unmodifiedDamage) || textOf(entry?.damage));
  return {
    name: name || "Melee",
    ...damage,
    reach: textOf(entry?.reach),
  };
}

// `bulk` is emitted once per weapon (before <rangedmodelist>), not per mode,
// so it comes from `weapon` rather than the mode `entry` itself.
function buildRangedMode(entry, weapon) {
  const name = textOf(entry?.name).trim();
  const damage = parseDamage(textOf(entry?.unmodifiedDamage) || textOf(entry?.damage));
  const range = parseRange(textOf(entry?.range));
  return {
    name: name || "Ranged",
    ...damage,
    accuracy: toInt(entry?.acc, 0),
    halfDamageRange: range.halfDamageRange,
    maxRange: range.maxRange,
    rateOfFire: parseRateOfFire(textOf(entry?.rof)),
    shots: textOf(entry?.shots),
    recoil: toInt(entry?.rcl, 1) || 1,
    bulk: toInt(weapon?.bulk, 0),
  };
}

export function parseRange(text) {
  const parts = String(text ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { halfDamageRange: toFloat(parts[0], 0), maxRange: toFloat(parts[1], 0) };
  }
  if (parts.length === 1) {
    return { halfDamageRange: 0, maxRange: toFloat(parts[0], 0) };
  }
  return { halfDamageRange: 0, maxRange: 0 };
}

export function parseRateOfFire(text) {
  const match = String(text ?? "").match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

function normalizeName(name) {
  return name.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Out-of-scope content reporting
// ---------------------------------------------------------------------------

function noteOutOfScopeContent(character, warnings) {
  const spellCount = asList(character?.abilities?.spelllist).length;
  if (spellCount > 0) {
    warnings.push(`${spellCount} spell(s) found in the file were not imported (spells are out of scope for this module).`);
  }
}

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

function toInt(value, fallback, label, warnings) {
  const n = typeof value === "number" ? value : parseInt(String(value ?? "").trim(), 10);
  if (Number.isFinite(n)) return Math.round(n);
  if (label && warnings) warnings.push(`Missing or unreadable ${label}; defaulted to ${fallback}.`);
  return fallback;
}

function toFloat(value, fallback, label, warnings) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").trim());
  if (Number.isFinite(n)) return n;
  if (label && warnings) warnings.push(`Missing or unreadable ${label}; defaulted to ${fallback}.`);
  return fallback;
}

function textOf(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}
