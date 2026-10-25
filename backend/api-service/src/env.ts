import type { R2Bucket, Queue, ExecutionContext, ScheduledController } from '@cloudflare/workers-types'

export interface Bindings {
  SOLANA_CLUSTER?: string
  SOLANA_RPC_URL?: string
  DARAJA_MODE?: string
  NEWLY_AI_URL?: string
  NEWLY_AI_TOKEN?: string
  NEWLY_EMAIL_URL?: string
  NEWLY_EMAIL_TOKEN?: string
  NEWLY_ENV: string
  NEWLY_PROJECT_ID: string
  LOG_LEVEL: string
  DATABASE_URL: string
  JWKS_URL: string
  JWT_ISSUER: string
  R2_BLOBS: R2Bucket
  R2_STORAGE: R2Bucket
  R2_PUBLIC: R2Bucket
  QUEUE_DEFAULT: Queue
  // Uptrace OTLP exporter — see infra/uptrace/ and the per-tenant observability
  // spec. UPTRACE_OTLP_URL is a [vars] entry (per-env constant); UPTRACE_DSN
  // is a Worker Secret PUT'd by deploy.sh after wrangler deploy.
  UPTRACE_OTLP_URL: string
  UPTRACE_DSN: string
}

export interface Variables {
  userId: string
  email?: string
  requestId: string
}

export type HonoEnv = { Bindings: Bindings; Variables: Variables }

export type { ExecutionContext, ScheduledController }
