import { useTranslation } from 'react-i18next'
import { Languages, Monitor, Moon, Sun } from 'lucide-react'
import { applyLanguage } from '../i18n'
import { applyTheme, setLocalPref, type ThemeMode } from '../lib/theme'
import { Button } from '../components/ui/button'
import { Dropdown } from '../components/ui/dropdown'

/** Language/theme are per-computer preferences (stored locally). */
export function LanguageToggle() {
  const { i18n } = useTranslation()
  const next = i18n.language === 'ar' ? 'en' : 'ar'
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        setLocalPref('language', next)
        applyLanguage(next)
      }}
    >
      <Languages /> {next === 'ar' ? 'العربية' : 'English'}
    </Button>
  )
}

export function ThemeToggle() {
  const { t } = useTranslation()
  const set = (m: ThemeMode) => {
    setLocalPref('theme', m)
    applyTheme(m)
  }
  return (
    <Dropdown
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={t('nav.theme')}>
          <Sun className="dark:hidden" />
          <Moon className="hidden dark:block" />
        </Button>
      }
      items={[
        { label: t('theme.light'), icon: Sun, onSelect: () => set('light') },
        { label: t('theme.dark'), icon: Moon, onSelect: () => set('dark') },
        { label: t('theme.system'), icon: Monitor, onSelect: () => set('system') }
      ]}
    />
  )
}
