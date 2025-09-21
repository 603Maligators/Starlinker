import os
from forgecore.runtime import ForgeRuntime


def test_module_loader_lifecycle_and_ordering(tmp_path):
    mod_dir = os.path.join(os.path.dirname(__file__), "..", "examples")
    mod_dir = os.path.abspath(mod_dir)
    rt = ForgeRuntime(mod_dir, storage_dir=str(tmp_path))
    rt.start()
    # modules loaded
    assert set(rt.loader.modules.keys()) == {"basic_module", "rpg_inventory"}
    # order: basic_module before rpg_inventory
    assert rt.loader.enable_order == ["basic_module", "rpg_inventory"]
    # capability available
    basic = rt.registry.get("basic.service@1.0")
    assert basic is rt.loader.modules["basic_module"].instance
    rt.stop()
