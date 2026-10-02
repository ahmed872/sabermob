import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { closeSync, createReadStream, createWriteStream, mkdirSync, openSync, readSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { AppError } from '@shared/errors'

/**
 * Central Pro encrypted archive (.cpbak / .centralbundle).
 *
 *   "CPBK" | u8 version | u32 headerLen | header JSON | iv(12) | AES-256-GCM(gzip(entries)) | tag(16)
 *
 * The header is authenticated as GCM additional data, so neither the data
 * nor the metadata can be altered without detection. Entries are
 * `u16 nameLen | name | u64 size | bytes`, terminated by nameLen = 0.
 * Everything is streamed: archive size is bounded by disk, not memory.
 */

const MAGIC = Buffer.from('CPBK')
const FORMAT = 1
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

/** Data key wrapped with a password-derived key (stored in every archive). */
export interface WrappedKey {
  salt: string
  iv: string
  tag: string
  ct: string
  keyId: string
}

export interface ArchiveHeader {
  format: number
  kind: string
  createdAt: string
  appVersion: string
  deviceId: string
  shopName: string
  migrations: string[]
  counts: Record<string, number>
  files: number
  bytes: number
  wrap: WrappedKey
}

export interface ArchiveEntry {
  name: string
  path: string
}

export const keyIdOf = (key: Buffer): string => createHash('sha256').update(key).update('central-pro:backup-key').digest('hex').slice(0, 16)

function passwordKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password.normalize('NFC'), salt, 32, SCRYPT)
}

