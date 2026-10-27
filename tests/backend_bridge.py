"""JSON-lines bridge for exercising the real Python store from the JS card tests."""
import asyncio
import importlib.util
import json
from pathlib import Path
import sys
import tempfile

source = Path(__file__).resolve().parents[1] / 'custom_components/dinner_shopping/storage.py'
spec = importlib.util.spec_from_file_location('shopping_storage', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DiskStore:
    def __init__(self, path):
        self.path = path

    async def async_load(self):
        return json.loads(self.path.read_text()) if self.path.exists() else None

    async def async_save(self, data):
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps(data))
        temporary.replace(self.path)


async def main():
    with tempfile.TemporaryDirectory() as directory:
        disk = DiskStore(Path(directory) / 'store.json')
        storage = module.ShoppingStorage(disk)
        await storage.load()
        for line in sys.stdin:
            msg = json.loads(line)
            try:
                if msg['type'] == 'dinner_shopping/get':
                    result = storage.snapshot()
                elif msg['type'] == 'dinner_shopping/action':
                    result = await storage.apply(msg['action'], msg['data'], msg['revision'])
                elif msg['type'] == 'restart':
                    await storage.close()
                    storage = module.ShoppingStorage(disk)
                    await storage.load()
                    result = storage.snapshot()
                else:
                    raise ValueError('Unexpected request type')
                reply = {'id':msg['request_id'], 'result':result}
            except Exception as error:
                reply = {'id':msg['request_id'], 'error':{'code':getattr(error, 'code', 'unknown'), 'message':str(error)}}
            print(json.dumps(reply), flush=True)


asyncio.run(main())
