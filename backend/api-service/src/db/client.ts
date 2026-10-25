import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import * as schema from './schema'

export type Env = { DATABASE_URL: string }
export type DB = ReturnType<typeof createDb>

export function createDb(databaseUrl: string) {
  const sql = neon(databaseUrl)
  return drizzle(sql, { schema, logger: false })
}

export { schema }
