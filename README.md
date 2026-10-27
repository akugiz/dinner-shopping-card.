# Dinner Shopping — independent storage

**Version 3.1.1** adds a dedicated Home Assistant integration for the card. Normal use needs **no Local to-do list, no Shopping list integration, and no `entity:` in the card configuration**.

Your items, reusable ingredient groups and shopping checkmarks are saved on your Home Assistant server. They survive browser refreshes and server restarts and are shared between devices.

## What the card does

- **Shopping:** everyday groceries plus separate selected groups, with a checkbox for each item.
- **Saved groups:** create Banana bread, select its ingredients from Items, and enter quantities.
- **Items:** reusable ingredients. Adding something directly to Shopping also saves it here.

Add Banana bread to shopping and its ingredients appear under a separate Banana bread heading alongside General items. Clearing that shopping section keeps the saved group for next time. Matching ingredients in different sections have independent quantities and checkmarks.

## Install everything through HACS

No ZIP download or manual file copying is needed. HACS now installs the integration and its bundled card together.

### If you added the old Dashboard repository

1. In HACS, remove the old **Dinner Shopping Card** Dashboard download.
2. Open HACS → three-dot menu → Custom repositories and remove its old Dashboard registration if it remains.
3. Follow the Integration installation steps below using the same repository URL.
4. Under Settings → Dashboards → Resources, remove any old `/hacsfiles/dinner-shopping-card./dinner-shopping-card.js` or `/local/dinner-shopping-card.js` entries if they remain. The new integration loads its bundled card automatically.

Removing the old Dashboard download does not remove your Local to-do list or the independent integration's saved data. Do not delete those data stores when changing HACS category.

### Integration installation

1. Open **HACS → three-dot menu → Custom repositories**.
2. Add `https://github.com/akugiz/dinner-shopping-card.` and choose **Integration**.
   The final dot is part of the repository name.
3. Find **Dinner Shopping**, select **Download**, and choose the default branch if asked.
4. **Restart Home Assistant.**
5. Go to **Settings → Devices & services → Add integration → Dinner Shopping** and submit the setup form. If you already added this integration manually in v3.0, keep that existing entry.
6. Refresh your browser or fully reload the Home Assistant app.
7. Add the card configuration below.

The integration automatically serves and loads the bundled JavaScript. No manual dashboard resource entry is required. The card should display **v3.1.1 · Independent storage**.

Future HACS Integration updates include both the backend and the card. Restart Home Assistant and refresh browsers after updating.

No credentials, device or to-do entity are required. There is one shared database that all signed-in Home Assistant users can view and edit.

## Add the independent card

Edit your dashboard → Add card → Manual:

```yaml
type: custom:dinner-shopping-card
title: Dinner shopping
```

There is **no `entity:` setting** in independent mode. If the integration is missing or not loaded, the card explains what to install. It does not silently switch to a browser-only list.

## Optional: copy your previous v1/v2 items

If you already used the old card with a Local to-do list, you can copy its data. This is optional and the only native-mode feature that reads a to-do entity.

1. Install and add the new Dinner Shopping integration first.
2. Replace the old card configuration with:

```yaml
type: custom:dinner-shopping-card
title: Dinner shopping
import_from: todo.dinner_shopping
```

3. Replace `todo.dinner_shopping` with your actual old entity ID if different.
4. Press **Import previous list** in the card and confirm.
5. Check your items and groups, then remove the `import_from:` line.

The import copies only this card's recognized v1/v2 records. It preserves quantities, group links and checkmarks, and leaves the old list unchanged. A repeated import skips existing matching records; it does not overwrite edits in the new storage. Unknown native to-do items are not imported.

Old v1 dinners appear in Shopping with their original checkmarks. Use **Save as group** to turn them into reusable groups.

For a gradual upgrade, an existing card containing `entity: todo...` still uses the old storage and shows **Legacy storage**. Remove `entity:` to switch to the new integration. Data does not migrate automatically.

## Example: Banana bread

1. Add Butter, Bread, Bananas, Milk and Flour in **Shopping**. These also become available in **Items**.
2. In **Saved groups**, create **Banana bread**.
3. Choose Bananas and enter `3`, then Add ingredient.
4. Add Butter with `100 g` and Flour with `200 g`.
5. Press **Add to shopping**. Banana bread appears as a separate shopping section.
6. Tick ingredients as you pick them up.
7. After the trip, use **Clear from shopping**. Next time, add Banana bread again; its new shopping checkboxes start unticked.

