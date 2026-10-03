/**
 * Five years of a busy Egyptian mobile shop, one day at a time, through the real
 * services with the system clock moved forward (Africa/Cairo: DST, leap day 2028,
 * year ends, sales after midnight in the same shift).
 *
 * The simulation keeps its own books — stock per item, customer debts, supplier
 * balances, the cash drawer of every shift, revenue per day and month — and checks
 * the app against them. Every simulated year it also times the screens a shop uses
 * daily as the data grows, and records usability signals (cluttered boards, alerts
 * nobody can act on, lists that grow without limit...).
 *
 * Output: test-results/sim/report.md (+ report.json).
 *   npm run test:sim                 full 5 years (~1826 days)
 *   SIM_DAYS=60 npm run test:sim     quick run
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
import { rawQuery } from '@main/database/client'
import { actor, cleanup, createTestApp, devActivationKey, FakeLicensePlatform, setupOwner, type TestApp } from '../helpers/app'

const DAYS = Number(process.env.SIM_DAYS ?? 1826)
const SEED = Number(process.env.SIM_SEED ?? 20261003)
const OUT = resolve(__dirname, '../../test-results/sim')
const START = new Date(2026, 9, 3, 9, 0, 0) // local (Africa/Cairo)

// ── deterministic randomness ──
let seed = SEED
const rng = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296
}
const int = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1))
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!
const round5 = (piasters: number) => Math.max(500, Math.round(piasters / 500) * 500) // prices end in 5 EGP

// ── time ──
const at = (day: number, h: number, m = 0) => new Date(START.getFullYear(), START.getMonth(), START.getDate() + day, h, m, int(0, 59))
const setNow = (d: Date) => vi.setSystemTime(d)
const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

// ── the simulation's own books ──
interface Item { variantId: string; productId: string; name: string; barcode: string; kind: 'ACC' | 'PART' | 'SERVICE'; supplier: number; price: number; cost: number; minStock: number; born: number; weight: number }
interface SoldLine { saleItemId: string; variantId: string; qty: number; unitPrice: number; refunded: number }
interface SoldSale { id: string; at: Date; credit: boolean; lines: SoldLine[] }
interface Ticket { id: string; stage: string; next: number; est: number; paid: number; parts: number; labor: number; fate: 'deliver' | 'abandon' | 'cancel'; created: number; readyDay?: number }

const items: Item[] = []
const stock = new Map<string, number>()
const custDebt = new Map<string, number>()
const custIds: string[] = []
const suppliers: string[] = []
const suppDebt = new Map<string, number>()
const revenueByDay = new Map<string, number>()
const revenueByMonth = new Map<string, number>()
const recent: SoldSale[] = []
const tickets: Ticket[] = []
let drawer = 0

// ── findings ──
const problems: string[] = []
const problem = (msg: string) => {
  if (problems.length < 400 && !problems.includes(msg)) problems.push(msg)
}
const counters: Record<string, number> = {}
const bump = (k: string, n = 1) => (counters[k] = (counters[k] ?? 0) + n)
const saleMs: number[] = []
interface YearRow { year: number; date: string; [k: string]: string | number | null }
const years: YearRow[] = []
const dstChecks: string[] = []

let t: TestApp
let OWNER: ReturnType<typeof actor>
let CASHIER: ReturnType<typeof actor>
let STATUS: Record<string, string> = {}
let CASHIER_LOGIN = { username: 'cashier', secret: 'cashier-pass-1', method: 'PASSWORD' as const }

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
const time = async <T,>(fn: () => Promise<T>): Promise<[T, number]> => {
  const s = performance.now()
  const r = await fn()
  return [r, Math.round(performance.now() - s)]
}
/** Runs `fn`; when the cashier needs a manager, the owner approves with the PIN (counted). */
const withApproval = async <T,>(what: string, fn: (overrideToken?: string) => Promise<T>): Promise<T> => {
  try {
    return await fn()
  } catch (e) {
    const err = e as { code?: string; details?: { permission: string; permissions: string[] } }
    if (err.code !== 'OVERRIDE_REQUIRED') throw e
    bump(`managerApproval:${what}:${err.details!.permissions.join('+')}`)
    const { token } = await t.app.auth.requestOverride({ username: 'owner', secret: '1234', method: 'PIN', permission: err.details!.permission as never, permissions: err.details!.permissions as never })
    return fn(token)
  }
}
const median3 = async (fn: () => Promise<unknown>) => {
  const xs: number[] = []
  for (let i = 0; i < 3; i++) xs.push((await time(fn))[1])
  return xs.sort((a, b) => a - b)[1]!
}
const dirSize = (dir: string): number => {
  let n = 0
  for (const f of readdirSync(dir, { withFileTypes: true })) n += f.isDirectory() ? dirSize(join(dir, f.name)) : statSync(join(dir, f.name)).size
  return n
}
const MB = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10

