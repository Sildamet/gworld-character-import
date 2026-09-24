# GWorld Character Import

A Foundry VTT module for the [GWorld - GURPS 4e](https://github.com/sargas79/GWorldVTT) system (`gworld`) that lets
a player import a character exported from **GURPS Character Assistant 5 (GCA5)** into a `character` actor.

Import happens entirely client-side: the GCA5 export file lives on your own desktop, not on the Foundry server, so
this reads it straight out of a file picker rather than requiring a GM to upload anything.

## Requirements

- Foundry VTT v14+
- The [`gworld`](https://github.com/sargas79/GWorldVTT) system, v1.40.0+
- GURPS Character Assistant 5 (not GCA4 — see [`gca-export/README.md`](gca-export/README.md))

## Setup

1. Install this module and enable it in your world (alongside the `gworld` system).
2. Each player who wants to import a character does the one-time GCA5 plugin setup described in
   [`gca-export/README.md`](gca-export/README.md).

## Using it

1. Export your character from GCA5 via **File → Export → Export To Foundry VTT**.
2. Open your character actor in Foundry and click **Import from GCA** in the sheet's header.
3. Pick the exported `.xml` file.

Importing replaces the actor's attributes, traits, skills and equipment with what's in the file — each import is a
full repopulate, not a merge, so re-importing after updating the character in GCA5 is safe to do (but don't expect
in-play state like current HP/FP damage to be preserved across a re-import in this version).

If anything in the file was skipped or had to be defaulted, you'll get a whispered chat message listing what and why
after the import finishes.

## What's imported (v1)

- Attributes: ST/DX/IQ/HT, HP/FP, Will/Perception, Basic Speed/Move
- Traits: advantages, disadvantages, perks, quirks
- Skills
- Equipment, including weapons (melee and ranged attack modes)

**Not imported in this version:** spells/magic, racial templates, languages/techniques as their own item type
(they're folded into generic traits — see below), and the `npc`/`vehicle`/`party` actor types. If your character
file has any of these, the post-import report will say so.

### Known limitations

- GCA5's export doesn't separate advantages from perks, or disadvantages from quirks — this module infers perk/quirk
  by the GURPS-standard flat 1/-1 point cost, which can misclassify an unusually cheap advantage or disadvantage.
- Languages and cultural familiarities aren't a distinct item type here; they show up as generic traits since GCA5's
  export doesn't separate them from advantages either.
- A racial template's or trait's effect on HP/Will/Per/FP/Speed/Move can't be told apart from character points spent
  on the same stat, since v1 doesn't parse templates — both land in `purchased`.
- GWorldVTT's own rules already recognize traits named "Extra ST/DX/IQ/HT", "Extra Hit Points", "Extra Fatigue
  Points", "Extra Will", "Extra Perception", "Extra Basic Move" and "Extra Basic Speed" by name, and apply their
  bonus on top of `system.attributes`/`system.purchased` at derive time. To avoid billing those points twice
  (once as the trait, once as a phantom attribute purchase — see `ATTRIBUTE_TRAIT_EFFECTS`/`SECONDARY_TRAIT_EFFECTS`
  in `gca-to-gworld-mapper.js`), the importer backs the trait's contribution out of the raw score it imports and
  sets the trait item's `levels` field instead, using GURPS 4e Basic Set per-level costs (e.g. DX at 20/level). A
  racial template that changes that per-level cost isn't detectable from this export and would throw the derived
  `levels` off.
- Weapon Parry/Block bonuses aren't imported: GCA5's export gives the final calculated Parry/Block number, not a
  modifier, so importing it directly would double-count against GWorld's own calculation.
- Equipment carried/equipped state isn't imported — GCA5's export doesn't carry it reliably, so everything comes in
  as carried and unequipped.

## Development

```
npm install
npm test
```

The mapping rationale is documented in comments in `scripts/importer/`; the GCA5 export plugin itself lives in
[`gca-export/`](gca-export/).

### Releasing

Releases are built by [`.github/workflows/release.yml`](.github/workflows/release.yml), triggered by pushing a
version tag:

1. Bump `version` in `module.json` and commit it.
2. `git tag vX.Y.Z && git push origin vX.Y.Z` (the tag must match `module.json`'s version, or the workflow fails).

The workflow zips the module's runtime files into `module.zip` and creates a GitHub Release with **both**
`module.json` and `module.zip` attached as separate assets — `module.json` stays available on its own outside the
zip, which is what lets Foundry's installer fetch just the manifest without downloading the whole package. Both
`manifest` and `download` in `module.json` point at `.../releases/latest/download/...`, a stable URL that always
resolves to the most recent release regardless of version.
