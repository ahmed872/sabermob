import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CUSTOMER_TYPES } from '@shared/constants/enums'
import type { CustomerDto } from '@shared/types/customers'
import { ApiError } from '../../lib/api'
import { useApiMutation } from '../../lib/query'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, MoneyInput, Select, Textarea } from '../../components/ui/input'

export function CustomerFormDialog({ value, onClose, onSaved }: { value: Partial<CustomerDto>; onClose: () => void; onSaved?: (c: CustomerDto) => void }) {
  const { t } = useTranslation()
  const [f, setF] = useState({
    name: value.name ?? '',
    phone: value.phone ?? '',
    phone2: value.phone2 ?? '',
    address: value.address ?? '',
    notes: value.notes ?? '',
    type: (value.type ?? 'REGULAR') as (typeof CUSTOMER_TYPES)[number],
    creditLimit: value.creditLimit ?? null,
    tags: (value.tags ?? []).join(', '),
    openingBalance: 0
  })
  const [dupe, setDupe] = useState<string | null>(null)
  const save = useApiMutation('customers.save', {
    invalidate: ['customers.'],
    success: 'customers.saved',
    silentError: true,
    onSuccess: (c) => {
      onSaved?.(c)
      onClose()
    }
  })
  const submit = () =>
    save.mutate(
      {
        id: value.id,
        name: f.name,
        phone: f.phone || null,
        phone2: f.phone2 || null,
        address: f.address || null,
        notes: f.notes || null,
        type: f.type,
        creditLimit: f.creditLimit,
        tags: f.tags.split(/[,،]/).map((s) => s.trim()).filter(Boolean),
        openingBalance: value.id ? undefined : f.openingBalance || undefined
      },
      {
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'DUPLICATE' && err.details?.name) setDupe(String(err.details.name))
          else setDupe(null)
        }
      }
    )
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={value.id ? t('customers.editCustomer') : t('customers.newCustomer')}
      footer={
        <Button onClick={submit} loading={save.isPending} disabled={!f.name.trim()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.name')} className="sm:col-span-2">
          <Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('common.phone')} error={dupe ? t('customers.duplicatePhone', { name: dupe }) : null}>
          <Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label={`${t('common.phone')} 2`} optional>
          <Input dir="ltr" inputMode="tel" value={f.phone2} onChange={(e) => setF({ ...f, phone2: e.target.value })} />
        </Field>
        <Field label={t('customers.type')}>
          <Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
            {CUSTOMER_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`customers.types.${ty}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('customers.creditLimit')} hint={t('customers.creditLimitHint')} optional>
          <MoneyInput allowEmpty value={f.creditLimit} onChange={(v) => setF({ ...f, creditLimit: v })} />
        </Field>
        <Field label={t('common.address')} optional className="sm:col-span-2">
          <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        </Field>
        <Field label={t('customers.tags')} hint={t('customers.tagsHint')} optional>
          <Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
        </Field>
        {!value.id ? (
          <Field label={t('customers.openingBalance')} optional>
            <MoneyInput value={f.openingBalance} onChange={(v) => setF({ ...f, openingBalance: v ?? 0 })} />
          </Field>
        ) : null}
        <Field label={t('common.notes')} optional className="sm:col-span-2">
          <Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Dialog>
  )
}
