import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { call } from '../../lib/api'
import { toastError } from '../../lib/query'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input } from '../../components/ui/input'
import { Segmented } from '../../components/ui/misc'

export function useAccountDialog() {
  const [open, setOpen] = useState(false)
  return { isOpen: open, open: () => setOpen(true), close: () => setOpen(false) }
}

export function AccountDialog({ isOpen, close }: { isOpen: boolean; close: () => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'password' | 'pin'>('password')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setCurrent('')
    setNext('')
    setPin('')
  }

  const submit = async (removePin = false) => {
    setBusy(true)
    try {
      if (tab === 'password') {
        await call('auth.changePassword', { currentPassword: current, newPassword: next })
        toast.success(t('auth.passwordChanged'))
      } else {
        await call('auth.setPin', { currentPassword: current, pin: removePin ? null : pin })
        toast.success(t('auth.pinChanged'))
      }
      reset()
      close()
    } catch (err) {
      toastError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(o) => {
        if (!o) {
          reset()
          close()
        }
      }}
      title={t('auth.myAccount')}
      size="sm"
      footer={
        <>
          {tab === 'pin' ? (
            <Button variant="ghost" onClick={() => submit(true)} disabled={!current || busy}>
              {t('auth.removePin')}
            </Button>
          ) : null}
          <Button onClick={() => submit()} loading={busy} disabled={!current || (tab === 'password' ? next.length < 6 : !/^\d{4,8}$/.test(pin))}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Segmented
          className="w-full"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'password', label: t('auth.changePassword') },
            { value: 'pin', label: t('auth.setPin') }
          ]}
        />
        <Field label={t('auth.currentPassword')}>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        {tab === 'password' ? (
          <Field label={t('auth.newPassword')}>
            <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
          </Field>
        ) : (
          <Field label={t('auth.pin')} hint={t('auth.pinHint')}>
            <Input inputMode="numeric" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} dir="ltr" />
          </Field>
        )}
      </div>
    </Dialog>
  )
}
