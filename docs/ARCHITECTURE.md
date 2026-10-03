# Architecture

## Overview

```
┌──────────────── Renderer (React, sandboxed) ────────────────┐
│ features/*  components/*  i18n (ar/en)  Zustand  TanStack Q │
│                 window.central.invoke(method, input)        │
└───────────────────────────┬─────────────────────────────────┘
                 preload (contextBridge, 2 functions)
┌───────────────────────────┴──────── Main (Node) ────────────┐
│ ipcMain 'api:invoke' → sender check → ApiRouter.dispatch     │
│   session · lock · permission · license · zod · DB gate      │
│ Services (AppContext): auth, catalog, inventory, sales,      │
│   shifts, customers, suppliers, repairs, offers, reports,    │
│   qr, media, backup, imports, license, settings, audit       │
│ Prisma 7 (better-sqlite3 adapter) ── SQLite (WAL)            │
└──────────────────────────────────────────────────────────────┘
```

- **Offline-first.** Nothing needs a network. Outbound requests from the renderer are blocked at the
  session level; the main process may reach only the optional update server.
- **AppContext** (`src/main/app/context.ts`) is the composition root. It has no Electron dependency,
  so the whole backend runs in plain Node for integration tests against a real SQLite database.
- **Typed IPC contract** (`src/shared/ipc/contract*.ts`): every method has an input/output type; the
  renderer's `call()` and the main `ApiRouter.handle()` are both typed from it.

## Request pipeline (`src/main/ipc/router.ts`)

1. Electron checks the sender frame URL (`app://bundle` only) and the method name shape.
2. Session required unless `public`; locked screen rejected unless `allowLocked`.
3. Permission check (`PermissionKey`), always in the backend — the UI only hides things.
4. License check unless `allowUnlicensed` (backups, activation and sign-in stay available).
5. Input validated with zod (strict objects; unknown keys rejected).
6. Runs inside the **DB gate** (a FIFO mutex) unless `skipGate` (long file work that takes the
   gate briefly itself — backups, imports, exports).
7. Errors are mapped to stable codes (`src/shared/errors.ts`); raw driver messages never reach the UI.

Why the gate: the Prisma better-sqlite3 adapter uses a single connection and only interactive
transactions take its lock, so concurrent IPC calls could interleave with an open transaction.

## Data rules

- **Money** is integer minor units (piastres); rates are basis points. `divRound` rounds half away
  from zero, `allocate` splits by largest remainder. `priceCart` (shared) prices carts in the UI and
  again, authoritatively, in the main process.
- **Ledgers are the truth**: customer and supplier balances are sums of ledger rows; stock quantity
  is a cache of the `StockMovement` ledger and is reconciled at startup.
- **Every write is a transaction** with its audit-log row. Sales carry an idempotency key, so a
  retried or crash-replayed sale is never recorded twice.
- **Sync-ready**: UUIDv7 ids, `deviceId`, `version`, timestamps on records (stamped by a Prisma query
  extension). There is no sync server yet; the metadata keeps that door open.

## Security model

| Area | Measure |
| --- | --- |
| Renderer | `sandbox`, `contextIsolation`, no Node, strict CSP, custom `app://` origin (no `file://`) |
| Navigation | pop-ups denied, foreign navigation blocked, `<webview>` blocked (all web contents) |
| Permissions | only camera (QR / photos) may be requested |
| IPC | single channel, sender validation, zod validation, backend permission checks |
| Passwords / PINs | bcrypt; lockout after N failures; manager overrides are single-use tokens (2 min, session-bound) |
| Secrets | workspace master secret → HKDF keys (QR signing, field encryption); device passcodes AES-256-GCM |
| Files | media saved only after magic-byte checks; protocol handler refuses path traversal; folders chosen only through OS dialogs |
| SQL | Prisma or parameterised raw SQL only; interpolated fragments are constants |
| Backups | AES-256-GCM, authenticated header, scrypt-wrapped key (see BACKUP_AND_RESTORE.md) |
| Licensing | Ed25519 signed keys bound to the machine; sealed trial clock (see LICENSING_VENDOR_GUIDE.md) |
| Logs | daily rotated; keys named like password/pin/secret/token are redacted; request inputs are never logged |

## Main modules

| Module | Highlights |
| --- | --- |
| Auth & users | roles + granular permissions, PIN login, fast user switching, idle lock, manager override with discount ceiling |
| POS | quick sale / invoice, split & credit payments, holds, refunds/voids, shifts with cash count, recovery of in-progress carts |
| Inventory | products & variants, barcodes, IMEI serials, adjustments with reasons, movements, labels |
| Repairs | configurable statuses with history, parts from stock, photos, signatures, encrypted passcodes, warranty |
| Suppliers | purchase orders, partial receiving (weighted average cost), returns, payments, balances |
| Offers | rule engine (`src/shared/domain/offers.ts`): cross-sell, bundles, thresholds, clearance, qty/BxGy; price floors and margin guard; validated again server-side |
| Reports | dashboard, sales/profit/inventory/repairs/suppliers/employees; CSV/Excel/PDF export; permission-filtered (cost/profit hidden) |
| Printing | hidden window renders the same React templates as the preview; 58/80 mm and A4; silent print or PDF |
| QR | optional signed `CP1:` codes on receipts, tickets and labels; everything works with QR off |
| Backup | encrypted archives, scheduled/on-exit, mirror folder, verify, restore, transfer bundles |
| Import | CSV/XLSX products & customers with mapping, validation, duplicate detection |

## Key decisions

- **SQLite + WAL** on the shop PC: zero administration, fast (20k-product search ≈ 6 ms), one file to back up.
- **Own migrator** instead of `prisma migrate deploy` at runtime: integrity check → snapshot backup →
  single transaction with FK check → automatic restore on failure.
- **Node-API SQLite driver**: the same binary works in Node and Electron; no compiler needed to build.
- **No ORM types in the UI**: DTOs in `src/shared/types` are the boundary.
