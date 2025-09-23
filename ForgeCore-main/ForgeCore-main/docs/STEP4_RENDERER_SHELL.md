# Step 4 – Renderer Shell

The Electron main process is now capable of handing off to a modern React
renderer so UI development can iterate with real backend responses and the
final styling system. This milestone establishes the scaffolding for future
admin tabs, startup flows, and health dashboards.

## Highlights

- Bootstrapped a Vite-powered React 18 + TypeScript application under
  `electron/renderer/` with TailwindCSS theming, HashRouter routing, and a
  Zustand store for shared state.
- Replaced the static placeholder window with the new renderer build, while
  keeping the legacy HTML as a fallback when no bundle exists.
- Added a dashboard shell that immediately pings the backend `/health`
  endpoint, surfaces the JSON payload, and displays status/refresh controls for
  backend troubleshooting during development.
- Wired the Electron launcher to pass the backend URL to both dev-server and
  production builds so the renderer can call APIs without hard-coded values.

## Project Layout

```
electron/
├── renderer/
│   ├── package.json           # Vite + React + Tailwind toolchain
│   ├── index.html             # Vite entry file
│   ├── src/
│   │   ├── main.tsx          # Renderer bootstrap
│   │   ├── routes/AppRoutes.tsx
│   │   ├── components/       # Layout + status badge
│   │   ├── pages/Dashboard.tsx
│   │   ├── store/useHealthStore.ts
│   │   └── styles/tailwind.css
│   └── tailwind.config.cjs    # Custom Starlinker theme tokens
└── src/main.js                # Electron main process (unchanged entry)
```

The renderer is intentionally modular so new tabs can register routes, drop in
Tailwind components, and tap into shared stores as they arrive in later steps.

## Running the Renderer

```
cd electron/renderer
npm install
npm run dev
```

Then launch Electron in a second terminal to point at the dev server:

```
cd electron
npm run start:dev
```

For a production-style preview:

```
npm run renderer:build      # Generates renderer/dist/
npm start                   # Electron loads the compiled bundle
```

## Next Up

- Flesh out the settings API on the backend and connect the renderer forms to
  real persistence.
- Add the startup wizard scaffolding so new installs can be guided through the
  required configuration before the scheduler activates.
- Continue building admin tabs atop the shared layout and state store.
