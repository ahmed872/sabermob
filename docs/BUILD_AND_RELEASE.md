# Build, release and deployment

## Release from GitHub (recommended)

The workflow `.github/workflows/build-windows.yml` builds on a real Windows machine and, before
publishing anything, verifies the installer:

1. tests (typecheck, unit/integration) and the release check (production license key embedded);
2. `electron-builder --win` → `Central-Pro-Setup-<version>.exe` (NSIS, x64);
3. runs the packaged app (first launch, product, sale, encrypted backup with Windows DPAPI);
4. **silent install** → runs the installed copy → **silent uninstall**, failing if the program stays or
   if `%APPDATA%\Central Pro` (business data) is removed;
5. uploads the installer + blockmap as an artifact and publishes a GitHub Release with notes and SHA-256.

To release a version:

```bash
# bump "version" in package.json (e.g. 1.0.1), commit, then:
git tag v1.0.1
git push origin v1.0.1          # → Actions builds, tests and publishes the Release
```

Or *Actions → بناء نسخة ويندوز → Run workflow* (tick “publish” to create the Release). The
installer appears under *Releases* (and as a run artifact for 30 days).

## Build locally on Windows

```powershell
# Windows 10/11 x64, Node.js 24, Git
git clone <repo> ; cd sabermob
npm ci
npm run dist:win                 # release check → build → dist\Central-Pro-Setup-<version>.exe
npx playwright test --config tests/e2e/packaged.config.ts   # optional: smoke test dist\win-unpacked
```

`dist:win` runs `scripts/release-check.mjs` first: it **refuses to build** while the development
license key is embedded. No Visual Studio / Python is needed: the SQLite driver ships Node-API prebuilds
for every platform (`better-sqlite3/prebuilds/win32-x64.node` is packaged), so no native compilation
happens. On Linux/macOS the Windows app folder builds, but the NSIS step needs Wine.

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

## Repository visibility

Keep the repository **private** before selling: a public repository exposes the full source (anyone
can build a copy with their own license key and bypass activation) and the Actions history. GitHub
free private repositories include 2,000 Actions minutes per month (Windows minutes count double; one
Windows build takes about 5 minutes).

## Pre-release checklist

```bash
npm run typecheck
npm test                    # unit + integration
npm run test:e2e            # real app (xvfb-run -a on Linux CI)
npm run test:perf            # stress dataset timings
git tag vX.Y.Z && git push origin vX.Y.Z   # Windows build + install/uninstall test + Release
```

Then on a clean Windows PC: install, onboard, sell, print a receipt, back up, restore, activate with a
real key, install the next version over it and confirm the data is intact.

## Deployment at a shop

1. Install, complete the first-launch wizard (owner account, backup password, printer).
2. Settings → Backup → choose a **mirror folder** on a USB / second disk.
3. Settings → Users → add staff with the right roles and PINs.
4. Import existing products / customers from Excel if available (Inventory → Import).
5. Before the trial ends: send the request code, paste the activation key.
