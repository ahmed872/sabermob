import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PrintDocument } from '@shared/types/printing'
import './print/print.css'
import { applyLanguage } from './i18n'
import { call } from './lib/api'
import { PrintDocumentView } from './print/templates'

/** Hidden print window: fetch the job, render, then signal "ready" via the title. */
function PrintApp() {
  const [doc, setDoc] = useState<PrintDocument | null>(null)
  useEffect(() => {
    const token = new URLSearchParams(location.search).get('token') ?? ''
    call('printing.job', { token })
      .then((d) => {
        applyLanguage(d.store.language)
        setDoc(d)
      })
      .catch(() => (document.title = 'error'))
  }, [])
  useEffect(() => {
    if (!doc) return
    const images = Array.from(document.images).map((img) => (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = img.onerror = r))))
    void Promise.all([document.fonts.ready, ...images]).then(() => requestAnimationFrame(() => (document.title = 'ready')))
  }, [doc])
  return doc ? <PrintDocumentView doc={doc} /> : null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrintApp />
  </StrictMode>
)
