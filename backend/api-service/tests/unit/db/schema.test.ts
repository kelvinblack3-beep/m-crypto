import { describe, expect, it } from 'vitest'
import { getTableColumns, type Column } from 'drizzle-orm'
import * as schema from '../../../src/db/schema'
import { kvEntries, newlyMeta } from '../../../src/db/schema'

describe('db/schema', () => {
  it('exports every table without TS error', () => {
    // If any exported table fails to load, the import above would have
    // thrown at module-evaluation time. Assert presence to keep this
    // honest at runtime too.
    expect(schema.newlyMeta).toBeDefined()
    expect(schema.kvEntries).toBeDefined()
  })

  it('getTableColumns returns the expected columns for newlyMeta', () => {
    const columns = getTableColumns(newlyMeta)
    expect(Object.keys(columns).sort()).toEqual(
      ['env', 'id', 'project_id', 'template_version'].sort(),
    )
  })

  it('getTableColumns returns the expected columns for kvEntries', () => {
    const columns = getTableColumns(kvEntries)
    expect(Object.keys(columns).sort()).toEqual(
      ['expires_at', 'key', 'value'].sort(),
    )
  })

  it('kvEntries table has key, value, expires_at columns', () => {
    const columns = getTableColumns(kvEntries)
    expect(columns).toHaveProperty('key')
    expect(columns).toHaveProperty('value')
    expect(columns).toHaveProperty('expires_at')
  })

  it('newlyMeta.id is column-shaped at the type and runtime level', () => {
    // Type-level assertion: typeof newlyMeta.id must be assignable to Column.
    // This line fails to compile if the schema ever stops producing a
    // Drizzle Column for `id`.
    const _idTypeCheck: Column = newlyMeta.id
    void _idTypeCheck

    // Runtime shape — Drizzle columns expose `name`, `dataType`, and
    // `columnType`. Verify the representative trio so a refactor that
    // swaps in a non-column value gets caught at test time as well.
    expect(newlyMeta.id).toBeDefined()
    expect(typeof newlyMeta.id.name).toBe('string')
    expect(newlyMeta.id.name).toBe('id')
    expect(typeof (newlyMeta.id as Column).dataType).toBe('string')
    expect(typeof (newlyMeta.id as Column).columnType).toBe('string')
  })

  it('kvEntries.key is column-shaped and marked as primary key', () => {
    const _keyTypeCheck: Column = kvEntries.key
    void _keyTypeCheck

    expect(kvEntries.key.name).toBe('key')
    expect(kvEntries.key.primary).toBe(true)
  })
})
