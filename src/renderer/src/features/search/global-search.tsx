import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import jsQR from 'jsqr'
import { Package, QrCode, Receipt, Search, Truck, Users, Wrench } from 'lucide-react'
import type { GlobalSearchResult } from '@shared/types/reports'
import type { QrResolution } from '@shared/types/printing'
import { call } from '../../lib/api'
import { errorMessage } from '../../lib/query'
import { fmtDate, fmtMoney, fmtNumber } from '../../lib/format'
import { beep } from '../../lib/scanner'
import { debounce } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Kbd } from '../../components/ui/misc'
import { Spinner } from '../../components/ui/spinner'
import { useCart } from '../pos/cart-store'

type Target = { kind: 'product'; id: string; variantId: string } | { kind: 'customer' | 'repair' | 'sale' | 'supplier'; id: string }

/** Header button that opens the search (also Ctrl+K / Ctrl+F from anywhere). */
export function SearchTrigger() {
  const { t } = useTranslation()
  return (
    <button
      onClick={() => window.dispatchEvent(new Event('central:search'))}
      className="flex h-9 w-72 max-w-full items-center gap-2 rounded-xl border border-line bg-sunken/60 px-3 text-sm text-subtle transition hover:border-primary/40 hover:text-fg"
    >
      <Search className="size-4" />
      <span className="flex-1 truncate text-start">{t('search.title')}…</span>
      <Kbd>Ctrl K</Kbd>
    </button>
  )
}

