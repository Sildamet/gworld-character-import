# Setting up the GCA5 export plugin

This module reads a character export produced by a small plugin that runs *inside* GURPS Character Assistant 5
(GCA5) — not GCA5's own save file. GCA5 compiles this plugin itself; there is nothing to build on your end beyond
copying a folder into place.

## Install (one time)

1. Close GCA5 if it's running.
2. Copy the `GWorldVTT5Plugin` folder (the one this README lives next to) into:

   ```
   Documents\GURPS Character Assistant 5\plugins\GWorldVTT5Plugin\
   ```

   (Create the `plugins` folder if it doesn't already exist.)
3. Launch GCA5. It discovers and compiles the plugin automatically on startup — no separate "enable plugins" step.

## Export a character

1. Open the character in GCA5.
2. **File → Export**, and pick **Export To Foundry VTT** from the list of export templates.
3. Save the `.xml` file it produces somewhere you can find it.
4. In Foundry, open the character actor (in the `gworld` system) and click the **Import from GCA** button in the
   sheet's header, then pick that `.xml` file.

Importing fully replaces the actor's attributes, traits, skills and equipment with what's in the file — it doesn't
merge with what's already there. See the root [README](../README.md) for what is and isn't imported.

## Where this plugin came from

See [`GWorldVTT5Plugin/NOTICE.md`](GWorldVTT5Plugin/NOTICE.md) — it's vendored, unmodified, from the `crnormand/gurps`
Foundry system (MIT-licensed), which ships the same plugin for its own GCS/GCA importer.
