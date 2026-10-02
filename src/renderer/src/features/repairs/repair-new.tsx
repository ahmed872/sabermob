import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Save, ShieldCheck, X } from 'lucide-react'
import { REPAIR_ACCESSORIES, type PaymentMethod } from '@shared/constants/enums'
import type { WarrantyMatch } from '@shared/types/repairs'
import type { CustomerListItem } from '@shared/types/customers'
import { call } from '../../lib/api'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate } from '../../lib/format'
import { debounce } from '../../lib/utils'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Field, Input, MoneyInput, Select, Textarea } from '../../components/ui/input'
import { Card, CardHeader, Checkbox } from '../../components/ui/misc'
import { PhotoCapture } from '../../components/photo-capture'
import { SignaturePad } from '../../components/signature-pad'

export default function RepairNewPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const settings = useApp((s) => s.settings)!
  const brands = useApi('catalog.brands')
  const techs = useApi('repairs.technicians')
  const services = useApi('catalog.list', { type: 'SERVICE', page: 1, pageSize: 100 })
  const [f, setF] = useState({
    customerId: null as string | null,
    customerName: '',
    customerPhone: '',
    deviceBrand: '',
    deviceModel: '',
    imei: '',
    deviceColor: '',
    deviceCondition: '',
    passcode: '',
    complaint: '',
    serviceVariantId: '',
    technicianId: '',
    estimatedPrice: 0,
    deposit: 0,
    depositMethod: 'CASH' as PaymentMethod,
    expectedAt: new Date(Date.now() + settings.repairs.defaultExpectedDays * 86_400_000).toISOString().slice(0, 10),
    accessories: [] as string[],
    parentRepairId: null as string | null
  })
  const [photos, setPhotos] = useState<Array<{ kind: 'BEFORE' | 'DAMAGE'; dataUrl: string }>>([])
  const [signature, setSignature] = useState<string | null>(null)
  const [found, setFound] = useState<CustomerListItem | null>(null)
  const [warranty, setWarranty] = useState<WarrantyMatch[]>([])
  const models = useApi('catalog.models', { brandId: brands.data?.find((b) => b.name === f.deviceBrand)?.id }, { enabled: !!brands.data?.some((b) => b.name === f.deviceBrand) })
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))

  // Look up the customer by phone as it is typed.
  useEffect(() => {
    const run = debounce(async (phone: string) => {
      if (phone.replace(/\D/g, '').length < 7) return setFound(null)
      const res = await call('customers.find', { q: phone })
      setFound(res[0] ?? null)
    }, 300)
    run(f.customerPhone)
    return () => run.cancel()
  }, [f.customerPhone])

  // Warranty: same IMEI, or same phone + model, still under warranty.
  useEffect(() => {
    const run = debounce(async () => {
      if (!f.imei && !(f.customerPhone && f.deviceModel)) return setWarranty([])
      setWarranty(await call('repairs.checkWarranty', { imei: f.imei || null, phone: f.customerPhone || null, model: f.deviceModel || null }))
    }, 400)
    run()
    return () => run.cancel()
  }, [f.imei, f.customerPhone, f.deviceModel])

  const create = useApiMutation('repairs.create', { invalidate: ['repairs.', 'customers.', 'shifts.'], success: 'repairs.created', onSuccess: (r) => navigate(`/repairs/${r.id}`, { replace: true }) })
  const valid = f.customerName.trim() && f.customerPhone.trim().length >= 3 && f.deviceModel.trim() && f.complaint.trim() && (!settings.repairs.requireSignature || signature)

  const submit = () =>
    create.mutate({
      customerId: f.customerId,
      customerName: f.customerName,
      customerPhone: f.customerPhone,
      deviceBrand: f.deviceBrand || null,
      deviceModel: f.deviceModel,
      imei: f.imei || null,
      deviceColor: f.deviceColor || null,
      deviceCondition: f.deviceCondition || null,
      passcode: f.passcode || null,
      complaint: f.complaint,
      accessories: f.accessories as never,
      serviceVariantId: f.serviceVariantId || null,
      technicianId: f.technicianId || null,
      estimatedPrice: f.estimatedPrice,
      expectedAt: f.expectedAt ? new Date(f.expectedAt).toISOString() : null,
      parentRepairId: f.parentRepairId,
      deposit: f.deposit > 0 ? { amount: f.deposit, method: f.depositMethod } : null,
      signature,
      photos
    })

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/repairs')}>
            <ArrowLeft className="rtl:rotate-180" />
          </Button>
          <h1 className="text-lg font-extrabold">{t('repairs.newTicket')}</h1>
        </div>
        <Button onClick={submit} loading={create.isPending} disabled={!valid}>
          <Save /> {t('common.save')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title={t('repairs.step.customer')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('common.phone')}>
                <Input autoFocus dir="ltr" inputMode="tel" value={f.customerPhone} onChange={(e) => set({ customerPhone: e.target.value, customerId: null })} />
              </Field>
              <Field label={t('common.name')}>
                <Input value={f.customerName} onChange={(e) => set({ customerName: e.target.value })} />
              </Field>
            </div>
            {found && f.customerId !== found.id ? (
              <button className="mt-2 w-full rounded-xl bg-info-soft px-3 py-2 text-start text-sm text-info" onClick={() => set({ customerId: found.id, customerName: found.name, customerPhone: found.phone ?? f.customerPhone })}>
                ✓ {found.name} — {found.phone}
              </button>
            ) : null}
            {warranty.length ? (
              <div className="mt-3 rounded-xl border border-info/40 bg-info-soft p-3 text-sm">
                <p className="flex items-center gap-1.5 font-bold text-info">
                  <ShieldCheck className="size-4" /> {t('repairs.warrantyFound')}
                </p>
                {warranty.map((w) => (
                  <div key={w.repairId} className="mt-2 flex items-center justify-between gap-2">
                    <span>
                      {w.number} · {w.deviceModel} · {t('repairs.warrantyUntil', { date: fmtDate(w.warrantyUntil) })}
                    </span>
                    {f.parentRepairId === w.repairId ? (
                      <Button size="xs" variant="ghost" onClick={() => set({ parentRepairId: null })}>
                        <X />
                      </Button>
                    ) : (
                      <Button size="xs" onClick={() => set({ parentRepairId: w.repairId, estimatedPrice: 0 })}>
                        {t('repairs.useWarranty')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title={t('repairs.step.device')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('repairs.brand')}>
                <Input list="cp-brands" value={f.deviceBrand} onChange={(e) => set({ deviceBrand: e.target.value })} />
                <datalist id="cp-brands">{brands.data?.map((b) => <option key={b.id} value={b.name} />)}</datalist>
              </Field>
              <Field label={t('repairs.model')}>
                <Input list="cp-models" value={f.deviceModel} onChange={(e) => set({ deviceModel: e.target.value })} />
                <datalist id="cp-models">{models.data?.map((m) => <option key={m.id} value={m.name} />)}</datalist>
              </Field>
              <Field label={t('repairs.imei')} optional>
                <Input dir="ltr" className="font-mono" value={f.imei} onChange={(e) => set({ imei: e.target.value.replace(/\s/g, '') })} />
              </Field>
              <Field label={t('repairs.color')} optional>
                <Input value={f.deviceColor} onChange={(e) => set({ deviceColor: e.target.value })} />
              </Field>
              <Field label={t('repairs.passcode')} optional>
                <Input dir="ltr" value={f.passcode} onChange={(e) => set({ passcode: e.target.value })} autoComplete="off" />
              </Field>
              <Field label={t('repairs.condition')} hint={t('repairs.conditionHint')} optional>
                <Input value={f.deviceCondition} onChange={(e) => set({ deviceCondition: e.target.value })} />
              </Field>
            </div>
            <p className="mb-2 mt-3 text-[13px] font-semibold">{t('repairs.accessories')}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {REPAIR_ACCESSORIES.map((a) => (
                <Checkbox
                  key={a}
                  checked={f.accessories.includes(a)}
                  onCheckedChange={(on) => set({ accessories: on ? [...f.accessories, a] : f.accessories.filter((x) => x !== a) })}
                  label={t(`repairs.accessoriesList.${a}`)}
                />
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('repairs.step.problem')} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('repairs.complaint')} className="sm:col-span-2">
                <Textarea rows={3} value={f.complaint} onChange={(e) => set({ complaint: e.target.value })} />
              </Field>
              <Field label={t('repairs.repairType')} optional>
                <Select
                  value={f.serviceVariantId}
                  onChange={(e) => {
                    const svc = services.data?.items.find((s) => s.variantId === e.target.value)
                    set({ serviceVariantId: e.target.value, estimatedPrice: svc && svc.sellPrice > 0 ? svc.sellPrice : f.estimatedPrice, complaint: f.complaint || svc?.name || '' })
                  }}
                >
                  <option value="">—</option>
                  {services.data?.items.map((s) => (
                    <option key={s.variantId} value={s.variantId}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('repairs.technician')} optional>
                <Select value={f.technicianId} onChange={(e) => set({ technicianId: e.target.value })}>
                  <option value="">{t('repairs.unassigned')}</option>
                  {techs.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('repairs.estimatedPrice')}>
                <MoneyInput value={f.estimatedPrice} onChange={(v) => set({ estimatedPrice: v ?? 0 })} />
              </Field>
              <Field label={t('repairs.expectedAt')}>
                <Input type="date" value={f.expectedAt} onChange={(e) => set({ expectedAt: e.target.value })} />
              </Field>
              <Field label={t('repairs.deposit')} optional>
                <MoneyInput value={f.deposit} onChange={(v) => set({ deposit: v ?? 0 })} />
              </Field>
              {f.deposit > 0 ? (
                <Field label={t('pos.payment')}>
                  <Select value={f.depositMethod} onChange={(e) => set({ depositMethod: e.target.value as PaymentMethod })}>
                    {(['CASH', 'CARD', 'WALLET', 'TRANSFER'] as const).map((m) => (
                      <option key={m} value={m}>
                        {t(`pos.methods.${m}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </Card>

          <Card>
            <CardHeader title={t('repairs.photos')} action={<PhotoCapture onPhoto={(d) => setPhotos((p) => [...p, { kind: 'BEFORE', dataUrl: d }])} />} />
            {photos.length ? (
              <div className="mb-4 grid grid-cols-4 gap-2">
                {photos.map((p, i) => (
                  <div key={i} className="group relative">
                    <img src={p.dataUrl} className="aspect-square w-full rounded-lg object-cover" alt="" />
                    <button className="absolute end-1 top-1 rounded-full bg-black/60 p-1 text-white" onClick={() => setPhotos((ps) => ps.filter((_, k) => k !== i))}>
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="mb-2 text-[13px] font-semibold">
              {t('repairs.signature')} {settings.repairs.requireSignature ? '' : <span className="font-normal text-subtle">({t('common.optional')})</span>}
            </p>
            <SignaturePad onChange={setSignature} />
          </Card>
        </div>
      </div>
    </div>
  )
}
