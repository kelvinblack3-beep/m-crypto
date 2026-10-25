import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../env'

export const loggerMiddleware: MiddlewareHandler<HonoEnv> = async (c, next) => {
  const start = Date.now()
  const requestId = crypto.randomUUID()
  c.set('requestId', requestId)
  c.header('X-Request-Id', requestId)
  await next()
  const duration_ms = Date.now() - start
  if (c.env.LOG_LEVEL !== 'silent') {
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status: c.res.status,
      duration_ms,
      request_id: requestId,
    }))
  }
}
