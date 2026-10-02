import { parseSettings, SETTINGS_GROUPS, type AllSettings, type SettingsGroup, type SettingsOf } from '@shared/settings'
import type { Db, Tx } from '../database/client'

/**
 * Typed settings with an in-memory cache. All reads are synchronous after
 * `load()`, which keeps hot paths (POS pricing, QR checks) fast.
 */
export class SettingsService {
  #cache: AllSettings | null = null
  #listeners: Array<(group: SettingsGroup) => void> = []

  constructor(private readonly db: Db) {}

  async load(): Promise<AllSettings> {
    const rows = await this.db.setting.findMany({ where: { key: { in: SETTINGS_GROUPS.map((g) => `settings.${g}`) } } })
    const map = new Map(rows.map((r) => [r.key, r.value]))
    const out = {} as Record<string, unknown>
    for (const g of SETTINGS_GROUPS) {
      let raw: unknown = {}
      const v = map.get(`settings.${g}`)
      if (v) {
        try {
          raw = JSON.parse(v)
        } catch {
          raw = {}
        }
      }
      out[g] = parseSettings(g, raw)
    }
    this.#cache = out as AllSettings
    return this.#cache
  }

  all(): AllSettings {
    if (!this.#cache) throw new Error('Settings not loaded')
    return this.#cache
  }

  get<G extends SettingsGroup>(group: G): SettingsOf<G> {
    return this.all()[group]
  }

  async update<G extends SettingsGroup>(group: G, patch: Partial<SettingsOf<G>>, userId?: string, tx?: Tx): Promise<SettingsOf<G>> {
    const next = parseSettings(group, { ...this.get(group), ...patch })
    const client = tx ?? this.db
    await client.setting.upsert({
      where: { key: `settings.${group}` },
      create: { key: `settings.${group}`, value: JSON.stringify(next), updatedById: userId ?? null },
      update: { value: JSON.stringify(next), updatedById: userId ?? null }
    })
    ;(this.#cache as Record<string, unknown>)[group] = next
    for (const l of this.#listeners) l(group)
    return next
  }

  onChange(listener: (group: SettingsGroup) => void): void {
    this.#listeners.push(listener)
  }

  /** Raw key/value storage for internal values (secrets, trial markers). */
  async getRaw(key: string, tx?: Tx): Promise<string | null> {
    const row = await (tx ?? this.db).setting.findUnique({ where: { key } })
    return row?.value ?? null
  }

  async setRaw(key: string, value: string, tx?: Tx): Promise<void> {
    await (tx ?? this.db).setting.upsert({ where: { key }, create: { key, value }, update: { value } })
  }
}
