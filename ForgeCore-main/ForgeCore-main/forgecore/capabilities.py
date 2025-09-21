import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from packaging.version import Version
from packaging.specifiers import SpecifierSet


@dataclass(order=True)
class Provider:
    version: Version
    obj: Any
    order: int


class CapabilityRegistry:
    """Registry mapping capability names and versions to providers."""

    def __init__(self) -> None:
        self._providers: Dict[str, List[Provider]] = {}
        self._counter = 0
        self._log = logging.getLogger("forge.capabilities")

    def bind(self, capability: str, provider: Any) -> None:
        name, ver = capability.split("@", 1)
        prov = Provider(Version(ver), provider, self._counter)
        self._counter += 1
        self._providers.setdefault(name, []).append(prov)
        self._providers[name].sort()  # keep deterministic order

    def unbind(self, capability: str, provider: Any) -> None:
        name, ver = capability.split("@", 1)
        lst = self._providers.get(name, [])
        self._providers[name] = [p for p in lst if not (p.version == Version(ver) and p.obj == provider)]

    def get(self, query: str) -> Optional[Any]:
        """Return the best provider matching *query* or ``None``."""
        if "@" not in query:
            name, spec = query, None
        else:
            name, spec = query.split("@", 1)
        providers = self._providers.get(name, [])
        if not providers:
            return None
        if spec is None or spec == "":
            return providers[-1].obj
        if spec[0].isdigit():
            ver = Version(spec)
            for p in providers:
                if p.version == ver:
                    return p.obj
            return None
        if spec.startswith("^"):
            base = Version(spec[1:])
            upper = f"{base.major + 1}.0"
            spec = f">={base},<{upper}"
        spec_set = SpecifierSet(spec)
        best: Optional[Provider] = None
        for p in providers:
            if p.version in spec_set:
                if best is None or p.version > best.version or (
                    p.version == best.version and p.order < best.order
                ):
                    best = p
        return best.obj if best else None

    # convenience for API
    def snapshot(self) -> Dict[str, List[str]]:
        snap: Dict[str, List[str]] = {}
        for name, lst in self._providers.items():
            snap[name] = [str(p.version) for p in lst]
        return snap


__all__ = ["CapabilityRegistry"]
