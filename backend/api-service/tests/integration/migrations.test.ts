import { describe, expect, it } from 'vitest'
import { getTableConfig } from 'drizzle-orm/pg-core'
import type { PgTable } from 'drizzle-orm/pg-core'
import * as schema from '../../src/db/schema'

/**
 * Smoke tests that guard against schema typos by inspecting each exported
 * Drizzle table at runtime. These don't touch a real database — they verify
 * that the table definitions in `src/db/schema.ts` are well-formed before
 * any migration is ever generated from them.
 */

type ExportedTable = { name: string; table: PgTable }

const exportedTables: ExportedTable[] = (Object.entries(schema) as [string, unknown][])
  .filter(
    (entry): entry is [string, PgTable] =>
      // A Drizzle PgTable carries getTableConfig-readable internals; the
      // cheapest runtime discriminator is the presence of the Symbol-keyed
      // entity kind, but Object-level duck typing on the Symbol API is
      // brittle across drizzle-orm versions, so we let getTableConfig
      // itself reject non-tables below.
      typeof entry[1] === 'object' && entry[1] !== null,
  )
  .flatMap(([name, value]) => {
    try {
      getTableConfig(value)
      return [{ name, table: value }]
    } catch {
      return []
    }
  })

describe('db/schema migrations smoke test', () => {
  it('discovers at least one exported table', () => {
    // Sanity check on the discovery loop itself — if this ever drops to
    // zero the rest of the suite becomes vacuously true.
    expect(exportedTables.length).toBeGreaterThan(0)
  })

  it.each(exportedTables)('table $name has at least one column', ({ table }) => {
    const { columns } = getTableConfig(table)
    expect(columns.length).toBeGreaterThanOrEqual(1)
  })

  it.each(exportedTables)('table $name has at least one primary key column', ({ table }) => {
    const { columns, primaryKeys } = getTableConfig(table)
    const hasColumnLevelPk = columns.some((column) => column.primary)
    const hasTableLevelPk = primaryKeys.length > 0
    expect(hasColumnLevelPk || hasTableLevelPk).toBe(true)
  })

  it('kvEntries has key, value, and expires_at columns by their DB-side names', () => {
    const { columns } = getTableConfig(schema.kvEntries)
    const dbNames = columns.map((column) => column.name).sort()
    expect(dbNames).toEqual(['expires_at', 'key', 'value'])
  })

  it('no two exported tables share the same DB-side table name', () => {
    const dbNames = exportedTables.map(({ table }) => getTableConfig(table).name)
    const duplicates = dbNames.filter(
      (name, index) => dbNames.indexOf(name) !== index,
    )
    expect(duplicates).toEqual([])
    expect(new Set(dbNames).size).toBe(dbNames.length)
  })
})
