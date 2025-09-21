import logging
from collections import defaultdict
from threading import RLock
from typing import Callable, Dict, List, Any


class EventBus:
    """Simple thread safe publish/subscribe event bus."""

    def __init__(self) -> None:
        self._subs: Dict[str, List[Callable[[Any], None]]] = defaultdict(list)
        self._lock = RLock()
        self._log = logging.getLogger("forge.event_bus")

    def subscribe(self, topic: str, handler: Callable[[Any], None]) -> Callable[[], None]:
        """Subscribe *handler* to *topic* and return an unsubscribe callable."""
        with self._lock:
            self._subs[topic].append(handler)

        def unsubscribe() -> None:
            with self._lock:
                if handler in self._subs.get(topic, []):
                    self._subs[topic].remove(handler)
        return unsubscribe

    def publish(self, topic: str, payload: Any) -> None:
        """Publish *payload* to all subscribers of *topic*.

        Exceptions raised by handlers are logged and ignored so that one
        misbehaving handler does not prevent delivery to others."""
        with self._lock:
            handlers = list(self._subs.get(topic, []))
        for h in handlers:
            try:
                h(payload)
            except Exception:  # pragma: no cover - logged for visibility
                self._log.exception("error in event handler for %s", topic)


__all__ = ["EventBus"]