// ── catalog ──
const WORDS = ['جراب', 'اسكرينة', 'شاحن', 'كابل', 'سماعة', 'باور بانك', 'ساعة ذكية', 'كارت ميموري', 'حامل موبايل', 'سماعة بلوتوث']
const MODELS = ['iPhone 15', 'iPhone 13', 'iPhone 11', 'Galaxy A54', 'Galaxy A15', 'Redmi 13C', 'Redmi Note 13', 'Oppo Reno 11', 'Realme C55', 'Infinix Hot 40', 'Tecno Spark 20', 'Honor X8', 'Vivo Y36', 'Galaxy S24', 'iPhone 16']
const PARTS = ['شاشة', 'بطارية', 'سوكت شحن', 'سماعة داخلية', 'كاميرا خلفية', 'ظهر', 'فلاتة']
let barcodeSeq = 0

async function newProduct(day: number, kind: Item['kind'], cats: Record<string, string>) {
  const isPart = kind === 'PART'
  const isService = kind === 'SERVICE'
  const word = isPart ? pick(PARTS) : isService ? pick(['شحن رصيد', 'باقة نت', 'تحويل كاش', 'تفعيل خط']) : pick(WORDS)
  const name = `${word} ${pick(MODELS)} ${isService ? '' : pick(['أسود', 'شفاف', 'أزرق', 'أصلي', 'كوبي', 'درجة أولى', ''])}`.replace(/\s+/g, ' ').trim() + ` #${items.length + 1}`
  const price = round5(isPart ? int(15000, 150000) : isService ? int(1000, 10000) : int(5000, 90000))
  const cost = Math.round(price * (isService ? 0.9 : 0.55 + rng() * 0.15))
  const barcode = `622${String(++barcodeSeq).padStart(9, '0')}`
  const minStock = isService ? 0 : int(2, 8)
  const opening = isService ? 0 : int(minStock + 4, minStock + 30)
  const p = await t.app.catalog.createProduct(
    {
      type: isPart ? 'PART' : isService ? 'SERVICE' : 'ACCESSORY',
      name,
      categoryId: cats[isPart ? 'قطع غيار' : isService ? 'خدمات' : word] ?? null,
      trackStock: !isService,
      variants: [{ sellPrice: price, costPrice: cost, minStock, openingStock: opening, barcodes: [barcode] }]
    },
    OWNER
  )
  const it: Item = { variantId: p.variants[0]!.id, productId: p.id, name, barcode, kind, supplier: int(0, suppliers.length - 1), price, cost, minStock, born: day, weight: isService ? 3 : 1 + rng() * 2 }
  items.push(it)
  stock.set(it.variantId, opening)
  return it
}

/** Popularity: new items sell, old ones fade (5-year shops collect dead stock). */
function sellable(day: number) {
  const list = items.filter((i) => i.kind !== 'PART' && (i.kind === 'SERVICE' || (stock.get(i.variantId) ?? 0) > 0))
  const w = list.map((i) => i.weight * Math.max(0.05, Math.exp(-(day - i.born) / 540)))
  const total = w.reduce((a, b) => a + b, 0)
  return () => {
    let r = rng() * total
    for (let k = 0; k < list.length; k++) if ((r -= w[k]!) <= 0) return list[k]!
    return list[list.length - 1]!
  }
}

// ── daily activities ──
let phoneSeq = 0
async function newCustomer(): Promise<string> {
  const first = pick(['محمد', 'أحمد', 'محمود', 'مصطفى', 'عمرو', 'كريم', 'سارة', 'منى', 'هبة', 'ياسمين', 'علي', 'حسن', 'إسلام', 'نورهان'])
  const last = pick(['عبد الرحمن', 'السيد', 'إبراهيم', 'حسين', 'فتحي', 'سعيد', 'منصور', 'الشافعي', 'عادل', 'جمال'])
  const c = await t.app.customers.save({ name: `${first} ${last}`, phone: `01${pick(['0', '1', '2', '5'])}${String(10_000_000 + ++phoneSeq * 7919).slice(-8)}`, creditLimit: rng() < 0.2 ? 200000 : null }, OWNER)
  custIds.push(c.id)
  return c.id
}

