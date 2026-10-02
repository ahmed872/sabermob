import { existsSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { protocol } from 'electron'

/**
 * `app://bundle/...` serves the renderer build with strict security headers.
 * `app://media/...` serves images from the workspace media folder only.
 * Using a custom scheme (instead of file://) gives the UI a stable origin
 * and prevents it from reading arbitrary files from disk.
 */
export const APP_SCHEME = 'app'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
}

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: app:",
  "font-src 'self' data:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
].join('; ')

export function registerSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } }
  ])
}

function safeJoin(root: string, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath).replace(/^\/+/, '')
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const full = normalize(join(root, decoded))
  const rootResolved = resolve(root) + sep
  return full.startsWith(rootResolved) ? full : null
}

export function handleAppProtocol(rendererDir: string, mediaDir: () => string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url)
    const isMedia = url.host === 'media'
    const root = isMedia ? mediaDir() : rendererDir
    let file = safeJoin(root, url.pathname === '/' ? '/index.html' : url.pathname)
    if (!file) return new Response('Forbidden', { status: 403 })
    if (!isMedia && (!existsSync(file) || statSync(file).isDirectory())) file = join(rendererDir, 'index.html')
    if (!existsSync(file)) return new Response('Not found', { status: 404 })
    const body = await readFile(file)
    const headers: Record<string, string> = {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    }
    if (!isMedia) headers['Content-Security-Policy'] = CSP
    else headers['Cache-Control'] = 'no-cache'
    return new Response(body, { status: 200, headers })
  })
}
