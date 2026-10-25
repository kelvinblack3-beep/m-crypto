import type { Config } from 'drizzle-kit'

// api-service and auth-service share one Neon database. `schemaFilter` scopes
// drizzle-kit to the `api` Postgres schema so a `push`/`migrate` here never
// sees auth-service's tables, sequences, or indexes — `tablesFilter` only
// filters tables and leaves the cross-service sequence-drop trap. Tables in
// src/db/schema.ts are declared via `apiSchema.table(...)` so they land in
// the `api` schema; the agent's new tenant tables should follow the same
// pattern.
export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
  schemaFilter: ['api'],
  // Both services share one database, so each keeps its migration ledger in
  // its own schema: one shared ledger would mix the two journals.
  migrations: { schema: 'api' },
  verbose: true,
  strict: true,
} satisfies Config
