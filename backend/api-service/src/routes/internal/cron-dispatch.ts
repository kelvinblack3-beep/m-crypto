import { Hono } from 'hono'
import type { HonoEnv } from '../../env'
import { oidcMiddleware } from '../../middleware/oidc'
import { logEvent } from '../../observability'
import { dispatchCronByName, hasCronHandler } from '../../platform/cron'

export const internalCronDispatchRoutes = new Hono<HonoEnv>()

internalCronDispatchRoutes.post('/_internal/cron/:name', oidcMiddleware, async (c) => {
  const name = c.req.param('name')
  const principalEmail = c.get('userId')

  if (!hasCronHandler(name)) {
    return c.json({ error: 'not_found', name }, 404)
  }

  logEvent({
    level: 'info',
    msg: 'cron.dispatch.start',
    meta: { name, principal: principalEmail },
  })

  try {
    await dispatchCronByName(name, c.env)
  } catch (err) {
    logEvent({
      level: 'error',
      msg: 'cron.dispatch.failed',
      meta: {
        name,
        principal: principalEmail,
        error: err instanceof Error ? err.message : String(err),
      },
    })
    throw err
  }

  logEvent({
    level: 'info',
    msg: 'cron.dispatch.done',
    meta: { name, principal: principalEmail },
  })

  return c.json({ ok: true as const, name })
})
