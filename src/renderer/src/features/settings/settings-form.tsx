import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save } from 'lucide-react'
import { CURRENCY_DECIMALS } from '@shared/money'
import type { SettingsGroup } from '@shared/settings'
import { PAYMENT_METHODS } from '@shared/constants/enums'
import { useApiMutation, useApi } from '../../lib/query'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Field, Input, MoneyInput, NumberInput, Select, Textarea } from '../../components/ui/input'
import { Card, Checkbox, SwitchRow } from '../../components/ui/misc'

type Spec =
  | { key: string; type: 'switch'; label?: string; hint?: string; showIf?: (v: Values) => boolean }
  | { key: string; type: 'int'; min?: number; max?: number; label?: string; hint?: string; showIf?: (v: Values) => boolean }
  | { key: string; type: 'money' | 'percentBp' | 'text' | 'textarea' | 'printer'; label?: string; hint?: string; showIf?: (v: Values) => boolean }
  | { key: string; type: 'select'; options: Array<{ value: string; label: string }>; label?: string; hint?: string; showIf?: (v: Values) => boolean }
  | { key: string; type: 'paymentMethods'; label?: string; hint?: string; showIf?: (v: Values) => boolean }

type Values = Record<string, unknown>

export function useSpecs(): Partial<Record<SettingsGroup, Spec[]>> {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      company: [
        { key: 'storeName', type: 'text' },
        { key: 'phone', type: 'text' },
        { key: 'phone2', type: 'text' },
        { key: 'address', type: 'text' },
        { key: 'taxNumber', type: 'text' },
        { key: 'commercialRegister', type: 'text' },
        { key: 'currency', type: 'select', options: Object.keys(CURRENCY_DECIMALS).map((c) => ({ value: c, label: c })) },
        { key: 'currencyDecimals', type: 'int', min: 0, max: 3 }
      ],
      pos: [
        { key: 'defaultSaleMode', type: 'select', hint: 'defaultSaleModeHint', options: (['QUICK', 'INVOICE'] as const).map((m) => ({ value: m, label: t(`settings.fields.saleModes.${m}`) })) },
        { key: 'defaultPaymentMethod', type: 'select', options: PAYMENT_METHODS.map((m) => ({ value: m, label: t(`pos.methods.${m}`, { defaultValue: m }) })) },
        { key: 'enabledPaymentMethods', type: 'paymentMethods' },
        { key: 'requireShift', type: 'switch' },
        { key: 'allowNegativeStock', type: 'switch' },
        { key: 'allowCreditSales', type: 'switch' },
        { key: 'autoPrintReceipt', type: 'switch' },
        { key: 'scanSound', type: 'switch' }
      ],
      taxes: [
        { key: 'enabled', type: 'switch', label: 'taxEnabled' },
        { key: 'defaultTaxBp', type: 'percentBp', showIf: (v) => !!v.enabled },
        { key: 'pricesIncludeTax', type: 'switch', showIf: (v) => !!v.enabled },
        { key: 'taxLabel', type: 'text', showIf: (v) => !!v.enabled }
      ],
      inventory: [
        { key: 'defaultMinStock', type: 'int', min: 0, max: 1000 },
        { key: 'deadStockDays', type: 'int', min: 7, max: 720 },
        { key: 'fastMovingDays', type: 'int', min: 1, max: 90 },
        { key: 'internalBarcodePrefix', type: 'text' }
      ],
      repairs: [
        { key: 'defaultWarrantyDays', type: 'int', min: 0, max: 3650 },
        { key: 'defaultExpectedDays', type: 'int', min: 0, max: 60 },
        { key: 'requireSignature', type: 'switch' },
        { key: 'termsText', type: 'textarea' }
      ],
      printing: [
        { key: 'receiptPaper', type: 'select', options: ['58mm', '80mm', 'A4'].map((v) => ({ value: v, label: v })) },
        { key: 'receiptPrinter', type: 'printer' },
        { key: 'a4Printer', type: 'printer' },
        { key: 'labelPrinter', type: 'printer' },
        { key: 'labelWidthMm', type: 'int', min: 20, max: 100 },
        { key: 'labelHeightMm', type: 'int', min: 15, max: 80 },
        { key: 'copies', type: 'int', min: 1, max: 5 },
        { key: 'showLogo', type: 'switch' }
      ],
      invoices: [
        { key: 'footerText', type: 'textarea' },
        { key: 'showCashier', type: 'switch' },
        { key: 'showTaxNumber', type: 'switch' }
      ],
      qr: [
        { key: 'enabled', type: 'switch', label: 'qrEnabled', hint: 'qrEnabledHint' },
        { key: 'onInvoices', type: 'switch', showIf: (v) => !!v.enabled },
        { key: 'onReceipts', type: 'switch', showIf: (v) => !!v.enabled },
        { key: 'onRepairs', type: 'switch', showIf: (v) => !!v.enabled },
        { key: 'onLabels', type: 'switch', showIf: (v) => !!v.enabled }
      ],
      offers: [
        { key: 'enabled', type: 'switch', label: 'offersEnabled' },
        { key: 'maxSuggestions', type: 'int', min: 1, max: 3, showIf: (v) => !!v.enabled },
        { key: 'minMarginBp', type: 'percentBp', showIf: (v) => !!v.enabled },
        { key: 'clearanceMaxDiscountBp', type: 'percentBp', showIf: (v) => !!v.enabled },
        { key: 'useAffinity', type: 'switch', showIf: (v) => !!v.enabled }
      ],
      loyalty: [
        { key: 'enabled', type: 'switch', label: 'loyaltyEnabled' },
        { key: 'amountPerPoint', type: 'money', showIf: (v) => !!v.enabled },
        { key: 'pointValue', type: 'money', showIf: (v) => !!v.enabled },
        { key: 'minRedeemPoints', type: 'int', min: 0, max: 1000000, showIf: (v) => !!v.enabled },
        { key: 'vipThresholdPoints', type: 'int', min: 0, max: 10000000, showIf: (v) => !!v.enabled }
      ],
      security: [
        { key: 'sessionTimeoutMinutes', type: 'int', min: 0, max: 480 },
        { key: 'maxFailedAttempts', type: 'int', min: 3, max: 20 },
        { key: 'lockoutMinutes', type: 'int', min: 1, max: 120 },
        { key: 'requireApprovalForRefund', type: 'switch' }
      ],
      backup: [
        { key: 'autoEnabled', type: 'switch' },
        { key: 'intervalHours', type: 'int', min: 1, max: 168, showIf: (v) => !!v.autoEnabled },
        { key: 'keepCount', type: 'int', min: 1, max: 365 },
        { key: 'backupOnExit', type: 'switch' }
      ]
    }),
    [t]
  )
}

