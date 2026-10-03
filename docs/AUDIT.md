# FINAL COMMERCIAL AUDIT — Central Pro

Date: 2026-10-03 · Branch `claude/pensive-meitner-l77w7l` · Version 1.0.0
Method: inspect the repository → write tests for real workflows → run them (Linux container + a real
Windows GitHub runner) → fix → re-run. Severity: **P0** cannot sell · **P1** fix before commercial
release · **P2** release with caution · **P3** future improvement.

## 1. Repository state

| Item | State |
| --- | --- |
| Branch / default branch | `claude/pensive-meitner-l77w7l` (also the repository default) |
| Visibility | **PUBLIC** — see release blockers |
| Stack | Electron 44, React 19, TypeScript strict, Prisma 7 + better-sqlite3 13 (SQLite WAL), Tailwind 4, Zustand, TanStack Query, Vitest, Playwright, electron-builder 26 |
| Schema | 54 models, 1 migration (`0001_init`), own migrator with backup + rollback + downgrade guard |
| Main process | composition root `AppContext` (no Electron dependency) · 19 services + backup service · typed IPC router |
| Renderer | 16 feature folders, Arabic/English i18n modules, print templates rendered by a hidden window |
| Tests | 15 Vitest files, 10 Playwright E2E specs, packaged-app smoke test, stress suite |
| CI/CD | `ci.yml` (typecheck + tests + E2E), `build-windows.yml` (Windows installer, install/uninstall test, Release), `license-key.yml` (activation keys) |
| Docs | README + 9 documents in docs/ (user manual AR, vendor licensing, architecture, development, database, backup, build/release, troubleshooting, this audit) |

## 2. Requirements traceability matrix

Evidence names refer to test files (`tests/…`) unless stated. "Windows CI" = run 37117411454 on
`windows-latest`.

