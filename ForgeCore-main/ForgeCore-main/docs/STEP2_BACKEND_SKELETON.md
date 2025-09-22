# Step 2 – Backend Skeleton

This iteration brings the first runnable Starlinker-specific backend into the
ForgeCore tree. The goal was to stand up persistent configuration, a concrete
FastAPI surface, and the scaffolding for future schedulers/ingesters without yet
implementing the heavy lifting.

## Highlights

- Added the `forgecore.starlinker_news` package with SQLite-backed persistence,
  pydantic configuration models, and a FastAPI application factory.
- Implemented a lightweight scheduler service that tracks manual poll/digest
  triggers so the renderer can surface operational health immediately.
- Exposed `/health`, `/settings`, `/run/poll`, `/run/digest`, and
  `/appearance/themes` endpoints via FastAPI, providing the minimum contract the
  forthcoming Electron shell and Admin UI can build against.
- Provisioned the Starlinker schema tables (`signals`, `digests`, `alerts`,
  `settings`, `errors`) and a `SettingsRepository` that persists config defaults
  into SQLite on first boot.
- Added unit tests exercising configuration persistence and the HTTP surface to
  ensure the skeleton is stable for subsequent steps.

## Next up

- Connect real ingest modules for the official RSI sources and plug them into
  the scheduler's timed triggers.
- Expand the API with settings CRUD granularity, OAuth handshakes, and preview
  endpoints required by the Startup Wizard/Admin UI.
- Begin wiring the Electron main process to spawn this FastAPI backend and read
  health/config state for the splash screen.
