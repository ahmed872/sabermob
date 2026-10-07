import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { drawToJpeg, fileToDataUrl } from '../lib/images'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

/** Add photos from a file or a webcam (works fully offline). */
export function PhotoCapture({
  onPhoto,
  multiple = true,
  maxSide = 1600,
  addLabel,
  takeLabel
}: {
  onPhoto: (dataUrl: string) => void
  multiple?: boolean
  /** longest side of the stored JPEG, in pixels */
  maxSide?: number
  addLabel?: string
  takeLabel?: string
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState(false)
  return (
    <div className="flex gap-2">
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={multiple}
        className="hidden"
        onChange={async (e) => {
          for (const f of Array.from(e.target.files ?? [])) {
            try {
              onPhoto(await fileToDataUrl(f, maxSide))
            } catch {
              toast.error(t('errors.FILE_ERROR'))
            }
          }
          e.target.value = ''
        }}
      />
      <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
        <ImagePlus /> {addLabel ?? t('repairs.addPhoto')}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setCamera(true)}>
        <Camera /> {takeLabel ?? t('repairs.takePhoto')}
      </Button>
      {camera ? <CameraDialog onClose={() => setCamera(false)} onCapture={onPhoto} maxSide={maxSide} /> : null}
    </div>
  )
}

function CameraDialog({ onClose, onCapture, maxSide }: { onClose: () => void; onCapture: (d: string) => void; maxSide: number }) {
  const { t } = useTranslation()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let stream: MediaStream | null = null
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
      .then((s) => {
        stream = s
        if (video.current) {
          video.current.srcObject = s
          void video.current.play()
        }
      })
      .catch(() => setError(true))
    return () => stream?.getTracks().forEach((tr) => tr.stop())
  }, [])
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('repairs.camera')}
      footer={
        <Button
          disabled={error}
          onClick={() => {
            const v = video.current
            if (!v || !v.videoWidth) return
            onCapture(drawToJpeg(v, v.videoWidth, v.videoHeight, maxSide))
            onClose()
          }}
        >
          <Camera /> {t('repairs.capture')}
        </Button>
      }
    >
      {error ? <p className="rounded-xl bg-danger-soft p-4 text-sm text-danger">{t('errors.FILE_ERROR')}</p> : <video ref={video} className="w-full rounded-xl bg-black" muted playsInline />}
    </Dialog>
  )
}
