/**
 * The player-facing UI: a DialogV2 with a plain `<input type="file">` (GCA5
 * export files live on the player's own desktop, not in Foundry's server-side
 * Data directory, so Foundry's FilePicker isn't the right tool), which reads
 * the file client-side and applies the mapped result to the actor.
 */

import { parseGcaExport, GcaImportError } from "./gca-xml-parser.js";
import { mapGcaCharacterToGworld } from "./gca-to-gworld-mapper.js";

const MODULE_ID = "gworld-character-import";
const REPLACED_ITEM_TYPES = ["trait", "skill", "equipment"];

export async function openGcaImportDialog(actor) {
  const content = await renderTemplate(`modules/${MODULE_ID}/templates/import-dialog.hbs`, {
    hint: game.i18n.localize("GWORLDIMPORT.DialogHint"),
    fileLabel: game.i18n.localize("GWORLDIMPORT.FileLabel"),
  });

  await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.format("GWORLDIMPORT.DialogTitle", { name: actor.name }) },
    content,
    ok: {
      label: game.i18n.localize("GWORLDIMPORT.ImportButton"),
      icon: "fa-solid fa-file-import",
      callback: async (_event, _button, dialog) => {
        const input = dialog.element.querySelector("#gca-import-file");
        const file = input?.files?.[0];
        if (!file) {
          ui.notifications.error(game.i18n.localize("GWORLDIMPORT.NoFileSelected"));
          return;
        }
        await importFile(actor, file);
      },
    },
  });
}

async function importFile(actor, file) {
  let text;
  try {
    text = await file.text();
  } catch (err) {
    ui.notifications.error(game.i18n.format("GWORLDIMPORT.ReadFailed", { message: err.message }));
    return;
  }

  let character;
  try {
    ({ character } = parseGcaExport(text));
  } catch (err) {
    if (err instanceof GcaImportError) {
      ui.notifications.error(err.message);
    } else {
      console.error(`${MODULE_ID} | Failed to parse GCA export`, err);
      ui.notifications.error(game.i18n.format("GWORLDIMPORT.ParseFailed", { message: err.message }));
    }
    return;
  }

  const { actorUpdate, items, warnings } = mapGcaCharacterToGworld(character);

  try {
    await actor.update(actorUpdate);

    // v1 fully repopulates rather than merging: replace this actor's
    // existing core-scope items outright, so a re-import doesn't leave
    // stale/duplicate traits, skills or equipment behind.
    const staleIds = actor.items.filter((item) => REPLACED_ITEM_TYPES.includes(item.type)).map((item) => item.id);
    if (staleIds.length > 0) await actor.deleteEmbeddedDocuments("Item", staleIds);
    if (items.length > 0) await actor.createEmbeddedDocuments("Item", items);
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to apply imported data`, err);
    ui.notifications.error(game.i18n.format("GWORLDIMPORT.ApplyFailed", { message: err.message }));
    return;
  }

  ui.notifications.info(game.i18n.format("GWORLDIMPORT.Success", { name: actor.name }));

  if (warnings.length > 0) {
    const reportContent = await renderTemplate(`modules/${MODULE_ID}/templates/import-report.hbs`, {
      intro: game.i18n.format("GWORLDIMPORT.ReportIntro", { name: actor.name }),
      warnings,
    });
    await ChatMessage.create({
      content: reportContent,
      whisper: [game.user.id],
      speaker: { alias: game.i18n.localize("GWORLDIMPORT.ChatSpeaker") },
    });
  }
}
