from forgecore.storage import StorageManager


def test_storage_manager_atomic_json(tmp_path):
    sm = StorageManager(str(tmp_path))
    sm.store("mod", "a", {"x": 1})
    assert sm.load("mod", "a") == {"x": 1}
    sm.store("mod", "a", {"x": 2})
    assert sm.load("mod", "a") == {"x": 2}
    sm.delete("mod", "a")
    assert sm.load("mod", "a") is None
