import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Check, Globe2, PartyPopper, Printer, Store, UserRound, Coins, PackageOpen } from 'lucide-react'
import { CURRENCY_DECIMALS } from '@shared/money'
import { applyLanguage } from '../../i18n'
import { call } from '../../lib/api'
import { toastError } from '../../lib/query'
import { cn } from '../../lib/utils'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Field, Input, Select } from '../../components/ui/input'
import { Checkbox, Segmented, SwitchRow } from '../../components/ui/misc'
import { BrandMark } from '../../layouts/brand'

type Step = 'welcome' | 'language' | 'store' | 'currency' | 'owner' | 'printer' | 'catalog' | 'done'
const STEPS: Step[] = ['welcome', 'language', 'store', 'currency', 'owner', 'printer', 'catalog', 'done']
const ICONS: Record<Step, typeof Store> = {
  welcome: PartyPopper,
  language: Globe2,
  store: Store,
  currency: Coins,
  owner: UserRound,
  printer: Printer,
  catalog: PackageOpen,
  done: Check
}

const CURRENCIES = Object.keys(CURRENCY_DECIMALS)

export function Onboarding() {
  const { t } = useTranslation()
  const load = useApp((s) => s.load)
  const [step, setStep] = useState<Step>('welcome')
  const [lang, setLang] = useState<'ar' | 'en'>('ar')
  const [store, setStore] = useState({ name: '', phone: '', address: '', taxNumber: '' })
  const [currency, setCurrency] = useState('EGP')
  const [taxEnabled, setTaxEnabled] = useState(false)
  const [taxRate, setTaxRate] = useState('14')
  const [owner, setOwner] = useState({ fullName: '', username: '', password: '', confirm: '', pin: '' })
  const [backupSame, setBackupSame] = useState(true)
  const [backupPassword, setBackupPassword] = useState('')
  const [printers, setPrinters] = useState<Array<{ name: string; displayName: string; isDefault: boolean }>>([])
  const [printer, setPrinter] = useState<string>('')
  const [paper, setPaper] = useState<'58mm' | '80mm' | 'A4'>('80mm')
  const [starter, setStarter] = useState(true)
  const [busy, setBusy] = useState(false)
  const [completed, setCompleted] = useState(false)

  useEffect(() => applyLanguage(lang), [lang])
  useEffect(() => {
    if (step === 'printer' && printers.length === 0) {
      void call('system.printers').then((list) => {
        setPrinters(list)
        setPrinter((p) => p || list.find((x) => x.isDefault)?.name || '')
      })
    }
  }, [step, printers.length])

  const idx = STEPS.indexOf(step)
  const usernameOk = /^[a-z0-9._-]{3,32}$/.test(owner.username.trim().toLowerCase())
  const ownerOk = owner.fullName.trim().length >= 2 && usernameOk && owner.password.length >= 6 && owner.password === owner.confirm && (!owner.pin || /^\d{4,8}$/.test(owner.pin)) && (backupSame || backupPassword.length >= 6)
  const canNext: Record<Step, boolean> = {
    welcome: true,
    language: true,
    store: store.name.trim().length > 0,
    currency: !taxEnabled || /^\d{1,2}(\.\d{1,2})?$/.test(taxRate),
    owner: ownerOk,
    printer: true,
    catalog: true,
    done: true
  }

  const finish = async () => {
    setBusy(true)
    try {
      await call('system.onboard', {
        language: lang,
        currency,
        store: { name: store.name, phone: store.phone || null, address: store.address || null, taxNumber: store.taxNumber || null },
        taxEnabled,
        taxBp: Math.round(Number(taxRate) * 100),
        owner: { fullName: owner.fullName, username: owner.username, password: owner.password, pin: owner.pin || null },
        backupPassword: backupSame ? owner.password : backupPassword,
        printer: printer ? { name: printer, paper } : null,
        starterCatalog: starter
      })
      setCompleted(true)
      setStep('done')
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    if (step === 'catalog') void finish()
    else setStep(STEPS[idx + 1]!)
  }

  let body: ReactNode
  switch (step) {
    case 'welcome':
      body = (
        <div className="py-6 text-center">
          <BrandMark className="mx-auto mb-5 size-20" />
          <h1 className="text-3xl font-extrabold">{t('onboarding.welcomeTitle')}</h1>
          <p className="mx-auto mt-3 max-w-md text-muted">{t('onboarding.welcomeBody')}</p>
        </div>
      )
      break
    case 'language':
      body = (
        <StepBody title={t('onboarding.chooseLanguage')}>
          <div className="grid grid-cols-2 gap-3">
            {(['ar', 'en'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={cn('rounded-2xl border-2 p-6 text-xl font-bold transition', lang === l ? 'border-primary bg-primary-soft text-primary' : 'border-line hover:border-line-strong')}
              >
                {l === 'ar' ? 'العربية' : 'English'}
              </button>
            ))}
          </div>
        </StepBody>
      )
      break
    case 'store':
      body = (
        <StepBody title={t('onboarding.stepStore')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('onboarding.storeName')} hint={t('onboarding.storeNameHint')} className="sm:col-span-2">
              <Input autoFocus value={store.name} onChange={(e) => setStore({ ...store, name: e.target.value })} />
            </Field>
            <Field label={t('onboarding.storePhone')} optional>
              <Input dir="ltr" value={store.phone} onChange={(e) => setStore({ ...store, phone: e.target.value })} />
            </Field>
            <Field label={t('onboarding.taxNumber')} optional>
              <Input dir="ltr" value={store.taxNumber} onChange={(e) => setStore({ ...store, taxNumber: e.target.value })} />
            </Field>
            <Field label={t('onboarding.storeAddress')} optional className="sm:col-span-2">
              <Input value={store.address} onChange={(e) => setStore({ ...store, address: e.target.value })} />
            </Field>
          </div>
        </StepBody>
      )
      break
    case 'currency':
      body = (
        <StepBody title={t('onboarding.stepCurrency')}>
          <div className="space-y-4">
            <Field label={t('onboarding.currency')}>
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <SwitchRow label={t('onboarding.enableTax')} hint={t('onboarding.taxHint')} checked={taxEnabled} onCheckedChange={setTaxEnabled} />
            {taxEnabled ? (
              <Field label={t('onboarding.taxRate')}>
                <Input dir="ltr" inputMode="decimal" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="max-w-32" />
              </Field>
            ) : null}
          </div>
        </StepBody>
      )
      break
    case 'owner':
      body = (
        <StepBody title={t('onboarding.ownerTitle')} subtitle={t('onboarding.ownerHint')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('onboarding.fullName')}>
              <Input autoFocus value={owner.fullName} onChange={(e) => setOwner({ ...owner, fullName: e.target.value })} />
            </Field>
            <Field label={t('auth.username')} hint={t('onboarding.usernameHint')} error={owner.username && !usernameOk ? t('onboarding.usernameHint') : null}>
              <Input dir="ltr" value={owner.username} onChange={(e) => setOwner({ ...owner, username: e.target.value.toLowerCase().replace(/\s/g, '') })} />
            </Field>
            <Field label={t('auth.password')}>
              <Input type="password" value={owner.password} onChange={(e) => setOwner({ ...owner, password: e.target.value })} />
            </Field>
            <Field label={t('onboarding.confirmPassword')} error={owner.confirm && owner.confirm !== owner.password ? t('onboarding.passwordsDontMatch') : null}>
              <Input type="password" value={owner.confirm} onChange={(e) => setOwner({ ...owner, confirm: e.target.value })} />
            </Field>
            <Field label={t('onboarding.pinOptional')} hint={t('auth.pinHint')}>
              <Input dir="ltr" inputMode="numeric" maxLength={8} value={owner.pin} onChange={(e) => setOwner({ ...owner, pin: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <div className="rounded-xl border border-line bg-sunken/60 p-3 sm:col-span-2">
              <p className="text-sm font-bold">{t('onboarding.backupPassword')}</p>
              <p className="mb-2 text-xs text-muted">{t('onboarding.backupPasswordHint')}</p>
              <Checkbox checked={backupSame} onCheckedChange={setBackupSame} label={t('onboarding.sameAsOwner')} />
              {!backupSame ? <Input className="mt-2" type="password" value={backupPassword} onChange={(e) => setBackupPassword(e.target.value)} /> : null}
            </div>
          </div>
        </StepBody>
      )
      break
    case 'printer':
      body = (
        <StepBody title={t('onboarding.printerTitle')} subtitle={t('onboarding.printerHint')}>
          <div className="space-y-4">
            {printers.length === 0 ? (
              <p className="rounded-xl bg-sunken p-4 text-sm text-muted">{t('onboarding.noPrinters')}</p>
            ) : (
              <Select value={printer} onChange={(e) => setPrinter(e.target.value)}>
                <option value="">{t('common.none')}</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName}
                  </option>
                ))}
              </Select>
            )}
            <Field label={t('onboarding.paperSize')}>
              <Segmented value={paper} onChange={setPaper} options={[{ value: '58mm', label: '58mm' }, { value: '80mm', label: '80mm' }, { value: 'A4', label: 'A4' }]} />
            </Field>
          </div>
        </StepBody>
      )
      break
    case 'catalog':
      body = (
        <StepBody title={t('onboarding.catalogTitle')}>
          <div className="space-y-3">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4">
              <Checkbox checked={starter} onCheckedChange={setStarter} />
              <span>
                <span className="block font-bold">{t('onboarding.starterCatalog')}</span>
                <span className="block text-sm text-muted">{t('onboarding.starterHint')}</span>
              </span>
            </label>
            <p className="text-sm text-muted">{t('onboarding.importLater')}</p>
          </div>
        </StepBody>
      )
      break
    case 'done':
      body = (
        <div className="py-6 text-center">
          <div className="mx-auto mb-4 flex size-20 items-center justify-center rounded-full bg-success-soft text-success">
            <Check className="size-10" strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-extrabold">{t('onboarding.doneTitle')}</h1>
          <p className="mt-2 text-muted">{t('onboarding.doneBody', { days: 15 })}</p>
        </div>
      )
      break
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,var(--primary-soft),var(--bg)_60%)] p-6">
      <div className="w-full max-w-2xl">
        {step !== 'welcome' && step !== 'done' ? (
          <div className="mb-5 flex items-center justify-center gap-1.5">
            {STEPS.slice(1, -1).map((s) => {
              const Icon = ICONS[s]
              const i = STEPS.indexOf(s)
              return (
                <div key={s} className={cn('flex size-9 items-center justify-center rounded-full transition', i < idx ? 'bg-success text-white' : i === idx ? 'bg-primary text-primary-fg' : 'bg-surface text-subtle')}>
                  {i < idx ? <Check className="size-4" /> : <Icon className="size-4" />}
                </div>
              )
            })}
          </div>
        ) : null}
        <div className="rounded-3xl border border-line bg-surface p-7 shadow-[var(--shadow-pop)]">
          {body}
          <div className="mt-6 flex items-center justify-between gap-3">
            {step !== 'welcome' && step !== 'done' ? (
              <Button variant="ghost" onClick={() => setStep(STEPS[idx - 1]!)} disabled={busy}>
                <ArrowLeft className="rtl:rotate-180" /> {t('common.back')}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {step === 'printer' ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPrinter('')
                    setStep('catalog')
                  }}
                >
                  {t('common.skip')}
                </Button>
              ) : null}
              {step === 'done' ? (
                <Button size="lg" onClick={() => void load()} disabled={!completed}>
                  {t('auth.signIn')} <ArrowRight className="rtl:rotate-180" />
                </Button>
              ) : (
                <Button size="lg" onClick={next} disabled={!canNext[step]} loading={busy}>
                  {step === 'welcome' ? t('onboarding.start') : step === 'catalog' ? t('common.finish') : t('common.next')}
                  {step !== 'catalog' ? <ArrowRight className="rtl:rotate-180" /> : null}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StepBody({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-xl font-extrabold">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-5">{children}</div>
    </div>
  )
}