async function sell(day: number, when: Date, next: () => Item, a = CASHIER) {
  setNow(when)
  const lines: Array<{ variantId: string; qty: number; unitPrice: number }> = []
  const n = rng() < 0.6 ? 1 : rng() < 0.75 ? 2 : 3
  for (let k = 0; k < n; k++) {
    const it = next()
    if (lines.some((l) => l.variantId === it.variantId)) continue
    const have = it.kind === 'SERVICE' ? 99 : (stock.get(it.variantId) ?? 0)
    const qty = Math.min(have, rng() < 0.85 ? 1 : 2)
    if (qty > 0) lines.push({ variantId: it.variantId, qty, unitPrice: it.price })
  }
  if (!lines.length) return
  const total = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  const withCustomer = rng() < 0.3
  const customerId = withCustomer ? (rng() < 0.7 && custIds.length > 20 ? pick(custIds) : await newCustomer()) : null
  const r = rng()
  let payments: Array<{ method: 'CASH' | 'CARD' | 'WALLET' | 'TRANSFER'; amount: number }>
  let credit = 0
  if (customerId && r < 0.06) {
    const cash = Math.round((total * int(0, 5)) / 10 / 100) * 100
    payments = cash ? [{ method: 'CASH', amount: cash }] : []
    credit = total - cash
  } else if (r < 0.62) payments = [{ method: 'CASH', amount: total }]
  else if (r < 0.77) payments = [{ method: 'CARD', amount: total }]
  else if (r < 0.93) payments = [{ method: 'WALLET', amount: total }]
  else {
    const cash = Math.round(total / 2 / 100) * 100
    payments = [{ method: 'CASH', amount: cash }, { method: 'CARD', amount: total - cash }]
  }
  const input = { idempotencyKey: randomUUID(), kind: (customerId && rng() < 0.3 ? 'INVOICE' : 'QUICK') as 'INVOICE' | 'QUICK', customerId, lines, payments }
  let sale
  try {
    const [s, ms] = await time(() => withApproval('sale', (overrideToken) => t.app.sales.complete({ ...input, overrideToken }, a)))
    sale = s
    saleMs.push(ms)
  } catch (e) {
    if ((e as { code?: string }).code === 'CREDIT_LIMIT') {
      bump('creditLimitBlocked')
      return sell(day, when, next, a)
    }
    throw e
  }
  if (sale.total !== total) problem(`Sale total ${sale.total} ≠ expected ${total} (${dayKey(when)})`)
  for (const l of lines) if (items.find((i) => i.variantId === l.variantId)!.kind !== 'SERVICE') add(stock, l.variantId, -l.qty)
  add(revenueByDay, dayKey(when), total)
  add(revenueByMonth, monthKey(when), total)
  drawer += payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0)
  if (credit) add(custDebt, customerId!, credit)
  bump('sales')
  if (credit) bump('creditSales')
  const sold: SoldSale = { id: sale.id, at: when, credit: credit > 0, lines: sale.items.map((i) => ({ saleItemId: i.id, variantId: i.variantId!, qty: i.qty, unitPrice: i.unitPrice, refunded: 0 })) }
  recent.push(sold)

  // a mistake noticed right away → void (cash/card/wallet only)
  if (!credit && rng() < 0.003) {
    await t.app.sales.void({ saleId: sale.id, reason: 'خطأ في الفاتورة' }, OWNER)
    for (const l of sold.lines) if (items.find((i) => i.variantId === l.variantId)!.kind !== 'SERVICE') add(stock, l.variantId, l.qty)
    add(revenueByDay, dayKey(when), -total)
    add(revenueByMonth, monthKey(when), -total)
    drawer -= payments.filter((p) => p.method === 'CASH').reduce((s, p) => s + p.amount, 0)
    recent.pop()
    bump('voids')
  }
}

async function refundOne(when: Date) {
  setNow(when)
  const cutoff = when.getTime() - 14 * 86_400_000
  while (recent.length && recent[0]!.at.getTime() < cutoff) recent.shift()
  const candidates = recent.filter((s) => !s.credit && s.lines.some((l) => l.refunded < l.qty))
  if (!candidates.length) return
  const s = pick(candidates)
  const line = s.lines.find((l) => l.refunded < l.qty)!
  const it = items.find((i) => i.variantId === line.variantId)!
  const restock = it.kind !== 'SERVICE' && rng() < 0.85
  await t.app.sales.refund({ saleId: s.id, items: [{ saleItemId: line.saleItemId, qty: 1, restock }], method: 'CASH', reason: 'العميل رجّع الصنف' }, OWNER)
  line.refunded++
  if (restock) add(stock, line.variantId, 1)
  add(revenueByDay, dayKey(s.at), -line.unitPrice)
  add(revenueByMonth, monthKey(s.at), -line.unitPrice)
  drawer -= line.unitPrice
  bump('refunds')
}

async function receiveRepair(day: number, when: Date) {
  setNow(when)
  const est = round5(int(15000, 250000))
  const deposit = rng() < 0.5 ? round5(est * 0.3) : 0
  const r = await t.app.repairs.create(
    {
      customerName: `عميل صيانة ${tickets.length + 1}`,
      customerPhone: `012${String(30_000_000 + tickets.length * 7).slice(-8)}`,
      deviceBrand: pick(['Samsung', 'Apple', 'Xiaomi', 'Oppo', 'Realme', 'Infinix']),
      deviceModel: pick(MODELS),
      complaint: pick(['الشاشة مكسورة', 'مش بيشحن', 'البطارية بتفصل', 'وقع في مية', 'السماعة مش شغالة', 'الكاميرا مش بتفتح']),
      estimatedPrice: est,
      deposit: deposit ? { amount: deposit, method: 'CASH' } : null
    },
    CASHIER
  )
  drawer += deposit
  const f = rng()
  tickets.push({ id: r.id, stage: 'RECEIVED', next: day + 1, est, paid: deposit, parts: 0, labor: 0, fate: f < 0.04 ? 'abandon' : f < 0.07 && !deposit ? 'cancel' : 'deliver', created: day })
  bump('repairs')
}

