import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Ban, Eye, HandCoins, PackageMinus, PackagePlus, Save, ShieldCheck, Trash2, Truck, X, ChevronDown } from 'lucide-react'
import type { RepairDto, RepairStatusDto } from '@shared/types/repairs'
import type { PaymentMethod } from '@shared/constants/enums'
import { call } from '../../lib/api'
import { invalidate, toastError, useApi, useApiMutation } from '../../lib/query'
import { fmtDate, fmtMoney } from '../../lib/format'
import { useCan } from '../../stores/app'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Dropdown } from '../../components/ui/dropdown'
import { Field, Input, MoneyInput, NumberInput, Select, Textarea } from '../../components/ui/input'
import { Badge, Card, CardHeader, Checkbox } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { ProductPicker } from '../../components/product-picker'
import { PhotoCapture } from '../../components/photo-capture'
import { SignaturePad } from '../../components/signature-pad'
import { StatusBadge, statusLabel } from './repairs-page'
import { RepairDetailExtras } from './repair-detail-extras'

export default function RepairDetailPage() {
  const { id = '' } = useParams()
  const q = useApi('repairs.get', { id })
  const statuses = useApi('repairs.statuses')
  if (!q.data || !statuses.data) return <PageLoader />
  return <RepairDetail key={q.data.id + q.data.statusId} r={q.data} statuses={statuses.data} />
}

