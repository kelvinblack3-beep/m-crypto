import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock drizzle-orm so the predicate builders (`eq`, `and`, `gt`, `isNull`,
// `like`, `or`, `sql`) return plain tagged objects that the fake DB can
// inspect. KV imports these to build WHERE clauses; the real drizzle
// runtime is irrelevant to the in-memory roundtrip we want to exercise.
vi.mock('drizzle-orm', () => {
  type Expr =
    | { kind: 'eq'; col: string; value: unknown }
    | { kind: 'gt'; col: string; value: unknown }
    | { kind: 'isNull'; col: string }
    | { kind: 'like'; col: string; pattern: string }
    | { kind: 'and'; parts: Expr[] }
    | { kind: 'or'; parts: Expr[] }
    | { kind: 'raw'; sql: string }

  const colName = (c: unknown): string => {
    if (c && typeof c === 'object' && 'name' in (c as Record<string, unknown>)) {
      return String((c as { name: unknown }).name)
    }
    return String(c)
  }

  return {
    eq: (col: unknown, value: unknown): Expr => ({ kind: 'eq', col: colName(col), value }),
    gt: (col: unknown, value: unknown): Expr => ({ kind: 'gt', col: colName(col), value }),
    isNull: (col: unknown): Expr => ({ kind: 'isNull', col: colName(col) }),
    like: (col: unknown, pattern: string): Expr => ({ kind: 'like', col: colName(col), pattern }),
    and: (...parts: Expr[]): Expr => ({ kind: 'and', parts }),
    or: (...parts: Expr[]): Expr => ({ kind: 'or', parts }),
    sql: Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]): Expr => {
        const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `\${${i}}` : ''), '')
        return { kind: 'raw', sql: text }
      },
      {
        // KV.list passes `sql\`TRUE\`` as the where when no prefix is given.
        raw: (s: string): Expr => ({ kind: 'raw', sql: s }),
      },
    ),
  }
})

// The real schema, not a mock: a column name KV gets wrong must fail here.
import { KV } from '../../src/platform/kv'

type Row = { key: string; value: unknown; expires_at: Date | null }

type Predicate =
  | { kind: 'eq'; col: string; value: unknown }
  | { kind: 'gt'; col: string; value: unknown }
  | { kind: 'isNull'; col: string }
  | { kind: 'like'; col: string; pattern: string }
  | { kind: 'and'; parts: Predicate[] }
  | { kind: 'or'; parts: Predicate[] }
  | { kind: 'raw'; sql: string }

function matches(row: Row, p: Predicate): boolean {
  switch (p.kind) {
    case 'eq':
      return (row as Record<string, unknown>)[p.col] === p.value
    case 'gt': {
      const v = (row as Record<string, unknown>)[p.col]
      if (v instanceof Date && p.value instanceof Date) return v.getTime() > p.value.getTime()
      return false
    }
    case 'isNull':
      return (row as Record<string, unknown>)[p.col] === null
    case 'like': {
      const v = (row as Record<string, unknown>)[p.col]
      if (typeof v !== 'string') return false
      // KV only ever uses trailing `%` prefix matches.
      const stripped = p.pattern.replace(/%$/, '')
      return v.startsWith(stripped)
    }
    case 'and':
      return p.parts.every((q) => matches(row, q))
    case 'or':
      return p.parts.some((q) => matches(row, q))
    case 'raw':
      // `sql\`TRUE\`` (used by list with no prefix) matches everything.
      return /TRUE/i.test(p.sql)
  }
}

/**
 * Fake DB that mirrors the exact drizzle chain shapes KV uses:
 *   - db.select({...}).from(t).where(p).limit(n)   // get / list
 *   - db.insert(t).values(v).onConflictDoUpdate({set}) // set
 *   - db.delete(t).where(p)                         // delete
 *   - db.execute(sql`...`)                          // increment
 *
 * Backed by an in-memory Map keyed by row.key.
 */
