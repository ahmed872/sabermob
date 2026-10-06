import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { AppError } from '@shared/errors'

const MAX_BYTES = 6 * 1024 * 1024
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/**
 * Stores images (repair photos, signatures, logo, product photos) inside the
 * workspace media folder. The database keeps relative paths only, so the
 * whole workspace can be moved to another computer.
 */
export class MediaService {
  constructor(private readonly root: string) {}

  saveDataUrl(folder: string, dataUrl: string): string {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl)
    if (!m) throw new AppError('VALIDATION', 'Unsupported image', { reason: 'badImage' })
    const bytes = Buffer.from(m[2]!, 'base64')
    if (bytes.length > MAX_BYTES) throw new AppError('VALIDATION', 'Image too large', { reason: 'imageTooLarge' })
    // Verify the magic bytes match the declared type.
    const sig = bytes.subarray(0, 12).toString('hex')
    const ok =
      (m[1] === 'image/png' && sig.startsWith('89504e47')) ||
      (m[1] === 'image/jpeg' && sig.startsWith('ffd8ff')) ||
      (m[1] === 'image/webp' && sig.startsWith('52494646') && bytes.subarray(8, 12).toString() === 'WEBP')
    if (!ok) throw new AppError('VALIDATION', 'Image content does not match its type', { reason: 'badImage' })
    const rel = `${folder}/${randomUUID()}.${EXT[m[1]!]}`
    const full = this.resolve(rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, bytes)
    return rel
  }

  resolve(rel: string): string {
    const full = normalize(join(this.root, rel))
    if (!full.startsWith(resolve(this.root) + sep)) throw new AppError('VALIDATION', 'Invalid media path', { reason: 'badImage' })
    return full
  }

  remove(rel: string | null | undefined): void {
    if (!rel) return
    try {
      rmSync(this.resolve(rel), { force: true })
    } catch {
      /* already gone */
    }
  }

  /** URL served by the app:// protocol (renderer only). */
  static url(rel: string | null | undefined): string | null {
    return rel ? `app://media/${rel.split('/').map(encodeURIComponent).join('/')}` : null
  }
}
