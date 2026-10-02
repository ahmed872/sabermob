import { useTranslation } from 'react-i18next'
import { FolderOpen, WifiOff } from 'lucide-react'
import { call } from '../../lib/api'
import { fmtNumber } from '../../lib/format'
import { useApp, useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Card } from '../../components/ui/misc'

export function DeviceSection() {
  const { t } = useTranslation()
  const system = useApp((s) => s.system)
  const can = useCan()
  if (!system) return null
  const rows: Array<[string, string]> = [
    [t('settings.appVersion'), system.appVersion],
    [t('settings.deviceId'), system.deviceId],
    [t('settings.dataFolder'), system.dataDir],
    [t('settings.database'), `${fmtNumber(Math.round(system.dbSizeBytes / 1024))} KB`]
  ]
  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success-soft text-success">
            <WifiOff className="size-5" />
          </div>
          <div>
            <p className="font-bold">{t('settings.offline')}</p>
            <p className="text-sm text-muted">{t('settings.offlineBody')}</p>
          </div>
        </div>
      </Card>
      <Card>
        <dl className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="selectable truncate font-mono text-xs" dir="ltr">
                {v}
              </dd>
            </div>
          ))}
        </dl>
        {can('manage_backups') ? (
          <Button variant="outline" className="mt-3" onClick={() => void call('system.openDataFolder')}>
            <FolderOpen /> {t('settings.openFolder')}
          </Button>
        ) : null}
      </Card>
    </div>
  )
}
