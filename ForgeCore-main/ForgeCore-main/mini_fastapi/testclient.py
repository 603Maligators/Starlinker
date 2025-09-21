from types import SimpleNamespace
from typing import Any

from .app import HTTPException


class TestClient:
    def __init__(self, app):
        self.app = app
    __test__ = False

    def request(self, method: str, path: str, json: Any = None):
        try:
            data = self.app.handle(method, path, json=json)
            status = 200
        except HTTPException as exc:
            data = None
            status = exc.status_code
        return SimpleNamespace(status_code=status, json=lambda: data)

    def get(self, path: str):
        return self.request("GET", path)

    def post(self, path: str, json: Any = None):
        return self.request("POST", path, json=json)

    def put(self, path: str, json: Any = None):
        return self.request("PUT", path, json=json)

    def delete(self, path: str):
        return self.request("DELETE", path)
