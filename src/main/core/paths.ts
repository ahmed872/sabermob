import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * All business data lives under one workspace directory so that it can be
 * backed up, exported and moved to another PC as a unit. Program files are
 * never written to — upgrades cannot touch business data.
 */
export interface AppPaths {
  root: string
  workspace: string
  database: string
  media: string
  backups: string
  logs: string
  temp: string
}

export function createPaths(root: string): AppPaths {
  const workspace = join(root, 'workspace')
  const paths: AppPaths = {
    root,
    workspace,
    database: join(workspace, 'central.db'),
    media: join(workspace, 'media'),
    backups: join(root, 'backups'),
    logs: join(root, 'logs'),
    temp: join(root, 'temp')
  }
  for (const dir of [workspace, paths.media, paths.backups, paths.logs, paths.temp]) mkdirSync(dir, { recursive: true })
  for (const sub of ['repairs', 'products', 'signatures', 'branding']) mkdirSync(join(paths.media, sub), { recursive: true })
  return paths
}
