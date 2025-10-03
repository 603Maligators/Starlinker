# First run guide

This document walks through setting up a fresh Starlinker ForgeCore workspace,
starting the runtime, and validating that the Starlinker reference module is
operational.

## 1. Create a virtual environment

```
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
```

## 2. Prepare a working directory

Starlinker stores state in a SQLite database. Pick a writable directory (for
example `./var`) and create it before running the CLI:

```
mkdir -p var
```

## 3. Launch the runtime

```
python -m forgecore.cli.forge start \
    --module-dir forgecore/examples \
    --data-dir var \
    --host 127.0.0.1 \
    --port 8765 \
    -v
```

The CLI will:

1. Build the runtime and load modules from `forgecore/examples`.
2. Initialise `var/starlinker.db` with the default schema.
3. Start the admin FastAPI server on `http://127.0.0.1:8765`.
4. Schedule background jobs according to the default Starlinker configuration.

Leave the process running in this shell.

## 4. Inspect the health endpoint

In a second terminal activate the virtual environment and run:

```
curl http://127.0.0.1:8765/health | jq
```

You should see a JSON payload similar to:

```json
{
  "status": "ok",
  "scheduler": {
    "running": true,
    "last_poll": null,
    "next_runs": {
      "priority_poll": "2024-01-01T13:05:00+00:00"
    }
  },
  "config": {
    "timezone": "America/New_York",
    "schedule": {
      "priority_poll_minutes": 60
    }
  }
}
```

The exact timestamps will differ, but the scheduler should report `running:
true` and the configuration should echo the defaults.

## 5. Trigger a manual poll

```
curl -X POST http://127.0.0.1:8765/run/poll -d '{"reason": "smoke-test"}' \
  -H 'Content-Type: application/json'
```

Refreshing `/health` will show `last_poll_reason` set to `smoke-test`. You can
inspect the database with `sqlite3 var/starlinker.db 'SELECT * FROM signals;'`
if you want to confirm persisted signals.

## 6. Review settings and schema

* `GET /settings` – fetches the active configuration.
* `GET /settings/defaults` – returns the baked-in defaults.
* `GET /settings/schema` – provides a JSON schema suitable for building
  front-end forms.

Modify settings with:

```
curl -X PATCH http://127.0.0.1:8765/settings \
  -H 'Content-Type: application/json' \
  -d '{"outputs": {"email_to": "ops@example"}}'
```

## 7. Shut down

Stop the CLI with `Ctrl+C`. The scheduler thread and FastAPI app will shut down
cleanly, preserving the SQLite database for the next run.

You are now ready to build additional ingest modules, integrate alternative
renderers, or deploy ForgeCore in more automated environments.
