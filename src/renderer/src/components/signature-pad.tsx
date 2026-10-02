import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eraser } from 'lucide-react'
import { Button } from './ui/button'

/** Mouse / touch / pen signature capture. Emits a PNG data URL (or null when cleared). */
export function SignaturePad({ onChange, height = 160 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const { t } = useTranslation()
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)

  useEffect(() => {
    const c = canvas.current!
    const ratio = window.devicePixelRatio || 1
    c.width = c.offsetWidth * ratio
    c.height = height * ratio
    const ctx = c.getContext('2d')!
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [height])

  const pos = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-line-strong bg-white">
        <canvas
          ref={canvas}
          style={{ height, width: '100%', touchAction: 'none' }}
          onPointerDown={(e) => {
            drawing.current = true
            canvas.current!.setPointerCapture(e.pointerId)
            const ctx = canvas.current!.getContext('2d')!
            const p = pos(e)
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return
            const ctx = canvas.current!.getContext('2d')!
            const p = pos(e)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
            setEmpty(false)
          }}
          onPointerUp={() => {
            drawing.current = false
            if (!empty || canvas.current) onChange(canvas.current!.toDataURL('image/png'))
          }}
        />
        {empty ? <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400">{t('repairs.signHere')}</span> : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="mt-1"
        onClick={() => {
          const c = canvas.current!
          c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
          setEmpty(true)
          onChange(null)
        }}
      >
        <Eraser /> {t('repairs.clearSignature')}
      </Button>
    </div>
  )
}
