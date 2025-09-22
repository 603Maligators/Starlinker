# Starlinker Foundational Planning

## Baseline Assessment of ForgeCore
- **Runtime orchestration**: `ForgeRuntime` wires together the event bus, capability registry, module loader, and storage manager, loading and enabling every discovered module from a target directory. "runtime" is started lazily and exposes lifecycle helpers via `create_runtime()`/`get_runtime()`. [Ref: `forgecore/runtime.py`]
- **Admin HTTP surface**: The current `admin_api` builds a miniature FastAPI-compatible app using a local stub (`mini_fastapi`) and exposes module inventory plus storage CRUD endpoints. No Starlinker-specific routes exist yet. [Ref: `forgecore/admin_api.py`]
- **Module system**: Module manifests follow the JSON schema outlined in `agent.md`, with loaders, capability graph validation, storage helpers, and a watcher for hot reloads already in place. [Refs: `forgecore/loader.py`, `forgecore/capabilities.py`, `forgecore/storage.py`, `forgecore/watcher.py`]
- **Tooling & tests**: Pytest coverage exists for the runtime primitives (`event_bus`, `capabilities`, `loader`, `storage`, `admin_api`). Requirements target packaging/click/watchdog plus FastAPI/uvicorn in dev extras. No Starlinker packages, scheduler, or ingest pipelines are present yet. [Refs: `requirements.txt`, `setup.py`, `forgecore/tests/`]

### Confirmed Tech Stack Versions
- **Python**: Targeting 3.11 per product requirements; existing code is compatible with >=3.8 (no 3.11 blockers observed).
- **Backend dependencies**: `fastapi>=0.68`, `uvicorn>=0.15`, `watchdog>=2.0`, `click>=8.0`, `packaging>=21` as per `requirements.txt`/`setup.py`. We will rely on the real FastAPI runtime (not the stub) for Starlinker APIs.
- **Testing**: `pytest>=7.0` already configured. We will extend suites to cover scheduler logic, ingest normalization, and API contracts in later steps.
- **Frontend/Electron**: No existing scaffold; we will introduce Node 18+/pnpm (or npm) alongside Electron 28+, React 18, and TailwindCSS 3 once we build the desktop shell in later steps.

### Identified Gaps & Risks
1. **Starlinker module absence**: `forgecore/starlinker_news/` does not exist—ingest, scheduler, alerts, digest, and API layers must be built from scratch.
2. **HTTP stack**: The included `mini_fastapi` shim is insufficient for production. We need a full FastAPI/ASGI app (with uvicorn/Hypercorn runner) that can be invoked both standalone and via Electron.
3. **Configuration**: No unified settings schema or persistence beyond generic storage. We must define Starlinker-specific keys, defaults, migrations, and validation.
4. **Database**: Storage manager currently backs onto JSON files; we must add SQLite (via SQLAlchemy or `sqlite3`) with migrations to satisfy the required tables.
5. **Scheduler**: No background job runner exists. We need an async scheduler (likely APScheduler) integrated with event bus and storage.
6. **Packaging**: There is no Electron project, bundler config, or Windows packaging pipeline. Asset handling for the Fankit license is also missing.
7. **Security & secrets**: No token storage/encryption helper exists. We must define a secrets vault or obfuscation strategy before wiring OAuth keys.

## Architecture Blueprint (High-Level)
```
+------------------+          HTTP/WebSocket           +-------------------------+
|  Electron Main   |  ─────────────────────────────▶  |  FastAPI (Starlinker)   |
|  • Single instance|                                   |  • Settings API         |
|  • Tray menu     | ◀─────────────────────────────┐   |  • Scheduler control    |
|  • Backend child |   Health / status polling     │   |  • Auth callbacks       |
+------------------+                               │   +-----------┬-------------+
            │                                       │               │
            │ IPC / preload                        │               │
            ▼                                       │               ▼
+------------------+       REST/WS Queries         │     +---------------------+
| Electron Renderer|  ─────────────────────────────┘     | Scheduler & Workers |
|  • React Admin UI|                                         | • Priority polls |
|  • Startup Wizard|                                         | • Standard polls |
+------------------+                                         | • Alert emission|
            │                                              +---------┬-----------+
            │                                                          │
            ▼                                                          ▼
    +---------------+        ORM/DAO Layer         +-----------------------------+
    | SQLite (default) | ◀───────────────────────── |  Ingest Pipelines (RSI, YT) |
    |  • settings      |                             |  • Normalizers             |
    |  • signals       |                             |  • Tagger/Ranker           |
    |  • alerts        |                             |  • Output dispatchers      |
    +---------------+                             +-----------------------------+
```

