# Backup, restore and moving to a new PC

User-facing steps are in the [Arabic manual](USER_MANUAL_AR.md#11-النسخ-الاحتياطي-مهم-جدا). This page
describes how it works.

## What is in a backup

A consistent snapshot of `central.db` (taken with `VACUUM INTO` from a read-only WAL connection, so
selling is never blocked) plus every file under `media/`. Settings, users, licenses-on-record and the
audit log are inside the database.

## File format (`.cpbak`, `.centralbundle`)

```
"CPBK" | u8 version | u32 headerLen | header JSON | iv(12) | AES-256-GCM( gzip( entries ) ) | tag(16)
entries: u16 nameLen | name | u64 size | bytes …  (terminated by nameLen = 0)
```

- The header (kind, date, shop name, app version, applied migrations, row counts, wrapped key) is
  authenticated as GCM additional data: altering data *or* metadata is detected.
- Streaming throughout; archive size is limited by disk, not memory.
- Entry names are validated on extraction (`db/` and `media/` only, no `..`, no absolute paths).

## Keys

- A random 256-bit **data key** encrypts archives.
- Every archive carries the data key **wrapped with the backup password** (scrypt N=2^15 → AES-256-GCM),
  so any backup restores on any PC with the password alone.
- A copy of the data key is kept locally in `backup-key.json`, protected by the Windows account
  (Electron `safeStorage` / DPAPI), so **automatic backups run without asking for the password**.
- Changing the password re-wraps the same key; **older files keep the password they were made with**.
- If the local copy is lost (new Windows profile), automatic backups pause until the password is
  entered once (Settings → Backup).

## Schedule

| Setting | Default |
| --- | --- |
| Automatic backup | on, every 24 h (checked every 10 min) |
| Keep | newest 14 automatic backups (manual ones are never pruned) |
| On exit | yes, unless a backup was made in the last 10 minutes |
| Mirror folder | off — choose a USB / external drive to get a second copy of every backup |

Folders are chosen only through the OS folder picker. A missing mirror drive never fails the backup.

## Verify

“Check” decrypts to a temp folder, runs `PRAGMA quick_check`, counts rows (products, customers, sales,
repairs, suppliers, users) and records `verifiedAt`.

## Restore

1. File chosen (from the list or the OS picker) → header shown: shop, date, contents, version.
2. Rejected before anything changes if: wrong password, tampered/corrupt file (GCM tag),
   integrity check fails, or the backup comes from a newer app version.
3. A **pre-restore backup** of the current data is made (listed as “Before restore” afterwards).
4. The DB gate is taken for good and a **restore journal** is written; the database and media folder
   are swapped by rename; the key is stored locally; the saved in-progress cart is cleared; the app
   restarts and the restore is written to the audit log.
   - If a rename fails (e.g. a file locked by antivirus), the old files are put back immediately.
   - If power is lost in the middle of the swap, the next start finds the journal and puts the old
     data back before opening the database (nothing is lost; restore again).

Available in Settings → Backup, on the expired-license screen (backup), and on the very first screen
of a fresh install (“Restore from backup”) for moving to a new PC.

## Moving to a new PC

`Settings → Backup → Save transfer file` creates a `.centralbundle` (same format, kind `BUNDLE`).
Restore it on the new PC's first screen with the backup password. The new PC has a different request
code, so it needs its own activation key.

## Code

`src/main/backup/archive.ts` (format), `src/main/backup/backup-service.ts` (service),
`src/main/ipc/handlers/data.ts` (IPC), tests in `tests/integration/backup.test.ts` and
`tests/e2e/06-backup-restore.spec.ts`.
