import type { Db, Tx } from '../database/client'

export interface AuditEntry {
  userId?: string | null
  action: string
  entity?: string
  entityId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Append-only audit trail. Callers pass the transaction client so the
 * audit row commits or rolls back together with the business change.
 */
export class AuditService {
  constructor(private readonly db: Db) {}

  async log(entry: AuditEntry, tx?: Tx): Promise<void> {
    await (tx ?? this.db).auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null
      }
    })
  }
}
