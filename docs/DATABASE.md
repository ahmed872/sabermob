# Database

SQLite (WAL mode, `foreign_keys=ON`, `busy_timeout=5000`) at `<data>/workspace/central.db`,
accessed through Prisma 7 with the better-sqlite3 driver adapter. Schema: `prisma/schema.prisma`.

## Data folder layout

```
<data>/                          %APPDATA%\Central Pro on Windows (or CENTRAL_DATA_DIR)
  installation.json              device id of this installation (not moved by transfers)
  backup-key.json                local copy of the backup key, protected by the OS account
  workspace/
    central.db                   all business data
    media/{repairs,products,signatures,branding}/   photos and signatures (relative paths in DB)
  backups/                       encrypted backups (default folder)
  logs/                          rotated logs
  temp/                          scratch (snapshots, staged restores)
```

## Model groups

| Group | Tables |
| --- | --- |
| System | Device, Setting, Counter, License, BackupRecord, SyncQueue, SyncConflict |
| People & security | Role, Permission, RolePermission, User, Session, AuditLog |
| Customers | Customer, CustomerTag, CustomerLedger, LoyaltyTransaction |
| Catalog & stock | Brand, DeviceModel, Category, Product, ProductVariant, Barcode, SerialItem, StockMovement, StockAdjustment |
| Suppliers | Supplier, SupplierLedger, PurchaseOrder/Item, PurchaseReceipt/Item, PurchaseReturn/Item, SupplierPayment |
| Sales | Shift, CashMovement, Sale, SaleItem, Payment, Refund, RefundItem, HeldCart, Quotation/Item |
| Repairs | RepairStatus, Repair, RepairStatusHistory, RepairPart, RepairPhoto |
| Offers | Offer, OfferProduct, OfferEvent, ProductAffinity |

## Rules

- **Ids** are UUIDv7 (time-ordered). Records carry `deviceId`, `version`, `createdAt`, `updatedAt`
  (stamped by the Prisma extension in `src/main/database/client.ts`) and `deletedAt` for soft deletes.
- **Money** columns are `Int` minor units; percentages are basis points (`1400` = 14%).
- **Balances** = `SUM(amount)` of `CustomerLedger` / `SupplierLedger` (positive: they owe us /
  we owe them). Never stored as a mutable number.
- **Stock**: `ProductVariant.stockQty` is a cache; `StockMovement` is the ledger. Startup
  reconciliation fixes drift and logs it.
- **Numbering**: `Counter` table + `nextNumber()` inside the same transaction (`S-000001`, `RP-0001`, `PO-00001`, `R-…` refunds).
- **Search**: `searchText` columns hold normalised Arabic/English tokens (alef/ya/ta-marbuta folding,
  Arabic-Indic digits → Latin) for fast `LIKE` search.

## Migrations

- Files: `prisma/migrations/NNNN_name/migration.sql`, generated with `npm run db:migration -- name`.
- Applied by the app at startup (`src/main/database/migrator.ts`), tracked in `_app_migrations`
  with a checksum:
  1. `PRAGMA quick_check` — refuses to touch a damaged database.
  2. `VACUUM INTO` a backup in `backups/` before any change.
  3. All pending migrations in **one transaction** with foreign keys off, then `foreign_key_check`.
  4. Any failure → the file is restored from the snapshot and the app shows a clear message.
- A database already migrated by a newer version is rejected (no silent downgrade). Restoring a
  backup from a newer version is refused the same way.
- Packaged builds read migrations from `resources/migrations`.
