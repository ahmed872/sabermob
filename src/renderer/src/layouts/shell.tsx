import { Suspense, useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { KeyRound, Lock, LogOut, UserCog, UsersRound } from 'lucide-react'
import { call } from '../lib/api'
import { cn } from '../lib/utils'
import { useApp, useCan } from '../stores/app'
import { PageLoader } from '../components/ui/spinner'
import { Dropdown } from '../components/ui/dropdown'
import { Button } from '../components/ui/button'
import { Avatar } from '../features/auth/login-screen'
import { ActivationScreen, LicenseBadge } from '../features/license/activation'
import { BrandMark } from './brand'
import { NAV } from './nav'
import { ROUTES, DEFAULT_ROUTE } from './routes'
import { LanguageToggle, ThemeToggle } from './preferences'
import { AccountDialog, useAccountDialog } from '../features/auth/account-dialog'
import { ShellExtras } from './shell-extras'

export function Shell() {
  const { t } = useTranslation()
  const can = useCan()
  const session = useApp((s) => s.session)!
  const license = useApp((s) => s.license)
  const storeName = useApp((s) => s.system?.storeName)
  const navigate = useNavigate()
  const account = useAccountDialog()

  const items = NAV.filter((n) => ROUTES.some((r) => r.path.startsWith(n.to)) && (!n.permission || can(n.permission)))

  // Alt+1..8 jumps between modules.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const item = items[Number(e.key) - 1]
        if (item) {
          e.preventDefault()
          navigate(item.to)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, navigate])

  const operational = license?.operational ?? true

  return (
    <div className="flex h-full">
      <aside className="flex w-[76px] shrink-0 flex-col items-center bg-sidebar py-3 text-sidebar-fg xl:w-[212px] xl:items-stretch xl:px-3">
        <div className="mb-4 flex items-center gap-2.5 px-1 xl:px-2">
          <BrandMark className="size-10" />
          <div className="hidden min-w-0 xl:block">
            <p className="truncate text-sm font-extrabold text-white">{t('app.name')}</p>
            <p className="truncate text-[11px] text-sidebar-fg/70">{storeName}</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((item, i) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={`${t(item.label)} (Alt+${i + 1})`}
              className={({ isActive }) =>
                cn(
                  'group flex flex-col items-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-semibold transition xl:flex-row xl:gap-3 xl:px-3 xl:text-sm',
                  isActive ? 'bg-sidebar-active text-white shadow-inner' : 'hover:bg-sidebar-active/60 hover:text-white'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn('size-[22px] shrink-0 xl:size-5', isActive && 'text-indigo-300')} />
                  <span className="max-w-full truncate">{t(item.label)}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-2 flex flex-col items-center gap-1 xl:items-stretch">
          <button
            onClick={() => void call('auth.lock')}
            title={t('nav.lock')}
            className="flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold hover:bg-sidebar-active/60 hover:text-white xl:flex-row xl:gap-3 xl:px-3 xl:text-sm"
          >
            <Lock className="size-5" />
            <span>{t('nav.lock')}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4">
          <div className="flex min-w-0 items-center gap-2">
            <ShellExtras.HeaderStart />
          </div>
          <div className="flex items-center gap-1.5">
            <ShellExtras.HeaderEnd />
            <LicenseBadge />
            <LanguageToggle />
            <ThemeToggle />
            <Dropdown
              trigger={
                <button className="ms-1 flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-sunken">
                  <Avatar name={session.fullName} size="sm" />
                  <span className="hidden text-start leading-tight md:block">
                    <span className="block text-[13px] font-bold">{session.fullName}</span>
                    <span className="block text-[11px] text-muted">{session.roleKey ? t(`roles.${session.roleKey}`) : session.roleName}</span>
                  </span>
                </button>
              }
              items={[
                { label: t('auth.myAccount'), icon: UserCog, onSelect: account.open },
                { label: t('license.manage'), icon: KeyRound, onSelect: () => navigate('/settings/license'), hidden: !can('manage_license') },
                'separator',
                { label: t('nav.switchUser'), icon: UsersRound, onSelect: () => void call('auth.lock') },
                { label: t('nav.logout'), icon: LogOut, danger: true, onSelect: () => void call('auth.logout') }
              ]}
            />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">
          {operational ? (
            <Suspense fallback={<PageLoader />}>
              <Routes>
                {ROUTES.filter((r) => !r.permission || can(r.permission)).map((r) => (
                  <Route key={r.path} path={r.path} element={<r.component />} />
                ))}
                <Route path="*" element={<Navigate to={DEFAULT_ROUTE(can)} replace />} />
              </Routes>
            </Suspense>
          ) : (
            <ActivationScreen />
          )}
        </main>
      </div>
      <AccountDialog {...account} />
      {operational ? <ShellExtras.Overlays /> : null}
    </div>
  )
}

export function PageScroll({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('h-full overflow-y-auto p-5', className)}>{children}</div>
}