| Requirement | Implemented? | Verified? | Evidence | Issues | Severity |
|---|---|---|---|---|---|
| Offline-first (no network needed) | COMPLETE | Verified | renderer requests blocked at session level; all suites run offline | — | — |
| Integer money, transactions, idempotent sales | COMPLETE | Verified | unit/money, unit/pricing, integration/sales (idempotency), audit (atomicity) | — | — |
| Dashboard (sales, profit, repairs, stock, supplier/customer debt, alerts, clickable KPIs) | COMPLETE | Verified | audit reconciliation (dashboard = hand calc), E2E 05 & UX sweep screenshot | stale cache fixed | — |
| Dashboard date ranges | PARTIAL | Verified | dashboard = today + 14-day trend; any range in Reports | by design | P3 |
| POS: search, barcode, qty, discount, tax, payment, stock, movement, receipt, audit | COMPLETE | Verified | integration/sales, audit, E2E 02/04/09 | — | — |
| Quick sale / formal invoice | COMPLETE | Verified | E2E 09 (receipt + invoice PDFs) | — | — |
| Customer / anonymous sale, customer optional | COMPLETE | Verified | audit (anonymous + customer), E2E 02 (no customer) | — | — |
| Cash / card / wallet / split / partial (credit) | COMPLETE | Verified | sales (split, credit limit), audit (partial credit 10,000 + 15,000) | — | — |
| Held & resumed sale | COMPLETE | Verified | audit "holds a cart and resumes it exactly once" | — | — |
| Refund / return / void | COMPLETE | Verified | sales (partial/full refund, void), audit reconciliation | — | — |
| Insufficient stock / invalid product / invalid input | COMPLETE | Verified | audit (qty ≤0, 1.5, 10M, negative price, unknown product, oversell) | — | — |
| Atomicity (no payment without sale, no stock change without sale) | COMPLETE | Verified | audit: crash injected at commit → 0 rows/0 stock change; purchase same | — | — |
| Concurrency (no oversell) | COMPLETE | Verified | audit: 20 simultaneous checkouts for 10 units → exactly 10 | — | — |
| Inventory: products, brands, models, categories, variants, barcode, SKU, prices, min price, min stock | COMPLETE | Verified | catalog-inventory, import, E2E 01 | — | — |
| Stock movements, adjustments, damaged stock, dead stock, valuation | COMPLETE | Verified | catalog-inventory (count/damage/negative), reports (valuation, dead/fast/slow), consistency check cache = ledger | — | — |
| Purchase ↑ stock, sale ↓, refund ↑, repair part ↓, adjustment recorded | COMPLETE | Verified | audit stock reconciliation (24/8/4 by hand), suppliers-repairs | — | — |
| Repairs: intake, device, complaint, diagnosis, technician, statuses, parts, payment, delivery, warranty | COMPLETE | Verified | suppliers-repairs full workflow, audit repair profit, UX sweep | — | — |
| Repair status history, photos, signature, encrypted passcode | COMPLETE | Verified | suppliers-repairs (photo file, passcode not in DB) | — | — |
| Warranty return | COMPLETE | Verified | warranty found by IMEI → linked warranty claim | — | — |
| Reopen a closed repair | MISSING | — | delivered/cancelled repairs are final; a warranty claim ticket is the supported path | — | P3 |
| Repair cancellation (parts back, deposit refunded) | COMPLETE | Verified | suppliers-repairs | — | — |
| Suppliers: purchase, partial receiving, balance, partial/full payment, return, history | COMPLETE | Verified | suppliers-repairs, audit (40,000 − 15,000 − 8,000 = 17,000) | — | — |
| Customers: creation, search, history, balance, loyalty, tags, type | COMPLETE | Verified | sales (credit, loyalty), import, audit (balance 10,000), E2E sweep | — | — |
| Smart offers: cross-sell, bundle, threshold, clearance, qty, buy-X-get-Y, VIP | COMPLETE | Verified | unit/offers, integration/offers, E2E 04 | — | — |
| Smart offers: upsell (cheap → premium) as its own type | PARTIAL | Verified | modelled as a cross-sell suggesting the premium item | no "replace" flow | P3 |
| Offers: margin/min-price protection, stock protection, max 1–3 suggestions, tracking | COMPLETE | Verified | unit/offers (floors, out-of-stock skip, max N), integration analytics | — | — |
| QR optional (on/off per document), signed, scan & resolve | COMPLETE | Verified | qr-printing (tamper, QR off everywhere), E2E 09 (QR on/off PDFs), audit malformed QR | webcam scan not tested | — |
| Printing 58 / 80 mm / A4, Arabic/English, logo, totals, payment, QR | COMPLETE | Verified | E2E 09: PDF widths 165 / 227 / 595 pt, rendered images inspected | receipt height & bidi fixed | — |
| Printer unavailable → sale stays valid | COMPLETE | Verified | E2E 02 | — | — |
| Physical thermal printer output | — | NOT VERIFIED — ENVIRONMENT LIMITATION | silent print path exercised only through the error path | — | — |
| Users, roles, granular permissions in backend | COMPLETE | Verified | audit role matrix (Manager, Cashier, Technician, Accountant, Inventory manager) × 12 IPC methods | import_data fixed | — |
| Manager override, discount limits | COMPLETE | Verified | sales (discount limit, price edit approval), auth (single-use override) | — | — |
| Fast user switching without permission leaks | COMPLETE | Verified | audit (cashier → manager → cashier) | — | — |
| Audit log | COMPLETE | Verified | audit (all financial actions present), switching attribution | — | — |
| Electron hardening | COMPLETE | Verified | code review: sandbox, contextIsolation, no nodeIntegration, CSP, nav/pop-up/webview guards, sender check | — | — |
| Backup (encrypted, scheduled, on exit, mirror, verify, keep N) | COMPLETE | Verified | backup (11 tests), E2E 06, Windows CI (DPAPI backup + verify) | — | — |
| Restore (wrong password, tampered, truncated, newer version, interruption) | COMPLETE | Verified | backup tests incl. power-cut simulation | journaling added | — |
| .centralbundle portability | COMPLETE | Verified | backup "moves the whole shop to a new PC", new sale after move | — | — |
| CSV/Excel import | COMPLETE | Verified | import (7 tests incl. 3k rows), E2E 07 | — | — |
| Licensing: trial, activation, wrong machine, tamper, expiry, grace, rollback, future clock | COMPLETE | Verified | auth-license (10 tests), production key checked end-to-end | future clock ends trial/timed early (documented) | P2 |
| Updates: data kept, migration with backup, downgrade refused | COMPLETE | Verified | migrator, failures (newer DB refused), Windows CI uninstall keeps data | — | — |
| Online auto-update (electron-updater) | PARTIAL | NOT VERIFIED — ENVIRONMENT LIMITATION | code path only; needs an update server | — | P2 |
| Arabic RTL first-class + English | COMPLETE | Verified | UX sweep (18 Arabic + 5 English screens inspected), print audit | small fixes applied | — |
| Light/dark theme | COMPLETE | Not re-verified in this audit | theme toggle exists | — | P3 |
| Windows NSIS installer | COMPLETE | Verified | Windows CI: built (107 MB), silent install, smoke test of installed app, uninstall keeps data | unsigned | P2 |
| Code signing | MISSING | — | no certificate | SmartScreen warning | P2 |
| Quotations | MISSING | — | table exists in schema, no feature | — | P3 |
| Multi-PC sync | MISSING (by design) | — | sync metadata only | — | P3 |
| Documentation | COMPLETE | Verified against behaviour | corrected in this audit (licensing, build, backup, troubleshooting) | — | — |

