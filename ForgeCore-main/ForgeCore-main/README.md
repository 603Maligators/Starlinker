# ForgeCore

ForgeCore is a lightweight runtime for building hot‑pluggable desktop style
applications.  It is intentionally small but showcases modules, an event bus,
a capability registry and a tiny admin HTTP API.

## Quick start

```
python -m forgecore.cli.forge start --module-dir forgecore/examples -v
```

Then open http://127.0.0.1:8765 in a browser.

## Tests

Run `pytest` to execute the unit tests.
