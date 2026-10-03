import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import JsBarcode from 'jsbarcode'
import { formatMoney } from '@shared/money'
import type { PrintDocument, PrintStore } from '@shared/types/printing'
import type { SaleDto } from '@shared/types/sales'

/*
 * Printable documents. Pure presentational components with inline-friendly
 * styles (black on white, no theme variables) so they look identical in the
 * on-screen preview, in PDFs and on thermal printers.
 */

function useFmt(store: PrintStore) {
  const locale = store.language === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US'
  return {
    money: (v: number | null | undefined) =>
      v === null || v === undefined ? '—' : formatMoney(v, { currency: store.currency, decimals: store.currencyDecimals, locale, compact: false }),
    date: (iso: string, time = true) =>
      new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(iso))
  }
}

export function PrintDocumentView({ doc }: { doc: PrintDocument }) {
  switch (doc.type) {
    case 'receipt':
      return <Receipt doc={doc} />
    case 'invoice':
      return <Invoice doc={doc} />
    case 'repairTicket':
      return <RepairTicket doc={doc} />
    case 'shiftReport':
      return <ShiftReport doc={doc} />
    case 'labels':
      return <Labels doc={doc} />
    case 'test':
      return <TestPage doc={doc} />
    case 'table':
      return <TablePage doc={doc} />
  }
}

