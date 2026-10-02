import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserPlus, UserRound } from 'lucide-react'
import type { CustomerListItem } from '@shared/types/customers'
import { call } from '../../lib/api'
import { toastError } from '../../lib/query'
import { fmtMoney } from '../../lib/format'
import { debounce } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, SearchInput } from '../../components/ui/input'
import { Badge } from '../../components/ui/misc'

/** Find a customer by phone/name or create one in two fields. */
export function CustomerPicker({ open, onOpenChange, onPick }: { open: boolean; onOpenChange: (o: boolean) => void; onPick: (c: CustomerListItem) => void }) {
  const { t } = useTranslation()
  const can = useCan()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CustomerListItem[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const run = debounce((text: string) => void call('customers.find', { q: text }).then(setResults), 150)
    run(q)
    return () => run.cancel()
  }, [q, open])

  useEffect(() => {
    if (open) {
      setQ('')
      setCreating(false)
    }
  }, [open])

  const create = async () => {
    setBusy(true)
    try {
      const c = await call('customers.save', { name, phone: phone || null, tags: [] })
      onPick({ ...c })
      onOpenChange(false)
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={creating ? t('pos.newCustomer') : t('pos.customer')} size="md">
      {creating ? (
        <div className="space-y-3">
          <Field label={t('common.name')}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('common.phone')}>
            <Input dir="ltr" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('common.back')}
            </Button>
            <Button onClick={create} loading={busy} disabled={!name.trim()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <SearchInput
                autoFocus
                value={q}
                placeholder={`${t('common.phone')} / ${t('common.name')}`}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && results[0]) {
                    onPick(results[0])
                    onOpenChange(false)
                  }
                }}
              />
            </div>
            {can('manage_customers') ? (
              <Button
                variant="soft"
                onClick={() => {
                  setCreating(true)
                  if (/^[\d+\s٠-٩]+$/.test(q)) setPhone(q)
                  else setName(q)
                }}
              >
                <UserPlus /> {t('pos.newCustomer')}
              </Button>
            ) : null}
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {results.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onPick(c)
                  onOpenChange(false)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-sunken"
              >
                <UserRound className="size-5 text-subtle" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="block text-xs text-muted" dir="ltr">
                    {c.phone ?? '—'}
                  </span>
                </span>
                {c.type !== 'REGULAR' ? <Badge tone="primary">{c.type}</Badge> : null}
                {c.balance > 0 ? <Badge tone="danger">{fmtMoney(c.balance)}</Badge> : null}
              </button>
            ))}
            {results.length === 0 ? <p className="py-6 text-center text-sm text-muted">{t('common.noResults')}</p> : null}
          </div>
        </div>
      )}
    </Dialog>
  )
}
