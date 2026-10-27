"""Packaging and frontend registration checks without a live HA installation."""
import ast
from dataclasses import dataclass
import json
from pathlib import Path
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[1]
COMPONENT = ROOT / 'custom_components/dinner_shopping'


class PackagingTests(unittest.TestCase):
    def test_all_runtime_assets_are_bundled_for_hacs(self):
        hacs = json.loads((ROOT / 'hacs.json').read_text())
        manifest = json.loads((COMPONENT / 'manifest.json').read_text())
        self.assertFalse(hacs.get('content_in_root', False))
        self.assertNotIn('filename', hacs)
        self.assertEqual(manifest['domain'], 'dinner_shopping')
        self.assertEqual(manifest['version'], '3.1.1')
        self.assertIn('frontend', manifest['dependencies'])
        self.assertTrue(manifest['config_flow'])
        self.assertEqual((ROOT / 'dinner-shopping-card.js').read_bytes(), (COMPONENT / 'www/dinner-shopping-card.js').read_bytes())
        self.assertIn('v3.1.1', (COMPONENT / 'www/dinner-shopping-card.js').read_text())


class FrontendTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        source = COMPONENT / 'frontend.py'
        tree = ast.parse(source.read_text())
        tree.body = [node for node in tree.body if not (isinstance(node, ast.ImportFrom) and node.module.startswith('homeassistant'))]
        self.urls = set()
        self.routes = []
        self.fail = False

        @dataclass
        class StaticPathConfig:
            url_path: str
            path: str
            cache_headers: bool

        async def register(routes):
            if self.fail:
                raise OSError('route registration failed')
            self.routes.extend(routes)

        self.hass = SimpleNamespace(data={}, http=SimpleNamespace(async_register_static_paths=register))
        frontend = SimpleNamespace(add_extra_js_url=lambda hass,url:self.urls.add(url), remove_extra_js_url=lambda hass,url:self.urls.remove(url))
        self.env = {'__file__':str(source),'frontend':frontend,'StaticPathConfig':StaticPathConfig}
        exec(compile(tree,str(source),'exec'),self.env)

    async def test_setup_reload_unload_and_reenable(self):
        setup = self.env['async_setup_frontend']
        unload = self.env['async_unload_frontend']
        await setup(self.hass)
        await setup(self.hass)
        self.assertEqual(len(self.routes),1)
        self.assertEqual(len(self.urls),1)
        self.assertTrue(Path(self.routes[0].path).is_file())
        self.assertFalse(self.routes[0].cache_headers)
        self.assertEqual(self.routes[0].url_path,'/dinner_shopping/dinner-shopping-card.js')
        self.assertIn('?v=3.1.1',next(iter(self.urls)))
        unload(self.hass)
        unload(self.hass)
        self.assertFalse(self.urls)
        await setup(self.hass)
        self.assertEqual(len(self.routes),1)
        self.assertEqual(len(self.urls),1)

    async def test_failed_registration_can_be_retried(self):
        self.fail = True
        with self.assertRaises(OSError):
            await self.env['async_setup_frontend'](self.hass)
        self.assertFalse(self.hass.data.get(self.env['REGISTERED']))
        self.assertFalse(self.urls)
        self.fail = False
        await self.env['async_setup_frontend'](self.hass)
        self.assertEqual(len(self.routes),1)


if __name__ == '__main__':
    unittest.main()
