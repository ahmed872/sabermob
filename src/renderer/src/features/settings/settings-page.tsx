import type { ComponentType } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BadgePercent, Building2, FileText, Gift, KeyRound, Lock, Monitor, Package, Printer, QrCode, Receipt,
  ScrollText, ShieldCheck, ShoppingCart, Users, Wrench
} from 'lucide-react'
import type { PermissionKey } from '@shared/permissions'
import type { SettingsGroup } from '@shared/settings'
import { cn } from '../../lib/utils'
import { useCan } from '../../stores/app'
import { Card } from '../../components/ui/misc'
import { LicensePanel } from '../license/activation'
import { SettingsGroupForm } from './settings-form'
import { UsersSection } from './users-section'
import { RolesSection } from './roles-section'
import { AuditSection } from './audit-section'
import { DeviceSection } from './device-section'
import { SETTINGS_EXTRA_SECTIONS } from './extra-sections'

export interface SectionDef {
  key: string
  group: 'business' | 'people' | 'operations' | 'system'
  icon: typeof Building2
  permission: PermissionKey[]
  settingsGroup?: SettingsGroup
  component?: ComponentType
}

const SECTIONS: SectionDef[] = [
  { key: 'company', group: 'business', icon: Building2, permission: ['manage_settings'], settingsGroup: 'company' },
  { key: 'taxes', group: 'business', icon: BadgePercent, permission: ['manage_settings'], settingsGroup: 'taxes' },
  { key: 'invoices', group: 'business', icon: FileText, permission: ['manage_settings'], settingsGroup: 'invoices' },
  { key: 'users', group: 'people', icon: Users, permission: ['manage_users'], component: UsersSection },
  { key: 'roles', group: 'people', icon: ShieldCheck, permission: ['manage_users'], component: RolesSection },
  { key: 'security', group: 'people', icon: Lock, permission: ['manage_settings'], settingsGroup: 'security' },
  { key: 'audit', group: 'people', icon: ScrollText, permission: ['view_audit_log'], component: AuditSection },
  { key: 'pos', group: 'operations', icon: ShoppingCart, permission: ['manage_settings'], settingsGroup: 'pos' },
  { key: 'inventory', group: 'operations', icon: Package, permission: ['manage_settings'], settingsGroup: 'inventory' },
  { key: 'repairs', group: 'operations', icon: Wrench, permission: ['manage_settings'], settingsGroup: 'repairs' },
  { key: 'offers', group: 'operations', icon: Gift, permission: ['manage_settings'], settingsGroup: 'offers' },
  { key: 'loyalty', group: 'operations', icon: Receipt, permission: ['manage_settings'], settingsGroup: 'loyalty' },
  { key: 'printing', group: 'system', icon: Printer, permission: ['manage_settings'], settingsGroup: 'printing' },
  { key: 'qr', group: 'system', icon: QrCode, permission: ['manage_settings'], settingsGroup: 'qr' },
  ...SETTINGS_EXTRA_SECTIONS,
  { key: 'license', group: 'system', icon: KeyRound, permission: ['manage_license'], component: () => <Card className="max-w-2xl"><LicensePanel compact /></Card> },
  { key: 'devices', group: 'system', icon: Monitor, permission: ['manage_settings', 'manage_backups'], component: DeviceSection }
]


export default function SettingsPage() {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const visible = SECTIONS.filter((s) => can(s.permission))
  const { section = visible[0]?.key } = useParams()
  const current = visible.find((s) => s.key === section) ?? visible[0]
  const groups = ['business', 'people', 'operations', 'system'] as const

  return (
    <div className="flex h-full">
      <aside className="w-60 shrink-0 overflow-y-auto border-e border-line bg-surface p-3">
        <h1 className="mb-3 px-2 text-lg font-extrabold">{t('settings.title')}</h1>
        {groups.map((g) => {
          const items = visible.filter((s) => s.group === g)
          if (items.length === 0) return null
          return (
            <div key={g} className="mb-3">
              <p className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-subtle">{t(`settings.groups.${g}`)}</p>
              {items.map((s) => (
                <button
                  key={s.key}
                  onClick={() => navigate(`/settings/${s.key}`)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-sm font-semibold transition',
                    current?.key === s.key ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-sunken hover:text-fg'
                  )}
                >
                  <s.icon className="size-4 shrink-0" />
                  {t(`settings.sections.${s.key}`)}
                </button>
              ))}
            </div>
          )
        })}
      </aside>
      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        {current ? (
          <>
            <h2 className="mb-4 text-xl font-extrabold">{t(`settings.sections.${current.key}`)}</h2>
            {current.settingsGroup ? <SettingsGroupForm key={current.key} group={current.settingsGroup} /> : current.component ? <current.component /> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
