import importlib
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any

from .capabilities import CapabilityRegistry
from .event_bus import EventBus
from .storage import StorageManager


@dataclass
class ModuleContext:
    event_bus: EventBus
    registry: CapabilityRegistry
    storage: StorageManager
    manifest: Dict[str, Any]
    module_path: str
    logger: logging.Logger


@dataclass
class ModuleState:
    name: str
    manifest: Dict[str, Any]
    path: str
    instance: Any
    provides: List[str]
    requires: List[str]
    enabled: bool = False


class ModuleLoader:
    def __init__(self, module_dir: str, registry: CapabilityRegistry, event_bus: EventBus, storage: StorageManager) -> None:
        self.module_dir = module_dir
        self.registry = registry
        self.event_bus = event_bus
        self.storage = storage
        self.modules: Dict[str, ModuleState] = {}
        self._log = logging.getLogger("forge.loader")
        self.enable_order: List[str] = []

    # ---- discovery & loading -------------------------------------------------
    def discover(self) -> List[str]:
        names = []
        for name in os.listdir(self.module_dir):
            path = os.path.join(self.module_dir, name)
            if os.path.isdir(path) and os.path.exists(os.path.join(path, "module.json")):
                names.append(name)
        return names

    def _read_manifest(self, path: str) -> Dict[str, Any]:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    def _load_entry(self, module_path: str, spec: str) -> Any:
        mod_name, _, cls_name = spec.partition(":")
        module = importlib.machinery.SourceFileLoader(
            mod_name,
            os.path.join(module_path, mod_name + ".py"),
        ).load_module()
        cls = getattr(module, cls_name)
        return cls()

    def load_all(self) -> None:
        manifests: Dict[str, Dict[str, Any]] = {}
        for name in self.discover():
            path = os.path.join(self.module_dir, name)
            manifest = self._read_manifest(os.path.join(path, "module.json"))
            manifests[name] = manifest
        order = self._dependency_order(manifests)
        for name in order:
            manifest = manifests[name]
            path = os.path.join(self.module_dir, name)
            instance = self._load_entry(path, manifest["entry"])
            logger = logging.getLogger(f"forge.module.{name}")
            ctx = ModuleContext(self.event_bus, self.registry, self.storage, manifest, path, logger)
            if hasattr(instance, "on_load"):
                instance.on_load(ctx)
            state = ModuleState(
                name=name,
                manifest=manifest,
                path=path,
                instance=instance,
                provides=manifest.get("provides", []),
                requires=manifest.get("requires", []),
            )
            self.modules[name] = state
            for cap in state.provides:
                self.registry.bind(cap, instance)

    # ---- enable/disable ------------------------------------------------------
    def enable_all(self) -> None:
        order = self._dependency_order({n: m.manifest for n, m in self.modules.items()})
        for name in order:
            self.enable_module(name)

    def enable_module(self, name: str) -> None:
        mod = self.modules[name]
        if mod.enabled:
            return
        if hasattr(mod.instance, "on_enable"):
            mod.instance.on_enable()
        mod.enabled = True
        self.enable_order.append(name)

    def disable_all(self) -> None:
        for name in reversed(self.enable_order):
            self.disable_module(name)
        self.enable_order.clear()

    def disable_module(self, name: str) -> None:
        mod = self.modules.get(name)
        if mod and mod.enabled and hasattr(mod.instance, "on_disable"):
            mod.instance.on_disable()
            mod.enabled = False

    # ---- helpers -------------------------------------------------------------
    def _dependency_order(self, manifests: Dict[str, Dict[str, Any]]) -> List[str]:
        # build graph edges: module -> providers of required capabilities
        provides_map: Dict[str, str] = {}
        for name, manifest in manifests.items():
            for cap in manifest.get("provides", []):
                cap_name = cap.split("@", 1)[0]
                provides_map[cap_name] = name
        edges: Dict[str, List[str]] = {name: [] for name in manifests}
        for name, manifest in manifests.items():
            for req in manifest.get("requires", []):
                cap_name = req.split("@", 1)[0]
                provider = provides_map.get(cap_name)
                if provider and provider != name:
                    edges[name].append(provider)
        # Kahn's algorithm
        result: List[str] = []
        temp_edges = {k: list(v) for k, v in edges.items()}
        while temp_edges:
            # find node with no incoming edges
            candidates = [n for n, deps in temp_edges.items() if not deps]
            if not candidates:
                raise RuntimeError("circular dependency")
            candidates.sort()
            n = candidates[0]
            result.append(n)
            temp_edges.pop(n)
            for deps in temp_edges.values():
                if n in deps:
                    deps.remove(n)
        return result

    def dependency_graph(self) -> Dict[str, List[str]]:
        manifests = {n: m.manifest for n, m in self.modules.items()}
        provides_map: Dict[str, str] = {}
        for name, manifest in manifests.items():
            for cap in manifest.get("provides", []):
                provides_map[cap.split("@",1)[0]] = name
        graph: Dict[str, List[str]] = {name: [] for name in manifests}
        for name, manifest in manifests.items():
            for req in manifest.get("requires", []):
                cap_name = req.split("@",1)[0]
                provider = provides_map.get(cap_name)
                if provider:
                    graph[name].append(provider)
        return graph


__all__ = ["ModuleLoader", "ModuleContext", "ModuleState"]
