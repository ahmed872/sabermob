# Development

## Setup

```bash
git clone <repo> && cd sabermob
npm install            # runs `prisma generate` (client in src/main/database/generated, git-ignored)
npm run dev
```

Node.js 22+ (24 recommended). On Windows no build tools are needed (SQLite driver ships prebuilt).

### Electron download fails

Electron 44 downloads its binary the first time it is used (`npm run dev`, tests), not during
`npm install`. Behind a proxy that blocks it, download `electron-v<version>-<platform>-x64.zip` from the
Electron GitHub releases, unzip it into `node_modules/electron/dist`, and write the executable name into
`node_modules/electron/path.txt` (`electron.exe` on Windows, `electron` on Linux).

### Data folder in development

The app stores data in Electron's `userData` (`%APPDATA%\Central Pro`). Set `CENTRAL_DATA_DIR`
to use another folder, e.g. a scratch one:

```bash
CENTRAL_DATA_DIR=./.dev/data npm run dev
```

## Tests

| Command | Scope |
| --- | --- |
| `npm run test:unit` | pure logic: money, pricing, offers engine, license codec |
| `npm run test:integration` | services and IPC router against a real SQLite DB in a temp folder |
| `npm run test:e2e` | builds, then drives the real Electron app with Playwright |
| `npx playwright test --config tests/e2e/packaged.config.ts` | smoke test of the packaged app (`dist/linux-unpacked` or `dist/win-unpacked`, or `CENTRAL_APP_EXE`) |
| `npm run test:perf` | stress dataset (10k products, 125k sale lines, 10k customers, 5k repairs) with timings |

On Linux CI use `xvfb-run -a` for Playwright. E2E tests set `CENTRAL_DATA_DIR` (fresh folder per
test) and `CENTRAL_E2E_PDF_DIR` (PDF/export/bundle output without save dialogs).

CI (`.github/workflows/ci.yml`) runs typecheck, unit/integration and E2E on every push.

Integration tests use `tests/helpers/app.ts`: `createTestApp()` builds a full `AppContext` with a
fake license platform and a controllable clock; `setupOwner()` onboards and signs in.

## Conventions

- TypeScript strict everywhere (`noUncheckedIndexedAccess`). No `any` in app code.
- Money: integer minor units only (`src/shared/money.ts`). Never use floats for amounts.
- New IPC method: add it to a contract file in `src/shared/ipc/`, register a handler with a zod
  input schema and a permission, call it from the UI with `call()` / `useApi()`.
- User-visible text: add keys to a module in `src/renderer/src/i18n/modules/` with both `en` and `ar`.
- UI: Arabic RTL first — use logical CSS (`ms-`, `pe-`, `text-start`), Latin digits.
- Every write that matters goes through a service, inside a transaction, with an audit log entry.
- Style: no semicolons, single quotes, long lines are fine (≈200 chars).

## Database changes

1. Edit `prisma/schema.prisma`.
2. `npm run db:migration -- short_name` → creates `prisma/migrations/NNNN_short_name/migration.sql`.
3. Review the SQL, run `npm test`. The app applies it on next start (after a backup).

Never edit a migration that has shipped; add a new one. See [DATABASE.md](DATABASE.md).

## Debugging

- Logs: `<data folder>/logs/app-YYYY-MM-DD.log`, `error-*.log`, `security-*.log` (JSON lines).
- DevTools are disabled in packaged builds; set `CENTRAL_DEVTOOLS=1` to enable them for support.
- Slow IPC calls (>250 ms) are logged with the method name.
