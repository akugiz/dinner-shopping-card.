"""Serve and automatically load the card bundled with the integration."""
from pathlib import Path

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig

VERSION = "3.1.1"
CARD_PATH = "/dinner_shopping/dinner-shopping-card.js"
CARD_URL = f"{CARD_PATH}?v={VERSION}"
REGISTERED = "dinner_shopping_frontend_registered"


async def async_setup_frontend(hass):
    """Register the static file once per server lifetime, including entry reloads."""
    if not hass.data.get(REGISTERED):
        path = Path(__file__).parent / "www" / "dinner-shopping-card.js"
        await hass.http.async_register_static_paths([
            StaticPathConfig(CARD_PATH, str(path), False)
        ])
        hass.data[REGISTERED] = True
    frontend.add_extra_js_url(hass, CARD_URL)


def async_unload_frontend(hass):
    """Stop injecting the card on future browser loads; retain the static route."""
    try:
        frontend.remove_extra_js_url(hass, CARD_URL)
    except KeyError:
        pass
