/**
 * Injects an "Import from GCA" control into GWorld character actor sheets.
 *
 * This module targets a system it doesn't own, so it can't subclass GWorld's
 * sheet class the way a system's own importer would; instead it hooks sheet
 * rendering and patches a button into the rendered header DOM. Both the
 * legacy AppV1 hook name and the ApplicationV2 catch-all are registered,
 * since which one actually fires depends on which base class GWorld's own
 * sheet extends (an internal, undocumented detail this module deliberately
 * doesn't depend on).
 */

import { openGcaImportDialog } from "./importer/import-dialog.js";

const SYSTEM_ID = "gworld";
const ACTOR_TYPE = "character";
const BUTTON_CLASS = "gca-import-button";

function isEligibleActorSheet(app) {
  if (game.system.id !== SYSTEM_ID) return false;
  const actor = app.actor ?? app.document;
  return actor instanceof Actor && actor.type === ACTOR_TYPE && actor.isOwner;
}

function toHtmlElement(htmlOrElement) {
  if (htmlOrElement instanceof HTMLElement) return htmlOrElement;
  if (htmlOrElement && typeof htmlOrElement.length === "number" && htmlOrElement[0] instanceof HTMLElement) {
    return htmlOrElement[0];
  }
  return null;
}

function injectImportButton(app, htmlOrElement) {
  if (!isEligibleActorSheet(app)) return;

  const root = toHtmlElement(htmlOrElement);
  const header = root?.querySelector?.(".window-header");
  if (!header || header.querySelector(`.${BUTTON_CLASS}`)) return;

  const actor = app.actor ?? app.document;

  const button = document.createElement("button");
  button.type = "button";
  button.className = `header-control ${BUTTON_CLASS}`;
  button.dataset.tooltip = game.i18n.localize("GWORLDIMPORT.ImportButton");
  button.innerHTML = `<i class="fa-solid fa-file-import"></i>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    openGcaImportDialog(actor);
  });

  const closeButton = header.querySelector(".close, [data-action='close']");
  if (closeButton) closeButton.before(button);
  else header.appendChild(button);
}

Hooks.on("renderActorSheet", injectImportButton);
Hooks.on("renderApplicationV2", (app, element) => injectImportButton(app, element));