async function workRepairs(day: number, when: Date) {
  setNow(when)
  for (const tk of tickets) {
    if (tk.next > day || tk.stage === 'DELIVERED' || tk.stage === 'CANCELLED') continue
    const go = async (key: string, extra: Record<string, unknown> = {}) => {
      await t.app.repairs.changeStatus({ id: tk.id, statusId: STATUS[key]!, ...extra }, OWNER)
      tk.stage = key
    }
    if (tk.stage === 'RECEIVED') await go('DIAGNOSING')
    else if (tk.stage === 'DIAGNOSING') {
      if (tk.fate === 'cancel') {
        await go('CANCELLED')
        bump('repairsCancelled')
      } else await go(rng() < 0.3 ? 'WAITING_CUSTOMER' : 'REPAIRING')
    } else if (tk.stage === 'WAITING_CUSTOMER') await go('REPAIRING')
    else if (tk.stage === 'REPAIRING') {
      const parts = items.filter((i) => i.kind === 'PART' && (stock.get(i.variantId) ?? 0) > 0)
      if (parts.length && rng() < 0.6) {
        const p = pick(parts)
        await t.app.repairs.addPart({ repairId: tk.id, variantId: p.variantId, qty: 1, unitPrice: p.price }, OWNER)
        add(stock, p.variantId, -1)
        tk.parts += p.price
      }
      tk.labor = round5(int(5000, 40000))
      await t.app.repairs.update({ id: tk.id, laborPrice: tk.labor }, OWNER)
      await go('READY')
      tk.readyDay = day
    } else if (tk.stage === 'READY' && tk.fate === 'abandon') {
      // nobody comes: after 60 days the owner files it as "Not collected"; 15% turn up later
      if (day - tk.readyDay! >= 60) {
        await go('UNCLAIMED')
        bump('repairsNotCollected')
        if (rng() < 0.15) tk.fate = 'deliver'
        tk.next = tk.fate === 'deliver' ? day + int(10, 180) : Number.POSITIVE_INFINITY
      }
      continue
    } else if (tk.stage === 'READY' || tk.stage === 'UNCLAIMED') {
      if (tk.stage === 'UNCLAIMED') bump('repairsCollectedLate')
      const due = tk.parts + tk.labor - tk.paid
      const r = await t.app.repairs.changeStatus({ id: tk.id, statusId: STATUS.DELIVERED!, payments: due > 0 ? [{ method: 'CASH', amount: due }] : [] }, OWNER)
      tk.stage = 'DELIVERED'
      if (due > 0) drawer += due
      if (r.balanceDue !== 0) problem(`Repair ${r.number}: balance ${r.balanceDue} after full payment`)
      bump('repairsDelivered')
    }
    tk.next = day + (rng() < 0.7 ? 1 : int(2, 4))
  }
}

async function restock(day: number, when: Date) {
  setNow(when)
  const bySupplier = new Map<number, Item[]>()
  for (const it of items) {
    if (it.kind === 'SERVICE' || (stock.get(it.variantId) ?? 0) > it.minStock) continue
    if (day - it.born > 720 && rng() < 0.7) continue // old items are not re-ordered any more
    const xs = bySupplier.get(it.supplier) ?? []
    xs.push(it)
    bySupplier.set(it.supplier, xs)
  }
  for (const [s, xs] of bySupplier) {
    const lines = xs.slice(0, 120).map((it) => ({ variantId: it.variantId, qty: it.minStock * 4 + int(0, 6), unitCost: it.cost }))
    const total = lines.reduce((a, l) => a + l.qty * l.unitCost, 0)
    const paid = Math.round((total * 0.4) / 100) * 100
    const supplierId = suppliers[s]!
    // Cash from the drawer when there is enough, otherwise the owner transfers.
    const method = paid <= drawer ? 'CASH' : 'TRANSFER'
    if (method === 'TRANSFER') bump('purchasePaidByTransfer (drawer short)')
    await t.app.suppliers.createPurchase({ supplierId, items: lines, receiveNow: true, payment: paid ? { amount: paid, method } : null }, OWNER)
    for (const l of lines) add(stock, l.variantId, l.qty)
    add(suppDebt, supplierId, total - paid)
    if (method === 'CASH') drawer -= paid
    bump('purchases')
  }
}

async function closeShift(day: number) {
  const shift = await t.app.shifts.currentShift()
  if (!shift) return
  setNow(at(day + 1, 0, 40))
  const summary = await t.app.shifts.summary(shift.id)
  if (summary.expectedCash !== drawer) problem(`Shift ${dayKey(at(day, 12))}: app expects ${summary.expectedCash / 100} EGP in the drawer, books say ${drawer / 100}`)
  const diff = rng() < 0.05 ? pick([-5000, -2000, -1000, 1000, 500]) : 0
  const closed = await t.app.shifts.close(summary.expectedCash + diff, diff ? 'فرق في العد' : null, CASHIER)
  if (closed.difference !== diff) problem(`Shift close difference ${closed.difference} ≠ ${diff}`)
  if (diff) bump('shiftDiffs')
  drawer = 0
}

