import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { KeyRound, Plus, UserCog } from 'lucide-react'
import type { UserDto } from '@shared/types/auth'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtDate } from '../../lib/format'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, Input, Select } from '../../components/ui/input'
import { Badge, Card, SwitchRow } from '../../components/ui/misc'
import { DataTable, type Column } from '../../components/ui/table'
import { Avatar } from '../auth/login-screen'

export function UsersSection() {
  const { t } = useTranslation()
  const users = useApi('users.list')
  const [edit, setEdit] = useState<Partial<UserDto> | null>(null)
  const columns: Column<UserDto>[] = [
    {
      key: 'name',
      header: t('common.name'),
      cell: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.fullName} size="sm" />
          <div>
            <p className="font-semibold">{u.fullName}</p>
            <p className="text-xs text-muted" dir="ltr">
              @{u.username}
            </p>
          </div>
        </div>
      )
    },
    { key: 'role', header: t('users.role'), cell: (u) => u.roleName },
    { key: 'pin', header: t('auth.pin'), cell: (u) => (u.hasPin ? <Badge tone="success">{t('users.pinSet')}</Badge> : <Badge>{t('users.noPin')}</Badge>) },
    { key: 'last', header: t('users.lastLogin'), cell: (u) => <span className="text-muted">{u.lastLoginAt ? fmtDate(u.lastLoginAt, true) : t('users.never')}</span> },
    { key: 'status', header: t('common.status'), cell: (u) => (u.isActive ? <Badge tone="success" dot>{t('common.active')}</Badge> : <Badge dot>{t('common.inactive')}</Badge>) }
  ]
  return (
    <Card padded={false} className="max-w-4xl">
      <div className="flex justify-end border-b border-line p-3">
        <Button onClick={() => setEdit({})}>
          <Plus /> {t('users.newUser')}
        </Button>
      </div>
      <DataTable columns={columns} rows={users.data ?? []} rowKey={(u) => u.id} onRowClick={(u) => setEdit(u)} />
      {edit ? <UserDialog value={edit} onClose={() => setEdit(null)} /> : null}
    </Card>
  )
}

function UserDialog({ value, onClose }: { value: Partial<UserDto>; onClose: () => void }) {
  const { t } = useTranslation()
  const roles = useApi('roles.list')
  const isNew = !value.id
  const [f, setF] = useState({
    fullName: value.fullName ?? '',
    username: value.username ?? '',
    phone: value.phone ?? '',
    roleId: value.roleId ?? '',
    password: '',
    pin: '',
    isActive: value.isActive ?? true
  })
  const create = useApiMutation('users.create', { invalidate: ['users.', 'auth.'], success: 'users.created', onSuccess: onClose })
  const update = useApiMutation('users.update', { invalidate: ['users.', 'auth.'], success: 'common.saved', onSuccess: onClose })
  const roleId = f.roleId || roles.data?.find((r) => r.systemKey === 'CASHIER')?.id || ''
  const valid = f.fullName.trim().length >= 2 && (isNew ? /^[a-z0-9._-]{3,32}$/.test(f.username) && f.password.length >= 6 : true) && (!f.pin || /^\d{4,8}$/.test(f.pin)) && (!f.password || f.password.length >= 6)

  const submit = () => {
    if (isNew) create.mutate({ username: f.username, fullName: f.fullName, phone: f.phone || null, password: f.password, pin: f.pin || null, roleId })
    else
      update.mutate({
        id: value.id!,
        fullName: f.fullName,
        phone: f.phone || null,
        roleId,
        isActive: f.isActive,
        ...(f.password ? { password: f.password } : {}),
        ...(f.pin ? { pin: f.pin } : {})
      })
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2">
          <UserCog className="size-5" /> {isNew ? t('users.newUser') : t('users.editUser')}
        </span>
      }
      footer={
        <Button onClick={submit} disabled={!valid} loading={create.isPending || update.isPending}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('onboarding.fullName')}>
          <Input autoFocus value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        </Field>
        <Field label={t('auth.username')} hint={isNew ? t('onboarding.usernameHint') : undefined}>
          <Input dir="ltr" disabled={!isNew} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') })} />
        </Field>
        <Field label={t('users.role')}>
          <Select value={roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.systemKey ? t(`roles.${r.systemKey}`) : r.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('common.phone')} optional>
          <Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
        <Field label={isNew ? t('auth.password') : t('users.resetPassword')} hint={isNew ? undefined : t('users.resetPasswordHint')}>
          <Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label={t('auth.pin')} hint={t('auth.pinHint')} optional>
          <Input dir="ltr" inputMode="numeric" maxLength={8} value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} />
        </Field>
        {!isNew ? (
          <div className="sm:col-span-2">
            <SwitchRow label={t('common.active')} checked={f.isActive} onCheckedChange={(v) => setF({ ...f, isActive: v })} />
          </div>
        ) : null}
      </div>
      {!isNew ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <KeyRound className="size-3.5" /> {t('users.resetPasswordHint')}
        </p>
      ) : null}
    </Dialog>
  )
}
