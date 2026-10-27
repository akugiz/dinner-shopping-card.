"""Test the disk verification adapter without requiring a Home Assistant install."""
import ast
import asyncio
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

source = Path(__file__).resolve().parents[1] / 'custom_components/dinner_shopping/__init__.py'
tree = ast.parse(source.read_text())
adapter = ast.Module(body=[node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'VerifiedStore'], type_ignores=[])


class VerifiedSaveTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'data.json'
        self.path.write_text(json.dumps({'data':{'revision':0,'items':[]}}))
        self.silent_failure = False
        self.calls = 0
        test = self

        class FakeHAStore:
            def __init__(self, hass, version, key):
                self.path = test.path

            async def async_load(self):
                return json.loads(self.path.read_text())['data']

            async def async_save(self, value):
                test.calls += 1
                if not test.silent_failure:
                    self.path.write_text(json.dumps({'data':value}))

        async def executor(func):
            return await asyncio.to_thread(func)

        env = {'Store':FakeHAStore,'STORAGE_VERSION':1,'STORAGE_KEY':'test', 'Path':Path,'json':json,'CoreState':SimpleNamespace(stopping='stopping')}
        exec(compile(adapter,str(source),'exec'),env)
        self.hass = SimpleNamespace(state='running',async_add_executor_job=executor)
        self.store = env['VerifiedStore'](self.hass)

    async def asyncTearDown(self):
        self.directory.cleanup()

    async def test_success_is_verified_from_disk(self):
        expected={'revision':1,'items':[]}
        await self.store.async_save(expected)
        self.assertEqual(await self.store.async_load(), expected)

    async def test_silent_ha_write_failure_is_reported(self):
        self.silent_failure=True
        with self.assertRaisesRegex(OSError,'verified on disk'):
            await self.store.async_save({'revision':1,'items':[]})
        self.assertEqual((await self.store.async_load())['revision'],0)

    async def test_shutdown_does_not_queue_a_write(self):
        self.hass.state='stopping'
        with self.assertRaisesRegex(OSError,'stopping'):
            await self.store.async_save({'revision':1,'items':[]})
        self.assertEqual(self.calls,0)
