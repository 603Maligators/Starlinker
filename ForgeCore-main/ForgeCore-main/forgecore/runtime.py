import logging
import os
from typing import Optional

from .event_bus import EventBus
from .capabilities import CapabilityRegistry
from .loader import ModuleLoader
from .storage import StorageManager


_runtime: Optional["ForgeRuntime"] = None


class ForgeRuntime:
    """Main runtime orchestrating components."""

    def __init__(self, module_dir: str, storage_dir: Optional[str] = None) -> None:
        self.module_dir = module_dir
        self.event_bus = EventBus()
        self.registry = CapabilityRegistry()
        self.storage = StorageManager(storage_dir or os.path.join(module_dir, "_storage"))
        self.loader = ModuleLoader(module_dir, self.registry, self.event_bus, self.storage)
        self._log = logging.getLogger("forge.runtime")
        self.started = False

    def start(self) -> None:
        if self.started:
            return
        self.loader.load_all()
        self.loader.enable_all()
        self.started = True
        self._log.info("runtime started")

    def stop(self) -> None:
        if not self.started:
            return
        self.loader.disable_all()
        self.started = False
        self._log.info("runtime stopped")


def get_runtime() -> ForgeRuntime:
    if _runtime is None:
        raise RuntimeError("runtime not initialised")
    return _runtime


def create_runtime(module_dir: str) -> ForgeRuntime:
    global _runtime
    _runtime = ForgeRuntime(module_dir)
    return _runtime


__all__ = ["ForgeRuntime", "create_runtime", "get_runtime"]
