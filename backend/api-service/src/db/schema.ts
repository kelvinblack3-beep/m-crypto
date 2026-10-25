import { pgSchema, text, integer, timestamp, jsonb, index, bigint, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

// api-service tables live in their own Postgres schema so the auth-service
// (which shares the tenant Neon DB) can migrate without touching api
// tables / sequences, and vice versa. The Worker connects
// with the default search_path; queries against these tables use the
// schema-qualified names emitted by drizzle.
export const apiSchema = pgSchema('api');

export const newlyMeta = apiSchema.table(
  '_newly_meta',
  {
    id: integer('id').primaryKey().generatedByDefaultAsIdentity(),
    project_id: text('project_id').notNull(),
    env: text('env').notNull(),
    template_version: text('template_version').notNull(),
  },
  (table) => ({
    projectIdIdx: index('_newly_meta_project_id_idx').on(table.project_id),
  }),
);

export type NewlyMetaRow = typeof newlyMeta.$inferSelect;
export type NewlyMetaInsert = typeof newlyMeta.$inferInsert;

export const kvEntries = apiSchema.table(
  'kv_entries',
  {
    key: text('key').primaryKey(),
    value: jsonb('value'),
    expires_at: timestamp('expires_at', { withTimezone: true }),
  },
  (table) => ({
    expiresAtIdx: index('kv_entries_expires_at_idx').on(table.expires_at),
  }),
);

export type KvEntriesRow = typeof kvEntries.$inferSelect;
export type KvEntriesInsert = typeof kvEntries.$inferInsert;

export const profiles = apiSchema.table('mtaa_profiles', {
  id: text('id').primaryKey(), username: text('username').notNull().unique(),
  role: text('role').notNull().default('user'), contactChecked: boolean('contact_checked').notNull().default(false),
  banned: boolean('banned').notNull().default(false), terms: boolean('terms').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const accounts = apiSchema.table('mtaa_accounts', {
  id: text('id').primaryKey(), balance: bigint('balance', { mode: 'number' }).notNull().default(0),
});
export const journals = apiSchema.table('mtaa_journals', {
  id: text('id').primaryKey(), kind: text('kind').notNull(), actor: text('actor').notNull(),
  sender: text('sender').notNull(), recipient: text('recipient').notNull(), amount: bigint('amount', { mode: 'number' }).notNull(),
  reversalOf: text('reversal_of').unique(), metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ senderIdx: index('mtaa_sender_idx').on(t.sender), recipientIdx: index('mtaa_recipient_idx').on(t.recipient) }));
export const lines = apiSchema.table('mtaa_lines', {
  id: text('id').primaryKey(), journalID: text('journal_id').notNull().references(() => journals.id),
  accountID: text('account_id').notNull().references(() => accounts.id), delta: bigint('delta', { mode: 'number' }).notNull(),
}, (t) => ({ accountIdx: index('mtaa_line_account_idx').on(t.accountID) }));
export const requests = apiSchema.table('mtaa_requests', {
  id: text('id').primaryKey(), actor: text('actor').notNull(), key: text('key').notNull(),
  payload: jsonb('payload').notNull(), result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ actorKey: uniqueIndex('mtaa_actor_key').on(t.actor, t.key) }));
export const deposits = apiSchema.table('mtaa_deposits', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), amount: bigint('amount', { mode: 'number' }).notNull(),
  status: text('status').notNull().default('pending'), mode: text('mode').notNull().default('local'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const tokens = apiSchema.table('mtaa_tokens', {
  id: text('id').primaryKey(), creator: text('creator').notNull(), name: text('name').notNull(),
  ticker: text('ticker').notNull().unique(), description: text('description').notNull(),
  supply: bigint('supply', { mode: 'number' }).notNull(), sold: bigint('sold', { mode: 'number' }).notNull().default(0),
  reserve: bigint('reserve', { mode: 'number' }).notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const holdings = apiSchema.table('mtaa_holdings', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), tokenID: text('token_id').notNull().references(() => tokens.id),
  quantity: bigint('quantity', { mode: 'number' }).notNull().default(0),
  cost: bigint('cost', { mode: 'number' }).notNull().default(0), realized: bigint('realized', { mode: 'number' }).notNull().default(0),
}, (t) => ({ ownerToken: uniqueIndex('mtaa_owner_token').on(t.owner, t.tokenID) }));
export const trades = apiSchema.table('mtaa_trades', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), tokenID: text('token_id').notNull().references(() => tokens.id),
  side: text('side').notNull(), quantity: bigint('quantity', { mode: 'number' }).notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(), journalID: text('journal_id').notNull().references(() => journals.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const posts = apiSchema.table('mtaa_posts', {
  id: text('id').primaryKey(), author: text('author').notNull(), community: text('community').notNull().default('mtaa-lab'),
  body: text('body').notNull(), hidden: boolean('hidden').notNull().default(false),
  parentID: text('parent_id'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const reactions = apiSchema.table('mtaa_reactions', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), target: text('target').notNull(), kind: text('kind').notNull(),
});
export const reports = apiSchema.table('mtaa_reports', {
  id: text('id').primaryKey(), actor: text('actor').notNull(), target: text('target').notNull(), reason: text('reason').notNull(),
  status: text('status').notNull().default('open'), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const audit = apiSchema.table('mtaa_audit', {
  id: text('id').primaryKey(), actor: text('actor').notNull(), action: text('action').notNull(),
  details: jsonb('details').notNull(), createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
export const limits = apiSchema.table('mtaa_limits', {
  key: text('key').primaryKey(), count: integer('count').notNull(), expires: timestamp('expires', { withTimezone: true }).notNull(),
});
