import type { Config } from 'drizzle-kit'

// api-service and auth-service share one Neon database. `schemaFilter` scopes
// drizzle-kit to the `auth` Postgres schema so a `push`/`migrate` here never
// sees api-service's tables, sequences, or indexes — `tablesFilter` only
// filters tables and leaves the cross-service sequence-drop trap. Tables in
// src/db/schema.ts are declared via `authSchema.table(...)` so they land in
// the `auth` schema.
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
  schemaFilter: ['auth'],
  // Both services share one database, so each keeps its migration ledger in
  // its own schema: one shared ledger would mix the two journals.
  migrations: { schema: 'auth' },
  verbose: true,
  strict: true,
} satisfies Config
