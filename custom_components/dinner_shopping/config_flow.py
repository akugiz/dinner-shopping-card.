"""UI setup for the shared Dinner Shopping store."""
try:
    import probatio as vol
except ImportError:
    import voluptuous as vol

from homeassistant import config_entries
from .const import DOMAIN


class DinnerShoppingConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """One shared shopping database per Home Assistant instance."""
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Dinner Shopping", data={})
        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))
