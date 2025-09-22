# Step 3 – Scheduler Automation

With the backend skeleton in place, this iteration focused on turning the
Starlinker scheduler into a real automation service that can be exercised via
the FastAPI surface and future ingest modules.

## Highlights

- Promoted the scheduler from a stub into a background service that spawns
  daemon timers for priority and standard polls plus daily/weekly digests.
- Made digest cadences timezone-aware using Python's `zoneinfo` module so the
  configured locale drives when notifications are emitted.
- Captured richer health telemetry, including last manual triggers, scheduled
  next runs, and the active configuration snapshot for `/health` consumers.
- Preserved manual trigger endpoints for `/run/poll` and `/run/digest`, tying
  them into the new health bookkeeping so operators can see when overrides fire.
- Added a dedicated regression suite that proves timers fire, configuration
  refreshes reschedule jobs, and that shutdown clears background state.

## Implementation Notes

### Background timers and cadence calculation

`SchedulerService` now owns `threading.Timer` instances for each cadence. When
`start()` is called it loads the latest `StarlinkerConfig`, records it in the
shared `HealthStatus`, and schedules:

- `priority_poll` timers keyed off `schedule.priority_poll_minutes`
- `standard_poll` timers keyed off `schedule.standard_poll_hours`
- Daily digests driven by `_seconds_until_daily()`
- Weekly digests driven by `_seconds_until_weekly()`

Each callback re-registers itself so the timers continue to recur until
`stop()` cancels them. Tests exercise this loop using an accelerated
`interval_scale` to keep runtime low.

### Timezone-aware digests

Daily and weekly digest helpers resolve the configured timezone with
`zoneinfo.ZoneInfo`, fall back to UTC when necessary, and calculate the seconds
until the next cadence using localized datetimes. This ensures digests fire at
local business hours rather than naive UTC offsets.

### Health reporting

The `HealthStatus` dataclass guards scheduler telemetry with a lock so
background timers can safely record last poll reasons, digest timestamps, and
configuration snapshots. `SchedulerService.describe()` exposes that state along
with the next run times, which the FastAPI `/health` endpoint returns directly
for observability.

### Manual triggers and configuration refresh

Manual POSTs to `/run/poll` and `/run/digest` now delegate into the scheduler's
trigger helpers. Each call records ISO-8601 timestamps in the health snapshot
so operators immediately see the effect. Updating settings via `/settings`
persists to SQLite and pushes the refreshed configuration back into the
scheduler, which cancels and rebuilds any affected timers.

### Testing

`forgecore/tests/starlinker_news/test_scheduler.py` covers the scheduler's
automatic poll execution, config refresh rescheduling, and shutdown cleanup.
The FastAPI suite in `forgecore/tests/starlinker_news/test_api.py` verifies the
health payload reflects scheduler state after manual triggers.

## Next Up

- Wire ingest pipelines for RSI sources into the scheduler callbacks.
- Expand digest outputs beyond placeholders so alerts can be delivered.
- Continue rounding out admin APIs needed by the Electron shell.