## 3. Verified features

Verified by executed tests (not by code reading): POS end-to-end, quick sale and invoice, cash/card/
split/partial-credit payments, held carts, refunds and voids, stock movements and reconciliation,
damaged/count adjustments, inventory valuation and dead/fast/slow stock, repairs (full lifecycle,
parts, photos, signature, encrypted passcode, warranty claim, cancellation), suppliers (purchase,
partial receipt, payments, returns, balances), customers (credit, limit, collection, loyalty),
smart offers (all rule types, floors, stock, max suggestions, analytics), QR on/off, printing at
58/80/A4, RBAC for six roles at the IPC level, user switching, audit trail, encrypted backups,
restore (incl. interruption), transfer bundle, CSV/XLSX import, licensing (trial → activation →
expiry → grace, wrong machine, tampering, clock changes), migrations/downgrade guard, disk-full and
locked-database handling, Windows installer install/run/uninstall.

## 4. Partial features

| Feature | Gap | Severity |
| --- | --- | --- |
| Online auto-update | Implemented, opt-in; never exercised against a real update server | P2 |
| Upsell | No dedicated "replace with premium" offer; cross-sell covers it | P3 |
| Dashboard ranges | Today + 14 days; arbitrary ranges are in Reports | P3 |
| Accessibility | PIN-pad `aria-label`s are English in the Arabic UI | P3 |

## 5. Missing features

Repair reopen (P3; warranty-claim ticket is the supported path) · Quotations (P3; schema only) ·
Code signing certificate (P2; business purchase) · Multi-PC sync (P3; out of scope for v1).

## 6. Bugs found (all fixed in this audit unless stated)

| # | Bug | Severity | Status |
| --- | --- | --- | --- |
| 1 | Sales report "by payment method" included repair deposits and debt collections and omitted credit: cash showed 1,120 for 780 of sales | P1 | Fixed + reconciliation test |
| 2 | Thermal receipts printed as fixed 26 cm pages (blank paper fed after every receipt) | P1 | Fixed (page sized to content: 6–10 cm) |
| 3 | Restore could leave no database if power was lost between two renames (app would show first-time setup) | P1 | Fixed: restore journal + automatic rollback at start; failed swap rolls back immediately |
| 4 | Older app version could open a database migrated by a newer version | P1 | Fixed (refused with a clear message) |
| 5 | Saved in-progress cart survived a restore (could reference products that no longer exist) | P2 | Fixed (cleared on restore) |
| 6 | Disk full surfaced as "unexpected error" | P2 | Fixed (`DISK_FULL`, nothing saved, recovers) |
| 7 | `import_data` permission defined but not enforced | P2 | Fixed |
| 8 | Date inputs in US month/day order (05/10 read as 10 May) | P2 | Fixed (day/month/year) |
| 9 | Receipt ignored an explicit paper size | P3 | Fixed |
| 10 | Arabic product names reordered inside English receipts | P3 | Fixed (bidi isolation) |
| 11 | Dashboard could show cached numbers for 10 s after a sale | P3 | Fixed (refetch on open) |
| 12 | Unassigned technician shown as "—"; wrong icon; plural "suppliers" label | P3 | Fixed |
| 13 | E2E helper assumed Electron's binary path (Electron 44 downloads lazily) | P2 (CI) | Fixed |

