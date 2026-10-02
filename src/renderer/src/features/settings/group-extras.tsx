import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ImagePlus, Printer, Trash2 } from 'lucide-react'
import type { SettingsGroup } from '@shared/settings'
import { call } from '../../lib/api'
import { fileToDataUrl } from '../../lib/images'
import { toastError } from '../../lib/query'
import { useApp } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { PrintPreviewDialog } from '../../components/print-preview'

function LogoField() {
  const { t } = useTranslation()
  const logoPath = useApp((s) => s.settings?.company.logoPath)
  const refresh = useApp((s) => s.refreshSettings)
  const input = useRef<HTMLInputElement>(null)
  const upload = async (dataUrl: string | null) => {
    try {
      await call('settings.uploadLogo', { dataUrl })
      await refresh()
    } catch (err) {
      toastError(err)
    }
  }
  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-line bg-white">
        {logoPath ? <img src={`app://media/${logoPath}`} alt="" className="max-h-full max-w-full" /> : <ImagePlus className="size-6 text-subtle" />}
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">{t('print.logo')}</p>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) await upload(await fileToDataUrl(f, 600, 0.9))
            e.target.value = ''
          }}
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
            <ImagePlus /> {t('print.uploadLogo')}
          </Button>
          {logoPath ? (
            <Button size="sm" variant="ghost" onClick={() => void upload(null)}>
              <Trash2 /> {t('print.removeLogo')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function TestPrint() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Printer /> {t('print.testPrint')}
      </Button>
      {open ? <PrintPreviewDialog request={{ type: 'test' }} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

export const GROUP_EXTRAS: Partial<Record<SettingsGroup, () => ReactNode>> = {
  company: () => <LogoField />,
  printing: () => <TestPrint />
}
