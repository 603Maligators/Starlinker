# Starlinker ForgeCore

Starlinker ForgeCore is a lightweight runtime for building hot‑pluggable desktop-style
applications. It combines a modular plugin architecture with an event bus, a
capability registry, a scheduler, and a minimal admin HTTP API. The Starlinker
reference module that ships with the runtime ingests community news, schedules
digest emails/webhooks, and exposes a control surface for operators.

## Features

* 🔌 **Hot-pluggable runtime** – load and unload modules without restarting the
  host process thanks to the module loader and lifecycle manager.
* 📨 **Starlinker news pipeline** – ingest RSI patch notes and other community
  sources, normalise their payloads, and persist them for alerting and digest
  rendering.
* 🧠 **Deterministic capability registry** – declare capabilities and
  dependencies in module manifests and let ForgeCore resolve them at runtime.
* 🌐 **Zero-web UI footprint** – interact with the system through a concise CLI
  or the admin FastAPI surface; bring your own renderer if needed.
* 🧪 **Well-tested core** – pytest coverage for loader, storage, event bus,
  scheduler, and Starlinker modules.

## Repository layout

```
forgecore/
├── cli/                 # Entry points for the ForgeCore CLI
├── runtime.py           # Runtime orchestrator used by the CLI
├── loader.py            # Module discovery and lifecycle coordination
├── storage.py           # SQLite-backed persistence helpers
├── starlinker_news/     # Starlinker reference module (scheduler, ingest, API)
└── tests/               # pytest suites covering the runtime and Starlinker
```

Additional supporting projects live in sibling directories:

* `electron/` – a minimal Electron shell that can embed ForgeCore via websockets.
* `mini_fastapi/` – sample FastAPI applications for experimentation with the
  runtime.

## Requirements

* Python 3.11+
* `pip` and `virtualenv` (recommended)
* SQLite (bundled with Python) for local development

Install dependencies with:

```
pip install -r requirements.txt
```

## First run

The Starlinker module can be started from the CLI and will initialise its
database on first launch:

```
python -m forgecore.cli.forge start --module-dir forgecore/examples -v
```

Then open <http://127.0.0.1:8765> to access the admin API/health endpoints or
point API tooling (such as `httpie` or `curl`) at the FastAPI server.

See [`FIRST_RUN`](FIRST_RUN.md) for a detailed walkthrough of the initial setup.

## Running tests

All tests are written with `pytest`:

```
pytest
```

The Starlinker tests will spin up lightweight schedulers and use SQLite
databases inside the temporary test directory. No external services are called;
HTTP interactions are mocked with `httpx.MockTransport`.

## Packaging

The project ships as a standard Python package. Guidance for building wheels
and distributable artefacts lives in [`PACKAGING`](PACKAGING.md).

## Contributing

1. Fork the repository and create a virtual environment.
2. Install development dependencies: `pip install -r requirements.txt`.
3. Run `pytest` to ensure all suites pass.
4. Open a pull request describing your change (see [`CHANGELOG`](CHANGELOG.md)
   for release history and [`FIRST_RUN`](FIRST_RUN.md) for validation steps).

We welcome focused improvements, additional ingest integrations, and renderer
contributions that respect the lightweight philosophy of ForgeCore.

## License

ForgeCore is released under the MIT License. See [LICENSE](LICENSE) for details.