## 7. Security audit

| Check | Result |
| --- | --- |
| contextIsolation / sandbox / no nodeIntegration | ✔ main and print windows |
| Preload API | 3 members: `invoke`, `on` (event allow-list), `platform` |
| IPC validation | sender URL check, method name shape, zod strict input, backend permission checks (verified per role) |
| Renderer file-system access | none; folders only via OS dialogs; media protocol rejects traversal / NUL / malformed paths |
| CSP | `default-src 'self'`, no inline scripts, `object-src 'none'`, `frame-ancestors 'none'` |
| Navigation / pop-ups / webview | blocked for every web contents |
| Passwords / PINs | bcrypt; lockout; overrides single-use and session-bound |
| Secrets in repository | only `scripts/license/dev-private-key.pem` (development builds; release build refuses the dev key). Production private key is **not** in the repository |
| eval / shell | none; OS commands via `execFile` with fixed arguments |
| SQL injection | Prisma or bound parameters; interpolated SQL fragments are constants |
| Logs | password/pin/secret/token/key fields redacted; request inputs not logged |
| Data at rest | backups AES-256-GCM; **live database is not encrypted** and device passcodes are encrypted with a key stored in the same database (protects against casual reading, not against someone holding the whole data folder) — recommend BitLocker on shop PCs | P2 |
| Repository visibility | **public** → anyone can read the source and build a copy with their own license key | **P0** |

## 8. Data integrity audit

Hand-calculated dataset (`tests/integration/audit.test.ts`): net sales 87,000 (sales 45,000 + 27,000 +
25,000 − refund 10,000, void excluded) · COGS 40,000 · product profit 47,000 · repair revenue 50,000 −
parts 15,000 = 35,000 · gross profit 82,000 · customer balance 25,000 − 10,000 − 5,000 = 10,000 ·
supplier balance 40,000 − 15,000 − 8,000 = 17,000 · drawer 185,000 · stock 24/8/4 · settlement cash
45,000 + card 27,000 + credit 15,000 = 87,000. **Every figure matched exactly**, in reports, profit,
balances, shift and dashboard.

Consistency checks after the dataset: `foreign_key_check` empty, `integrity_check` ok, no sale without
items, stock cache = movement ledger for every variant, no negative stock, no over-refund, every
payment linked as its kind requires, sale payments + credit = sale total.

## 9. Performance audit

`npm run test:perf` — 10,016 products · 125,440 sale lines (50,176 sales) · 10,048 customers ·
5,024 repairs (Linux container):

| Operation | ms |
| --- | ---: |
| Cold start on the large database | 379 |
| Login (bcrypt) | 90 |
| POS search | 8 |
| Barcode lookup | 1 |
| Inventory search page | 10 |
| Complete a 3-line sale | 26 |
| Dashboard | 28 |
| Sales report, full year by month | 396 |
| Profit report, full year | 195 |
| Inventory report | 56 |
| Global search | 72 |
| Encrypted backup (32 MB) / verify | 4,261 / 1,002 |

Cold start of a normal database to the sign-in screen: ~0.9 s (E2E). No bottleneck requires work.

## 10. UX / Arabic RTL audit

