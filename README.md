# Dinner Shopping Card

A Home Assistant card for everyday shopping and reusable ingredient groups.

- **Shopping:** add Butter, Bread, Bananas, Milk, and other groceries. Tick each item when you pick it up.
- **Saved groups:** create Banana bread, choose its ingredients from your saved items, and enter quantities.
- **Items:** your reusable catalogue. Anything added directly to Shopping is saved here automatically.

Press **Add to shopping** on Banana bread, or select it from the Shopping tab. Its ingredients appear under their own **Banana bread** heading, alongside **General items**. Saved groups stay available for your next trip.

## Update an existing installation

In HACS, open Dinner Shopping Card → menu → Update information, then Redownload the default branch. Refresh the browser or fully reload the Home Assistant app. The card displays **v2.0.0** below its title. Your existing card YAML and dedicated Local to-do entity stay the same.

The repository name currently ends with a dot: `akugiz/dinner-shopping-card.` Include that dot in repository and resource URLs.

## Install with HACS

1. Open HACS → three-dot menu → Custom repositories.
2. Add `https://github.com/akugiz/dinner-shopping-card.` and choose **Dashboard** (Lovelace/Plugin in older versions).
3. Find **Dinner Shopping Card** and select Download. Select the default branch if asked.
4. Reload your browser.

If needed, add this **JavaScript Module** under Settings → Dashboards → Resources:

```text
/hacsfiles/dinner-shopping-card./dinner-shopping-card.js
```

For YAML-managed resources, use that URL with `type: module`. Remove an older manual `/local/dinner-shopping-card.js` resource entry if you switch to HACS, so only one copy is loaded.

This is a custom HACS repository, not a listing in the default catalog.

## One-time storage setup

The card uses Home Assistant's **Local to-do** integration to keep items and groups on your server, shared between devices. It is still a dashboard card, not a new custom integration. After this setup, manage all shopping items and saved groups inside the card.

1. Go to Settings → Devices & services → Add integration → **Local to-do**.
2. Name the list **Dinner Shopping**.
3. Check its entity ID; normally it is `todo.dinner_shopping`.
4. Add a Manual card to your dashboard:

```yaml
type: custom:dinner-shopping-card
entity: todo.dinner_shopping
title: Dinner shopping
```

Use your actual entity ID if different. The separate **Shopping list** integration does not provide the description storage this card needs.

Use a dedicated list. This card stores products, groups, ingredient templates, and shopping entries as separate records with metadata in their descriptions. In the native To-do dashboard those records appear flat, and its count includes saved records. Use the custom card to manage this list; do not clear its records or edit descriptions in the native dashboard.

## Example: Banana bread

1. In **Shopping**, add Butter, Bread, Bananas, Milk, and Flour. These also become available in **Items**.
2. Open **Saved groups** and create **Banana bread**.
3. Choose Bananas and enter `3`, then press **Add ingredient**.
4. Add Butter with `100 g` and Flour with `200 g`.
5. Press **Add to shopping**. Shopping now has a separate Banana bread section with its own checkboxes.
6. Tick each ingredient as you pick it up.
7. Use **Clear from shopping** after that trip. Next time, add Banana bread again; the saved ingredients remain and the new shopping checkboxes start unticked.

General items and group ingredients stay separate even if they have the same name. For example, general Butter and Banana bread's Butter have independent checkboxes; quantities are not combined automatically. If you only need the grouped copy, remove the general copy with ×.

## Editing and reuse

- **Items → Save item:** add an ingredient to your catalogue without adding it to today's shopping.
- **Saved groups → Quantity:** edit the saved quantity; use × to remove an ingredient.
- **Rename:** change a saved group's name. Existing shopping copies keep their original name and quantities.
- **Delete group:** remove the saved group and its ingredients. Current shopping copies are kept.
- **Clear from shopping:** remove that section's current shopping entries. Saved groups and catalogue items are kept.
- Repeated **Add group** presses fill only missing ingredients, preserving checkmarks. Clear the shopping section before adding the group for a new trip.
- Removing an item from **Items** keeps any existing saved-group ingredients and shopping copies.

## Upgrading from v1

Existing dinner headings, ingredients, and ticked states remain visible in Shopping. Use **Save as group** on an old dinner to copy it into Saved groups. This leaves the original checklist unchanged. Old quantities typed into the item name remain part of that name.

There is no automatic destructive migration. Older v1 cards do not display new v2 records, so refresh all devices after upgrading.

## Manual installation

Copy `dinner-shopping-card.js` to `/config/www/dinner-shopping-card.js`, creating the `www` folder if needed. If you created `www` for the first time, restart Home Assistant. Add `/local/dinner-shopping-card.js?v=2.0.0` as a JavaScript Module dashboard resource, reload, and use the YAML above.

## Troubleshooting and limitations

- **Custom element doesn't exist:** verify the resource path and JavaScript Module type, then hard-refresh. Check the version displayed on the card.
- **Read/save error:** verify the dedicated Local to-do entity, connection, and account permissions. The card displays errors without claiming the change was saved.
- Home Assistant must be reachable to read or save. There is no offline editing queue or browser-only storage.
- Other open cards poll every five seconds. Simultaneous edits on separate devices are not transactional; simultaneous additions can still create duplicates. Multi-item operations may partly succeed if the connection fails. Reload and retry **Add group** to fill missing entries.
- Group quantities are free text; there is no unit conversion or automatic combining of shared ingredients.

## Validation

JavaScript syntax checks and `node tests/model.test.cjs` passed. The model tests cover persistence requests, separate shopping copies, group reuse, duplicate protection, partial save failures, and preservation of v1 data.

`tests/card.spec.cjs` exercises the browser UI against an in-memory mock of Home Assistant's to-do services. It covers group creation, quantities, independent checkmarks, reloads, shared data, clearing/reusing groups, duplicate protection, partial failures, unfinished input, v1 preservation, text escaping, narrow-screen layout, and deleting templates without deleting shopping copies.

Run with Node.js:

```sh
npm install --no-save playwright
npx playwright install chromium
node tests/card.spec.cjs
```

The browser test is included but could not be executed in the development environment because its Chromium download failed. Visual layout and browser interaction still need verification. No live Home Assistant instance was available during development.

References: [Local to-do](https://www.home-assistant.io/integrations/local_todo/), [To-do actions](https://www.home-assistant.io/integrations/todo/), [HACS custom repositories](https://www.hacs.dev/docs/faq/custom_repositories/).
