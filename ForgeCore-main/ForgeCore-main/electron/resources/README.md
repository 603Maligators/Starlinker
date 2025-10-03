# Starlinker Resource Assets

This directory is bundled with the packaged Electron application and exposes
theme definitions that the renderer can consume at runtime. Two themes ship by
default:

- `fankit/theme.json` – high-energy palette aligned with the Starlinker fan kit.
- `neutral/theme.json` – subtle palette for focus-intensive workflows.

At build time the contents of this directory are copied to `resources/` inside
`%APPDATA%/Starlinker Shell` so they can be loaded without unpacking the ASAR
archive.
