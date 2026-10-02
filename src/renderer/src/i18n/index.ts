import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { modules } from './modules'

type Tree = { [k: string]: string | Tree }

function merge(target: Tree, src: Tree): Tree {
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'object' && v) target[k] = merge((target[k] as Tree) ?? {}, v)
    else target[k] = v
  }
  return target
}

const en: Tree = {}
const ar: Tree = {}
for (const m of modules) {
  merge(en, m.en as Tree)
  merge(ar, m.ar as Tree)
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: 'ar',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false
})

export function applyLanguage(lang: 'ar' | 'en'): void {
  void i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
}

export default i18n