// ── checks ──
async function checkBooks(label: string) {
  const ledgerIssues = await t.app.inventory.verifyLedger()
  if (ledgerIssues.length) problem(`${label}: stock ledger mismatches: ${ledgerIssues.length}`)
  const rows = await rawQuery<{ id: string; stockQty: number }>(t.app.db, `SELECT id, stockQty FROM ProductVariant`)
  let bad = 0
  for (const r of rows) if (stock.has(r.id) && items.find((i) => i.variantId === r.id)!.kind !== 'SERVICE' && stock.get(r.id) !== r.stockQty) bad++
  if (bad) problem(`${label}: ${bad} items have a different stock than the books`)
  let custBad = 0
  for (const [id, debt] of custDebt) if ((await t.app.customers.balance(id)) !== debt) custBad++
  if (custBad) problem(`${label}: ${custBad} customer balances differ from the books`)
  for (const [id, debt] of suppDebt) {
    const b = await t.app.suppliers.balance(id)
    if (b !== debt) problem(`${label}: supplier balance ${b} ≠ books ${debt}`)
  }
}

async function checkMonth(d: Date) {
  const from = new Date(d.getFullYear(), d.getMonth(), 1)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1)
  const rep = await t.app.reports.sales({ from: from.toISOString(), to: to.toISOString() }, 'day', OWNER)
  const want = revenueByMonth.get(monthKey(from)) ?? 0
  if (rep.totals.revenue !== want) problem(`Sales report ${monthKey(from)}: ${rep.totals.revenue / 100} EGP, books ${want / 100} EGP`)
  const days = rep.series.reduce((s: number, x: { revenue: number }) => s + x.revenue, 0)
  if (days !== rep.totals.revenue) problem(`Sales report ${monthKey(from)}: daily rows add up to ${days / 100}, total says ${rep.totals.revenue / 100}`)
}

async function checkDashboardDay(when: Date, why: string) {
  setNow(when)
  const dash = await t.app.reports.dashboard(OWNER)
  const want = revenueByDay.get(dayKey(when)) ?? 0
  const trendKeys = dash.trend.map((x: { day: string }) => x.day)
  const uniq = new Set(trendKeys).size === trendKeys.length && trendKeys.at(-1) === dayKey(when)
  const line = `${dayKey(when)} (${why}): today ${dash.today.sales / 100} vs books ${want / 100}; 14-day chart days unique & ends today: ${uniq}`
  dstChecks.push(line)
  if (dash.today.sales !== want || !uniq) problem(`Dashboard on ${line}`)
}

