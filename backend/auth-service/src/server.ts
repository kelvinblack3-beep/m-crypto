import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { instrument, type ResolveConfigFn } from '@microlabs/otel-cf-workers'
import { createAuth, type AuthEnv } from './auth'

interface Bindings extends AuthEnv {
  NEWLY_ENV: string
  NEWLY_PROJECT_ID: string
  LOG_LEVEL: string
  // Uptrace OTLP exporter — kept in sync with api-service. UPTRACE_OTLP_URL is
  // a per-env [vars] entry; UPTRACE_DSN is a Worker Secret PUT'd by deploy.sh.
  UPTRACE_OTLP_URL: string
  UPTRACE_DSN: string
}

type Variables = Record<string, never>

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

app.use(
  '*',
  cors({
    origin: (origin) => origin || '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    credentials: true,
    maxAge: 86400,
  }),
)

app.get('/health', (c) => c.json({ ok: true, service: 'auth' }))
app.get('/healthz', (c) => c.json({ ok: true, service: 'auth' }))

app.all('/api/auth/*', (c) => {
  const auth = createAuth(c.env, c.req.raw)
  return auth.handler(c.req.raw)
})

const handler = {
  fetch: app.fetch,
}

const otelConfig: ResolveConfigFn = (env: Bindings) => ({
  exporter: {
    url: env.UPTRACE_OTLP_URL,
    headers: { 'uptrace-dsn': env.UPTRACE_DSN ?? '' },
  },
  service: {
    name: `${env.NEWLY_PROJECT_ID ?? 'unknown'}-auth`,
    version: env.NEWLY_ENV ?? 'unknown',
    namespace: 'newly-tenant',
  },
})

export default instrument(handler, otelConfig)
