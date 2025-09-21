from typing import Any, Callable, Dict, List, Tuple


class HTTPException(Exception):
    def __init__(self, status_code: int):
        self.status_code = status_code


class FastAPI:
    def __init__(self):
        self.routes: List[Tuple[str, List[str], Callable]] = []

    def _register(self, method: str, path: str, func: Callable) -> Callable:
        segments = path.strip("/").split("/") if path != "/" else [""]
        self.routes.append((method.upper(), segments, func))
        return func

    def get(self, path: str):
        def deco(func: Callable) -> Callable:
            return self._register("GET", path, func)
        return deco

    def post(self, path: str):
        def deco(func: Callable) -> Callable:
            return self._register("POST", path, func)
        return deco

    def put(self, path: str):
        def deco(func: Callable) -> Callable:
            return self._register("PUT", path, func)
        return deco

    def delete(self, path: str):
        def deco(func: Callable) -> Callable:
            return self._register("DELETE", path, func)
        return deco

    def _match(self, method: str, path: str) -> Tuple[Callable, Dict[str, str]]:
        segs = path.strip("/").split("/") if path != "/" else [""]
        for m, rsegs, func in self.routes:
            if m != method.upper() or len(rsegs) != len(segs):
                continue
            params: Dict[str, str] = {}
            ok = True
            for rs, s in zip(rsegs, segs):
                if rs.startswith("{") and rs.endswith("}"):
                    params[rs[1:-1]] = s
                elif rs != s:
                    ok = False
                    break
            if ok:
                return func, params
        raise HTTPException(404)

    # used by TestClient
    def handle(self, method: str, path: str, json: Any = None):
        func, params = self._match(method, path)
        if json is not None:
            return func(**params, item=json)
        return func(**params)
