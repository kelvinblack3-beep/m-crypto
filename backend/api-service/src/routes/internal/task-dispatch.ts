import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { HonoEnv } from '../../env'
import { oidcMiddleware } from '../../middleware/oidc'
import { getTaskHandler } from '../../platform/task-registry'
import { maybeInline, deserializePayload } from '../../platform/task-payload'
import { Storage } from '../../platform/storage'
import { logEvent } from '../../observability'

const dispatchBodySchema = z.object({
  name: z.string().min(1),
  codec: z.enum(['pickle', 'json']).optional(),
  inline_b64: z.string().optional(),
  gcs_object: z.string().optional(),
})

export const taskDispatchRoutes = new Hono<HonoEnv>()

taskDispatchRoutes.post(
  '/_internal/task/:name',
  oidcMiddleware,
  zValidator('json', dispatchBodySchema),
  async (c) => {
    const name = c.req.param('name')
    const body = c.req.valid('json')
    // Default JSON: the Worker can't decode Python pickle, so a producer
    // that wants pickle must pass it explicitly and accept the resulting
    // 500 error message. JSON producers (and producers that don't care)
    // get a working default.
    const codec = body.codec ?? 'json'

    const handler = getTaskHandler(name)
    if (!handler) {
      logEvent({
        level: 'warn',
        msg: 'task.dispatch.unknown',
        meta: { name },
      })
      return c.json({ error: 'unknown_task', name }, 404)
    }

    try {
      const raw = await maybeInline(c.env, {
        inline_b64: body.inline_b64,
        gcs_object: body.gcs_object,
      })
      const payload = deserializePayload(raw, codec)

      await handler(payload, { env: c.env, name })

      if (body.gcs_object) {
        const storage = new Storage(c.env)
        await storage.delete('blobs', body.gcs_object)
      }

      return c.json({ ok: true as const, name })
    } catch (err) {
      logEvent({
        level: 'error',
        msg: 'task.dispatch.failed',
        meta: {
          name,
          gcs_object: body.gcs_object,
          codec,
          error: err instanceof Error ? err.message : String(err),
        },
      })
      throw err
    }
  }
)
