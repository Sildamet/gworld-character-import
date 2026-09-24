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

/**
 * GWorldVTT's own trait-effects engine (src/rules/trait-effects.ts) already
 * recognizes traits named "Extra ST/DX/IQ/HT" etc. by name and adds their
 * levels on top of `system.attributes`/`system.purchased` at derive time —
 * its comment says outright "GCA carries them by these names". If this
 * importer also baked that same bonus into the raw attribute/purchased
 * score (by using GCA's already-inflated final value directly), the levels
 * would be billed twice: once as the trait's own points, once again as a
 * phantom attribute purchase. These tables let the mapper detect those
 * traits, set the item's `levels` field so GWorldVTT's engine applies the
 * bonus itself, and subtract the same amount from the raw score it derives
 * so the two don't stack. Per-level costs are the GURPS 4e Basic Set
 * defaults; a racial cost multiplier would throw the derived `levels` off,
 * which isn't detectable from this export (see README limitations).
 */
const ATTRIBUTE_TRAIT_EFFECTS = {
  "extra st": { field: "ST", costPerLevel: 10 },
  "extra dx": { field: "DX", costPerLevel: 20 },
  "extra iq": { field: "IQ", costPerLevel: 20 },
  "extra ht": { field: "HT", costPerLevel: 10 },
};

const SECONDARY_TRAIT_EFFECTS = {
  "extra hit points": { field: "hp", costPerLevel: 2 },
  "extra fatigue points": { field: "fp", costPerLevel: 3 },
  "extra will": { field: "will", costPerLevel: 5 },
  "extra perception": { field: "per", costPerLevel: 5 },
  "extra basic move": { field: "basicMove", costPerLevel: 5 },
  "extra basic speed": { field: "basicSpeed", costPerLevel: 20, levelUnit: BASIC_SPEED_STEP },
};