23 screens captured with realistic Arabic data (`tests/e2e/10-ux-sweep.spec.ts`) and inspected:
dashboard, POS + payment, inventory, product editor, repairs (list/new/detail), customers, suppliers,
purchase editor, sales history, reports, offers, settings, users; then English. No reversed layouts,
clipped text or broken numbers found; issues found (date order, labels, icons, stale dashboard) were
fixed. A first-time employee can sell (scan or tap → F8 → Enter), find products, create a customer
inline, receive a device, change its status, receive a purchase and read a supplier balance from the
visible buttons; the manual is a backup, not a prerequisite.

## 11. Backup / restore audit

Backup → verify → modify → restore → original data back (incl. photos) — integration + E2E. Wrong
password, tampered, truncated and junk files rejected before anything changes; newer-version backups
refused; interrupted restore rolled back at next start; pre-restore copy listed afterwards; contents:
database (settings, users, licenses-on-record, audit) + all media. Encryption verified (no SQLite
header or product names in the file). Windows: backup with DPAPI-protected key + verify passed on the
installed app.

## 12. Licensing audit (actual behaviour)

| Situation | Behaviour (tested) |
| --- | --- |
| New install | 15-day trial, full features, max 10 users |
| Trial ends | activation screen replaces the app; data untouched; backup available there |
| Valid key | active immediately, offline; survives restart |
| Key for another PC / modified / garbage | rejected (`MACHINE` / `SIGNATURE` / invalid) |
| Timed key expires | 3-day grace (still works, warning) then activation screen |
| Clock turned back | no gain: the app uses the latest time it has seen; warning logged |
| Clock set forward by mistake then fixed | lifetime license unaffected; trial/timed license may end early → new key (P2) |
| Reinstall / delete DB marker | trial does not restart (sealed marker outside the data folder) |
| Restore on another PC | data moves; the new PC needs its own key |
| Production key chain | key issued by the vendor tool with the production private key activates the shipped app; same key refused on another machine |

## 13. Packaging audit

Windows CI (real Windows): `Central-Pro-Setup-1.0.0.exe` 107 MB built; silent per-user install to
`%LOCALAPPDATA%\Programs\Central Pro`; `resources\migrations` and the `win32-x64` SQLite driver
present; installed app ran onboarding → product → sale → encrypted backup → verify; uninstall removed
the program and **kept `%APPDATA%\Central Pro`**. Business data never lives in the installation folder.
Linux packaged build smoke-tested the same way. Fonts (Cairo) bundled; icons present.

## 14. Tests executed

| Suite | Result |
| --- | --- |
| Typecheck (main, renderer, scripts) | pass |
| Vitest unit + integration (15 files) | all pass |
| Playwright E2E (10 specs: onboarding, POS, repairs/suppliers, offers, dashboard/reports, backup/restore, import, startup, print audit, UX sweep) | all pass |
| Packaged app smoke (Linux) | pass |
| Windows CI: packaged + installed app smoke, install/uninstall data check | pass |
| Stress suite | pass (timings above) |

## 15. Fixes applied

See section 6, plus: production license key generated (private key kept outside the repository),
key tool refuses keys the app would reject, Windows release and activation-key workflows, CI on every
push, documentation corrected.

## 16. Remaining risks

- Physical thermal printers, barcode scanners and webcams were not available (environment limitation).
- Online auto-update not exercised against a server (optional feature).
- Installer is unsigned → SmartScreen warning at install.
- Live database not encrypted at rest; protect shop PCs with Windows passwords/BitLocker.
- Wrong forward clock can end a trial/timed license early (lifetime unaffected).
- Single-PC design: no multi-branch sync in v1.

## 17. RELEASE BLOCKERS

| # | Blocker | Severity | Owner / action |
| --- | --- | --- | --- |
| 1 | Repository is **public**: full source is readable, so a technical buyer can build an unlicensed copy with their own key | **P0** | Owner: Settings → General → Change visibility → **Private** |
| 2 | Production private key must be stored as the `LICENSE_PRIVATE_KEY` secret and backed up offline before the first sale (without it no activation keys can be issued) | **P0 (operational)** | Owner: add the secret, keep two offline copies |

No P0/P1 code defects remain open.

## 18. Exact Windows release procedure

