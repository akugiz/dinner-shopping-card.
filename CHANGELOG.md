# Changelog

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
