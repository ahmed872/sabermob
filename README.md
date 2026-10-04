# Central Pro — سنترال برو

Offline-first desktop system for Egyptian telecom centers and mobile accessory / repair shops:
point of sale, inventory (IMEI, barcodes, variants), repairs, customers & debts, suppliers &
purchases, smart offers, reports, encrypted backups and offline licensing.

> **Extremely simple for the employee — extremely powerful for the owner.**

- Arabic (RTL) first, full English; light / dark / system theme
- Works 100% offline; one shop PC or several, each with its own data folder
- Windows installer (NSIS), 15-day trial, then an activation key from the vendor

## Quick start (development)

Requirements: Node.js 22+ (24 recommended), npm, Git. Windows, Linux or macOS.

```bash
npm install          # also generates the Prisma client
npm run dev          # starts the app with hot reload
```

If `npm install` cannot download Electron (corporate proxy), see
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#electron-download-fails).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run the app in development mode |
| `npm run typecheck` | TypeScript checks (main, renderer, scripts) |
| `npm test` | Unit + integration tests (Vitest, real SQLite) |
| `npm run test:e2e` | Build, then end-to-end tests of the real Electron app (Playwright) |
| `npm run test:perf` | Stress dataset (10k products, 125k sale lines) with timings |
| `npm run db:migration -- <name>` | Create the next SQL migration after editing `prisma/schema.prisma` |
| `npm run dist:win` | Release check + Windows installer in `dist/` |
| `npm run dist:linux` | Unpacked Linux build (used for packaged smoke tests) |
| `npm run license:init` | **Vendor, once:** create your private signing key |
| `npm run license:issue -- --request XXXX-XXXX-XXXX-XXXX` | **Vendor:** issue an activation key |

## Release & activation keys (GitHub Actions)

| Workflow | What it does |
| --- | --- |
| **بناء نسخة ويندوز** | On tag `v*` (or manually): tests → Windows installer → runs, installs and uninstalls it on Windows → GitHub Release |
| **توليد مفتاح تفعيل** | Issue a 3-month subscription key (500 EGP) from a request code; renewals add on top (needs the `LICENSE_PRIVATE_KEY` secret) |
| **فحص الكود** | Typecheck, unit/integration and E2E tests on every push |

## Documentation

| Document | For |
| --- | --- |
| [docs/manual/Central-Pro-User-Guide-AR.pdf](docs/manual/Central-Pro-User-Guide-AR.pdf) | **كتيب الاستخدام المصوّر** (PDF، 39 صفحة) — `npm run docs:booklet` يعيد بناءه |
| [docs/USER_MANUAL_AR.md](docs/USER_MANUAL_AR.md) | دليل الاستخدام المختصر (عربي) |
| [docs/LICENSING_VENDOR_GUIDE.md](docs/LICENSING_VENDOR_GUIDE.md) | The vendor: trial, activation keys, key safety (Arabic + English) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app is built, security model, main decisions |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setting up, coding conventions, tests |
| [docs/DATABASE.md](docs/DATABASE.md) | Schema, money, ledgers, migrations |
| [docs/BACKUP_AND_RESTORE.md](docs/BACKUP_AND_RESTORE.md) | Backup format, restore, moving to a new PC |
| [docs/BUILD_AND_RELEASE.md](docs/BUILD_AND_RELEASE.md) | Packaging, signing, updates, deployment |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common problems and fixes |
| [docs/AUDIT.md](docs/AUDIT.md) | Final commercial audit: what was verified, findings, fixes, remaining risks |

## Project layout

```
prisma/              schema.prisma + SQL migrations (applied by the app at startup)
src/shared/          code used by both processes: money, pricing, offers engine, schemas, IPC contract, i18n-free types
src/main/            Electron main process: services, IPC handlers, backup, licensing, printing
src/preload/         the only bridge to the UI (invoke + events)
src/renderer/        React UI (features/*, components/*, i18n/*, print templates)
scripts/             license key tool, migration generator, release check
tests/               unit, integration (real DB) and e2e (real Electron) tests
```
