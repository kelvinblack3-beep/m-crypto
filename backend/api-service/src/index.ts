import { Hono } from 'hono'
import { mtaaRoutes } from './mtaa'
import { instrument, type ResolveConfigFn } from '@microlabs/otel-cf-workers'
import { corsMiddleware } from './middleware/cors'
import { loggerMiddleware } from './middleware/logger'
import { errorHandler } from './middleware/error'
import { dispatchCron } from './platform/cron'
import { getTaskHandler } from './platform/task-registry'
import { logEvent } from './observability'
import type { HonoEnv, ExecutionContext, ScheduledController } from './env'
import type { MessageBatch } from '@cloudflare/workers-types'
import { healthRoutes } from './routes/health'
import { meRoutes } from './routes/me'
import { internalCronManifestRoutes } from './routes/internal/cron-manifest'
import { internalCronDispatchRoutes } from './routes/internal/cron-dispatch'
import { taskDispatchRoutes } from './routes/internal/task-dispatch'

const app = new Hono<HonoEnv>()
app.use('*', loggerMiddleware)
app.use('*', corsMiddleware)
app.onError(errorHandler)

app.route('/v1', mtaaRoutes)
app.route('/', healthRoutes)
app.route('/', meRoutes)
app.route('/', internalCronManifestRoutes)
app.route('/', internalCronDispatchRoutes)
app.route('/', taskDispatchRoutes)

// Queue messages that the api-service handles are `{name, payload}` envelopes.
// Producers send `{name: 'send-email', payload: {...}}` onto QUEUE_DEFAULT;
// this consumer looks the handler up by name and invokes it.
// A message with an unknown name is acked (not retried) because retrying a
// handler that doesn't exist won't help — the producer needs to fix the
// payload. Handler errors → retry, capped by the queue's max_retries.
export interface TaskQueueMessage {
  name: string
  payload?: unknown
}

export async function handleQueueBatch(
  batch: MessageBatch<TaskQueueMessage>,
  env: HonoEnv['Bindings'],
): Promise<void> {
  for (const msg of batch.messages) {
    const body = msg.body
    const name = typeof body?.name === 'string' ? body.name : null
    if (!name) {
      logEvent({ level: 'warn', msg: 'queue.message.missing_name', meta: { id: msg.id, queue: batch.queue } })
      msg.ack()
      continue
    }
    const handler = getTaskHandler(name)
    if (!handler) {
      logEvent({ level: 'warn', msg: 'queue.message.unknown_task', meta: { id: msg.id, queue: batch.queue, name } })
      msg.ack()
      continue
    }
    try {
      await handler(body.payload, { env, name })
      msg.ack()
    } catch (err) {
      logEvent({
        level: 'error',
        msg: 'queue.message.handler_failed',
        meta: { id: msg.id, queue: batch.queue, name, error: err instanceof Error ? err.message : String(err) },
      })
      msg.retry()
    }
  }
}

const handler = {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: HonoEnv['Bindings'], _ctx: ExecutionContext) {
    try {
      await dispatchCron(controller, env)
    } catch (err) {
      logEvent({ level: 'error', msg: 'scheduled_handler_error', meta: { cron: controller.cron, error: String(err) } })
    }
  },
  async queue(batch: MessageBatch<TaskQueueMessage>, env: HonoEnv['Bindings'], _ctx: ExecutionContext) {
    await handleQueueBatch(batch, env)
  },
}

// OTLP/HTTP exporter to the Newly platform Uptrace instance (see infra/uptrace/
// and docs/superpowers/specs/2026-06-28-cf-native-observability.md). The DSN
// authorises ingest into the env-shared Uptrace project; per-tenant filtering
// is done at query time on the `tenant.id` attribute.
const otelConfig: ResolveConfigFn = (env: HonoEnv['Bindings']) => ({
  exporter: {
    url: env.UPTRACE_OTLP_URL,
    headers: { 'uptrace-dsn': env.UPTRACE_DSN ?? '' },
  },
  service: {
    name: `${env.NEWLY_PROJECT_ID ?? 'unknown'}-api`,
    version: env.NEWLY_ENV ?? 'unknown',
    namespace: 'newly-tenant',
  },
})

export default instrument(handler, otelConfig)
