# Changelog

## 3.1.2

- Sort items, ingredient choices, saved groups, and shopping entries alphabetically using the browser locale.
- Keep General items first and keep shopping recipe groups separate.

## 3.1.1

- Highlight catalogue items green when they have an unticked entry anywhere in Shopping.
- Show an In shopping list label and disable duplicate adds from the Items tab.
- Clear the highlight when all matching entries are picked up or removed.

## 3.1.0

- Package the storage integration and card together for HACS Integration installation.
- Automatically serve and load the bundled card; no ZIP, manual copy, or dashboard resource is required.
- Keep frontend route registration safe across integration reloads.
- Document migration from the old HACS Dashboard category.

## 3.0.0

- Add the Dinner Shopping custom integration with independent persistent storage.
- Default the card to native storage with no to-do entity configuration.
- Save changes with revision checks to reject stale writes from other devices.
- Add an optional non-destructive import from old v1/v2 Local to-do records.
- Preserve legacy card configurations during a gradual upgrade.
- Add Python storage tests and a native JS-to-Python workflow test.
- Document the separate one-time integration installation in the same repository.

## 2.0.0

- Add Shopping, Saved groups, and Items tabs.
- Automatically remember items entered on the shopping list.
- Build reusable ingredient groups from the item catalogue, with quantities.
- Add each selected group to shopping under a separate heading.
- Keep shopping checkmarks independent from saved ingredients and other groups.
- Keep templates when clearing shopping; prevent repeated group clicks from duplicating existing entries.
- Preserve v1 dinner lists and their checkmarks; add an explicit Save as group action.
- Preserve unfinished text during refreshes and surface save failures.
- Add a browser workflow test using mocked Home Assistant services.

## 1.0.0

- Initial dinner shopping checklist and HACS custom repository support.
