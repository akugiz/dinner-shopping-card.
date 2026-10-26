# Dinner shopping card

Create dinners, add the groceries needed for each dinner, and tick off items while shopping. No photos, graphs, or cooking instructions. Items remain available after being ticked, so you can untick them for another shopping trip.

## Install with HACS (recommended)

1. Open HACS → three-dot menu → Custom repositories.
2. Paste the full repository URL: `https://github.com/akugiz/dinner-shopping-card.`
   The final dot is part of the current repository name.
3. Select **Dashboard** (called Lovelace or Plugin in older versions), then Add.
4. Find **Dinner Shopping Card**, open it, and select Download. Use the default branch if asked.
5. Reload your browser.
6. Create the dedicated Local to-do list described below, then add the card YAML in step 4. Skip the manual file-copy and resource steps if HACS has registered the resource.

If the card does not load, check Settings → Dashboards → Resources. The HACS JavaScript Module URL is:

`/hacsfiles/dinner-shopping-card./dinner-shopping-card.js`

For YAML-managed resources, add that URL with `type: module`. If you installed manually before, remove the old `/local/dinner-shopping-card.js` resource entry so only the HACS copy is loaded. This does not delete your to-do data.

This is a HACS **custom repository**; it has not been submitted to the default catalog. The manifest explicitly specifies the JavaScript filename because the repository name ends in a dot. HACS installation still needs verification on a live Home Assistant instance.

## 1. Create the storage list

In Home Assistant, open Settings → Devices & services → Add integration → Local to-do.
Name the list **Dinner Shopping**. Find its entity ID in the integration's entities; normally it will be `todo.dinner_shopping`.

Use a new, dedicated Local to-do list. The card stores grouping metadata in item descriptions. It does not use your browser's local storage. The ordinary To-do dashboard will show the dinner names and ingredients as a flat list; use this custom card for the grouped view. Do not edit descriptions or clear completed items from the ordinary To-do dashboard if you want to keep them on this card.

## 2. Copy the JavaScript file

Download `dinner-shopping-card.js` from this repository. Using your usual Home Assistant file editor or network share, copy `dinner-shopping-card.js` into:

`/config/www/dinner-shopping-card.js`

Create the `www` folder if needed. If this is the first time you have created that folder, restart Home Assistant.

## 3. Add a dashboard resource

Enable Advanced mode in your Home Assistant user profile if Resources is hidden.
Open Settings → Dashboards → menu (three dots) → Resources → Add resource.

- URL: `/local/dinner-shopping-card.js?v=1`
- Type: JavaScript Module

Reload your browser. If you manage dashboard resources in YAML, add the same URL with `type: module` under your existing Lovelace resources instead.

## 4. Add the card

Edit your dashboard → Add card → Manual. Paste:

```yaml
type: custom:dinner-shopping-card
entity: todo.dinner_shopping
title: Dinner shopping
```

Replace the entity if yours has a different ID. Save.

## How to use

1. Type **Steak dinner** into the new dinner field and press Add.
2. Under Steak dinner, add **Steak — 2 pieces**, **Potatoes — 1 kg**, **Mushrooms**, and **Pepper sauce**, one at a time.
3. Add another dinner, such as Chicken curry, in the top field.
4. Tick the checkboxes while shopping; untick them to buy the items again.
5. Use × to remove an item or Delete to remove a dinner and its items. Both ask for confirmation.

Quantities are typed as part of the item name. Matching ingredients under different dinners stay separate. Other devices refresh about every five seconds while the card is open. Saving requires a connection to Home Assistant and permission to change the list. No separate API key is needed.

## Troubleshooting

- **Custom element doesn't exist:** check the filename, resource URL and JavaScript Module type, then hard-refresh the browser. Check that `/local/dinner-shopping-card.js?v=1` opens on your Home Assistant address.
- **Entity not found / cannot read list:** verify the entity ID. Use the Local to-do integration, not an input_text helper.
- **Changes fail:** the card displays the service error. Check your connection and account permissions.
- After replacing the JS with a newer version, change the resource query to `?v=2` and refresh.

## Validation and limitations

JavaScript syntax and mocked storage operations were checked. This version has not been tested on your live Home Assistant instance. Keep a normal Home Assistant backup. Simultaneous additions from multiple devices may create duplicate dinners; the card groups exact matching dinner names together.

Official references:
- https://www.home-assistant.io/integrations/local_todo/
- https://www.home-assistant.io/integrations/todo/
- https://developers.home-assistant.io/docs/api/websocket/