async function yearCheckpoint(day: number) {
  const now = at(day, 23, 50)
  setNow(now)
  const year = Math.round(((day + 1) / 365) * 10) / 10
  await checkBooks(`Year ${year}`)
  const yearFrom = new Date(now.getFullYear(), 0, 1).toISOString()
  const last365 = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString()
  const range = { from: last365, to: now.toISOString() }
  const heavy = (await rawQuery<{ customerId: string }>(t.app.db, `SELECT customerId FROM CustomerLedger GROUP BY customerId ORDER BY COUNT(*) DESC LIMIT 1`))[0]?.customerId
  const someone = custIds[Math.floor(custIds.length / 2)]
  const phone = someone ? (await t.app.customers.get(someone)).phone : '010'
  const row: YearRow = { year, date: dayKey(now) }
  row['POS search (name)'] = await median3(() => t.app.catalog.posSearch({ q: 'جراب ايفون' }, true))
  row['POS search (barcode)'] = await median3(() => t.app.catalog.findByCode(items[0]!.barcode, true))
  const recentMs = saleMs.slice(-2000).sort((a, b) => a - b)
  row['Complete sale p50'] = recentMs[Math.floor(recentMs.length / 2)] ?? null
  row['Complete sale p95'] = recentMs[Math.floor(recentMs.length * 0.95)] ?? null
  row['Dashboard'] = await median3(() => t.app.reports.dashboard(OWNER))
  row['Sales report 12 months'] = await median3(() => t.app.reports.sales(range, 'month', OWNER))
  row['Sales report this year by day'] = await median3(() => t.app.reports.sales({ from: yearFrom, to: now.toISOString() }, 'day', OWNER))
  row['Profit report 12 months'] = await median3(() => t.app.reports.profit(range, 'month'))
  row['Inventory report'] = await median3(() => t.app.reports.inventory(OWNER))
  row['Sales history page 1'] = await median3(() => t.app.sales.list({ page: 1, pageSize: 50 }, OWNER))
  row['Sales history search'] = await median3(() => t.app.sales.list({ page: 1, pageSize: 50, q: phone ?? '010' }, OWNER))
  row['Customers page 1'] = await median3(() => t.app.customers.list({ page: 1, pageSize: 50 }))
  row['Customer by phone'] = await median3(() => t.app.customers.list({ q: phone ?? '010', page: 1, pageSize: 5 }))
  row['Heaviest customer ledger'] = heavy ? await median3(() => t.app.customers.ledger(heavy)) : null
  row['Repair board'] = await median3(() => t.app.repairs.list({ open: true, page: 1, pageSize: 200 }))
  row['Global search'] = await median3(() => t.app.reports.search('محمد', OWNER))
  row['Audit log page 1'] = await median3(() => t.app.users.auditLog({ page: 1, pageSize: 50 }))
  const [backup, backupMs] = await time(() => t.app.backup.create('MANUAL', OWNER.userId))
  row['Backup (ms)'] = backupMs
  row['Backup size MB'] = MB(backup.sizeBytes)
  row['Database MB'] = MB(statSync(t.app.paths.database).size)
  row['Backups folder MB'] = MB(dirSize(t.app.paths.backups))
  const [, reopenMs] = await time(async () => {
    t = await t.reopen()
  })
  row['Restart app (ms)'] = reopenMs
  await t.app.auth.login({ username: 'owner', secret: 'owner-pass-1', method: 'PASSWORD' })
  OWNER = actor(t)
  await t.app.auth.login(CASHIER_LOGIN)
  CASHIER = actor(t)
  await t.app.backup.unlock('backup-pass-1', OWNER.userId)

  const count = async (sql: string, ...p: unknown[]) => (await rawQuery<{ n: number }>(t.app.db, sql, ...p))[0]!.n
  const dash = await t.app.reports.dashboard(OWNER)
  row['Sales (total)'] = await count(`SELECT COUNT(*) AS n FROM Sale`)
  row['Products'] = items.length
  row['Customers'] = await count(`SELECT COUNT(*) AS n FROM Customer WHERE deletedAt IS NULL`)
  row['Open repairs'] = await count(`SELECT COUNT(*) AS n FROM Repair r JOIN RepairStatus s ON s.id = r.statusId WHERE s.isFinal = 0 AND r.deletedAt IS NULL`)
  row['Filed as not collected'] = await count(`SELECT COUNT(*) AS n FROM Repair r JOIN RepairStatus s ON s.id = r.statusId WHERE s.key = 'UNCLAIMED'`)
  row['Ready, never collected (>90 days)'] = await count(
    `SELECT COUNT(*) AS n FROM Repair r JOIN RepairStatus s ON s.id = r.statusId WHERE s.key = 'READY' AND r.updatedAt < ?`,
    new Date(now.getTime() - 90 * 86_400_000).toISOString()
  )
  row['Low-stock alert'] = dash.lowStock
  row['Out-of-stock alert'] = dash.outOfStock
  row['Dead-stock items'] = dash.deadStock
  row['Customers owing'] = await count(`SELECT COUNT(*) AS n FROM (SELECT customerId FROM CustomerLedger GROUP BY customerId HAVING SUM(amount) > 0)`)
  row['Audit log rows'] = await count(`SELECT COUNT(*) AS n FROM AuditLog`)
  row['Last sale #'] = (await rawQuery<{ number: string }>(t.app.db, `SELECT number FROM Sale ORDER BY createdAt DESC LIMIT 1`))[0]?.number ?? ''
  row['Last repair #'] = (await rawQuery<{ number: string }>(t.app.db, `SELECT number FROM Repair ORDER BY createdAt DESC LIMIT 1`))[0]?.number ?? ''
  row['License'] = (await t.app.license.state()).status
  years.push(row)
  console.log(`[sim] year ${year}: ${JSON.stringify(row)}`)
}