function makeFakeDb() {
  const store = new Map<string, Row>()

  const selectBuilder = (cols: Record<string, { name: string }>) => {
    const projection = Object.entries(cols).map(([alias, c]) => [alias, c.name] as const)
    let predicate: Predicate | null = null
    let limit: number | null = null

    const run = (): Record<string, unknown>[] => {
      const out: Record<string, unknown>[] = []
      for (const row of store.values()) {
        if (predicate && !matches(row, predicate)) continue
        const projected: Record<string, unknown> = {}
        for (const [alias, colKey] of projection) {
          projected[alias] = (row as Record<string, unknown>)[colKey]
        }
        out.push(projected)
        if (limit !== null && out.length >= limit) break
      }
      return out
    }

    const chain = {
      from: (_t: unknown) => chain,
      where: (p: Predicate) => {
        predicate = p
        return chain
      },
      limit: (n: number) => {
        limit = n
        return Promise.resolve(run())
      },
      // Awaiting the builder directly (no .limit()) runs the query — KV.list
      // does this for the prefix scan.
      then: (resolve: (v: Record<string, unknown>[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }
    return chain
  }

  const insertBuilder = () => {
    let pending: { key: string; value: unknown; expires_at: Date | null } | null = null
    const chain = {
      values: (v: { key: string; value: unknown; expires_at: Date | null }) => {
        pending = v
        return chain
      },
      onConflictDoUpdate: (_opts: {
        target: unknown
        set: { value: unknown; expires_at: Date | null }
      }) => {
        if (!pending) throw new Error('insert.values() not called')
        const existing = store.get(pending.key)
        if (existing) {
          existing.value = _opts.set.value
          existing.expires_at = _opts.set.expires_at
        } else {
          store.set(pending.key, { ...pending })
        }
        return Promise.resolve()
      },
    }
    return chain
  }

  const deleteBuilder = () => {
    let predicate: Predicate | null = null
    const chain = {
      where: (p: Predicate) => {
        predicate = p
        const toDrop: string[] = []
        for (const [k, row] of store.entries()) {
          if (!predicate || matches(row, predicate)) toDrop.push(k)
        }
        for (const k of toDrop) store.delete(k)
        return Promise.resolve()
      },
    }
    return chain
  }

  const execute = async (expr: { kind: 'raw'; sql: string } | unknown) => {
    // KV.increment passes a sql`INSERT ... RETURNING ...` template. We don't
    // re-parse SQL — we re-implement the semantics: INSERT-or-UPDATE with
    // a numeric delta and return the resulting value.
    // The fake captures the operation by replaying the same in-memory map.
    const op = (execute as unknown as { __pending?: { key: string; by: number } }).__pending
    if (!op) throw new Error('execute called without pending increment')
    const existing = store.get(op.key)
    const current = typeof existing?.value === 'number' ? (existing.value as number) : 0
    const next = current + op.by
    if (existing) {
      existing.value = next
    } else {
      store.set(op.key, { key: op.key, value: next, expires_at: null })
    }
    delete (execute as unknown as { __pending?: { key: string; by: number } }).__pending
    return { rows: [{ n: next }] }
  }

  const db = {
    select: (cols: Record<string, { name: string }>) => selectBuilder(cols),
    insert: (_t: unknown) => insertBuilder(),
    delete: (_t: unknown) => deleteBuilder(),
    execute,
    // Test hook: KV.increment builds the sql tag internally; tell the fake
    // what (key, by) is about to be executed so it can mutate the store.
    __setPendingIncrement: (key: string, by: number) => {
      ;(execute as unknown as { __pending?: { key: string; by: number } }).__pending = { key, by }
    },
    __store: store,
  }

  return db
}

describe('KV roundtrip (integration with fake drizzle DB)', () => {
  let fake: ReturnType<typeof makeFakeDb>
  let kv: KV

  beforeEach(() => {
    fake = makeFakeDb()
    // The real KV.increment doesn't go through our hook, so monkey-patch
    // it to register the pending op against the fake before delegating.
    kv = new KV(fake as unknown as never)
    const realIncrement = kv.increment.bind(kv)
    kv.increment = async (key: string, by: number = 1) => {
      fake.__setPendingIncrement(key, by)
      return realIncrement(key, by)
    }
  })

  it('set + get roundtrips the stored value', async () => {
    await kv.set('feature:beta', { enabled: true })

    const value = await kv.get<{ enabled: boolean }>('feature:beta')

    expect(value).toEqual({ enabled: true })
  })

  it('returns null once the TTL has expired', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))

      await kv.set('session:abc', 'tok', { ttlSeconds: 60 })

      // Sanity: before expiry, the value is present.
      expect(await kv.get('session:abc')).toBe('tok')

      // Jump past the TTL window.
      vi.setSystemTime(new Date('2026-01-01T00:02:00Z'))

      expect(await kv.get('session:abc')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('delete removes the key', async () => {
    await kv.set('temp', 'x')
    expect(await kv.get('temp')).toBe('x')

    await kv.delete('temp')

    expect(await kv.get('temp')).toBeNull()
    expect(fake.__store.has('temp')).toBe(false)
  })

  it('list returns only keys matching the prefix', async () => {
    await kv.set('feature:a', 1)
    await kv.set('feature:b', 2)
    await kv.set('other:c', 3)

    const keys = await kv.list('feature:')

    expect(keys.sort()).toEqual(['feature:a', 'feature:b'])
  })

  it('increment without a prior key starts at the increment value', async () => {
    const result = await kv.increment('counter', 5)

    expect(result).toBe(5)
    expect(await kv.get<number>('counter')).toBe(5)
  })
})
