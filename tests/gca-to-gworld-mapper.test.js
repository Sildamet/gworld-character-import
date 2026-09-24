import { describe, expect, it } from "vitest";
import {
  derivePurchasedSecondary,
  mapGcaCharacterToGworld,
  normalizeAttribute,
  normalizeDifficulty,
  normalizeTraitEffectName,
  parseRange,
  parseRateOfFire,
  roundToStep,
} from "../scripts/importer/gca-to-gworld-mapper.js";

describe("derivePurchasedSecondary", () => {
  it("is zero across the board for an unmodified ST 10/DX 10/IQ 10/HT 10 character", () => {
    const attrs = { ST: 10, DX: 10, IQ: 10, HT: 10 };
    const result = derivePurchasedSecondary(attrs, {
      hp: 10,
      will: 10,
      per: 10,
      fp: 10,
      basicSpeed: 5,
      basicMove: 5,
    });
    expect(result).toEqual({ hp: 0, will: 0, per: 0, fp: 0, basicSpeed: 0, basicMove: 0 });
  });

  it("derives positive deltas when GCA reports levels above the GURPS base", () => {
    const attrs = { ST: 12, DX: 11, IQ: 13, HT: 10 };
    // base speed = (11+10)/4 = 5.25; base move = floor(5.25) = 5
    const result = derivePurchasedSecondary(attrs, {
      hp: 15, // ST 12 + 3 bought
      will: 15, // IQ 13 + 2 bought
      per: 14, // IQ 13 + 1 bought
      fp: 12, // HT 10 + 2 bought
      basicSpeed: 5.5, // +0.25 bought
      basicMove: 6, // default floor(5.5)=5, +1 bought
    });
    expect(result).toEqual({ hp: 3, will: 2, per: 1, fp: 2, basicSpeed: 0.25, basicMove: 1 });
  });

  it("rounds an off-step basic speed delta to the nearest 0.25", () => {
    expect(roundToStep(0.26, 0.25)).toBeCloseTo(0.25);
    expect(roundToStep(0.4, 0.25)).toBeCloseTo(0.5);
  });
});

describe("normalizeAttribute / normalizeDifficulty", () => {
  it("maps GCA skill 'type' attribute codes to GWorld's choices", () => {
    expect(normalizeAttribute("DX")).toBe("DX");
    expect(normalizeAttribute("will")).toBe("Will");
    expect(normalizeAttribute("PER")).toBe("Per");
    expect(normalizeAttribute("nonsense")).toBeNull();
  });

  it("maps GCA difficulty codes, and detects a wildcard skill by its trailing !", () => {
    expect(normalizeDifficulty("H", "Guns (Pistol)")).toBe("H");
    expect(normalizeDifficulty("", "Weapon!")).toBe("W");
    expect(normalizeDifficulty("nonsense", "Foo")).toBeNull();
  });
});

describe("parseRange / parseRateOfFire", () => {
  it("splits a half/max range pair", () => {
    expect(parseRange("150/200")).toEqual({ halfDamageRange: 150, maxRange: 200 });
  });

  it("treats a single range figure as max range only", () => {
    expect(parseRange("100")).toEqual({ halfDamageRange: 0, maxRange: 100 });
  });

  it("extracts a leading integer from a rate of fire mark", () => {
    expect(parseRateOfFire("3~")).toBe(3);
    expect(parseRateOfFire("10")).toBe(10);
    expect(parseRateOfFire("")).toBe(1);
  });
});

