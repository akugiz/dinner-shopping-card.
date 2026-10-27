"""Dinner Shopping: persistent storage for the accompanying dashboard card."""
from __future__ import annotations

import logging
import json
from pathlib import Path

try:
    import probatio as vol
except ImportError:  # Home Assistant versions before the schema-library transition.
    import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, CoreState
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store

from .const import DOMAIN, STORAGE_KEY, STORAGE_VERSION
from .storage import ShoppingError, ShoppingStorage
from .frontend import async_setup_frontend, async_unload_frontend

_LOGGER = logging.getLogger(__name__)
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


class VerifiedStore:
    """Verify saves because HA's Store may log I/O errors instead of raising them."""
    def __init__(self, hass):
        self.hass = hass
        self.store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    async def async_load(self):
        return await self.store.async_load()

    def _read_disk(self):
        with Path(self.store.path).open(encoding="utf-8") as handle:
            return json.load(handle).get("data")

    async def async_save(self, value):
        if self.hass.state is CoreState.stopping:
            raise OSError("Home Assistant is stopping. Retry after restart.")
        await self.store.async_save(value)
        saved = await self.hass.async_add_executor_job(self._read_disk)
        if saved != value:
            raise OSError("Shopping data could not be verified on disk.")


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Register API commands. Home Assistant authenticates WebSocket connections."""
    websocket_api.async_register_command(hass, websocket_get)
    websocket_api.async_register_command(hass, websocket_action)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Load the single shared household store."""
    storage = ShoppingStorage(VerifiedStore(hass))
    try:
        await storage.load()
    except (OSError, ValueError) as err:
        raise ConfigEntryNotReady(f"Dinner Shopping data could not be loaded: {err}") from err
    await async_setup_frontend(hass)
    hass.data[DOMAIN] = storage
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Stop access but retain the saved data for reinstallation."""
    async_unload_frontend(hass)
    storage = hass.data.get(DOMAIN)
    if storage is not None:
        await storage.close()
        hass.data.pop(DOMAIN, None)
    return True


def _storage(hass, connection, msg):
    if connection.user is None:
        connection.send_error(msg["id"], "unauthorized", "Sign in to Home Assistant first.")
        return None
    storage = hass.data.get(DOMAIN)
    if storage is None:
        connection.send_error(msg["id"], "not_loaded", "Add Dinner Shopping in Settings → Devices & services first.")
    return storage


@websocket_api.websocket_command({vol.Required("type"): "dinner_shopping/get"})
@websocket_api.async_response
async def websocket_get(hass, connection, msg):
    """Read a snapshot for a signed-in household user."""
    storage = _storage(hass, connection, msg)
    if storage is None:
        return
    try:
        connection.send_result(msg["id"], storage.snapshot())
    except ShoppingError as err:
        connection.send_error(msg["id"], err.code, str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "dinner_shopping/action",
    vol.Required("action"): str,
    vol.Required("data"): dict,
    vol.Required("revision"): int,
})
@websocket_api.async_response
async def websocket_action(hass, connection, msg):
    """Save an individual change or a single atomic import."""
    storage = _storage(hass, connection, msg)
    if storage is None:
        return
    try:
        result = await storage.apply(msg["action"], msg["data"], msg["revision"])
    except ShoppingError as err:
        connection.send_error(msg["id"], err.code, str(err))
    except Exception:  # No successful save response on disk errors or unexpected failures.
        _LOGGER.exception("Could not save Dinner Shopping data")
        connection.send_error(msg["id"], "save_failed", "Could not save shopping data. Check Home Assistant logs and storage.")
    else:
        connection.send_result(msg["id"], result)
