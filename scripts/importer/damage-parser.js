/**
 * Parses a GURPS damage string, as emitted by the GCA5 "Export To Foundry VTT"
 * plugin's `unmodifiedDamage`/`damage` tags (e.g. "sw+2 cut", "thr-1 imp",
 * "1d+2 (2) cr"), into the shape GWorldVTT's `meleeModeField`/`rangedModeField`
 * expect: { damageBase, damageModifier, damageFormula, damageExtraDice,
 * damageType, armorDivisor }.
 *
 * GCA's own "unmodified" formula still names the base (thr/sw) rather than a
 * fixed die count when the weapon is ST-based, which is exactly what
 * `damageBase`/`damageModifier`/`damageExtraDice` need to let GWorldVTT
 * recompute the final damage from the character's own ST.
 */

const DAMAGE_TYPES = ["burn", "cor", "cut", "fat", "imp", "tox", "cr", "pi++", "pi+", "pi-", "pi"];

const DEFAULT_RESULT = Object.freeze({
  damageBase: "thr",
  damageModifier: 0,
  damageFormula: "",
  damageExtraDice: 0,
  damageType: "cr",
  armorDivisor: 1,
});

export function parseDamage(raw) {
  const result = { ...DEFAULT_RESULT };
  if (!raw) return result;

  let text = String(raw).trim();
  if (!text) return result;

  // Pull off a parenthetical armor divisor, e.g. "1d+2 (2) cut" or "hx (0.5) cut".
  const divisorMatch = text.match(/\(([\d.]+)\)/);
  if (divisorMatch) {
    const divisor = Number(divisorMatch[1]);
    if (Number.isFinite(divisor) && divisor > 0) result.armorDivisor = divisor;
    text = `${text.slice(0, divisorMatch.index)} ${text.slice(divisorMatch.index + divisorMatch[0].length)}`.trim();
  }

  // Split off the trailing damage type word, longest alternatives first so
  // "pi++"/"pi+" aren't swallowed by the bare "pi" alternative.
  const typePattern = new RegExp(`(${DAMAGE_TYPES.map(escapeRegExp).join("|")})\\s*$`, "i");
  const typeMatch = text.match(typePattern);
  let formula = text;
  if (typeMatch) {
    result.damageType = typeMatch[1].toLowerCase();
    formula = text.slice(0, typeMatch.index).trim();
  }

  formula = formula.replace(/\s+/g, "");
  if (!formula) return result;

  const baseMatch = formula.match(/^(thr|sw)/i);
  if (baseMatch) {
    result.damageBase = baseMatch[1].toLowerCase();
    let rest = formula.slice(baseMatch[0].length);

    // Extra whole dice added to the base, e.g. "sw+1d" (a chainsaw).
    const diceMatch = rest.match(/([+-]\d+)d(?!\d)/i);
    if (diceMatch) {
      result.damageExtraDice = Math.abs(parseInt(diceMatch[1], 10)) || 0;
      rest = rest.replace(diceMatch[0], "");
    }

    const modMatch = rest.match(/([+-]\d+)/);
    if (modMatch) result.damageModifier = parseInt(modMatch[1], 10) || 0;

    return result;
  }

  // Fixed dice formula not based on thr/sw, e.g. "2d+2", "1d-1", "3d".
  const fixedMatch = formula.match(/^\d+d(?:[+-]\d+)?$/i);
  if (fixedMatch) {
    result.damageBase = "fixed";
    result.damageFormula = fixedMatch[0];
    return result;
  }

  // Unrecognized formula (e.g. "spec.", or something the plugin didn't
  // anticipate) — keep the raw text as a fixed formula rather than guessing.
  result.damageBase = "fixed";
  result.damageFormula = formula;
  return result;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