function RepairDetail({ r, statuses }: { r: RepairDto; statuses: RepairStatusDto[] }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const can = useCan()
  const confirm = useConfirm()
  const edit = can('manage_repairs')
  const closed = r.statusKey === 'DELIVERED' || r.statusKey === 'CANCELLED'
  const byId = new Map(statuses.map((s) => [s.id, s]))
  const [form, setForm] = useState({ diagnosis: r.diagnosis ?? '', notes: r.notes ?? '', laborPrice: r.laborPrice, technicianId: r.technicianId ?? '', warrantyDays: r.warrantyDays, expectedAt: r.expectedAt?.slice(0, 10) ?? '' })
  const [passcode, setPasscode] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'deliver' | 'cancel' | 'payment' | 'part' | null>(null)
  const techs = useApi('repairs.technicians')
  const after = { invalidate: ['repairs.', 'catalog.', 'inventory.', 'shifts.', 'customers.'] }
  const update = useApiMutation('repairs.update', { ...after, success: 'repairs.saved' })
  const setStatus = useApiMutation('repairs.setStatus', after)
  const removePart = useApiMutation('repairs.removePart', after)
  const addPhoto = useApiMutation('repairs.addPhoto', after)
  const removePhoto = useApiMutation('repairs.removePhoto', after)
  const del = useApiMutation('repairs.delete', { ...after, success: 'repairs.deletedTicket', onSuccess: () => navigate('/repairs') })
  const dirty =
    form.diagnosis !== (r.diagnosis ?? '') ||
    form.notes !== (r.notes ?? '') ||
    form.laborPrice !== r.laborPrice ||
    form.technicianId !== (r.technicianId ?? '') ||
    form.warrantyDays !== r.warrantyDays ||
    form.expectedAt !== (r.expectedAt?.slice(0, 10) ?? '')

  const save = () =>
    update.mutate({
      id: r.id,
      diagnosis: form.diagnosis || null,
      notes: form.notes || null,
      ...(closed ? {} : { laborPrice: form.laborPrice }),
      technicianId: form.technicianId || null,
      warrantyDays: form.warrantyDays,
      expectedAt: form.expectedAt ? new Date(form.expectedAt).toISOString() : null
    })

  // "Not collected" is final (off the board) but can still be reopened or delivered.
  const moveTargets = statuses.filter((s) => s.isActive && (!s.isFinal || s.key === 'UNCLAIMED') && s.id !== r.statusId)

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate('/repairs')}>
            <ArrowLeft className="rtl:rotate-180" />
          </Button>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
              <span dir="ltr">{r.number}</span> <StatusBadge status={byId.get(r.statusId)} />
              {r.overdue ? <Badge tone="danger">{t('repairs.overdue')}</Badge> : null}
              {r.isWarrantyClaim ? <Badge tone="info"><ShieldCheck className="size-3" /> {t('repairs.warrantyClaim')} {r.parentRepairNumber}</Badge> : null}
            </h1>
            <p className="truncate text-sm text-muted">
              {[r.deviceBrand, r.deviceModel].filter(Boolean).join(' ')} · {r.customerName} · <span dir="ltr">{r.customerPhone}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <RepairDetailExtras repair={r} />
          {edit && !closed ? (
            <>
              <Dropdown
                trigger={
                  <Button variant="outline">
                    {t('repairs.changeStatus')} <ChevronDown />
                  </Button>
                }
                items={moveTargets.map((s) => ({ label: statusLabel(s, i18n.language), onSelect: () => setStatus.mutate({ id: r.id, statusId: s.id }) }))}
              />
              <Button variant="success" onClick={() => setDialog('deliver')}>
                <Truck /> {t('repairs.deliver')}
              </Button>
              <Button variant="ghost" onClick={() => setDialog('cancel')}>
                <Ban /> {t('repairs.cancelRepair')}
              </Button>
            </>
          ) : null}
          {can('delete_repair') && r.paidTotal === 0 && r.parts.every((p) => p.returnedAt) ? (
            <Button variant="ghost" size="icon" onClick={async () => (await confirm({ title: t('common.confirmDelete'), body: r.number, danger: true })) && del.mutate({ id: r.id })}>
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <Card>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <Info label={t('repairs.imei')} value={r.imei} mono />
                <Info label={t('repairs.color')} value={r.deviceColor} />
                <Info label={t('repairs.condition')} value={r.deviceCondition} />
                <Info label={t('repairs.receivedAt')} value={fmtDate(r.receivedAt, true)} />
                <Info label={t('repairs.accessories')} value={r.accessories.map((a) => t(`repairs.accessoriesList.${a}`)).join('، ') || '—'} />
                {r.hasPasscode ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted">{t('repairs.passcode')}</dt>
                    <dd>
                      {passcode !== null ? (
                        <span className="font-mono font-bold" dir="ltr">{passcode}</span>
                      ) : can('view_device_passcode') ? (
                        <Button size="xs" variant="soft" onClick={() => void call('repairs.passcode', { id: r.id }).then((p) => setPasscode(p.passcode ?? ''))}>
                          <Eye /> {t('repairs.showPasscode')}
                        </Button>
                      ) : (
                        '••••'
                      )}
                    </dd>
                  </div>
                ) : null}
                {r.warrantyUntil ? <Info label={t('repairs.warranty')} value={t('repairs.warrantyUntil', { date: fmtDate(r.warrantyUntil) })} /> : null}
                {r.deliveredAt ? <Info label={t('repairs.deliveredAt')} value={fmtDate(r.deliveredAt, true)} /> : null}
              </dl>
              <div className="mt-3 rounded-xl bg-sunken p-3 text-sm">
                <p className="text-xs font-bold text-muted">{t('repairs.complaint')}</p>
                <p>{r.complaint}</p>
              </div>
            </Card>

            <Card>
              <fieldset disabled={!edit} className="grid gap-3 sm:grid-cols-2">
                <Field label={t('repairs.diagnosis')} className="sm:col-span-2">
                  <Textarea rows={2} value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} />
                </Field>
                <Field label={t('repairs.technician')}>
                  <Select value={form.technicianId} onChange={(e) => setForm({ ...form, technicianId: e.target.value })}>
                    <option value="">{t('repairs.unassigned')}</option>
                    {techs.data?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('repairs.expectedAt')}>
                  <Input type="date" value={form.expectedAt} onChange={(e) => setForm({ ...form, expectedAt: e.target.value })} />
                </Field>
                <Field label={t('repairs.laborPrice')}>
                  <MoneyInput value={form.laborPrice} disabled={closed} onChange={(v) => setForm({ ...form, laborPrice: v ?? 0 })} />
                </Field>
                <Field label={t('repairs.warrantyDays')}>
                  <NumberInput value={form.warrantyDays} max={3650} onChange={(v) => setForm({ ...form, warrantyDays: v ?? 0 })} />
                </Field>
                <Field label={t('repairs.notes')} className="sm:col-span-2" optional>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </Field>
              </fieldset>
              {edit ? (
                <div className="mt-3 flex justify-end">
                  <Button onClick={save} disabled={!dirty} loading={update.isPending}>
                    <Save /> {t('common.save')}
                  </Button>
                </div>
              ) : null}
            </Card>

            <Card>
              <CardHeader
                title={t('repairs.parts')}
                action={
                  edit && !closed ? (
                    <Button size="sm" variant="soft" onClick={() => setDialog('part')}>
                      <PackagePlus /> {t('repairs.addPart')}
                    </Button>
                  ) : null
                }
              />
              {r.parts.length === 0 ? <p className="text-sm text-muted">—</p> : null}
              <div className="divide-y divide-line">
                {r.parts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className={p.returnedAt ? 'flex-1 line-through opacity-50' : 'flex-1 font-semibold'}>
                      {p.qty} × {p.name}
                    </span>
                    {p.unitCost !== null ? <span className="text-xs text-muted tabular">{fmtMoney(p.unitCost)}</span> : null}
                    <span className="font-bold tabular">{fmtMoney(p.unitPrice * p.qty)}</span>
                    {edit && !closed && !p.returnedAt ? (
                      <Button variant="ghost" size="icon-sm" onClick={() => removePart.mutate({ id: p.id, restock: true })} aria-label={t('repairs.restockPart')}>
                        <PackageMinus />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader title={t('repairs.photos')} action={edit ? <PhotoCapture onPhoto={(d) => addPhoto.mutate({ repairId: r.id, kind: closed ? 'AFTER' : 'BEFORE', dataUrl: d })} /> : null} />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {r.photos.map((p) => (
                  <div key={p.id} className="group relative">
                    <a href={p.url} target="_blank" rel="noreferrer">
                      <img src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                    <span className="absolute start-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">{t(`repairs.photoKinds.${p.kind}`)}</span>
                    {edit ? (
                      <button className="absolute end-1 top-1 hidden rounded-full bg-black/60 p-1 text-white group-hover:block" onClick={() => removePhoto.mutate({ id: p.id })}>
                        <X className="size-3" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
              {r.receiveSignature || r.deliverySignature ? (
                <div className="mt-3 flex flex-wrap gap-4">
                  {r.receiveSignature ? <Signature label={t('repairs.receivedAt')} src={r.receiveSignature} /> : null}
                  {r.deliverySignature ? <Signature label={t('repairs.deliveredAt')} src={r.deliverySignature} /> : null}
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <Row label={t('repairs.estimatedPrice')} value={fmtMoney(r.estimatedPrice)} muted />
              <Row label={t('repairs.laborPrice')} value={fmtMoney(r.laborPrice)} />
              <Row label={t('repairs.partsTotal')} value={fmtMoney(r.partsTotal)} />
              <div className="my-2 border-t border-line" />
              <Row label={t('repairs.finalPrice')} value={fmtMoney(r.finalPrice)} bold />
              <Row label={t('repairs.paid')} value={fmtMoney(r.paidTotal)} />
              {r.balanceDue > 0 ? <Row label={t('repairs.balanceDue')} value={fmtMoney(r.balanceDue)} danger /> : null}
              {r.creditAmount > 0 ? <Row label={t('pos.onCredit')} value={fmtMoney(r.creditAmount)} danger /> : null}
              {r.profit !== null ? <Row label={t('repairs.profit')} value={fmtMoney(r.profit)} muted /> : null}
              {edit && !closed ? (
                <Button variant="soft" size="sm" className="mt-3 w-full" onClick={() => setDialog('payment')}>
                  <HandCoins /> {t('repairs.addPayment')}
                </Button>
              ) : null}
            </Card>
            {r.payments.length ? (
              <Card>
                <CardHeader title={t('sales.payments')} />
                {r.payments.map((p) => (
                  <div key={p.id} className="flex justify-between py-1 text-sm">
                    <span className="text-muted">
                      {fmtDate(p.createdAt)} · {t(`pos.methods.${p.method}`, { defaultValue: p.method })}
                    </span>
                    <span className="tabular" dir="ltr">{fmtMoney(p.amount)}</span>
                  </div>
                ))}
              </Card>
            ) : null}
            <Card>
              <CardHeader title={t('repairs.history')} />
              <ol className="space-y-3 border-s-2 border-line ps-4">
                {r.history.map((h) => (
                  <li key={h.id} className="relative text-sm">
                    <span className="absolute -start-[23px] top-1.5 size-3 rounded-full border-2 border-surface" style={{ background: byId.get(h.toStatusId)?.color }} />
                    <p className="font-semibold">{statusLabel(byId.get(h.toStatusId), i18n.language)}</p>
                    <p className="text-xs text-muted">
                      {fmtDate(h.createdAt, true)} · {h.userName}
                    </p>
                    {h.note ? <p className="text-xs">{h.note}</p> : null}
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </div>

      {dialog === 'deliver' ? <DeliverDialog r={r} statusId={statuses.find((s) => s.key === 'DELIVERED')!.id} onClose={() => setDialog(null)} /> : null}
      {dialog === 'cancel' ? <CancelDialog r={r} statusId={statuses.find((s) => s.key === 'CANCELLED')!.id} onClose={() => setDialog(null)} /> : null}
      {dialog === 'payment' ? <PaymentDialog r={r} onClose={() => setDialog(null)} /> : null}
      {dialog === 'part' ? <PartDialog r={r} onClose={() => setDialog(null)} /> : null}
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? 'font-mono' : 'font-semibold'} dir={mono ? 'ltr' : undefined}>
        {value || '—'}
      </dd>
    </div>
  )
}

function Row({ label, value, bold, danger, muted }: { label: string; value: string; bold?: boolean; danger?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${bold ? 'text-lg font-extrabold' : ''} ${danger ? 'font-bold text-danger' : ''} ${muted ? 'text-muted' : ''}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  )
}

function Signature({ label, src }: { label: string; src: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      <img src={src} alt="" className="h-20 rounded-lg border border-line bg-white" />
    </div>
  )
}

function DeliverDialog({ r, statusId, onClose }: { r: RepairDto; statusId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(r.balanceDue)
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const [signature, setSignature] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const remaining = Math.max(0, r.balanceDue - amount)
  const submit = async () => {
    setBusy(true)
    try {
      await call('repairs.setStatus', { id: r.id, statusId, payments: amount > 0 ? [{ method, amount }] : [], signature })
      invalidate('repairs.', 'shifts.', 'customers.')
      onClose()
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('repairs.deliverTitle', { number: r.number })}
      footer={
        <Button variant="success" onClick={submit} loading={busy}>
          <Truck /> {t('repairs.deliver')}
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex justify-between rounded-xl bg-sunken p-3">
          <span className="text-muted">{t('repairs.balanceDue')}</span>
          <span className="text-xl font-extrabold tabular">{fmtMoney(r.balanceDue)}</span>
        </div>
        {r.balanceDue > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('pos.tendered')}>
              <MoneyInput autoFocus value={amount} onChange={(v) => setAmount(v ?? 0)} />
            </Field>
            <Field label={t('pos.payment')}>
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                {(['CASH', 'CARD', 'WALLET', 'TRANSFER'] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`pos.methods.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}
        {amount > r.balanceDue ? <p className="text-sm font-bold text-success">{t('pos.change')}: {fmtMoney(amount - r.balanceDue)}</p> : null}
        {remaining > 0 ? (
          <p className="rounded-xl bg-warning-soft p-2 text-sm font-semibold text-warning">
            {t('pos.onCredit')}: {fmtMoney(remaining)}
          </p>
        ) : null}
        <p className="text-[13px] font-semibold">{t('repairs.signature')}</p>
        <SignaturePad onChange={setSignature} height={130} />
      </div>
    </Dialog>
  )
}

function CancelDialog({ r, statusId, onClose }: { r: RepairDto; statusId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [refund, setRefund] = useState(r.paidTotal > 0)
  const [note, setNote] = useState('')
  const m = useApiMutation('repairs.setStatus', { invalidate: ['repairs.', 'shifts.', 'catalog.', 'inventory.'], onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('repairs.cancelRepair')}
      footer={
        <Button variant="danger" loading={m.isPending} onClick={() => m.mutate({ id: r.id, statusId, refundDeposit: refund, note: note || null })}>
          <Ban /> {t('repairs.cancelRepair')}
        </Button>
      }
    >
      <div className="space-y-3">
        {r.paidTotal > 0 ? <Checkbox checked={refund} onCheckedChange={setRefund} label={`${t('repairs.refundDeposit')} (${fmtMoney(r.paidTotal)})`} /> : null}
        <Field label={t('common.reason')} optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}

function PaymentDialog({ r, onClose }: { r: RepairDto; onClose: () => void }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState(r.balanceDue)
  const [method, setMethod] = useState<PaymentMethod>('CASH')
  const m = useApiMutation('repairs.addPayment', { invalidate: ['repairs.', 'shifts.'], success: 'common.saved', onSuccess: onClose })
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('repairs.addPayment')}
      footer={
        <Button loading={m.isPending} disabled={amount <= 0} onClick={() => m.mutate({ repairId: r.id, amount, method })}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-3">
        <MoneyInput autoFocus value={amount} onChange={(v) => setAmount(v ?? 0)} />
        <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {(['CASH', 'CARD', 'WALLET', 'TRANSFER'] as const).map((x) => (
            <option key={x} value={x}>
              {t(`pos.methods.${x}`)}
            </option>
          ))}
        </Select>
      </div>
    </Dialog>
  )
}

function PartDialog({ r, onClose }: { r: RepairDto; onClose: () => void }) {
  const { t } = useTranslation()
  const [custom, setCustom] = useState(false)
  const [name, setName] = useState('')
  const [qty, setQty] = useState(1)
  const [price, setPrice] = useState(0)
  const [cost, setCost] = useState(0)
  const [variantId, setVariantId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const m = useApiMutation('repairs.addPart', { invalidate: ['repairs.', 'catalog.', 'inventory.'], success: 'common.saved', onSuccess: onClose })
  useEffect(() => setVariantId(null), [custom])
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('repairs.addPart')}
      footer={
        <Button
          loading={m.isPending}
          disabled={custom ? !name.trim() : !variantId}
          onClick={() => m.mutate({ repairId: r.id, variantId: custom ? null : variantId, name: custom ? name : undefined, qty, unitPrice: price, unitCost: custom ? cost : undefined })}
        >
          {t('common.add')}
        </Button>
      }
    >
      <div className="space-y-3">
        <Checkbox checked={custom} onCheckedChange={setCustom} label={t('repairs.customPart')} />
        {custom ? (
          <Field label={t('common.name')}>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        ) : (
          <>
            <ProductPicker
              autoFocus
              clearOnPick={false}
              filter={(i) => i.type !== 'SERVICE'}
              onPick={(i) => {
                setVariantId(i.variantId)
                setLabel(i.name)
                setPrice(i.sellPrice)
              }}
            />
            {label ? <p className="rounded-lg bg-sunken px-3 py-2 text-sm font-semibold">{label}</p> : null}
          </>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('common.qty')}>
            <NumberInput value={qty} min={1} max={100} onChange={(v) => setQty(v ?? 1)} />
          </Field>
          <Field label={t('common.price')}>
            <MoneyInput value={price} onChange={(v) => setPrice(v ?? 0)} />
          </Field>
          {custom ? (
            <Field label={t('inventory.costPrice')}>
              <MoneyInput value={cost} onChange={(v) => setCost(v ?? 0)} />
            </Field>
          ) : null}
        </div>
      </div>
    </Dialog>
  )
}
