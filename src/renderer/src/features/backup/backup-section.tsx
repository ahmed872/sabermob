import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, DatabaseBackup, FolderOpen, HardDriveDownload, KeyRound, Lock, PackageOpen, RotateCcw, ShieldCheck, Upload } from 'lucide-react'
import type { BackupInspection, BackupRecordDto } from '@shared/types/backup'
import { call } from '../../lib/api'
import { invalidate, toastError, useApi, useApiMutation } from '../../lib/query'
import { fmtBytes, fmtDate, fmtRelative } from '../../lib/format'
import { Button } from '../../components/ui/button'
import { Field, Input } from '../../components/ui/input'
import { Badge, Card, CardHeader, EmptyState } from '../../components/ui/misc'
import { PageLoader } from '../../components/ui/spinner'
import { DataTable } from '../../components/ui/table'
import { SettingsGroupForm } from '../settings/settings-form'
import { pickBackupFile, RestoreDialog } from './restore-dialog'
import { StartFreshCard } from './start-fresh'
import { useApp } from '../../stores/app'

function PasswordForm({ needsCurrent, onDone, cta }: { needsCurrent?: boolean; onDone?: () => void; cta: string }) {
  const { t } = useTranslation()
  const [current, setCurrent] = useState('')
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const save = useApiMutation('backup.setPassword', {
    success: 'backup.passwordSaved',
    invalidate: ['backup.'],
    onSuccess: () => {
      setCurrent('')
      setPw('')
      setConfirm('')
      onDone?.()
    }
  })
  const mismatch = confirm.length > 0 && pw !== confirm
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {needsCurrent ? (
        <Field label={t('backup.currentPassword')} className="sm:col-span-2">
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
      ) : null}
      <Field label={t('backup.newPassword')}>
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Field label={t('backup.confirm')} error={mismatch ? t('backup.mismatch') : null}>
        <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <div className="sm:col-span-2">
        <Button loading={save.isPending} disabled={pw.length < 6 || pw !== confirm} onClick={() => save.mutate({ password: pw, currentPassword: current || undefined })}>
          <KeyRound /> {cta}
        </Button>
      </div>
    </div>
  )
}

function UnlockForm() {
  const { t } = useTranslation()
  const [pw, setPw] = useState('')
  const unlock = useApiMutation('backup.unlock', { success: 'backup.unlocked', invalidate: ['backup.'] })
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Field label={t('backup.password')} className="w-64">
        <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && pw && unlock.mutate({ password: pw })} />
      </Field>
      <Button loading={unlock.isPending} disabled={!pw} onClick={() => unlock.mutate({ password: pw })}>
        <Lock /> {t('backup.unlock')}
      </Button>
    </div>
  )
}

