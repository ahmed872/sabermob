import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

/**
 * Structured logging with rotation. Separate streams:
 *  - app-*.log      general application events
 *  - error-*.log    errors only (from all loggers)
 *  - security-*.log authentication / authorization / license events
 * Business audit events go to the AuditLog table (queryable in the app).
 */
export interface Loggers {
  app: winston.Logger
  security: winston.Logger
}

const SENSITIVE = /pass(word)?|pin|secret|token|key|hash|passcode/i

function redact(info: Record<string, unknown>): Record<string, unknown> {
  for (const k of Object.keys(info)) {
    if (SENSITIVE.test(k) && typeof info[k] === 'string') info[k] = '[redacted]'
  }
  return info
}

const redactFormat = winston.format((info) => redact(info as Record<string, unknown>) as winston.Logform.TransformableInfo)

export function createLoggers(dir: string | null, level = 'info'): Loggers {
  const format = winston.format.combine(redactFormat(), winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json())
  const rotate = (name: string, lvl?: string) =>
    new DailyRotateFile({
      dirname: dir!,
      filename: `${name}-%DATE%.log`,
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',
      maxFiles: '30d',
      level: lvl
    })
  const transports = (name: string): winston.transport[] => {
    if (!dir) return [new winston.transports.Console({ level: 'error', silent: process.env.NODE_ENV === 'test' })]
    const list: winston.transport[] = [rotate(name), rotate('error', 'error')]
    if (process.env.NODE_ENV === 'development') list.push(new winston.transports.Console({ format: winston.format.simple() }))
    return list
  }
  return {
    app: winston.createLogger({ level, format, transports: transports('app') }),
    security: winston.createLogger({ level: 'info', format, transports: transports('security') })
  }
}

/** A logger that discards everything — used by tests. */
export function createSilentLoggers(): Loggers {
  const silent = () => winston.createLogger({ silent: true, transports: [new winston.transports.Console({ silent: true })] })
  return { app: silent(), security: silent() }
}
