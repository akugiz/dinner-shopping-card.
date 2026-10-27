"""Run with python3 -m unittest discover -s tests -p 'test_*.py'."""
import asyncio
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'custom_components/dinner_shopping/storage.py'
spec = importlib.util.spec_from_file_location('shopping_storage', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ShoppingStorage, ShoppingError = module.ShoppingStorage, module.ShoppingError
PREFIX = module.PREFIX


def item(name='Bananas', rid='product-1', kind='product', **extra):
    return {'item': name, 'description': PREFIX + json.dumps({'id': rid, 'kind': kind, **extra})}


class DiskStore:
    def __init__(self, path):
        self.path = path
        self.fail = False

    async def async_load(self):
        return json.loads(self.path.read_text()) if self.path.exists() else None

    async def async_save(self, value):
        if self.fail:
            raise OSError('Disk full')
        # Mimic an asynchronous persistence operation and atomic file replacement.
        await asyncio.sleep(0)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(value))
        temporary.replace(self.path)


class StorageTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.disk = DiskStore(Path(self.temp.name) / 'shopping.json')
        self.storage = ShoppingStorage(self.disk)
        await self.storage.load()

    async def asyncTearDown(self):
        self.temp.cleanup()

    async def test_persistence_and_independent_checkmarks(self):
        saved = await self.storage.apply('add_item', item(), 0)
        saved = await self.storage.apply('add_item', item('Banana bread', 'group-1', 'group'), 1)
        saved = await self.storage.apply('add_item', item(rid='ingredient-1', kind='ingredient', group='group-1', qty='3', product='product-1'), 2)
        saved = await self.storage.apply('add_item', item(rid='shop-1', kind='shop', group='group-1', qty='3', source='ingredient-1'), 3)
        uid = saved['items'][-1]['uid']
        saved = await self.storage.apply('update_item', {'item': uid, 'status': 'completed'}, 4)
        self.assertEqual(saved['items'][-1]['status'], 'completed')
        self.assertEqual(saved['items'][2]['status'], 'needs_action')
        restarted = ShoppingStorage(self.disk)
        await restarted.load()
        self.assertEqual(restarted.snapshot(), saved)
        saved = await restarted.apply('remove_item', {'item': uid}, saved['revision'])
        self.assertEqual(len(saved['items']), 3)  # The recipe template is still saved.
        saved['items'].clear()
        self.assertEqual(len(restarted.snapshot()['items']), 3)  # Snapshot is isolated.

    async def test_conflicting_devices_do_not_overwrite_each_other(self):
        results = await asyncio.gather(
            self.storage.apply('add_item', item(), 0),
            self.storage.apply('add_item', item('Milk', 'product-2'), 0),
            return_exceptions=True,
        )
        self.assertEqual(sum(isinstance(r, ShoppingError) for r in results), 1)
        conflict = next(r for r in results if isinstance(r, ShoppingError))
        self.assertEqual(conflict.code, 'conflict')
        self.assertEqual(len(self.storage.snapshot()['items']), 1)
        self.assertEqual(self.storage.snapshot()['revision'], 1)

    async def test_failed_save_is_not_acknowledged_or_applied(self):
        before = await self.storage.apply('add_item', item(), 0)
        self.disk.fail = True
        with self.assertRaises(OSError):
            await self.storage.apply('remove_item', {'item': before['items'][0]['uid']}, 1)
        self.assertEqual(self.storage.snapshot(), before)
        self.assertEqual(await self.disk.async_load(), before)

    async def test_bad_input_and_metadata_cannot_corrupt_store(self):
        for action, data in [
            ('add_item', {'item': '', 'description': item()['description']}),
            ('add_item', {'item': 'X', 'description': 'invalid'}),
            ('add_item', {'item': 'X', 'description': PREFIX + 'null'}),
            ('add_item', {'item': 'X', 'description': PREFIX + '{"id":"bad","kind":"shop","group":null,"qty":""}'}),
            ('remove_item', {'item': 'missing'}),
            ('arbitrary', {}),
        ]:
            with self.assertRaises(ShoppingError):
                await self.storage.apply(action, data, 0)
        before = await self.storage.apply('add_item', item(), 0)
        uid = before['items'][0]['uid']
        with self.assertRaises(ShoppingError):
            await self.storage.apply('update_item', {'item': uid, 'status': 'anything'}, 1)
        with self.assertRaises(ShoppingError):
            await self.storage.apply('update_item', {'item': uid, 'description': item(rid='different')['description']}, 1)
        with self.assertRaises(ShoppingError):
            await self.storage.apply('add_item', item(), 1)
        self.assertEqual(self.storage.snapshot(), before)

    async def test_import_preserves_ids_quantities_and_ticks(self):
        rows = [
            {'uid':'old-p','summary':'Bananas','description':item()['description'],'status':'needs_action'},
            {'uid':'old-g','summary':'Banana bread','description':item(rid='group-1',kind='group')['description'],'status':'needs_action'},
            {'uid':'old-i','summary':'Bananas','description':item(rid='ingredient-1',kind='ingredient',group='group-1',qty='3',product='product-1')['description'],'status':'needs_action'},
            {'uid':'old-s','summary':'Bananas','description':item(rid='shop-1',kind='shop',group='group-1',qty='3',source='ingredient-1')['description'],'status':'completed'},
            {'uid':'v1','summary':'Steak','description':'dinner-shopping-card:v1:{"kind":"item","dinner":"Steak dinner"}','status':'completed'},
            {'uid':'unrelated','summary':'Do not copy','description':'other content','status':'needs_action'},
        ]
        original = deepcopy(rows)
        data = {'source':'todo.dinner_shopping','items':rows}
        saved = await self.storage.apply('import', data, 0)
        self.assertEqual(len(saved['items']), 5)
        self.assertEqual(saved['items'][3]['status'], 'completed')
        self.assertEqual(module.metadata(saved['items'][2]['description'])['qty'], '3')
        again = await self.storage.apply('import', data, 1)
        self.assertEqual(again, saved)
        self.assertEqual(rows, original)
        # An import never overwrites an already-edited independent record.
        uid = saved['items'][0]['uid']
        saved = await self.storage.apply('update_item', {'item':uid,'rename':'Changed name'}, 1)
        again = await self.storage.apply('import', data, 2)
        self.assertEqual(again, saved)

    async def test_invalid_import_is_atomic(self):
        rows = [
            {'uid':'valid','summary':'Bananas','description':item()['description'],'status':'needs_action'},
            {'uid':'broken','summary':'Bad','description':PREFIX + 'not-json','status':'needs_action'},
        ]
        with self.assertRaises(ShoppingError):
            await self.storage.apply('import', {'source':'old','items':rows}, 0)
        self.assertEqual(self.storage.snapshot(), {'revision':0,'items':[]})
        self.assertIsNone(await self.disk.async_load())

    async def test_unload_retains_data_and_rejects_writes(self):
        before = await self.storage.apply('add_item', item(), 0)
        await self.storage.close()
        with self.assertRaises(ShoppingError):
            await self.storage.apply('remove_item', {'item':before['items'][0]['uid']}, 1)
        with self.assertRaises(ShoppingError):
            self.storage.snapshot()
        reloaded = ShoppingStorage(self.disk)
        await reloaded.load()
        self.assertEqual(reloaded.snapshot(), before)

    async def test_corrupt_saved_data_is_not_reset(self):
        bad = {'revision':1,'items':[{'summary':'Missing fields'}]}
        await self.disk.async_save(bad)
        with self.assertRaises(ShoppingError):
            await self.storage.load()
        self.assertEqual(await self.disk.async_load(), bad)


if __name__ == '__main__':
    unittest.main()