## Configuration Strategy
- **Format**: Adopt TOML (`starlinker.toml`) stored under the ForgeCore storage directory, synchronized with the SQLite `settings` table for durability. Electron renderer will use the API to read/write settings; CLI fallbacks will load from TOML on boot.
- **Loader**: On startup, Starlinker module loads defaults, merges user overrides, and validates against Pydantic models. Changes persist to SQLite and mirror back to TOML.
- **Secrets**: Sensitive values (webhooks, OAuth tokens) will be encrypted at rest using Fernet with a machine-local key; the config will store references while encrypted blobs live in SQLite.

### Shared Settings Schema (Draft)
```
[starlinker.news]
timezone = "America/New_York"
quiet_hours = ["23:00", "07:00"]

[starlinker.news.schedule]
digest_daily = "09:00"
digest_weekly = ""
priority_poll_minutes = 60
standard_poll_hours = 6

[starlinker.news.outputs]
discord_webhook = ""
email_to = ""

[starlinker.news.sources]
patch_notes = { enabled = true, include_ptu = false }
roadmap     = { enabled = true }
status      = { enabled = true }
this_week   = { enabled = true }
inside_sc   = { enabled = true, channels = ["rsi_official"] }
reddit      = { enabled = false, subs = ["starcitizen"], feed = ["new"], min_upvotes = 50 }

[starlinker.news.appearance]
theme = "neutral"  # options: neutral, uee, crusader, drake, rsi
```
This schema aligns with the product requirements and will be backed by migrations so future releases can evolve defaults safely.

## Program Roadmap
1. **Foundational Planning (today)** – Review the existing ForgeCore codebase, confirm tech stack versions, and identify any gaps. Define a high-level architecture diagram (Electron shell ↔ FastAPI backend ↔ scheduler/ingest modules ↔ SQLite). Decide on configuration format (likely TOML) and shared settings schema.
2. **Backend Skeleton** – Add a `starlinker_news` package inside ForgeCore with a minimal FastAPI router (`/health` endpoint, config scaffolding, empty scheduler hook). Ensure the backend can load defaults, write/read from the settings table, and expose basic health info.
3. **Electron Main Process MVP** – Create the Electron project with a barebones window, single-instance lock, and backend child-process launcher (hard-coded port initially). Show a placeholder splash screen until the backend responds to `/health`.
4. **Renderer Shell** – Set up React + Tailwind with routing, global state (e.g., Zustand/Redux), and a placeholder dashboard page that pings `/health`.
5. **Config & Settings API** – Flesh out settings CRUD endpoints in FastAPI, backed by SQLite. Wire the renderer to load/save settings, with validation scaffolding.
6. **Startup Wizard (Frontend)** – Implement the multi-step flow with mocked saves. Persist “incomplete” flags to drive badges in the Admin UI.
7. **Scheduler & Ingest Modules** – Add the scheduler loop (APScheduler/async tasks). Implement one ingest module end-to-end (e.g., RSI Patch Notes) to validate the pipeline (fetch → normalize → store). Gradually add the remaining sources.
8. **Alerts & Digest Engine** – Build the tagging/priority system, dedupe logic, quiet hours checks. Implement alert dispatchers (Discord webhook, email placeholder). Create the daily/weekly digest generator and preview API.
9. **Renderer Admin Tabs** – Iterate tab-by-tab (Connections, Sources, Schedule, Alerts, Digest, Reddit, Advanced, Health & Logs, Appearance), wiring to real APIs and validations. Add toast/error handling, red badges for missing prerequisites.
10. **Tray & Autostart Features** – Implement the tray menu actions (Open Dashboard, Run Poll Now, Snooze Alerts, Quit). Add optional Windows auto-launch toggle.
11. **Packaging** – Configure electron-builder for portable `.exe` and installer. Include resource assets (Fankit + neutral themes), About dialog, LICENSE placement. Add code-signing hook stub.
12. **Docs & Tests** – Write README, FIRST_RUN, PACKAGING, CHANGELOG. Add targeted unit tests (ingest normalizers, scheduler timing, settings API) and renderer-level tests where feasible.

These artifacts set the baseline so subsequent steps can focus on iterative feature delivery without architectural rework.