export function GlobalSearch() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const can = useCan()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [res, setRes] = useState<GlobalSearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const [camera, setCamera] = useState(false)

  useEffect(() => {
    const show = () => setOpen(true)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.code === 'KeyK')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('central:search', show)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('central:search', show)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      setQ('')
      setRes(null)
      setActive(0)
    }
  }, [open])

  const search = useMemo(
    () =>
      debounce(async (text: string) => {
        try {
          setRes(await call('search.global', { q: text }))
          setActive(0)
        } catch {
          setRes(null)
        } finally {
          setLoading(false)
        }
      }, 180),
    []
  )

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2 || text.startsWith('CP1:')) {
      search.cancel()
      setRes(null)
      setLoading(false)
      return
    }
    setLoading(true)
    search(text)
    return () => search.cancel()
  }, [q, search])

  const go = async (target: Target) => {
    setOpen(false)
    switch (target.kind) {
      case 'product': {
        const toPos = location.pathname.startsWith('/pos') || !can('view_inventory')
        if (toPos && can('create_sale')) {
          try {
            useCart.getState().add(await call('catalog.variant', { id: target.variantId }))
            navigate('/pos')
          } catch (err) {
            toast.error(errorMessage(err))
          }
        } else navigate(`/inventory/products/${target.id}`)
        return
      }
      case 'customer':
        return navigate(`/customers/${target.id}`)
      case 'repair':
        return navigate(`/repairs/${target.id}`)
      case 'sale':
        return navigate(`/sales/history?sale=${target.id}`)
      case 'supplier':
        return navigate(`/suppliers/${target.id}`)
    }
  }

  const resolveQr = async (text: string) => {
    try {
      const r: QrResolution = await call('qr.resolve', { text })
      beep(true)
      await go(r.kind === 'product' ? { kind: 'product', id: r.id, variantId: r.variantId ?? '' } : { kind: r.kind, id: r.id })
    } catch (err) {
      beep(false)
      toast.error(errorMessage(err))
    }
  }

  // Flatten into one keyboard-navigable list.
  const groups: Array<{ key: string; icon: typeof Search; items: Array<{ target: Target; title: ReactNode; meta: ReactNode }> }> = res
    ? [
        { key: 'products', icon: Package, items: res.products.map((p) => ({ target: { kind: 'product' as const, id: p.id, variantId: p.variantId }, title: p.name, meta: <>{fmtMoney(p.price)}{p.stock !== null ? ` · ${fmtNumber(p.stock)}` : ''}</> })) },
        { key: 'customers', icon: Users, items: res.customers.map((c) => ({ target: { kind: 'customer' as const, id: c.id }, title: c.name, meta: <span dir="ltr">{c.phone ?? ''}</span> })) },
        { key: 'repairs', icon: Wrench, items: res.repairs.map((r) => ({ target: { kind: 'repair' as const, id: r.id }, title: `${r.number} · ${r.deviceModel}`, meta: r.customerName })) },
        { key: 'sales', icon: Receipt, items: res.sales.map((s) => ({ target: { kind: 'sale' as const, id: s.id }, title: s.number, meta: <>{fmtMoney(s.total)} · {fmtDate(s.createdAt)}{s.customerName ? ` · ${s.customerName}` : ''}</> })) },
        { key: 'suppliers', icon: Truck, items: res.suppliers.map((s) => ({ target: { kind: 'supplier' as const, id: s.id }, title: s.name, meta: <span dir="ltr">{s.phone ?? ''}</span> })) }
      ].filter((g) => g.items.length)
    : []
  const flat = groups.flatMap((g) => g.items)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const text = q.trim()
      if (text.startsWith('CP1:')) void resolveQr(text)
      else if (flat[active]) void go(flat[active].target)
    }
  }

  let index = -1
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen} size="lg" className="top-[12vh] translate-y-0">
        <div className="-mx-5 -mt-4 flex items-center gap-2 border-b border-line px-4 py-3">
          <Search className="size-5 text-subtle" />
          <input
            autoFocus
            data-scanner-target="1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            aria-label={t('search.title')}
            className="h-10 min-w-0 flex-1 bg-transparent text-base !outline-none placeholder:text-subtle"
          />
          {loading ? <Spinner className="size-4" /> : null}
          <Button size="sm" variant="ghost" onClick={() => setCamera(true)}>
            <QrCode /> {t('search.scanQr')}
          </Button>
        </div>
        <div className="-mx-2 mt-2 min-h-24">
          {q.trim().length < 2 ? (
            <p className="py-6 text-center text-sm text-subtle">
              {t('search.empty')} · {t('search.hint')}
            </p>
          ) : res && flat.length === 0 && !loading ? (
            <p className="py-6 text-center text-sm text-subtle">{t('common.noResults')}</p>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="mb-2">
                <p className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-bold uppercase text-subtle">
                  <g.icon className="size-3.5" /> {t(`search.${g.key}`)}
                </p>
                {g.items.map((it) => {
                  index += 1
                  const i = index
                  return (
                    <button
                      key={`${g.key}-${it.target.id}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => void go(it.target)}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-start ${active === i ? 'bg-primary-soft' : ''}`}
                    >
                      <span className="truncate text-sm font-semibold">{it.title}</span>
                      <span className="shrink-0 text-xs text-muted tabular">{it.meta}</span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </Dialog>
      {camera ? (
        <QrCameraDialog
          onClose={() => setCamera(false)}
          onCode={(text) => {
            setCamera(false)
            void resolveQr(text)
          }}
        />
      ) : null}
    </>
  )
}

/** Webcam QR reader (offline, decodes frames locally with jsQR). */
export function QrCameraDialog({ onClose, onCode }: { onClose: () => void; onCode: (text: string) => void }) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  const cb = useRef(onCode)
  cb.current = onCode

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let done = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    const tick = () => {
      const v = video.current
      if (done) return
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        const w = Math.min(640, v.videoWidth)
        const h = Math.round((v.videoHeight / v.videoWidth) * w)
        canvas.width = w
        canvas.height = h
        ctx.drawImage(v, 0, 0, w, h)
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
        if (code?.data) {
          done = true
          cb.current(code.data)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
        raf = requestAnimationFrame(tick)
      })
      .catch(() => setError(true))
    return () => {
      done = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="md" title={t('search.scanQr')}>
      {error ? (
        <p className="rounded-xl bg-danger-soft p-4 text-sm font-semibold text-danger">{t('search.noCamera')}</p>
      ) : (
        <div className="relative overflow-hidden rounded-xl bg-black">
          <video ref={video} muted playsInline className="aspect-video w-full object-cover" />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/80" />
        </div>
      )}
    </Dialog>
  )
}
