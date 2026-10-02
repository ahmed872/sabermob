import { defineConfig } from 'prisma/config'

// The URL is only used by Prisma CLI tooling during development
// (migration generation). The application opens its own database file
// at runtime and applies migrations with src/main/database/migrator.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: 'file:./.dev/dev.db' }
})