export function SettingsGroupForm({ group }: { group: SettingsGroup }) {
  const { t } = useTranslation()
  const specs = useSpecs()[group] ?? []
  const current = useApp((s) => s.settings?.[group]) as Values | undefined
  const refresh = useApp((s) => s.refreshSettings)
  const [values, setValues] = useState<Values>(current ?? {})
  const printers = useApi('system.printers', undefined, { enabled: specs.some((s) => s.type === 'printer') })
  useEffect(() => setValues(current ?? {}), [current])
  const save = useApiMutation('settings.update', { success: 'settings.saved', onSuccess: () => void refresh() })
  const dirty = JSON.stringify(values) !== JSON.stringify(current)
  const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }))
  const label = (s: Spec) => t(`settings.fields.${s.label ?? s.key}`)
  const hint = (s: Spec) => (s.hint ? t(`settings.fields.${s.hint}`) : undefined)

  return (
    <Card className="max-w-2xl">
      <div className="space-y-1">
        {specs
          .filter((s) => !s.showIf || s.showIf(values))
          .map((s) => {
            const v = values[s.key]
            switch (s.type) {
              case 'switch':
                return <SwitchRow key={s.key} label={label(s)} hint={hint(s)} checked={!!v} onCheckedChange={(x) => set(s.key, x)} />
              case 'int':
                return (
                  <Field key={s.key} label={label(s)} hint={hint(s)} className="py-2">
                    <NumberInput className="max-w-40" value={(v as number) ?? 0} min={s.min} max={s.max} onChange={(x) => set(s.key, x ?? s.min ?? 0)} />
                  </Field>
                )
              case 'money':
                return (
                  <Field key={s.key} label={label(s)} hint={hint(s)} className="py-2">
                    <div className="max-w-48">
                      <MoneyInput value={(v as number) ?? 0} onChange={(x) => set(s.key, x ?? 0)} />
                    </div>
                  </Field>
                )
              case 'percentBp':
                return (
                  <Field key={s.key} label={label(s)} hint={hint(s)} className="py-2">
                    <Input
                      className="max-w-32"
                      dir="ltr"
                      inputMode="decimal"
                      defaultValue={((v as number) ?? 0) / 100}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        if (Number.isFinite(n) && n >= 0 && n <= 100) set(s.key, Math.round(n * 100))
                      }}
                    />
                  </Field>
                )
              case 'text':
                return (
                  <Field key={s.key} label={label(s)} hint={hint(s)} className="py-2">
                    <Input value={(v as string) ?? ''} onChange={(e) => set(s.key, e.target.value)} />
                  </Field>
                )
              case 'textarea':
                return (
                  <Field key={s.key} label={label(s)} hint={hint(s)} className="py-2">
                    <Textarea rows={4} value={(v as string) ?? ''} onChange={(e) => set(s.key, e.target.value)} />
                  </Field>
                )
              case 'select':
                return (
                  <Field key={s.key} label={label(s)} hint={hint(s)} className="py-2">
                    <Select className="max-w-72" value={String(v ?? '')} onChange={(e) => set(s.key, e.target.value)}>
                      {s.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )
              case 'printer':
                return (
                  <Field key={s.key} label={label(s)} className="py-2">
                    <Select className="max-w-96" value={(v as string) ?? ''} onChange={(e) => set(s.key, e.target.value || null)}>
                      <option value="">{t('settings.fields.systemDefault')}</option>
                      {printers.data?.map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.displayName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )
              case 'paymentMethods': {
                const list = (v as string[]) ?? []
                return (
                  <Field key={s.key} label={label(s)} className="py-2">
                    <div className="flex flex-wrap gap-4">
                      {PAYMENT_METHODS.map((m) => (
                        <Checkbox
                          key={m}
                          checked={list.includes(m)}
                          disabled={m === 'CASH'}
                          onCheckedChange={(on) => set(s.key, on ? [...list, m] : list.filter((x) => x !== m))}
                          label={t(`pos.methods.${m}`, { defaultValue: m })}
                        />
                      ))}
                    </div>
                  </Field>
                )
              }
              default:
                return null
            }
          })}
      </div>
      <div className="mt-4 flex items-center justify-end gap-3 border-t border-line pt-4">
        {dirty ? <span className="text-xs font-semibold text-warning">{t('settings.unsaved')}</span> : null}
        <Button onClick={() => save.mutate({ group, values })} loading={save.isPending} disabled={!dirty}>
          <Save /> {t('common.save')}
        </Button>
      </div>
    </Card>
  )
}
