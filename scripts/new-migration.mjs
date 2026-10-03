// Creates the next SQL migration from changes in prisma/schema.prisma.
//   npm run db:migration -- add_customer_email
// The current schema is rebuilt from the existing migrations in a scratch
// database, then diffed against schema.prisma. The app applies migrations
// itself at startup (src/main/database/migrator.ts), with a backup first.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'

const root = resolve(import.meta.dirname, '..')
const name = process.argv[2]
if (!name || !/^[a-z0-9_]{3,60}$/.test(name)) {
  console.error('Usage: npm run db:migration -- <name_in_snake_case>')
  process.exit(1)
}

const migrationsDir = join(root, 'prisma/migrations')
const existing = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(migrationsDir, d.name, 'migration.sql')))
  .map((d) => d.name)
  .sort()

const devDir = join(root, '.dev')
const devDb = join(devDir, 'dev.db')
mkdirSync(devDir, { recursive: true })
for (const f of [devDb, `${devDb}-wal`, `${devDb}-shm`]) rmSync(f, { force: true })
const db = new Database(devDb)
for (const m of existing) db.exec(readFileSync(join(migrationsDir, m, 'migration.sql'), 'utf8'))
db.close()

const sql = execFileSync('npx', ['prisma', 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--script'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32'
})
if (!sql.trim() || /^-- This is an empty migration\.?\s*$/m.test(sql.trim())) {
  console.log('No schema changes: nothing to do.')
  process.exit(0)
}

const next = String((existing.length ? Number.parseInt(existing.at(-1), 10) : 0) + 1).padStart(4, '0')
const dir = join(migrationsDir, `${next}_${name}`)
mkdirSync(dir)
writeFileSync(join(dir, 'migration.sql'), sql)
console.log(`Created prisma/migrations/${next}_${name}/migration.sql — review it, then run the tests.`)
