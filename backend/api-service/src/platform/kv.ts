import { and, eq, gt, isNull, like, or, sql } from 'drizzle-orm'
import type { DB } from '../db/client'
import { kvEntries } from '../db/schema'

export class KV {
  constructor(private db: DB) {}

  async get<T = unknown>(key: string): Promise<T | null> {
    const now = new Date()
    const rows = await this.db
      .select({ value: kvEntries.value, expiresAt: kvEntries.expires_at })
      .from(kvEntries)
      .where(and(eq(kvEntries.key, key), or(isNull(kvEntries.expires_at), gt(kvEntries.expires_at, now))))
      .limit(1)
    if (!rows.length) return null
    return rows[0]!.value as T
  }

  async set<T = unknown>(key: string, value: T, opts?: { ttlSeconds?: number }): Promise<void> {
    const expiresAt = opts?.ttlSeconds ? new Date(Date.now() + opts.ttlSeconds * 1000) : null
    await this.db
      .insert(kvEntries)
      .values({ key, value: value as any, expires_at: expiresAt })
      .onConflictDoUpdate({
        target: kvEntries.key,
        set: { value: value as any, expires_at: expiresAt },
      })
  }

  async delete(key: string): Promise<void> {
    await this.db.delete(kvEntries).where(eq(kvEntries.key, key))
  }

  async increment(key: string, by: number = 1): Promise<number> {
    const result: any = await this.db.execute(sql`
      INSERT INTO ${kvEntries} AS kv (key, value, expires_at)
      VALUES (${key}, to_jsonb(${by}::int), NULL)
      ON CONFLICT (key) DO UPDATE
        SET value = to_jsonb(COALESCE(((kv.value)::text)::int, 0) + ${by})
      RETURNING (value)::int AS n
    `)
    const rows: { n: number }[] = (result?.rows ?? result) as { n: number }[]
    return rows[0]?.n ?? by
  }

  async list(prefix?: string): Promise<string[]> {
    const rows = await this.db
      .select({ key: kvEntries.key })
      .from(kvEntries)
      .where(prefix ? like(kvEntries.key, `${prefix}%`) : sql`TRUE`)
    return rows.map((r) => r.key)
  }
}