export function wrapKey(key: Buffer, password: string): WrappedKey {
  const salt = randomBytes(16)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', passwordKey(password, salt), iv)
  const ct = Buffer.concat([cipher.update(key), cipher.final()])
  return { salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64'), keyId: keyIdOf(key) }
}

/** Throws BACKUP_PASSWORD when the password is wrong. */
export function unwrapKey(wrap: WrappedKey, password: string): Buffer {
  try {
    const decipher = createDecipheriv('aes-256-gcm', passwordKey(password, Buffer.from(wrap.salt, 'base64')), Buffer.from(wrap.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(wrap.tag, 'base64'))
    const key = Buffer.concat([decipher.update(Buffer.from(wrap.ct, 'base64')), decipher.final()])
    if (key.length !== 32 || !timingSafeEqual(Buffer.from(keyIdOf(key)), Buffer.from(wrap.keyId))) throw new Error('key id')
    return key
  } catch {
    throw new AppError('BACKUP_PASSWORD')
  }
}

async function* entryStream(entries: ArchiveEntry[]): AsyncGenerator<Buffer> {
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8')
    const size = statSync(e.path).size
    const head = Buffer.alloc(2 + name.length + 8)
    head.writeUInt16BE(name.length, 0)
    name.copy(head, 2)
    head.writeBigUInt64BE(BigInt(size), 2 + name.length)
    yield head
    if (size === 0) continue
    let read = 0
    for await (const chunk of createReadStream(e.path, { start: 0, end: size - 1 })) {
      read += (chunk as Buffer).length
      yield chunk as Buffer
    }
    if (read !== size) throw new Error(`File changed while archiving: ${e.name}`)
  }
  yield Buffer.alloc(2) // terminator
}

/** Writes an archive atomically (temp file + rename). Returns its sha256. */
export async function writeArchive(file: string, header: Omit<ArchiveHeader, 'format'>, entries: ArchiveEntry[], key: Buffer): Promise<{ sha256: string; size: number }> {
  mkdirSync(dirname(file), { recursive: true })
  const partial = `${file}.partial`
  try {
    const headerBytes = Buffer.from(JSON.stringify({ format: FORMAT, ...header }), 'utf8')
    const prefix = Buffer.alloc(9)
    MAGIC.copy(prefix, 0)
    prefix.writeUInt8(FORMAT, 4)
    prefix.writeUInt32BE(headerBytes.length, 5)
    const iv = randomBytes(12)
    writeFileSync(partial, Buffer.concat([prefix, headerBytes, iv]))
    const cipher = createCipheriv('aes-256-gcm', key, iv)
    cipher.setAAD(headerBytes)
    await pipeline(Readable.from(entryStream(entries)), createGzip({ level: 6 }), cipher, createWriteStream(partial, { flags: 'a' }))
    const fd = openSync(partial, 'a')
    try {
      writeSync(fd, cipher.getAuthTag())
    } finally {
      closeSync(fd)
    }
    renameSync(partial, file)
  } catch (err) {
    rmSync(partial, { force: true })
    throw err
  }
  return { sha256: await sha256File(file), size: statSync(file).size }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

/** Reads and validates the (unauthenticated until extraction) header. */
export function readHeader(file: string): { header: ArchiveHeader; headerBytes: Buffer; dataStart: number; size: number } {
  let fd: number
  try {
    fd = openSync(file, 'r')
  } catch {
    throw new AppError('FILE_ERROR')
  }
  try {
    const size = statSync(file).size
    const prefix = Buffer.alloc(9)
    if (size < 9 + 12 + 16 || readSync(fd, prefix, 0, 9, 0) !== 9 || !prefix.subarray(0, 4).equals(MAGIC)) throw new AppError('BACKUP_INVALID')
    if (prefix.readUInt8(4) !== FORMAT) throw new AppError('BACKUP_INVALID', 'Unsupported backup format')
    const len = prefix.readUInt32BE(5)
    if (len > 1_000_000 || 9 + len + 28 > size) throw new AppError('BACKUP_INVALID')
    const headerBytes = Buffer.alloc(len)
    readSync(fd, headerBytes, 0, len, 9)
    let header: ArchiveHeader
    try {
      header = JSON.parse(headerBytes.toString('utf8')) as ArchiveHeader
    } catch {
      throw new AppError('BACKUP_INVALID')
    }
    if (header.format !== FORMAT || !header.wrap?.keyId || !Array.isArray(header.migrations)) throw new AppError('BACKUP_INVALID')
    return { header, headerBytes, dataStart: 9 + len, size }
  } finally {
    closeSync(fd)
  }
}

function safeName(name: string): string {
  const n = normalize(name)
  if (!n || n.startsWith('..') || n.includes(`..${sep}`) || n.startsWith(sep) || /^[a-zA-Z]:/.test(n) || !/^(db|media)[\\/]/.test(n)) throw new AppError('BACKUP_INVALID', `Unsafe entry: ${name}`)
  return n
}

/**
 * Decrypts and extracts into `dir`. The GCM tag is checked at the end; on
 * any failure the caller must discard `dir` (nothing is trusted until this
 * resolves).
 */
export async function extractArchive(file: string, key: Buffer, dir: string): Promise<{ header: ArchiveHeader; files: string[] }> {
  const { header, headerBytes, dataStart, size } = readHeader(file)
  const fd = openSync(file, 'r')
  const iv = Buffer.alloc(12)
  const tag = Buffer.alloc(16)
  try {
    readSync(fd, iv, 0, 12, dataStart)
    readSync(fd, tag, 0, 16, size - 16)
  } finally {
    closeSync(fd)
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAAD(headerBytes)
  decipher.setAuthTag(tag)
  mkdirSync(dir, { recursive: true })

  const files: string[] = []
  let buf: Buffer = Buffer.alloc(0)
  let out: number | null = null
  let remaining = 0n
  let done = false
  const sink = async function (source: AsyncIterable<Buffer>) {
    for await (const chunk of source) {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
      while (buf.length && !done) {
        if (out !== null) {
          const take = Number(remaining < BigInt(buf.length) ? remaining : BigInt(buf.length))
          writeSync(out, buf, 0, take)
          remaining -= BigInt(take)
          buf = buf.subarray(take)
          if (remaining === 0n) {
            closeSync(out)
            out = null
          }
          continue
        }
        if (buf.length < 2) break
        const nameLen = buf.readUInt16BE(0)
        if (nameLen === 0) {
          done = true
          buf = buf.subarray(2)
          break
        }
        if (buf.length < 2 + nameLen + 8) break
        const name = safeName(buf.subarray(2, 2 + nameLen).toString('utf8'))
        remaining = buf.readBigUInt64BE(2 + nameLen)
        buf = buf.subarray(2 + nameLen + 8)
        const target = join(dir, name)
        mkdirSync(dirname(target), { recursive: true })
        out = openSync(target, 'w')
        files.push(name)
        if (remaining === 0n) {
          closeSync(out)
          out = null
        }
      }
    }
  }
  try {
    await pipeline(createReadStream(file, { start: dataStart + 12, end: size - 17 }), decipher, createGunzip(), sink)
  } catch (err) {
    if (out !== null) closeSync(out)
    if (err instanceof AppError) throw err
    throw new AppError('BACKUP_INVALID', String(err))
  }
  if (!done || out !== null) throw new AppError('BACKUP_INVALID', 'Truncated archive')
  return { header, files }
}