export function mapGcaCharacterToGworld(character) {
  const warnings = [];

  const traitsResult = mapTraits(character, warnings);
  const attrs = mapAttributes(character, traitsResult.attributeCorrections, warnings);
  const secondary = mapSecondary(character, attrs.final, traitsResult.secondaryCorrections, warnings);
  const misc = mapMisc(character, warnings);
  const details = mapDetails(character);

  const traits = traitsResult.items;
  const skills = mapSkills(character, warnings);
  const equipment = mapEquipment(character, warnings);

  noteOutOfScopeContent(character, warnings);

  const actorUpdate = {
    "system.attributes.ST": attrs.bought.ST,
    "system.attributes.DX": attrs.bought.DX,
    "system.attributes.IQ": attrs.bought.IQ,
    "system.attributes.HT": attrs.bought.HT,
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

/**
 * Returns both the GCA-reported (`final`) attribute score and the raw
 * "bought" score with any Extra ST/DX/IQ/HT trait correction removed.
 * `final` is what secondary-characteristic bases (HP=ST, Speed=(DX+HT)/4,
 * etc.) must use, since that's the effective score GWorldVTT's own engine
 * re-derives at runtime (bought + trait bonus); only `bought` goes into
 * `system.attributes.*`, since the trait bonus is re-added there too.
 */
function mapAttributes(character, corrections, warnings) {
  const a = character?.attributes ?? {};
  const c = corrections ?? {};
  const final = {
    ST: toInt(a.strength, 10, "ST", warnings),
    DX: toInt(a.dexterity, 10, "DX", warnings),
    IQ: toInt(a.intelligence, 10, "IQ", warnings),
    HT: toInt(a.health, 10, "HT", warnings),
  };
  const bought = {
    ST: final.ST - (c.ST ?? 0),
    DX: final.DX - (c.DX ?? 0),
    IQ: final.IQ - (c.IQ ?? 0),
    HT: final.HT - (c.HT ?? 0),
  };
  return { final, bought };
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

/** `finalAttrs` must be the GCA-reported (uncorrected) ST/DX/IQ/HT — see mapAttributes(). */
function mapSecondary(character, finalAttrs, corrections, warnings) {
  const a = character?.attributes ?? {};
  const c = corrections ?? {};
  const hp = toInt(a.hitpoints, finalAttrs.ST, "HP", warnings) - (c.hp ?? 0);
  const will = toInt(a.will, finalAttrs.IQ, "Will", warnings) - (c.will ?? 0);
  const per = toInt(a.perception, finalAttrs.IQ, "Perception", warnings) - (c.per ?? 0);
  const fp = toInt(a.fatiguepoints, finalAttrs.HT, "FP", warnings) - (c.fp ?? 0);
  const basicSpeed =
    toFloat(a.basicspeed, (finalAttrs.DX + finalAttrs.HT) / 4, "Basic Speed", warnings) - (c.basicSpeed ?? 0);
  const basicMove = toInt(a.basicmove, Math.floor(basicSpeed), "Basic Move", warnings) - (c.basicMove ?? 0);

  return {
    hp,
    fp,
    purchased: derivePurchasedSecondary(finalAttrs, { hp, will, per, fp, basicSpeed, basicMove }),
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

  const attributeCorrections = { ST: 0, DX: 0, IQ: 0, HT: 0 };
  const secondaryCorrections = { hp: 0, fp: 0, will: 0, per: 0, basicMove: 0, basicSpeed: 0 };

  const items = [
    ...ads.map((entry) => traitItem(entry, isPerkByPoints(entry) ? "perk" : "advantage")),
    ...disads.map((entry) => traitItem(entry, isQuirkByPoints(entry) ? "quirk" : "disadvantage")),
  ].filter((item) => item.name);

  for (const item of items) {
    const key = normalizeTraitEffectName(item.name);

    const attributeEffect = ATTRIBUTE_TRAIT_EFFECTS[key];
    if (attributeEffect) {
      const levels = attributeGrantLevels(item.system.points, attributeEffect.costPerLevel);
      item.system.levels = levels;
      attributeCorrections[attributeEffect.field] += levels;
      warnings.push(
        `Trait "${item.name}" grants ${levels} level(s) of ${attributeEffect.field} through GWorldVTT's own trait ` +
          `rules, so that many levels were excluded from the imported ${attributeEffect.field} score to avoid billing its points twice.`,
      );
      continue;
    }

    const secondaryEffect = SECONDARY_TRAIT_EFFECTS[key];
    if (secondaryEffect) {
      const levels = attributeGrantLevels(item.system.points, secondaryEffect.costPerLevel);
      item.system.levels = levels;
      secondaryCorrections[secondaryEffect.field] += levels * (secondaryEffect.levelUnit ?? 1);
      warnings.push(
        `Trait "${item.name}" grants ${levels} level(s) of ${secondaryEffect.field} through GWorldVTT's own trait ` +
          `rules, so that was excluded from the imported ${secondaryEffect.field} value to avoid billing its points twice.`,
      );
    }
  }

  const languageCount = asList(character?.traits?.languagelist).length;
  const cultureCount = asList(character?.traits?.culturalfamiliaritylist).length;
  if (languageCount > 0 || cultureCount > 0) {
    warnings.push(
      "Languages/cultural familiarities are not distinguished from advantages in the GCA5 export, so they were " +
        "imported as generic traits rather than skipped.",
    );
  }

  return { items, attributeCorrections, secondaryCorrections };
}

/** Mirrors GWorldVTT's own trait-name normalization (rules/trait-effects.ts effectKey/matchName). */
export function normalizeTraitEffectName(rawName) {
  let name = String(rawName ?? "").trim().toLowerCase();
  name = name.replace(/\s+\d+$/, ""); // a level written into the name, e.g. "Extra ST 2"
  name = name.replace(/\s*\([^()]*%[^()]*\)\s*$/, ""); // a trailing modifier list, e.g. "(Size, -10%)"
  return name.trim();
}

/** How many levels of a trait the points billed pay for, at the given GURPS 4e per-level cost. */
function attributeGrantLevels(points, costPerLevel) {
  return Math.max(1, Math.round(points / costPerLevel));
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