/** Settings → Backup & restore. */
export function BackupSection() {
  const { t } = useTranslation()
  const isOwner = useApp((st) => st.session?.roleKey === 'OWNER')
  const status = useApi('backup.status')
  const list = useApi('backup.list')
  const [restoring, setRestoring] = useState<BackupInspection | null>(null)
  const create = useApiMutation('backup.create', { success: 'backup.created', invalidate: ['backup.'] })
  const bundle = useApiMutation('backup.exportBundle', {
    invalidate: ['backup.'],
    onSuccess: (r) => r.path && toast.success(t('backup.bundleSaved', { path: r.path }))
  })
  const s = status.data
  if (!s) return <PageLoader />

  const chooseFolder = async (target: 'directory' | 'mirrorDirectory', clear?: boolean) => {
    try {
      await call('backup.chooseFolder', { target, clear })
      invalidate('backup.')
    } catch (err) {
      toastError(err)
    }
  }
  const openRestore = async (id?: string) => {
    try {
      const info = id ? await call('backup.inspect', { id }) : await pickBackupFile()
      if (info) setRestoring(info)
    } catch (err) {
      toastError(err)
    }
  }
  const verify = async (r: BackupRecordDto) => {
    try {
      const v = await call('backup.verify', { id: r.id })
      toast.success(t('backup.verified', { products: v.counts.products ?? 0, sales: v.counts.sales ?? 0 }))
      invalidate('backup.list')
    } catch (err) {
      toastError(err)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className={`flex size-12 items-center justify-center rounded-2xl ${s.lastSuccessAt ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'}`}>
            {s.lastSuccessAt ? <ShieldCheck className="size-6" /> : <AlertTriangle className="size-6" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted">{t('backup.last')}</p>
            <p className="text-lg font-extrabold">{s.lastSuccessAt ? `${fmtRelative(s.lastSuccessAt)} · ${fmtDate(s.lastSuccessAt, true)}` : t('backup.never')}</p>
            <p className="text-xs text-subtle">
              {s.configured ? (s.protection === 'os' ? t('backup.protectedOs') : t('backup.protectedPlain')) : null}
              {s.nextAutoAt && s.unlocked ? ` · ${t('backup.next')}: ${fmtDate(s.nextAutoAt, true)}` : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" loading={create.isPending} disabled={!s.configured || !s.unlocked} onClick={() => create.mutate(undefined)}>
              <DatabaseBackup /> {create.isPending ? t('backup.creating') : t('backup.now')}
            </Button>
            <Button variant="outline" size="lg" onClick={() => void openRestore()}>
              <Upload /> {t('backup.restoreFile')}
            </Button>
          </div>
        </div>
      </Card>

      {!s.configured ? (
        <Card>
          <CardHeader title={t('backup.notConfigured')} icon={KeyRound} subtitle={t('backup.notConfiguredBody')} />
          <PasswordForm cta={t('backup.setPassword')} />
        </Card>
      ) : !s.unlocked ? (
        <Card>
          <CardHeader title={t('backup.locked')} icon={Lock} subtitle={t('backup.lockedBody')} />
          <UnlockForm />
        </Card>
      ) : null}

      <SettingsGroupForm group="backup" />

      <Card>
        <CardHeader title={t('backup.folders')} icon={FolderOpen} />
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">{t('backup.folder')}</p>
              <p className="truncate text-xs text-muted" dir="ltr">
                {s.directory}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => void call('backup.openFolder').catch(toastError)}>
                <FolderOpen /> {t('backup.openFolder')}
              </Button>
              <Button size="sm" variant="outline" onClick={() => void chooseFolder('directory')}>
                {t('backup.change')}
              </Button>
              {s.directory !== s.defaultDirectory ? (
                <Button size="sm" variant="ghost" onClick={() => void chooseFolder('directory', true)}>
                  {t('backup.reset')}
                </Button>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="min-w-0">
              <p className="font-semibold">{t('backup.mirror')}</p>
              <p className="truncate text-xs text-muted" dir={s.mirrorDirectory ? 'ltr' : undefined}>
                {s.mirrorDirectory ?? t('backup.mirrorHint')}
              </p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => void chooseFolder('mirrorDirectory')}>
                {s.mirrorDirectory ? t('backup.change') : t('backup.choose')}
              </Button>
              {s.mirrorDirectory ? (
                <Button size="sm" variant="ghost" onClick={() => void chooseFolder('mirrorDirectory', true)}>
                  {t('backup.remove')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={t('backup.history')} icon={HardDriveDownload} />
        <DataTable
          dense
          rows={list.data ?? []}
          rowKey={(r) => r.id}
          loading={list.isFetching}
          empty={<EmptyState icon={DatabaseBackup} title={t('backup.never')} />}
          columns={[
            { key: 'd', header: t('backup.createdAt'), cell: (r) => <span className="font-semibold">{fmtDate(r.createdAt, true)}</span> },
            { key: 'k', header: t('common.type'), cell: (r) => <Badge tone={r.kind === 'MANUAL' ? 'primary' : r.kind === 'PRE_RESTORE' ? 'warning' : 'neutral'}>{t(`backup.kinds.${r.kind}`, { defaultValue: r.kind })}</Badge> },
            { key: 's', header: '', align: 'end', cell: (r) => <span className="text-xs text-muted tabular">{fmtBytes(r.sizeBytes)}</span> },
            {
              key: 'st',
              header: '',
              cell: (r) =>
                r.status !== 'SUCCESS' ? (
                  <Badge tone="danger">{t('backup.failed')}</Badge>
                ) : !r.exists ? (
                  <Badge tone="warning">{t('backup.missing')}</Badge>
                ) : r.verifiedAt ? (
                  <CheckCircle2 className="size-4 text-success" />
                ) : null
            },
            {
              key: 'a',
              header: '',
              align: 'end',
              cell: (r) =>
                r.status === 'SUCCESS' && r.exists ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => void verify(r)}>
                      <ShieldCheck /> {t('backup.verify')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void openRestore(r.id)}>
                      <RotateCcw /> {t('backup.restore')}
                    </Button>
                  </div>
                ) : null
            }
          ]}
        />
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader title={t('backup.move')} icon={PackageOpen} />
          <p className="mb-3 text-sm text-muted">{t('backup.moveBody')}</p>
          <Button variant="outline" loading={bundle.isPending} disabled={!s.configured || !s.unlocked} onClick={() => bundle.mutate(undefined)}>
            <PackageOpen /> {t('backup.exportBundle')}
          </Button>
        </Card>
        {s.configured ? (
          <Card>
            <CardHeader title={t('backup.changePassword')} icon={KeyRound} subtitle={t('backup.changeHint')} />
            <PasswordForm needsCurrent={!s.unlocked} cta={t('backup.setPassword')} />
          </Card>
        ) : null}
        {isOwner ? <StartFreshCard /> : null}
      </div>

      {restoring ? <RestoreDialog info={restoring} onClose={() => setRestoring(null)} /> : null}
    </div>
  )
}
