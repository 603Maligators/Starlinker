class DummyWatcher:
    def start(self):
        pass

    def stop(self):
        pass


try:
    from watchdog.observers import Observer  # type: ignore
except Exception:  # pragma: no cover
    Observer = DummyWatcher  # type: ignore

__all__ = ["Observer", "DummyWatcher"]
