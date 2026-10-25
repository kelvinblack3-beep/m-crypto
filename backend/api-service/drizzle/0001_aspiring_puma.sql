CREATE TABLE IF NOT EXISTS "api"."mtaa_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"balance" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"amount" bigint NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mode" text DEFAULT 'local' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_holdings" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"token_id" text NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"cost" bigint DEFAULT 0 NOT NULL,
	"realized" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_journals" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"sender" text NOT NULL,
	"recipient" text NOT NULL,
	"amount" bigint NOT NULL,
	"reversal_of" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mtaa_journals_reversal_of_unique" UNIQUE("reversal_of")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"journal_id" text NOT NULL,
	"account_id" text NOT NULL,
	"delta" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author" text NOT NULL,
	"community" text DEFAULT 'mtaa-lab' NOT NULL,
	"body" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"parent_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"contact_checked" boolean DEFAULT false NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"terms" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mtaa_profiles_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"target" text NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"target" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"creator" text NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"description" text NOT NULL,
	"supply" bigint NOT NULL,
	"sold" bigint DEFAULT 0 NOT NULL,
	"reserve" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mtaa_tokens_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api"."mtaa_trades" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"token_id" text NOT NULL,
	"side" text NOT NULL,
	"quantity" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"journal_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api"."mtaa_holdings" ADD CONSTRAINT "mtaa_holdings_token_id_mtaa_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "api"."mtaa_tokens"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api"."mtaa_lines" ADD CONSTRAINT "mtaa_lines_journal_id_mtaa_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "api"."mtaa_journals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api"."mtaa_lines" ADD CONSTRAINT "mtaa_lines_account_id_mtaa_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "api"."mtaa_accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api"."mtaa_trades" ADD CONSTRAINT "mtaa_trades_token_id_mtaa_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "api"."mtaa_tokens"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api"."mtaa_trades" ADD CONSTRAINT "mtaa_trades_journal_id_mtaa_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "api"."mtaa_journals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mtaa_owner_token" ON "api"."mtaa_holdings" USING btree ("owner","token_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mtaa_sender_idx" ON "api"."mtaa_journals" USING btree ("sender");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mtaa_recipient_idx" ON "api"."mtaa_journals" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mtaa_line_account_idx" ON "api"."mtaa_lines" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mtaa_actor_key" ON "api"."mtaa_requests" USING btree ("actor","key");