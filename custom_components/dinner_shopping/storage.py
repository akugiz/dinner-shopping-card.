"""Persistent, revision-checked shopping data; independent of to-do entities."""
from __future__ import annotations

import asyncio
from copy import deepcopy
import hashlib
import json
from uuid import uuid4

PREFIX = "dinner-shopping-card:v2:"
OLD_PREFIX = "dinner-shopping-card:v1:"
MAX_ITEMS = 5000


class ShoppingError(ValueError):
    """An error safe to show to the user."""
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def text(value, field, maximum=8192, empty=False):
    if not isinstance(value, str) or len(value) > maximum or (not empty and not value.strip()):
        raise ShoppingError("invalid_data", f"Invalid {field}.")
    return value


def metadata(description):
    text(description, "description")
    try:
        if description.startswith(PREFIX):
            value = json.loads(description[len(PREFIX):])
            if not isinstance(value, dict) or value.get("kind") not in ("product", "group", "ingredient", "shop"):
                raise ValueError
            text(value.get("id"), "record id", 200)
            if value["kind"] in ("ingredient", "shop"):
                text(value.get("group"), "group", 200, empty=value["kind"] == "shop")
                text(value.get("qty"), "quantity", 160, empty=True)
            return value
        if description.startswith(OLD_PREFIX):
            value = json.loads(description[len(OLD_PREFIX):])
            if not isinstance(value, dict) or value.get("kind") not in ("dinner", "item"):
                raise ValueError
            text(value.get("dinner"), "dinner", 500)
            return value
    except (ValueError, TypeError) as err:
        raise ShoppingError("invalid_data", "Invalid shopping metadata.") from err
    raise ShoppingError("invalid_data", "Not a Dinner Shopping record.")


def validate_record(record):
    if not isinstance(record, dict):
        raise ShoppingError("invalid_data", "Invalid shopping record.")
    text(record.get("uid"), "uid", 200)
    text(record.get("summary"), "item name", 500)
    metadata(record.get("description"))
    if record.get("status") not in ("needs_action", "completed"):
        raise ShoppingError("invalid_data", "Invalid checkmark status.")
    return {key: record[key] for key in ("uid", "summary", "description", "status")}


class ShoppingStorage:
    """Serialize writes and acknowledge changes only after durable storage succeeds."""
    def __init__(self, store):
        self.store = store
        self.lock = asyncio.Lock()
        self.active = True
        self.data = {"revision": 0, "items": []}

    async def load(self):
        saved = await self.store.async_load()
        if saved is None:
            return
        if not isinstance(saved, dict) or type(saved.get("revision")) is not int or saved["revision"] < 0:
            raise ShoppingError("invalid_storage", "Saved shopping data is invalid; it has not been overwritten.")
        if not isinstance(saved.get("items"), list) or len(saved["items"]) > MAX_ITEMS:
            raise ShoppingError("invalid_storage", "Saved shopping items are invalid; they have not been overwritten.")
        records = [validate_record(r) for r in saved["items"]]
        if len({r["uid"] for r in records}) != len(records):
            raise ShoppingError("invalid_storage", "Saved shopping IDs are duplicated; data has not been overwritten.")
        self.data = {"revision": saved["revision"], "items": records}

    def snapshot(self):
        if not self.active:
            raise ShoppingError("not_loaded", "Dinner Shopping integration is not loaded.")
        return deepcopy(self.data)

    async def close(self):
        async with self.lock:
            self.active = False

    async def apply(self, action, payload, expected_revision):
        async with self.lock:
            self.snapshot()  # Check that this instance was not unloaded.
            if type(expected_revision) is not int or expected_revision != self.data["revision"]:
                raise ShoppingError("conflict", "The list changed on another device. Refresh and try again.")
            if not isinstance(payload, dict):
                raise ShoppingError("invalid_data", "Invalid action data.")
            updated = deepcopy(self.data)
            items = updated["items"]
            if action == "add_item":
                if set(payload) != {"item", "description"}:
                    raise ShoppingError("invalid_data", "Invalid new item fields.")
                record = validate_record({"uid": str(uuid4()), "summary": payload["item"], "description": payload["description"], "status": "needs_action"})
                record_id = metadata(record["description"]).get("id")
                if not record_id:
                    raise ShoppingError("invalid_data", "New records need an ID.")
                if any(metadata(r["description"]).get("id") == record_id for r in items):
                    raise ShoppingError("duplicate", "This record already exists. Refresh the list.")
                items.append(record)
            elif action in ("update_item", "remove_item"):
                allowed = {"item", "status", "rename", "description"} if action == "update_item" else {"item"}
                if not set(payload) <= allowed or "item" not in payload:
                    raise ShoppingError("invalid_data", "Invalid item fields.")
                record = next((r for r in items if r["uid"] == payload["item"]), None)
                if record is None:
                    raise ShoppingError("not_found", "This item was removed. Refresh the list.")
                if action == "remove_item":
                    items.remove(record)
                else:
                    if "description" in payload:
                        previous = metadata(record["description"])
                        changed = metadata(payload["description"])
                        for key in ("id", "kind", "group", "product", "source"):
                            if previous.get(key) != changed.get(key):
                                raise ShoppingError("invalid_data", "Record identity cannot be changed.")
                    for field, target in (("rename", "summary"), ("description", "description"), ("status", "status")):
                        if field in payload:
                            record[target] = payload[field]
                    validate_record(record)
            elif action == "import":
                self._import(items, payload)
            else:
                raise ShoppingError("invalid_action", "Unknown shopping action.")
            if len(items) > MAX_ITEMS:
                raise ShoppingError("limit_reached", f"The storage limit is {MAX_ITEMS} records.")
            if items == self.data["items"]:
                return self.snapshot()
            updated["revision"] += 1
            # A failed save leaves the in-memory state and revision unchanged.
            await self.store.async_save(updated)
            self.data = updated
            return self.snapshot()

    @staticmethod
    def _import(items, payload):
        """Copy known v1/v2 records without touching the old source or replacing new data."""
        if set(payload) != {"source", "items"}:
            raise ShoppingError("invalid_data", "Invalid import fields.")
        source = text(payload["source"], "source", 200)
        incoming = payload["items"]
        if not isinstance(incoming, list) or len(incoming) > MAX_ITEMS:
            raise ShoppingError("invalid_data", "Invalid import list.")
        uids = {r["uid"] for r in items}
        ids = {metadata(r["description"]).get("id") for r in items}
        for candidate in incoming:
            if not isinstance(candidate, dict):
                raise ShoppingError("invalid_data", "Invalid imported record.")
            description = candidate.get("description", "")
            if not isinstance(description, str) or not description.startswith((PREFIX, OLD_PREFIX)):
                continue
            clean = validate_record(candidate)
            record_id = metadata(clean["description"]).get("id")
            uid = "import-" + hashlib.sha256((source + "\0" + clean["uid"]).encode()).hexdigest()
            if uid in uids or (record_id is not None and record_id in ids):
                continue
            clean["uid"] = uid
            items.append(clean)
            uids.add(uid)
            ids.add(record_id)