describe("mapGcaCharacterToGworld", () => {
  function baseCharacter(overrides = {}) {
    return {
      name: "Test Character",
      attributes: {
        strength: 10,
        dexterity: 10,
        intelligence: 10,
        health: 10,
        hitpoints: 10,
        will: 10,
        perception: 10,
        fatiguepoints: 10,
        basicspeed: "5",
        basicmove: 5,
      },
      traits: { tl: 3, sizemodifier: 0 },
      pointtotals: { totalpoints: 100, unspentpoints: 0 },
      ...overrides,
    };
  }

  it("maps attributes and secondary pools onto dotted actor-update keys", () => {
    const { actorUpdate } = mapGcaCharacterToGworld(baseCharacter());
    expect(actorUpdate["system.attributes.ST"]).toBe(10);
    expect(actorUpdate["system.hp.value"]).toBe(10);
    expect(actorUpdate["system.hp.max"]).toBe(10);
    expect(actorUpdate["system.points.starting"]).toBe(100);
    expect(actorUpdate.name).toBe("Test Character");
  });

  it("classifies adslist/disadslist entries into perk/quirk by the standard flat point cost", () => {
    const character = baseCharacter({
      traits: {
        tl: 3,
        sizemodifier: 0,
        adslist: [
          { name: "Combat Reflexes", points: 15, text: "", pageref: "B43" },
          { name: "Ambidexterity", points: 1, text: "", pageref: "B39" },
        ],
        disadslist: [
          { name: "Bad Temper", points: -10, text: "", pageref: "B125" },
          { name: "Odious Personal Habit", points: -1, text: "", pageref: "B22" },
        ],
      },
    });
    const { items } = mapGcaCharacterToGworld(character);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName["Combat Reflexes"].system.category).toBe("advantage");
    expect(byName["Ambidexterity"].system.category).toBe("perk");
    expect(byName["Bad Temper"].system.category).toBe("disadvantage");
    expect(byName["Odious Personal Habit"].system.category).toBe("quirk");
  });

  it("parses a skill's GCA type field into attribute + difficulty", () => {
    const character = baseCharacter({
      abilities: {
        skilllist: [{ name: "Karate", type: "DX/H", points: 8, text: "", pageref: "B208" }],
      },
    });
    const { items } = mapGcaCharacterToGworld(character);
    const skill = items.find((i) => i.name === "Karate");
    expect(skill.type).toBe("skill");
    expect(skill.system.attribute).toBe("DX");
    expect(skill.system.difficulty).toBe("H");
    expect(skill.system.points).toBe(8);
  });

  it("attaches melee combat modes onto the matching inventory equipment item by name", () => {
    const character = baseCharacter({
      inventorylist: [{ name: "Broadsword", count: 1, cost: "500", weight: 3, notes: "", pageref: "B274" }],
      combat: {
        meleecombatlist: [
          {
            name: "Broadsword",
            meleemodelist: [{ name: "swing", damage: "sw+2 cut", unmodifiedDamage: "sw+2 cut", reach: "1" }],
          },
        ],
      },
    });
    const { items, warnings } = mapGcaCharacterToGworld(character);
    const sword = items.find((i) => i.name === "Broadsword");
    expect(sword.type).toBe("equipment");
    expect(sword.system.meleeModes).toHaveLength(1);
    expect(sword.system.meleeModes[0]).toMatchObject({ damageBase: "sw", damageModifier: 2, damageType: "cut" });
    expect(warnings.some((w) => w.includes("standalone"))).toBe(false);
  });

  it("creates a standalone weapon item when a combat entry has no matching inventory entry", () => {
    const character = baseCharacter({
      combat: {
        rangedcombatlist: [
          {
            name: "Mystery Pistol",
            bulk: -2,
            rangedmodelist: [
              { name: "", damage: "2d+2 pi", acc: 2, range: "150/200", rof: "3", shots: "8+1(3)", rcl: 2 },
            ],
          },
        ],
      },
    });
    const { items, warnings } = mapGcaCharacterToGworld(character);
    const pistol = items.find((i) => i.name === "Mystery Pistol");
    expect(pistol).toBeDefined();
    expect(pistol.system.rangedModes[0]).toMatchObject({
      damageBase: "fixed",
      damageFormula: "2d+2",
      damageType: "pi",
      accuracy: 2,
      halfDamageRange: 150,
      maxRange: 200,
      rateOfFire: 3,
      recoil: 2,
      bulk: -2,
    });
    expect(warnings.some((w) => w.includes("standalone"))).toBe(true);
  });

  it("warns about spells found in the file rather than silently dropping them", () => {
    const character = baseCharacter({ abilities: { spelllist: [{ name: "Fireball" }] } });
    const { warnings } = mapGcaCharacterToGworld(character);
    expect(warnings.some((w) => w.includes("spell"))).toBe(true);
  });

  // Regression test: GWorldVTT's own trait-effects engine already recognizes
  // "Extra ST/DX/IQ/HT" traits by name and adds their levels on top of
  // system.attributes at derive time. GCA's exported attribute score is
  // already inflated by that trait, so importing it directly and also
  // importing the trait billed its points twice (reported by a real user
  // after installing the module).
  it("does not double-count an 'Extra DX' trait's points against both the trait and the DX score", () => {
    const character = baseCharacter({
      attributes: {
        strength: 10,
        dexterity: 11, // GCA's final DX already includes the Extra DX +1
        intelligence: 10,
        health: 10,
        hitpoints: 10,
        will: 10,
        perception: 10,
        fatiguepoints: 10,
        basicspeed: "5.25", // (11+10)/4 with the inflated DX
        basicmove: 5,
      },
      traits: {
        tl: 3,
        sizemodifier: 0,
        adslist: [{ name: "Extra DX", points: 20, text: "", pageref: "B15" }],
      },
    });
    const { actorUpdate, items } = mapGcaCharacterToGworld(character);

    // The raw "bought" DX excludes the trait's contribution...
    expect(actorUpdate["system.attributes.DX"]).toBe(10);

    // ...and the trait carries its own levels so GWorldVTT's engine adds the
    // +1 back on its own, rather than the importer baking it into DX AND
    // billing the trait's 20 points on top.
    const trait = items.find((i) => i.name === "Extra DX");
    expect(trait.system.levels).toBe(1);
    expect(trait.system.points).toBe(20);
  });

  it("does not double-count an 'Extra Hit Points' trait against both the trait and purchased HP", () => {
    const character = baseCharacter({
      attributes: {
        strength: 10,
        dexterity: 10,
        intelligence: 10,
        health: 10,
        hitpoints: 12, // 10 base + 2 from the Extra Hit Points trait
        will: 10,
        perception: 10,
        fatiguepoints: 10,
        basicspeed: "5",
        basicmove: 5,
      },
      traits: {
        tl: 3,
        sizemodifier: 0,
        adslist: [{ name: "Extra Hit Points", points: 4, text: "", pageref: "B16" }],
      },
    });
    const { actorUpdate, items } = mapGcaCharacterToGworld(character);

    expect(actorUpdate["system.purchased.hp"]).toBe(0);
    expect(actorUpdate["system.hp.value"]).toBe(10);

    const trait = items.find((i) => i.name === "Extra Hit Points");
    expect(trait.system.levels).toBe(2);
    expect(trait.system.points).toBe(4);
  });
});

describe("normalizeTraitEffectName", () => {
  it("strips a level number written into the trait's name", () => {
    expect(normalizeTraitEffectName("Extra ST 2")).toBe("extra st");
  });

  it("strips a trailing percentage-modifier list", () => {
    expect(normalizeTraitEffectName("Extra HT (Size, -10%)")).toBe("extra ht");
  });

  it("lowercases and trims plain names", () => {
    expect(normalizeTraitEffectName("  Extra DX  ")).toBe("extra dx");
  });
});