function TablePage({ doc }: { doc: Extract<PrintDocument, { type: 'table' }> }) {
  const f = useFmt(doc.store)
  const cell = (type: string | undefined, v: string | number | null | undefined) =>
    v === null || v === undefined ? '—' : type === 'money' && typeof v === 'number' ? f.money(v) : type === 'date' && typeof v === 'string' ? f.date(v, false) : String(v)
  return (
    <div className="w-[794px] bg-white p-8 text-[11px] text-black">
      <div className="mb-4 flex items-end justify-between border-b-2 border-black pb-2">
        <div>
          <p className="text-lg font-extrabold">{doc.table.title}</p>
          {doc.table.subtitle ? <p>{doc.table.subtitle}</p> : null}
        </div>
        <div className="text-end">
          <p className="font-bold">{doc.store.name}</p>
          <p>{f.date(doc.generatedAt)}</p>
        </div>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-black text-white">
            {doc.table.columns.map((c) => (
              <th key={c.key} className={`p-1.5 ${c.type === 'money' || c.type === 'number' ? 'text-end' : 'text-start'}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {doc.table.rows.map((r, i) => (
            <tr key={i} className="border-b border-black/20 even:bg-black/[0.03]" style={{ breakInside: 'avoid' }}>
              {doc.table.columns.map((c) => (
                <td key={c.key} className={`p-1.5 ${c.type === 'money' || c.type === 'number' ? 'text-end tabular' : ''}`}>
                  {cell(c.type, r[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const thermal = (paper: string) => (paper === '58mm' ? 'w-[219px] text-[11px]' : paper === '80mm' ? 'w-[302px] text-[12px]' : 'w-[794px] text-[13px] p-8')

function Header({ store, compact }: { store: PrintStore; compact?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="text-center">
      {store.logo ? <img src={store.logo} alt="" className={compact ? 'mx-auto mb-1 max-h-14' : 'mx-auto mb-2 max-h-20'} /> : null}
      <p className={compact ? 'text-[15px] font-extrabold' : 'text-xl font-extrabold'}>{store.name}</p>
      {store.address ? <p>{store.address}</p> : null}
      {store.phone || store.phone2 ? (
        <p dir="ltr">
          {t('print.phone')}: {[store.phone, store.phone2].filter(Boolean).join(' / ')}
        </p>
      ) : null}
      {store.showTaxNumber && store.taxNumber ? (
        <p>
          {t('print.taxNo')}: {store.taxNumber}
          {store.commercialRegister ? ` · ${t('print.cr')}: ${store.commercialRegister}` : ''}
        </p>
      ) : null}
    </div>
  )
}

const Dash = () => <div className="my-1.5 border-t border-dashed border-black" />

function KV({ k, v, bold, big }: { k: ReactNode; v: ReactNode; bold?: boolean; big?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? 'font-bold' : ''} ${big ? 'text-[1.35em] font-extrabold' : ''}`}>
      <span>{k}</span>
      <span className="tabular">{v}</span>
    </div>
  )
}

function SaleTotals({ sale, store }: { sale: SaleDto; store: PrintStore }) {
  const { t } = useTranslation()
  const f = useFmt(store)
  const cash = sale.payments.filter((p) => p.kind === 'SALE')
  return (
    <>
      {sale.discountTotal > 0 ? (
        <>
          <KV k={t('print.subtotal')} v={f.money(sale.subtotal)} />
          <KV k={t('print.discount')} v={`- ${f.money(sale.discountTotal)}`} />
        </>
      ) : null}
      {sale.taxTotal > 0 ? <KV k={`${store.taxLabel}${sale.pricesIncludeTax ? ' (incl.)' : ''}`} v={f.money(sale.taxTotal)} /> : null}
      <KV k={t('print.grandTotal')} v={f.money(sale.total)} big />
      {cash.map((p) => (
        <KV key={p.id} k={t(`pos.methods.${p.method}`, { defaultValue: p.method })} v={f.money(p.amount)} />
      ))}
      {sale.changeDue > 0 ? <KV k={t('print.change')} v={f.money(sale.changeDue)} /> : null}
      {sale.creditAmount > 0 ? <KV k={t('print.credit')} v={f.money(sale.creditAmount)} bold /> : null}
      {sale.refundedTotal > 0 ? <KV k={t('print.refunded')} v={`- ${f.money(sale.refundedTotal)}`} /> : null}
    </>
  )
}

function Receipt({ doc, formal }: { doc: Extract<PrintDocument, { type: 'receipt' }>; formal?: boolean }) {
  const { t } = useTranslation()
  const { sale, store } = doc
  const f = useFmt(store)
  return (
    <div className={`${thermal(doc.paper)} bg-white px-1.5 py-2 leading-snug text-black`}>
      <Header store={store} compact />
      <Dash />
      {doc.reprint ? <p className="text-center font-extrabold">*** {t('print.reprint')} ***</p> : null}
      {sale.status === 'VOIDED' ? <p className="text-center font-extrabold">*** {t('print.voided')} ***</p> : null}
      {formal ? <p className="text-center text-[1.15em] font-extrabold">{sale.taxTotal > 0 ? t('print.taxInvoice') : t('print.invoice')}</p> : null}
      <KV k={sale.invoiceNumber ? t('print.invoice') : t('print.receipt')} v={<span dir="ltr">{sale.invoiceNumber ?? sale.number}</span>} bold />
      <KV k={t('print.date')} v={f.date(sale.createdAt)} />
      {store.showCashier ? <KV k={t('print.cashier')} v={<bdi>{sale.cashierName}</bdi>} /> : null}
      {sale.customer ? <KV k={t('print.customer')} v={<bdi>{sale.customer.name}</bdi>} /> : null}
      {formal && sale.customer?.phone ? <KV k={t('print.phone')} v={<span dir="ltr">{sale.customer.phone}</span>} /> : null}
      <Dash />
      {sale.items.map((i) => (
        <div key={i.id} className="mb-1">
          <p className="font-semibold" dir="auto">{i.name}</p>
          <div className="flex justify-between">
            <span className="tabular" dir="ltr">
              {i.qty} × {f.money(i.unitPrice)}
            </span>
            <span className="font-bold tabular">{f.money(i.total)}</span>
          </div>
          {i.discount > 0 ? <p className="text-[0.9em]">{t('print.discount')}: -{f.money(i.discount)}</p> : null}
          {i.serial ? <p className="text-[0.9em]" dir="ltr">IMEI: {i.serial}</p> : null}
          {i.warrantyDays ? <p className="text-[0.9em]">{t('print.warranty', { days: i.warrantyDays })}</p> : null}
        </div>
      ))}
      <Dash />
      <SaleTotals sale={sale} store={store} />
      {sale.loyaltyEarned > 0 ? <p className="mt-1 text-center">{t('print.points', { count: sale.loyaltyEarned })}</p> : null}
      {doc.qr ? <img src={doc.qr} alt="" className="mx-auto mt-2 w-28" /> : null}
      <Dash />
      <p className="whitespace-pre-line text-center">{store.footer || t('print.thanks')}</p>
    </div>
  )
}

function Invoice({ doc }: { doc: Extract<PrintDocument, { type: 'invoice' }> }) {
  const { t } = useTranslation()
  const { sale, store } = doc
  const f = useFmt(store)
  // Small shops print formal invoices on the same thermal roll as receipts.
  if (doc.paper !== 'A4') return <Receipt doc={{ ...doc, type: 'receipt' }} formal />
  return (
    <div className="min-h-[1100px] w-[794px] bg-white p-10 text-[13px] leading-relaxed text-black">
      <div className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div className="text-start">
          {store.logo ? <img src={store.logo} alt="" className="mb-2 max-h-20" /> : null}
          <p className="text-2xl font-extrabold">{store.name}</p>
          <p>{store.address}</p>
          <p dir="ltr" className="text-start">{[store.phone, store.phone2].filter(Boolean).join(' / ')}</p>
          {store.taxNumber ? <p>{t('print.taxNo')}: {store.taxNumber}</p> : null}
          {store.commercialRegister ? <p>{t('print.cr')}: {store.commercialRegister}</p> : null}
        </div>
        <div className="text-end">
          <p className="text-3xl font-black">{sale.taxTotal > 0 ? t('print.taxInvoice') : t('print.invoice')}</p>
          {doc.reprint ? <p className="font-bold">({t('print.reprint')})</p> : null}
          {sale.status === 'VOIDED' ? <p className="font-bold">*** {t('print.voided')} ***</p> : null}
          <p className="mt-2">
            {t('print.number')}: <b dir="ltr">{sale.invoiceNumber ?? sale.number}</b>
          </p>
          <p>
            {t('print.date')}: {f.date(sale.createdAt)}
          </p>
          {store.showCashier ? <p>{t('print.cashier')}: <bdi>{sale.cashierName}</bdi></p> : null}
          {doc.qr ? <img src={doc.qr} alt="" className="ms-auto mt-2 w-24" /> : null}
        </div>
      </div>
      {sale.customer ? (
        <div className="mt-4 rounded border border-black/40 p-3">
          <p className="font-bold">{t('print.customer')}</p>
          <p dir="auto">{sale.customer.name}</p>
          {sale.customer.phone ? <p dir="ltr" className="text-start">{sale.customer.phone}</p> : null}
        </div>
      ) : null}
      <table className="mt-5 w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-black text-white">
            <th className="p-2 text-start">#</th>
            <th className="p-2 text-start">{t('print.item')}</th>
            <th className="p-2 text-center">{t('print.qty')}</th>
            <th className="p-2 text-end">{t('print.price')}</th>
            <th className="p-2 text-end">{t('print.discount')}</th>
            {sale.taxTotal > 0 ? <th className="p-2 text-end">{store.taxLabel}</th> : null}
            <th className="p-2 text-end">{t('print.total')}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((i, k) => (
            <tr key={i.id} className="border-b border-black/30">
              <td className="p-2">{k + 1}</td>
              <td className="p-2">
                <bdi>{i.name}</bdi>
                {i.serial ? <span className="block text-[11px]" dir="ltr">IMEI {i.serial}</span> : null}
              </td>
              <td className="p-2 text-center tabular">{i.qty}</td>
              <td className="p-2 text-end tabular">{f.money(i.unitPrice)}</td>
              <td className="p-2 text-end tabular">{i.discount ? f.money(i.discount) : '—'}</td>
              {sale.taxTotal > 0 ? <td className="p-2 text-end tabular">{f.money(i.tax)}</td> : null}
              <td className="p-2 text-end font-bold tabular">{f.money(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ms-auto mt-4 w-72 space-y-1">
        <SaleTotals sale={sale} store={store} />
      </div>
      <div className="mt-16 flex justify-between">
        <p className="w-56 border-t border-black pt-1 text-center">{t('print.customerSignature')}</p>
        <p className="w-56 border-t border-black pt-1 text-center">{store.name}</p>
      </div>
      <p className="mt-8 whitespace-pre-line text-center">{store.footer || t('print.thanks')}</p>
    </div>
  )
}

function RepairTicket({ doc }: { doc: Extract<PrintDocument, { type: 'repairTicket' }> }) {
  const { t } = useTranslation()
  const { repair: r, store } = doc
  const f = useFmt(store)
  return (
    <div className={`${thermal(doc.paper)} bg-white px-1.5 py-2 leading-snug text-black`}>
      <Header store={store} compact={doc.paper !== 'A4'} />
      <Dash />
      <p className="text-center font-bold">{t('print.repairTicket')}</p>
      <p className="text-center text-[1.8em] font-black" dir="ltr">
        {r.number}
      </p>
      {doc.qr ? <img src={doc.qr} alt="" className="mx-auto w-28" /> : null}
      <Dash />
      <KV k={t('print.date')} v={f.date(r.receivedAt)} />
      <KV k={t('print.customer')} v={<bdi>{r.customerName}</bdi>} />
      <KV k={t('print.phone')} v={<span dir="ltr">{r.customerPhone}</span>} />
      <KV k={t('print.device')} v={[r.deviceBrand, r.deviceModel].filter(Boolean).join(' ')} />
      {r.imei ? <KV k={t('print.imei')} v={<span dir="ltr">{r.imei}</span>} /> : null}
      <p className="mt-1 font-semibold">{t('print.complaint')}:</p>
      <p>{r.complaint}</p>
      {r.accessories.length ? <KV k={t('print.accessories')} v={r.accessories.map((a) => t(`repairs.accessoriesList.${a}`)).join('، ')} /> : null}
      <Dash />
      <KV k={t('print.estimate')} v={f.money(r.estimatedPrice)} />
      {r.paidTotal > 0 ? <KV k={t('print.deposit')} v={f.money(r.paidTotal)} bold /> : null}
      {r.expectedAt ? <KV k={t('print.expected')} v={f.date(r.expectedAt, false)} /> : null}
      {r.statusKey === 'DELIVERED' ? (
        <>
          <KV k={t('print.total')} v={f.money(r.finalPrice)} bold />
          {r.warrantyUntil ? <KV k={t('print.warranty', { days: r.warrantyDays })} v={f.date(r.warrantyUntil, false)} /> : null}
        </>
      ) : null}
      {doc.terms ? (
        <>
          <Dash />
          <p className="text-[0.85em] font-semibold">{t('print.terms')}</p>
          <p className="whitespace-pre-line text-[0.85em]">{doc.terms}</p>
        </>
      ) : null}
      <Dash />
      {r.receiveSignature ? <img src={r.receiveSignature} alt="" className="mx-auto h-14" /> : <div className="h-10" />}
      <p className="text-center">{t('print.customerSignature')}</p>
      <p className="mt-2 text-center text-[0.9em]">{t('print.keepTicket')}</p>
    </div>
  )
}

function ShiftReport({ doc }: { doc: Extract<PrintDocument, { type: 'shiftReport' }> }) {
  const { t } = useTranslation()
  const { shift: s, store } = doc
  const f = useFmt(store)
  return (
    <div className={`${thermal(doc.paper)} bg-white px-1.5 py-2 leading-snug text-black`}>
      <Header store={store} compact />
      <Dash />
      <p className="text-center font-bold">
        {t('print.shiftReport')} · {s.number}
      </p>
      <KV k={t('print.opened')} v={`${f.date(s.openedAt)} · ${s.openedBy}`} />
      {s.closedAt ? <KV k={t('print.closed')} v={`${f.date(s.closedAt)} · ${s.closedBy ?? ''}`} /> : null}
      <Dash />
      <KV k={t('pos.openingCash')} v={f.money(s.openingCash)} />
      <KV k={`${t('pos.salesTotal')} (${s.salesCount})`} v={f.money(s.salesTotal)} />
      <KV k={t('pos.refundsTotal')} v={f.money(-s.refundsTotal)} />
      {Object.entries(s.byMethod).map(([m, v]) => (
        <KV key={m} k={t(`pos.methods.${m}`, { defaultValue: m })} v={f.money(v)} />
      ))}
      <KV k={t('pos.cashIn')} v={f.money(s.cashIn)} />
      <KV k={t('pos.cashOut')} v={f.money(-s.cashOut)} />
      <KV k={t('pos.supplierPayments')} v={f.money(-s.supplierPayments)} />
      <Dash />
      <KV k={t('print.expected2')} v={f.money(s.expectedCash)} bold />
      {s.countedCash !== null ? (
        <>
          <KV k={t('print.counted')} v={f.money(s.countedCash)} />
          <KV k={t('print.difference')} v={f.money(s.difference)} bold />
        </>
      ) : null}
    </div>
  )
}

function Barcode({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const ean = /^\d{13}$/.test(value)
    try {
      JsBarcode(ref.current, value, { format: ean ? 'EAN13' : 'CODE128', height, width: 1.4, fontSize: 10, margin: 0, displayValue: true })
    } catch {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width: 1.4, fontSize: 10, margin: 0 })
    }
  }, [value, height])
  return <svg ref={ref} className="mx-auto max-w-full" />
}

function Labels({ doc }: { doc: Extract<PrintDocument, { type: 'labels' }> }) {
  const f = useFmt(doc.store)
  const w = (doc.widthMm * 96) / 25.4
  const h = (doc.heightMm * 96) / 25.4
  return (
    <div className="bg-white text-black">
      {doc.labels.map((l, i) => (
        <div key={i} style={{ width: w, height: h, pageBreakAfter: 'always', breakAfter: 'page' }} className="flex flex-col items-center justify-center overflow-hidden px-1 text-center">
          <p className="line-clamp-1 w-full text-[10px] font-bold leading-tight" dir="auto">{l.name}</p>
          <p className="text-[12px] font-black">{f.money(l.price)}</p>
          {l.barcode ? <Barcode value={l.barcode} height={Math.max(18, h * 0.38)} /> : l.qr ? <img src={l.qr} alt="" style={{ height: h * 0.5 }} /> : null}
        </div>
      ))}
    </div>
  )
}

function TestPage({ doc }: { doc: Extract<PrintDocument, { type: 'test' }> }) {
  const { t } = useTranslation()
  return (
    <div className={`${thermal(doc.paper)} bg-white px-1.5 py-2 text-black`}>
      <Header store={doc.store} compact={doc.paper !== 'A4'} />
      <Dash />
      <p className="text-center text-lg font-extrabold">{t('print.testTitle')}</p>
      <p className="text-center">{t('print.testBody')}</p>
      <p className="text-center" dir="ltr">
        Central Pro — 0123456789 — {new Date().toLocaleString()}
      </p>
      <Barcode value="2000000000015" height={40} />
    </div>
  )
}