// ── the run ──
it(`runs a mobile shop for ${DAYS} days`, async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: START })
  const clock = { get now() { return new Date() } }
  t = await createTestApp({ clock: clock as { now: Date }, platform: new FakeLicensePlatform('sim-shop-pc') })
  await setupOwner(t, { starterCatalog: false, language: 'ar' })
  OWNER = actor(t)
  await t.app.backup.setPassword('backup-pass-1', OWNER.userId)
  const roles = await t.app.users.listRoles()
  const cashierUser = await t.app.users.create({ username: 'cashier', fullName: 'أحمد الكاشير', password: 'cashier-pass-1', pin: null, roleId: roles.find((r) => r.systemKey === 'CASHIER')!.id }, OWNER)
  await t.app.auth.login({ username: 'cashier', secret: 'cashier-pass-1', method: 'PASSWORD' })
  CASHIER = actor(t)
  STATUS = Object.fromEntries((await t.app.repairs.statuses()).map((s) => [s.key, s.id]))

  const cats: Record<string, string> = {}
  for (const name of [...WORDS, 'قطع غيار', 'خدمات']) cats[name] = (await t.app.catalog.saveCategory({ name }, OWNER)).id
  for (const name of ['شركة النور', 'المتحدة للإكسسوارات', 'الأهرام موبايل', 'سمارت تريد', 'دلتا للقطع', 'مكة للتوكيلات']) {
    const s = await t.app.suppliers.save({ name }, OWNER)
    suppliers.push(s.id)
    suppDebt.set(s.id, 0)
  }
  for (let i = 0; i < 230; i++) await newProduct(-400 + i, 'ACC', cats)
  for (let i = 0; i < 40; i++) await newProduct(-200, 'PART', cats)
  for (let i = 0; i < 8; i++) await newProduct(0, 'SERVICE', cats)

  let licenseUntil = -1
  let cashier2 = false
  let dstFollowUp: number[] = []
  for (let day = 0; day < DAYS; day++) {
    const date = at(day, 12)
    const year = Math.floor(day / 365)

    // licence: 15-day trial, then yearly keys; in year 3 the owner forgets to renew
    if (day === 10 || (licenseUntil >= 0 && day === licenseUntil - 5 && year !== 3) || (licenseUntil >= 0 && day === licenseUntil + 6)) {
      setNow(at(day, 9, 30))
      if (day === licenseUntil + 6) {
        const st = await t.app.license.state()
        if (st.status !== 'EXPIRED' || st.operational) problem(`Licence 6 days after its end: ${st.status}, operational ${st.operational} (expected EXPIRED, blocked)`)
        bump('licenseLapsed')
      }
      await t.app.license.activate(devActivationKey('sim-shop-pc', 'PROFESSIONAL', 365, new Date()), OWNER.userId)
      licenseUntil = day + 365
    }
    if (licenseUntil >= 0 && day === licenseUntil + 2) {
      setNow(at(day, 9, 30))
      const st = await t.app.license.state()
      if (!st.inGrace || !st.operational) problem(`Licence 2 days after expiry: ${st.status}, grace ${st.inGrace} (expected the 3-day grace period)`)
    }
    if (day === 15) {
      setNow(at(day, 9, 31))
      const st = await t.app.license.state()
      if (st.status !== 'ACTIVE') problem(`After activation on day 10 the licence is ${st.status} on day 15`)
    }

    // staff changes
    if (day === 400 && !cashier2) {
      setNow(at(day, 9, 40))
      await t.app.users.create({ username: 'cashier2', fullName: 'منى الكاشير', password: 'cashier-pass-2', pin: null, roleId: roles.find((r) => r.systemKey === 'CASHIER')!.id }, OWNER)
      cashier2 = true
    }
    if (day === 800) {
      setNow(at(day, 9, 41))
      await t.app.users.update({ id: cashierUser.id, isActive: false }, OWNER)
      CASHIER_LOGIN = { username: 'cashier2', secret: 'cashier-pass-2', method: 'PASSWORD' }
      await t.app.auth.login(CASHIER_LOGIN)
      CASHIER = actor(t)
    }

    // monthly: new arrivals; quarterly: price increases through an Excel import
    if (date.getDate() === 1) {
      setNow(at(day, 9, 45))
      for (let k = 0; k < 9; k++) await newProduct(day, 'ACC', cats)
      if (rng() < 0.3) await newProduct(day, 'PART', cats)
      if (date.getMonth() % 3 === 0) {
        const raise = items.filter((i) => i.kind === 'ACC' && day - i.born < 900)
        for (const i of raise) {
          i.price = round5(i.price * 1.06)
          i.cost = Math.round(i.cost * 1.06)
        }
        const csv = 'الباركود,اسم الصنف,سعر البيع\n' + raise.map((i) => `${i.barcode},"${i.name}",${i.price / 100}`).join('\n')
        const [res, ms] = await time(async () => {
          const parsed = await t.app.imports.parse('prices.csv', Buffer.from(csv), 'products')
          await t.app.imports.preview(parsed.token, 'products', parsed.mapping)
          return t.app.imports.commit(parsed.token, 'products', parsed.mapping, 'update', OWNER)
        })
        if (res.updated !== raise.length || res.failed.length) problem(`Price import ${monthKey(date)}: updated ${res.updated}/${raise.length}, failed ${res.failed.length}`)
        bump('priceImportMs', ms)
        bump('priceImports')
      }
      // supplier settlements by bank transfer
      for (const s of suppliers) {
        const owe = suppDebt.get(s) ?? 0
        if (owe > 0) {
          const amount = Math.round((owe * 0.7) / 100) * 100
          if (amount > 0) {
            await t.app.suppliers.pay({ supplierId: s, amount, method: 'TRANSFER' }, OWNER)
            add(suppDebt, s, -amount)
          }
        }
      }
    }

    // the shop day: 10:00 → 00:30
    const closedToday = date.getMonth() === 3 && date.getDate() === 10 // one holiday a year
    if (closedToday) continue
    setNow(at(day, 10, 0))
    await t.app.shifts.open(50000, CASHIER)
    drawer = 50000
    if (date.getDay() === 6) await restock(day, at(day, 10, 15))
    await workRepairs(day, at(day, 10, 30))

    const weekday = [1, 1, 1, 1, 1.15, 1.3, 0.9][date.getDay()]!
    const season = [1, 1.05, 1, 1, 1, 0.95, 1.1, 1.1, 1.2, 1.05, 1, 1.15][date.getMonth()]!
    const nSales = Math.round(36 * Math.pow(1.07, year) * weekday * season * (0.8 + rng() * 0.4))
    const next = sellable(day)
    const tomorrowNoon = at(day + 1, 12)
    const hours = (new Date(tomorrowNoon.getFullYear(), tomorrowNoon.getMonth(), tomorrowNoon.getDate()).getTime() - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 3.6e6
    const minutes = Array.from({ length: nSales }, () => int(10 * 60 + 20, 24 * 60 + 25))
    if (hours !== 24) minutes.push(23 * 60 + 15) // a late customer on the day the clock changes
    minutes.sort((a, b) => a - b)
    let r = 0
    for (const m of minutes) {
      await sell(day, at(day, 0, m), next) // minutes past midnight; > 24h rolls to the next day
      if (rng() < 0.012) await refundOne(at(day, 0, m + 1))
      if (r++ % 12 === 0 && rng() < 0.5) await receiveRepair(day, at(day, 0, m + 2))
      if (rng() < 0.01) {
        const debtors = [...custDebt].filter(([, d]) => d > 0)
        if (debtors.length) {
          const [cid, d] = pick(debtors)
          const amount = rng() < 0.5 ? d : Math.max(100, Math.round(d / 2 / 100) * 100)
          setNow(at(day, 0, m + 3))
          await t.app.customers.collectDebt({ customerId: cid, amount, method: 'CASH' }, CASHIER)
          add(custDebt, cid, -amount)
          drawer += amount
          bump('collections')
        }
      }
    }
    setNow(at(day, 18, 5))
    const payout = round5(int(2000, 8000))
    await t.app.shifts.cashMovement({ type: 'PAY_OUT', amount: payout, reason: 'شاي ومواصلات' }, CASHIER)
    drawer -= payout
    await closeShift(day)

    // owner looks at shift differences the next morning; auto backups at night
    setNow(at(day + 1, 0, 45))
    if (day % 365 > 340) await t.app.backup.runAutoIfDue()
    if (date.getDate() === 28) await checkMonth(date)

    // dashboard on the days Egypt changes the clock, on leap day and on New Year's Eve
    if (hours !== 24) {
      await checkDashboardDay(at(day, 23, 30), `${hours}-hour day`)
      dstFollowUp = [day + 1, day + 7]
    } else if (dstFollowUp.includes(day)) await checkDashboardDay(at(day, 23, 30), 'after a clock change')
    else if (date.getMonth() === 1 && date.getDate() === 29) await checkDashboardDay(at(day, 23, 30), 'leap day')
    else if (date.getMonth() === 11 && date.getDate() === 31) await checkDashboardDay(at(day, 23, 30), "New Year's Eve")

    if ((day + 1) % 365 === 0 || day === DAYS - 1) await yearCheckpoint(day)
    if (day % 30 === 0) console.log(`[sim] ${dayKey(date)} sales ${counters.sales ?? 0} problems ${problems.length}`)
  }
  await checkBooks('End')
}, 4 * 3600_000)

