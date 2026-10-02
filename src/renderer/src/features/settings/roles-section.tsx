import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { ALL_PERMISSIONS, PERMISSIONS, type PermissionKey } from '@shared/permissions'
import type { RoleDto } from '@shared/types/auth'
import { useApi, useApiMutation } from '../../lib/query'
import { fmtPercentBp } from '../../lib/format'
import { cn } from '../../lib/utils'
import { useConfirm } from '../../components/confirm'
import { Button } from '../../components/ui/button'
import { Field, Input } from '../../components/ui/input'
import { Badge, Card, Checkbox } from '../../components/ui/misc'

const GROUPS = [...new Set(Object.values(PERMISSIONS))]

export function RolesSection() {
  const { t } = useTranslation()
  const roles = useApi('roles.list')
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<RoleDto | null>(null)
  const confirm = useConfirm()
  const save = useApiMutation('roles.save', { invalidate: ['roles.', 'users.'], success: 'common.saved', onSuccess: (r) => setSelected(r.id) })
  const del = useApiMutation('roles.delete', { invalidate: ['roles.'], success: 'common.deleted', onSuccess: () => setDraft(null) })

  const pick = (r: RoleDto) => {
    setSelected(r.id)
    setDraft({ ...r, permissions: [...r.permissions] })
  }
  const roleLabel = (r: RoleDto) => (r.systemKey ? t(`roles.${r.systemKey}`) : r.name)
  const locked = draft?.systemKey === 'OWNER'
  const toggle = (p: PermissionKey, on: boolean) =>
    draft && setDraft({ ...draft, permissions: on ? [...draft.permissions, p] : draft.permissions.filter((x) => x !== p) })

  return (
    <div className="grid max-w-5xl gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit">
        <div className="space-y-1">
          {roles.data?.map((r) => (
            <button
              key={r.id}
              onClick={() => pick(r)}
              className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-start', selected === r.id ? 'bg-primary-soft text-primary' : 'hover:bg-sunken')}
            >
              <span>
                <span className="block text-sm font-bold">{roleLabel(r)}</span>
                <span className="block text-xs text-muted">{t('users.usersCount', { count: r.userCount })}</span>
              </span>
              {r.systemKey ? <Badge>{t('users.builtIn')}</Badge> : null}
            </button>
          ))}
        </div>
        <Button
          variant="soft"
          size="sm"
          className="mt-3 w-full"
          onClick={() => {
            setSelected(null)
            setDraft({ id: '', name: '', systemKey: null, description: null, maxDiscountBp: 0, permissions: ['create_sale', 'view_inventory'], userCount: 0 })
          }}
        >
          <Plus /> {t('users.newRole')}
        </Button>
      </Card>
      {draft ? (
        <Card>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <Field label={t('users.roleName')}>
              <Input value={draft.systemKey ? roleLabel(draft) : draft.name} disabled={!!draft.systemKey} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label={t('users.maxDiscount')} hint={fmtPercentBp(draft.maxDiscountBp)}>
              <Input
                dir="ltr"
                inputMode="decimal"
                disabled={locked}
                defaultValue={draft.maxDiscountBp / 100}
                key={draft.id}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (Number.isFinite(n) && n >= 0 && n <= 100) setDraft({ ...draft, maxDiscountBp: Math.round(n * 100) })
                }}
              />
            </Field>
          </div>
          {locked ? <p className="mb-3 rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{t('users.ownerLocked')}</p> : null}
          <div className="grid gap-4 md:grid-cols-2">
            {GROUPS.map((g) => (
              <div key={g} className="rounded-xl border border-line p-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                  <ShieldCheck className="size-4 text-primary" /> {t(`permissionGroups.${g}`)}
                </p>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.filter((p) => PERMISSIONS[p] === g).map((p) => (
                    <Checkbox key={p} disabled={locked} checked={draft.permissions.includes(p)} onCheckedChange={(on) => toggle(p, on)} label={t(`permissions.${p}`)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          {!locked ? (
            <div className="mt-4 flex justify-between border-t border-line pt-4">
              {draft.id && !draft.systemKey ? (
                <Button
                  variant="ghost"
                  onClick={async () => (await confirm({ title: t('common.confirmDelete'), body: draft.name, danger: true })) && del.mutate({ id: draft.id })}
                >
                  <Trash2 /> {t('common.delete')}
                </Button>
              ) : (
                <span />
              )}
              <Button
                loading={save.isPending}
                disabled={!draft.systemKey && draft.name.trim().length < 2}
                onClick={() => save.mutate({ id: draft.id || undefined, name: draft.systemKey ? roleLabel(draft) : draft.name, description: draft.description, maxDiscountBp: draft.maxDiscountBp, permissions: draft.permissions })}
              >
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  )
}
