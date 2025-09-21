from typing import Any, Dict

from .runtime import ForgeRuntime


class Response:
    def __init__(self, data: Any, status_code: int = 200):
        self.data = data
        self.status_code = status_code

    def json(self):
        return self.data


def create_app(runtime: ForgeRuntime):
    from mini_fastapi import FastAPI, HTTPException  # local stub renamed

    app = FastAPI()

    @app.get("/api/modules")
    def list_modules() -> Dict[str, Any]:
        result = []
        for name, mod in runtime.loader.modules.items():
            result.append({
                "name": name,
                "version": mod.manifest.get("version"),
                "enabled": mod.enabled,
                "provides": mod.provides,
                "requires": mod.requires,
            })
        return {"modules": result}

    @app.get("/api/modules/{name}")
    def module_details(name: str) -> Dict[str, Any]:
        mod = runtime.loader.modules.get(name)
        if not mod:
            raise HTTPException(404)
        data = mod.manifest.copy()
        data.update({"enabled": mod.enabled})
        return data

    @app.get("/api/storage/{module}")
    def storage_list(module: str) -> Dict[str, Any]:
        keys = runtime.storage.list_keys(module)
        return {"keys": keys}

    @app.get("/api/storage/{module}/{key}")
    def storage_get(module: str, key: str):
        data = runtime.storage.load(module, key)
        if data is None:
            raise HTTPException(404)
        return data

    @app.put("/api/storage/{module}/{key}")
    def storage_put(module: str, key: str, item: Dict[str, Any]):
        runtime.storage.store(module, key, item["value"])
        return {"status": "ok"}

    @app.delete("/api/storage/{module}/{key}")
    def storage_delete(module: str, key: str):
        runtime.storage.delete(module, key)
        return {"status": "ok"}

    @app.post("/api/validate")
    def validate() -> Dict[str, Any]:
        graph = runtime.loader.dependency_graph()
        return {"graph": graph}

    return app


__all__ = ["create_app", "Response"]
