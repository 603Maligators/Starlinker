# Starlinker Shell Icon Assets

This directory is reserved for the Windows icon artwork consumed by
`electron-builder`. Because the automated evaluation environment cannot
accept binary assets, the `icon.png` and `icon.ico` files are intentionally
omitted from version control.

To package the application locally with branded artwork, drop the final icon
files into this folder using the following naming convention:

- `icon.png` – 512×512 PNG source image
- `icon.ico` – Multi-size Windows ICO generated from the PNG

After adding the assets, update `electron/package.json` if you would like to
point `build.win.icon` at the ICO file. When the artwork is absent the build
falls back to the default Electron icon so packaging still succeeds in CI.