1. Make the repository private; add secret `LICENSE_PRIVATE_KEY` (contents of `private-key.pem`).
2. Set `"version"` in `package.json`, commit, push.
3. `git tag vX.Y.Z && git push origin vX.Y.Z` (or Actions → **بناء نسخة ويندوز** → Run workflow → publish).
4. The workflow tests, builds `Central-Pro-Setup-X.Y.Z.exe` on Windows, runs it, installs it, runs the
   installed copy, uninstalls it (failing if data is deleted) and publishes the Release with SHA-256.
5. Download the installer from **Releases**; on a clean shop PC: install → onboard → sell → print →
   backup → activate with a key from **Actions → توليد مفتاح تفعيل**.

Local alternative on Windows 10/11 x64 with Node 24: `npm ci && npm run dist:win`.

## 19. Final recommendation

The application's business logic, financial integrity, data safety, security model and Windows
packaging were verified with executed tests, including a hand-reconciled accounting dataset, failure
injection, a stress dataset and a real Windows install/uninstall. All P0/P1 **code** defects found
were fixed and re-tested.

**Recommendation: ready for a controlled commercial pilot** (first shops, with the vendor reachable),
**after the two operational blockers in §17 are done** — make the repository private and store the
production private key as a secret with offline copies. Before broad sale: test once with the actual
thermal printer and barcode scanner models used by customers, and consider a code-signing certificate.

---

## Addendum (1.0.2): five-year simulation

`npm run test:sim` (tests/sim/five-years.test.ts) runs a busy shop for 1,826 days through the real
services with the clock moved forward in **Africa/Cairo** (10 clock changes, leap day 2028, five year
ends, sales after midnight inside the same shift). It keeps independent books and compares them with
the app: every shift's expected drawer cash, stock of every item, every customer and supplier
balance, monthly sales reports, and the dashboard on clock-change days, leap day and New Year's Eve.

**Final run (seed 20261003): 82,781 sales, 3,822 repairs, 1,528 purchases, 989 refunds, 247 voids,
809 debt collections, 20 bulk price imports, staff changes, a licence that lapses and is renewed —
0 mismatches.**

| At year 5 (DB 312 MB) | ms |
| --- | --- |
| Complete a sale (p50 / p95) | 9 / 23 |
| POS search by name / barcode | 1–2 / ≤1 |
| Dashboard | 17 |
| Sales report, 12 months | 190 |
| Sales history page / search | 34 / 114 |
| Customers page / by phone | 56 / 6 |
| Global search | 81 |
| Backup (66 MB encrypted) | 9,000 |
| App restart | 352 |

Found and fixed by the simulation:

| # | Problem | Fix |
| --- | --- | --- |
| S1 | Dashboard "today", yesterday, the 14-day chart and day ranges added 24 h to midnight; on Egypt's 23-hour day sales after midnight were counted in the previous day (seen: 30 Apr 2027) | `src/shared/dates.ts` steps calendar days; used by reports and the renderer |
| S2 | A purchase paid in cash could exceed the drawer (supplier payments were already checked): expected cash went negative, petty cash was then refused and closing showed a false surplus | Same check; new `INSUFFICIENT_CASH` error with the available amount |
| S3 | Unclaimed repaired phones stayed on the board forever (≈25/year); cancelling returned the fitted parts to stock | Built-in final status **«لم يُستلم»**: off the board, parts and deposit kept, still deliverable |
| S4 | Repair board silently showed only the newest 200 open devices | Notice with the real total |
| S5 | Dashboard alerts opened unfiltered lists | Alerts open the filtered list (out, low, overdue, ready) |
| S6 | Screens stopped refreshing when Windows reported no network (React Query "online" mode) | `networkMode: 'always'` — all calls are local |

Observations (no change needed now): the backups folder reaches ~1.1 GB at year 5 with the default
14 copies (lower the count or use an external drive on small disks); a cashier without the credit
permission needs the owner's PIN about once a day for credit sales (grant the permission if that is
too often); 50–90 slow-moving items accumulate as dead stock, which the dashboard and the
Clearance offer already surface.
