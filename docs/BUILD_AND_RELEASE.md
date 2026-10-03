# Build, release and deployment

## One-time (vendor)

1. `npm run license:init` — creates your private signing key (see
   [LICENSING_VENDOR_GUIDE.md](LICENSING_VENDOR_GUIDE.md)) and embeds the public key. Back up `license-keys/`.
2. Set the version in `package.json` (`"version": "1.1.0"`).

## Build the Windows installer

```bash
npm ci
npm run dist:win        # → dist/Central-Pro-Setup-<version>.exe
```

`dist:win` runs `scripts/release-check.mjs` first: it **refuses to build** while the development
license key is embedded. Run it on Windows (or on Linux/macOS with Wine installed — NSIS needs it to
build the uninstaller). The SQLite driver ships Node-API prebuilds for every platform, so no native
compilation happens and no Visual Studio is needed.

Configuration: `electron-builder.config.cjs`.

| What | How |
| --- | --- |
| Installer | NSIS x64, per-user, Arabic, choose folder, desktop + Start-menu shortcuts |
| App data | `%APPDATA%\Central Pro` — **never** deleted on uninstall or upgrade |
| Migrations | shipped in `resources/migrations`, applied at first start after a backup |
| Native driver | `better-sqlite3/prebuilds/win32-x64.node`, unpacked from the asar |
| Size | ~60 MB app files + Electron runtime |

### Code signing (recommended)

Unsigned installers trigger Windows SmartScreen (“More info → Run anyway”). With a code-signing
certificate set `CSC_LINK` (path/URL of the `.pfx`) and `CSC_KEY_PASSWORD` before `npm run dist:win`.

## Updates

**Default (offline):** send customers the new installer. Running it over the existing installation
keeps all data, settings and the activation. The new version migrates the database at first start,
with a backup taken first and automatic rollback on failure.

**Optional online updates:** build with `CENTRAL_UPDATE_URL=https://your-server/central-pro/` and
upload the files from `dist/` (`latest.yml`, the `.exe`, its `.blockmap`) to that folder. Then
Settings → This computer → Updates offers *Check → Download → Back up & install*. Nothing is
downloaded or installed unless the owner asks; the installer's sha512 (and signature, when signed) is
verified by electron-updater; a `PRE_UPDATE` backup is made just before installing. Only that server
is reachable from the app; the UI itself stays fully offline.

## Pre-release checklist

```bash
npm run typecheck
npm test                    # unit + integration
npm run test:e2e            # real app (xvfb-run -a on Linux CI)
npm run dist:linux && npx playwright test --config tests/e2e/packaged.config.ts   # packaged smoke test
npm run dist:win
```

Then on a clean Windows PC: install, onboard, sell, print a receipt, back up, restore, activate with a
real key, install the next version over it and confirm the data is intact.

## Deployment at a shop

1. Install, complete the first-launch wizard (owner account, backup password, printer).
2. Settings → Backup → choose a **mirror folder** on a USB / second disk.
3. Settings → Users → add staff with the right roles and PINs.
4. Import existing products / customers from Excel if available (Inventory → Import).
5. Before the trial ends: send the request code, paste the activation key.