Items already in General items are not moved or automatically combined with a recipe's ingredients. Remove a general copy with × if you only need the grouped copy.

In **Items**, products with an unticked shopping entry are highlighted green and show **✓ In shopping list**. This includes ingredients in recipe groups. The highlight clears when all matching shopping entries are ticked or removed. You can still add an intentional extra general item from the Shopping tab.

## Editing and reuse

- **Items → Save item:** save an ingredient without adding it to today's shopping.
- **Quantity:** edit an ingredient's saved quantity. Existing shopping copies keep their original quantity.
- **Rename:** rename a saved group. Existing shopping copies keep their original heading.
- **Delete group:** remove its saved template; current shopping copies remain.
- **Clear from shopping:** remove current shopping entries; saved groups and reusable items remain.
- Repeated **Add group** clicks fill missing ingredients and keep existing checkmarks. Clear its shopping section to start a fresh trip.
- Removing a catalogue item does not remove ingredients already copied into groups or shopping.

## Storage and troubleshooting

- The integration uses Home Assistant's versioned storage helper at `/config/.storage/dinner_shopping.data`. Keep it in your Home Assistant backups. Do not edit it while Home Assistant is running.
- Removing the integration from Devices & services retains stored data for reinstallation. It does not delete your old to-do list either.
- **Dinner Shopping not found under Add integration:** verify the folder path and restart Home Assistant. Check Settings → System → Logs for `dinner_shopping`.
- **Custom element doesn't exist:** check the card resource URL and JavaScript Module type, then hard-refresh.
- **The list changed on another device:** refresh and retry. The backend rejects stale writes instead of silently overwriting another device's change.
- A failed storage write is reported as a failure. The server does not acknowledge it as saved.
- The card refreshes from the server every five seconds while open. Home Assistant must be reachable; there is no offline editing queue.
- Multi-item shopping operations can partly succeed if the connection drops or another device edits the list. Refresh and retry Add group to fill missing ingredients.
- Quantities are text; shared ingredients are not automatically combined or converted between units.
- There is one shared household store, with a limit of 5,000 records including catalogue items and templates.

## Developer packaging

All runtime files, including the JavaScript card, are under `custom_components/dinner_shopping/`, so HACS installs them as one integration. `hacs.json` uses the standard integration layout, without `content_in_root` or a dashboard `filename` override.

The root `dinner-shopping-card.js` remains a development source copy. Keep it byte-identical to `custom_components/dinner_shopping/www/dinner-shopping-card.js`; the packaging tests check this.

The integration serves `/dinner_shopping/dinner-shopping-card.js` and registers the versioned URL as an extra frontend module. Its static route is registered once per Home Assistant lifetime so entry reloads do not duplicate the route. Unloading removes the module from future page loads, while retaining saved shopping data.

## Validation

Completed checks:

- JavaScript syntax and legacy-mode model tests.
- Python syntax and eleven storage/adapter tests: disk persistence, concurrent-device conflicts, failed saves, validation, import preservation, atomic import failure, unload/reload, corrupt-storage protection, verification of successful disk writes, detection of silently failed writes, and safe rejection during shutdown.
- A native card test connected to the real Python storage engine over a local test bridge: complete shopping/group workflow, no to-do calls in normal mode, restart persistence, checkmarks, conflict handling, and optional import.

Run from this repository:

```sh
node --check dinner-shopping-card.js
node tests/model.test.cjs
node tests/native.test.cjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

`tests/card.spec.cjs` contains additional browser workflow tests for the legacy adapter. They were not run because the test Chromium download failed. No live Home Assistant installation was available; integration loading, visual layout, HACS download and on-device behavior still need verification. Packaging and frontend registration are tested with mocked Home Assistant APIs.

## Developer notes

The backend's authenticated WebSocket commands are `dinner_shopping/get` and `dinner_shopping/action`. Each change carries the last-read revision. Writes are serialized and saved before acknowledgment. The existing record format is reused internally for migration compatibility; native storage does not create or call to-do entities.

References: [Home Assistant WebSocket extensions](https://contributors.home-assistant.io/frontend/extending/websocket-api/), [HACS custom repositories](https://www.hacs.dev/docs/faq/custom_repositories/).
