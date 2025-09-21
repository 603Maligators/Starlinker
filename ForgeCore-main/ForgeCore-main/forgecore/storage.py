import json
import os
import tempfile
from typing import Any, List, Optional


class StorageManager:
    """Simple JSON file based storage per module."""

    def __init__(self, base_dir: str) -> None:
        self.base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)

    def _module_dir(self, module: str) -> str:
        path = os.path.join(self.base_dir, module)
        os.makedirs(path, exist_ok=True)
        return path

    def store(self, module: str, key: str, obj: Any) -> None:
        mdir = self._module_dir(module)
        path = os.path.join(mdir, f"{key}.json")
        tmp_fd, tmp_path = tempfile.mkstemp(dir=mdir)
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as fh:
            json.dump(obj, fh)
        os.replace(tmp_path, path)

    def load(self, module: str, key: str, default: Optional[Any] = None) -> Any:
        path = os.path.join(self._module_dir(module), f"{key}.json")
        if not os.path.exists(path):
            return default
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    def delete(self, module: str, key: str) -> None:
        path = os.path.join(self._module_dir(module), f"{key}.json")
        if os.path.exists(path):
            os.remove(path)

    def list_keys(self, module: str) -> List[str]:
        mdir = self._module_dir(module)
        keys = []
        for name in os.listdir(mdir):
            if name.endswith('.json'):
                keys.append(name[:-5])
        return sorted(keys)


__all__ = ["StorageManager"]