afterAll(async () => {
  vi.useRealTimers()
  mkdirSync(OUT, { recursive: true })
  const keys = years.length ? Object.keys(years[0]!).filter((k) => k !== 'year' && k !== 'date') : []
  const md = [
    `# Five-year shop simulation`,
    ``,
    `${DAYS} days from ${dayKey(START)} (Africa/Cairo), seed ${SEED}.`,
    ``,
    `## Activity`,
    '',
    ...Object.entries(counters).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Per year`,
    ``,
    `| | ${years.map((y) => `Year ${y.year} (${y.date})`).join(' | ')} |`,
    `| --- | ${years.map(() => '---').join(' | ')} |`,
    ...keys.map((k) => `| ${k} | ${years.map((y) => String(y[k] ?? '')).join(' | ')} |`),
    ``,
    `Timings are milliseconds (median of 3) on the test machine.`,
    ``,
    `## Clock changes, leap day, year end`,
    ``,
    ...dstChecks.map((l) => `- ${l}`),
    ``,
    `## Problems found (${problems.length})`,
    ``,
    ...(problems.length ? problems.map((p) => `- ${p}`) : ['- none'])
  ].join('\n')
  writeFileSync(join(OUT, 'report.md'), md)
  writeFileSync(join(OUT, 'report.json'), JSON.stringify({ days: DAYS, seed: SEED, counters, years, dstChecks, problems }, null, 2))
  console.log(md)
  if (t) {
    await t.close()
    cleanup(t)
  }
})

it('found no problems', () => {
  expect(problems).toEqual([])
})
