import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

interface ConfirmOptions {
  title: ReactNode
  body?: ReactNode
  confirmLabel?: ReactNode
  danger?: boolean
}

const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)
  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])
  const close = (v: boolean) => {
    resolver.current?.(v)
    resolver.current = null
    setOpts(null)
  }
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog
        open={!!opts}
        onOpenChange={(o) => !o && close(false)}
        title={opts?.title}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>
              {opts?.confirmLabel ?? t('common.confirm')}
            </Button>
          </>
        }
      >
        <div className="text-sm text-muted">{opts?.body}</div>
      </Dialog>
    </Ctx.Provider>
  )
}

export function useConfirm() {
  return useContext(Ctx)
}
