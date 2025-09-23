# Step 3 – Electron Main Process MVP

With the backend skeleton functional, this milestone bootstraps the desktop
shell so future UI work can target a real Electron runtime instead of mocks.
The emphasis was on getting a reliable main process that can launch the
Starlinker FastAPI backend, enforce a single instance, and surface a polished
splash experience while the services warm up.

## Highlights

- Added an `electron/` project that ships with Electron 28, local HTML assets,
  and `npm` scripts for running the shell during development.
- Implemented `electron/src/main.js` to request a single-instance lock, manage
  the primary window lifecycle, and cleanly dispose of resources when quitting.
  Health polling is now resilient: timeouts and retry cadence are configurable
  via environment variables, splash messages surface errors in-line, and the
  app quits if the backend dies after launching to avoid a zombie shell.
- Spawns the Starlinker backend (`python -m forgecore.starlinker_news`) as a
  child process, wiring a hard-coded `8777` port and data directory under the
  Electron `userData` path so both processes share state predictably.
- Presents a branded splash screen that repeatedly polls `/health` on the
  backend and only reveals the main window once the API confirms readiness;
  status badges now differentiate info/errors for quick troubleshooting.
- Provides placeholder renderer HTML (`static/index.html`) that fetches the
  `/health` payload, rendering the JSON response so backend developers can see
  scheduler/storage state before the React Admin UI lands.

## Implementation Notes

### Project layout

```
electron/
├── package.json        # Electron runtime + scripts
├── .gitignore          # keep node_modules out of source control
├── src/
│   └── main.js         # Electron main process entrypoint
└── static/
    ├── index.html      # placeholder window content
    └── splash.html     # animated splash with status updates
```

`package.json` pins Electron 28 and exposes `npm start` for running the shell
locally. The project is marked `private` so it cannot be published to the npm
registry by accident. A generated `package-lock.json` is checked in to freeze
the dependency tree for reproducible installs.

### Main process lifecycle

`src/main.js` is written in CommonJS for compatibility with the default Electron
loader. The main process:

1. Requests a single-instance lock and focuses the existing window when a second
   instance is attempted.
2. Spawns the Starlinker backend as a child process using the configured (or
   default) Python interpreter, hard-coding the `8777` API port for now.
3. Polls `/health` via Node 18's built-in `fetch` until the backend is
   responsive. Poll timing, request timeout, and total wait duration can be
   tuned through environment variables (`STARLINKER_HEALTH_POLL_MS`,
   `STARLINKER_HEALTH_REQUEST_TIMEOUT_MS`, `STARLINKER_BACKEND_TIMEOUT_MS`).
   Splash copy distinguishes info vs. failure states so the team can diagnose
   issues without attaching dev tools.
4. Creates the main browser window once the backend is ready, automatically
   closing the splash window when the renderer is visible.
5. Tears down the backend process on `before-quit` to avoid orphaned servers
   and displays an error dialog if the backend crashes mid-session.

Environment variables (`STARLINKER_BACKEND_PORT`, `STARLINKER_BACKEND_HOST`,
`STARLINKER_PYTHON`) allow overrides without changing code, but sensible
hard-coded defaults keep the MVP simple.

### Splash handshake & placeholder UI

The splash window is frameless and styled with a simple gradient plus a CSS
spinner. The renderer exposes a `window.updateStatus` helper so the main process
can push human-readable updates (e.g., "Starting Starlinker backend…",
"Backend ready. Preparing window…"). If the backend crashes or times out,
the splash text reflects the failure instead of closing silently.

Once healthy, the main window loads `static/index.html`, which immediately calls
`/health`, renders the JSON payload, and still reminds developers that a full
React admin UI will replace the placeholder soon.

### Running the Electron shell

```
cd electron
npm install
npm start
```

`npm start` runs `electron .`, which will show the splash screen while the
backend boots. Logs from the Python backend stream into the Electron console so
errors are easy to diagnose. Developers can point the main window at a
renderer dev server by exporting `ELECTRON_START_URL` before running the shell.

## Next Up

- Replace the placeholder HTML with the React-based Admin UI and preload IPC
  bridge.
- Allow dynamic port negotiation and richer health telemetry in the splash.
- Package the backend with the Electron build pipeline for distribution.
