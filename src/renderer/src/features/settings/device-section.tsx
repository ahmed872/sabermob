import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { Download, FolderOpen, RefreshCw, Rocket, WifiOff } from 'lucide-react'
import type { UpdateStatus } from '@shared/types/update'
import { call, onEvent } from '../../lib/api'
import { toastError } from '../../lib/query'
import { fmtNumber } from '../../lib/format'
import { useApp, useCan } from '../../stores/app'
import { Button } from '../../components/ui/button'
import { Card, CardHeader } from '../../components/ui/misc'

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
      {can('manage_settings') ? <UpdateCard /> : null}
    </div>
  )
}

function UpdateCard() {
  const { t } = useTranslation()
  const [s, setS] = useState<UpdateStatus | null>(null)
  useEffect(() => {
    void call('system.updateStatus').then(setS, toastError)
    return onEvent<UpdateStatus>('update:status', setS)
  }, [])
  if (!s) return null
  const run = (m: 'system.checkUpdate' | 'system.downloadUpdate') => void call(m).then(setS, toastError)
  return (
    <Card>
      <CardHeader title={t('update.title')} icon={Rocket} subtitle={t('update.current', { version: s.currentVersion })} />
      {!s.enabled ? (
        <p className="text-sm text-muted">{t('update.manual')}</p>
      ) : (
        <div className="space-y-3 text-sm">
          {s.state === 'none' ? <p className="font-semibold text-success">{t('update.none')}</p> : null}
          {s.state === 'error' ? <p className="font-semibold text-danger">{t('update.offline')}</p> : null}
          {s.state === 'available' ? <p className="font-semibold">{t('update.available', { version: s.version })}</p> : null}
          {s.state === 'downloading' ? (
            <div>
              <p className="mb-1 font-semibold">{t('update.downloading', { progress: s.progress })}</p>
              <div className="h-2 overflow-hidden rounded-full bg-sunken">
                <div className="h-full bg-primary transition-all" style={{ width: `${s.progress}%` }} />
              </div>
            </div>
          ) : null}
          {s.state === 'ready' ? (
            <>
              <p className="font-semibold text-success">{t('update.ready', { version: s.version })}</p>
              <p className="text-xs text-muted">{t('update.installHint')}</p>
            </>
          ) : null}
          <div className="flex gap-2">
            {s.state === 'available' ? (
              <Button onClick={() => run('system.downloadUpdate')}>
                <Download /> {t('update.download')}
              </Button>
            ) : s.state === 'ready' ? (
              <Button onClick={() => void call('system.installUpdate').catch(toastError)}>
                <Rocket /> {t('update.install')}
              </Button>
            ) : (
              <Button variant="outline" loading={s.state === 'checking'} disabled={s.state === 'downloading'} onClick={() => run('system.checkUpdate')}>
                <RefreshCw /> {s.state === 'checking' ? t('update.checking') : t('update.check')}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
